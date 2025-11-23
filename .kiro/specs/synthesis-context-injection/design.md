# Design Document

## Overview

This design addresses critical deficiencies in the Synthesis Engine that prevent it from producing high-quality responses, particularly for code generation tasks. The core issue is that the moderator synthesizes answers without access to the original user query, making it impossible to validate that responses actually address the user's needs. Additionally, the Devil's Advocate module exists only as a placeholder without functional critique capabilities.

The solution involves three key changes:
1. Injecting the original user query into all synthesis operations
2. Implementing stricter, production-ready code synthesis logic
3. Fully implementing the Devil's Advocate critique and rewrite system

## Architecture

### Component Interactions

```
OrchestrationEngine
    ↓ (passes UserRequest + responses)
SynthesisEngine
    ↓ (extracts query, applies strategy)
    ├─→ ConsensusExtraction (with query context)
    ├─→ WeightedFusion (with query context)
    └─→ MetaSynthesis (with query context + stricter prompts)
         ↓
    DevilsAdvocateModule (optional)
         ↓ (critique + rewrite)
    Final Response
```

### Key Changes

1. **Interface Update**: `ISynthesisEngine.synthesize()` now accepts `UserRequest` parameter
2. **Query Injection**: All synthesis strategies receive the original user query
3. **Code-Specific Logic**: Enhanced handling for code responses (no concatenation, best-response selection)
4. **Stricter Validation**: Code with syntax errors receives near-zero weight
5. **Active Critique**: Devil's Advocate uses LLM to generate critiques and rewrites

## Components and Interfaces

### Updated ISynthesisEngine Interface

```typescript
interface ISynthesisEngine {
  synthesize(
    request: UserRequest,  // NEW: Original user request with query
    responses: CouncilResponse[],
    strategy: SynthesisStrategy
  ): Promise<SynthesisResult>;
}
```

### Updated IDevilsAdvocateModule Interface

```typescript
interface IDevilsAdvocateModule {
  critique(
    query: string,
    synthesis: string,
    responses: CouncilResponse[]
  ): Promise<Critique>;
  
  rewrite(
    query: string,
    originalSynthesis: string,
    critique: Critique
  ): Promise<string>;
  
  synthesizeWithCritique(
    query: string,
    synthesis: string,
    responses: CouncilResponse[]
  ): Promise<string>;
}

interface Critique {
  weaknesses: string[];
  suggestions: string[];
  severity: 'minor' | 'moderate' | 'critical';
}
```

### Enhanced ValidationResult

```typescript
interface ValidationResult {
  isValid: boolean;
  hasObviousSyntaxErrors: boolean;
  isCriticalError: boolean;  // NEW: Flags errors that should reject the response
  errorMessages: string[];
  weight: number;  // 0.0 for critical errors
}
```

## Data Models

### Synthesis Context

```typescript
interface SynthesisContext {
  query: string;
  responses: CouncilResponse[];
  strategy: SynthesisStrategy;
  isCodeRequest: boolean;
  validationResults: Map<string, ValidationResult>;
}
```

### Devil's Advocate Configuration

```typescript
interface DevilsAdvocateConfig {
  enabled: boolean;
  applyToCodeRequests: boolean;
  applyToTextRequests: boolean;
  intensityLevel: 'light' | 'moderate' | 'thorough';
  provider: string;  // Which LLM to use for critique
  model: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, several properties were identified as redundant:
- Requirements 2.2, 2.3, 2.4, 2.5 and 5.2, 5.3, 5.4, 5.5 all test the same thing: moderator prompt content for code synthesis
- Requirements 1.5 and 4.3 both test that all strategies receive the query
- Property 7 (Interface Consistency) is subsumed by Property 1 (Query Context Preservation)

These have been consolidated into comprehensive properties below.

### Property 1: Query Context Preservation Across All Strategies

*For any* user request and council responses, when the Synthesis Engine synthesizes a response using any strategy (Consensus Extraction, Weighted Fusion, or Meta-Synthesis), the original user query must be accessible to the strategy and included in any moderator prompts.

**Validates: Requirements 1.1, 1.2, 1.5, 4.2, 4.3**

### Property 2: Code Non-Concatenation

*For any* code generation request, when using Consensus Extraction or Weighted Fusion strategies, the system must select a single best response rather than concatenating multiple code snippets.

**Validates: Requirements 2.1**

### Property 3: Critical Error Rejection

*For any* code response with obvious syntax errors, the validation system must assign a weight of 0.0 or near-zero, effectively rejecting it from synthesis.

**Validates: Requirements 2.1**

### Property 4: Production-Ready Code Prompt Completeness

*For any* code synthesis operation using Meta-Synthesis, the moderator prompt must include explicit instructions for: (1) correctness validation, (2) security vulnerability checking, (3) best practices adherence, (4) error handling, (5) completeness checking, and (6) user constraint validation.

**Validates: Requirements 2.2, 2.3, 2.4, 2.5, 5.2, 5.3, 5.4, 5.5**

### Property 5: Code-Specific Prompt Template Selection

*For any* synthesis request, when the system detects a code generation request, it must use a specialized code synthesis prompt template that differs from the text synthesis template.

**Validates: Requirements 5.1**

### Property 6: Active Critique Generation with LLM

*For any* synthesis result when Devil's Advocate is enabled, the system must invoke an LLM provider to generate a critique that contains specific weaknesses (non-empty weaknesses array).

**Validates: Requirements 3.1, 3.2**

### Property 7: Critique-Based Rewrite with LLM

*For any* critique with identified issues, the system must invoke an LLM provider to rewrite the response, producing a modified response that differs from the original.

**Validates: Requirements 3.3, 3.5**

### Property 8: Query Validation

*For any* synthesis operation, when the user query is null or empty, the system must handle it gracefully (either reject with error or use fallback behavior) rather than crashing.

**Validates: Requirements 4.5**

### Property 9: Devil's Advocate Configuration Enforcement

*For any* Devil's Advocate configuration change (enabled/disabled, request type filters, intensity level), subsequent synthesis requests must respect the new configuration without requiring a system restart.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 10: Devil's Advocate Logging Completeness

*For any* Devil's Advocate operation (critique or rewrite), the system must log: (1) critique content, (2) original and improved versions, (3) time taken, (4) request ID, and (5) improvement indicator.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

## Error Handling

### Synthesis Errors

- **Missing Query**: If user query is null/empty, log error and proceed with degraded synthesis
- **Invalid Strategy**: Fall back to Consensus Extraction if specified strategy fails
- **All Responses Invalid**: Return error indicating no valid responses to synthesize

### Devil's Advocate Errors

- **Critique Generation Failure**: Log error and return original synthesis
- **Rewrite Failure**: Log error and return original synthesis
- **Provider Unavailable**: Disable Devil's Advocate for current request, log warning

### Validation Errors

- **Syntax Error Detection**: Mark as critical error, set weight to 0.0
- **Validation Timeout**: Use default weight of 0.5, log warning
- **Validator Crash**: Skip validation for that response, log error

## Testing Strategy

### Unit Tests

1. **Query Injection Tests**
   - Verify query is passed to all synthesis strategies
   - Verify query is included in moderator prompts
   - Verify query is passed to Devil's Advocate

2. **Code Synthesis Tests**
   - Verify code responses are not concatenated
   - Verify best response selection logic
   - Verify syntax error rejection

3. **Devil's Advocate Tests**
   - Verify critique generation with mock LLM
   - Verify rewrite logic with mock LLM
   - Verify configuration enforcement

### Property-Based Tests

Each property test will run a minimum of 100 iterations and include a comment header referencing the design property.

1. **Property 1: Query Context Preservation**
   - Generate random user queries and responses
   - Verify query is accessible in all synthesis paths
   - Verify query appears in moderator prompts

2. **Property 2: Code Non-Concatenation**
   - Generate random code responses
   - Verify synthesis result is a single code block
   - Verify no `\n\n` or `\n` joining of multiple responses

3. **Property 3: Critical Error Rejection**
   - Generate code with various syntax errors
   - Verify weight is 0.0 for critical errors
   - Verify such responses are excluded from synthesis

4. **Property 4: Production-Ready Code Validation**
   - Generate random code synthesis requests
   - Verify moderator prompt includes production-ready instructions
   - Verify prompt includes security, correctness, error handling checks

5. **Property 5: Active Critique Generation**
   - Generate random synthesis results
   - Verify critique contains specific weaknesses
   - Verify critique is generated by LLM (not placeholder)

6. **Property 6: Critique-Based Rewrite**
   - Generate random critiques
   - Verify rewrite addresses identified issues
   - Verify rewrite preserves original strengths

7. **Property 7: Interface Consistency**
   - Generate random synthesis strategy calls
   - Verify all strategies receive query parameter
   - Verify query is used in strategy logic

8. **Property 8: Configuration Enforcement**
   - Generate random configuration changes
   - Verify subsequent requests use new configuration
   - Verify no restart required

### Integration Tests

1. **End-to-End Code Synthesis**
   - Submit code generation request
   - Verify synthesized code addresses original query
   - Verify code passes validation
   - Verify Devil's Advocate improves response (if enabled)

2. **End-to-End Text Synthesis**
   - Submit text request
   - Verify synthesis includes query context
   - Verify Devil's Advocate critique (if enabled)

### Testing Framework

- **Unit Tests**: Jest with mocking for external dependencies
- **Property Tests**: fast-check library with minimum 100 iterations per property
- **Test Timeout**: 120000ms (2 minutes) for property tests
- **Coverage Target**: 90%+ for synthesis engine and Devil's Advocate module

### Property Test Format

```typescript
/**
 * Property-Based Test: Query Context Preservation
 * Feature: synthesis-context-injection, Property 1: Query context must be accessible to all synthesis strategies
 * 
 * Validates: Requirements 1.1, 1.2, 4.3
 */
test('query context is preserved across all synthesis strategies', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 10 }),  // user query
      fc.array(fc.record({  // council responses
        memberId: fc.string(),
        response: fc.string(),
        confidence: fc.float({ min: 0, max: 1 })
      }), { minLength: 1, maxLength: 5 }),
      async (query, responses) => {
        // Test implementation
      }
    ),
    { numRuns: 100 }
  );
}, 120000);
```

## Implementation Notes

### Consensus Extraction for Code

**Current (Incorrect)**:
```typescript
// Joins multiple code blocks with newlines
return majorityGroup.map(r => r.response).join('\n\n');
```

**Fixed**:
```typescript
// Select single best response from majority group
const bestResponse = majorityGroup.reduce((best, current) => {
  const bestValidation = validationResults.get(best.memberId);
  const currentValidation = validationResults.get(current.memberId);
  return (currentValidation?.weight || 0) > (bestValidation?.weight || 0) 
    ? current 
    : best;
});
return bestResponse.response;
```

### Weighted Fusion for Code

**Current (Incorrect)**:
```typescript
// Joins weighted responses
return weightedResponses.map(r => r.response).join('\n');
```

**Fixed**:
```typescript
// Select highest-weighted response
const bestResponse = weightedResponses.reduce((best, current) => 
  current.weight > best.weight ? current : best
);
return bestResponse.response;
```

### Meta-Synthesis Moderator Prompt

**Enhanced Prompt for Code**:
```
You are synthesizing code responses from multiple AI models.

ORIGINAL USER QUERY:
${query}

CRITICAL REQUIREMENTS FOR PRODUCTION-READY CODE:
1. Correctness: Code must be syntactically correct and logically sound
2. Security: Check for common vulnerabilities (injection, XSS, etc.)
3. Error Handling: Include proper try-catch blocks and error messages
4. Best Practices: Follow language-specific conventions and patterns
5. User Constraints: Strictly adhere to requirements in the original query
6. Completeness: Ensure all requested functionality is implemented

COUNCIL RESPONSES:
${responses}

Synthesize a single, production-ready code solution that addresses the original query.
Do NOT concatenate multiple solutions. Select or combine the best elements.
```

### Devil's Advocate Implementation

```typescript
async synthesizeWithCritique(
  query: string,
  synthesis: string,
  responses: CouncilResponse[]
): Promise<string> {
  // Generate critique using LLM
  const critique = await this.critique(query, synthesis, responses);
  
  // If no significant issues, return original
  if (critique.severity === 'minor' && critique.weaknesses.length === 0) {
    return synthesis;
  }
  
  // Rewrite based on critique
  const improved = await this.rewrite(query, synthesis, critique);
  
  // Log the improvement
  await this.logger.logEvent({
    type: 'devils_advocate_improvement',
    critique: critique.weaknesses,
    originalLength: synthesis.length,
    improvedLength: improved.length
  });
  
  return improved;
}
```

## Performance Considerations

- **Query Passing**: Minimal overhead (string reference)
- **Devil's Advocate**: Adds one additional LLM call (critique) + one rewrite call
- **Validation**: Syntax checking may add 50-200ms per response
- **Caching**: Consider caching critiques for identical synthesis results

## Security Considerations

- **Prompt Injection**: Sanitize user query before including in moderator prompts
- **Code Execution**: Never execute synthesized code during validation
- **LLM Abuse**: Rate limit Devil's Advocate to prevent excessive LLM usage
- **Logging**: Sanitize sensitive data before logging critiques

## Deployment Considerations

- **Backward Compatibility**: Old code calling `synthesize()` without query will need updates
- **Configuration**: Add Devil's Advocate config to existing configuration system
- **Monitoring**: Add metrics for Devil's Advocate effectiveness (improvement rate)
- **Rollout**: Deploy with Devil's Advocate disabled initially, enable gradually
