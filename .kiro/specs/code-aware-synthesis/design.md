# Design Document

## Overview

This design enhances the AI Council Proxy synthesis engine with code-aware capabilities to improve consensus quality for agentic coding tasks. The enhancement adds three core capabilities: (1) automatic code detection and extraction, (2) code-aware similarity calculation based on functional equivalence, and (3) validation-based weighting to prioritize syntactically correct and well-documented code.

The design maintains backward compatibility by auto-detecting code content and falling back to existing text-based similarity for non-code responses. All enhancements are implemented within the existing SynthesisEngine class without requiring changes to other components.

## Architecture

### Component Architecture

```
SynthesisEngine (Enhanced)
├── Code Detection
│   ├── detectCode(content: string): boolean
│   └── extractCode(content: string): string[]
│
├── Code-Aware Similarity
│   ├── calculateCodeAgreement(exchanges: Exchange[]): number
│   ├── extractFunctionSignatures(code: string): Signature[]
│   ├── compareSignatures(sig1: Signature, sig2: Signature): number
│   ├── extractLogicStructure(code: string): Structure
│   └── compareLogicStructure(struct1: Structure, struct2: Structure): number
│
├── Code Validation
│   ├── validateCode(code: string): ValidationResult
│   ├── hasBalancedBrackets(code: string): boolean
│   ├── hasObviousSyntaxErrors(code: string): boolean
│   ├── hasErrorHandling(code: string): boolean
│   └── hasDocumentation(code: string): boolean
│
├── Validation Weighting
│   └── weightByValidation(exchanges: Exchange[]): Map<string, number>
│
└── Enhanced Synthesis
    ├── calculateAgreementLevel(exchanges: Exchange[]): number (modified)
    └── metaSynthesis(exchanges: Exchange[], ...): Promise<ConsensusDecision> (modified)
```

### Integration Points

- **SynthesisEngine.calculateAgreementLevel()**: Modified to detect code and route to appropriate similarity calculation
- **SynthesisEngine.metaSynthesis()**: Modified to use code-specific prompts when code is detected
- **SynthesisEngine.weightedFusion()**: Modified to apply validation weights
- **ConfigurationManager**: Extended with new "coding-council" preset

### Data Flow

```
1. Exchanges arrive at synthesis engine
2. detectCode() checks for code content
3. If code detected:
   a. extractCode() pulls code blocks
   b. calculateCodeAgreement() computes similarity
   c. weightByValidation() applies quality weights
4. If no code detected:
   a. Use existing calculateTextAgreement()
   b. Use existing weight calculation
5. Synthesis proceeds with weighted exchanges
6. Meta-synthesis uses code-specific prompts if applicable
```

## Components and Interfaces

### Code Detection Module

```typescript
interface CodeDetectionResult {
  isCode: boolean;
  codeBlocks: string[];
  language?: string;
  confidence: number; // 0.0-1.0
}

class CodeDetector {
  /**
   * Detect if content contains code
   * Checks for markdown code blocks and programming keywords
   */
  detectCode(content: string): boolean;
  
  /**
   * Extract code blocks from markdown
   * Returns array of code strings
   */
  extractCode(content: string): string[];
  
  /**
   * Detect programming language
   * Returns language identifier or undefined
   */
  detectLanguage(code: string): string | undefined;
}
```

### Code Similarity Module

```typescript
interface FunctionSignature {
  name: string;
  parameters: string[];
  returnType?: string;
}

interface LogicStructure {
  controlFlowKeywords: string[]; // if, for, while, etc.
  nestingDepth: number;
  loopCount: number;
  conditionalCount: number;
}

interface CodeSimilarityResult {
  signatureSimilarity: number; // 0.0-1.0
  logicSimilarity: number; // 0.0-1.0
  variableSimilarity: number; // 0.0-1.0
  overallSimilarity: number; // weighted average
}

class CodeSimilarityCalculator {
  /**
   * Calculate overall code similarity
   * Weights: signature 70%, logic 20%, variables 10%
   */
  calculateSimilarity(code1: string, code2: string): number;
  
  /**
   * Extract function signatures from code
   */
  extractFunctionSignatures(code: string): FunctionSignature[];
  
  /**
   * Compare two function signatures
   */
  compareSignatures(sig1: FunctionSignature, sig2: FunctionSignature): number;
  
  /**
   * Extract logic structure from code
   */
  extractLogicStructure(code: string): LogicStructure;
  
  /**
   * Compare two logic structures
   */
  compareLogicStructure(struct1: LogicStructure, struct2: LogicStructure): number;
  
  /**
   * Extract and compare variable names
   */
  compareVariableNames(code1: string, code2: string): number;
}
```

### Code Validation Module

```typescript
interface ValidationResult {
  isValid: boolean;
  hasBalancedBrackets: boolean;
  hasSyntaxErrors: boolean;
  hasErrorHandling: boolean;
  hasDocumentation: boolean;
  weight: number; // calculated multiplier
}

class CodeValidator {
  /**
   * Validate code and return quality metrics
   */
  validateCode(code: string): ValidationResult;
  
  /**
   * Check if brackets are balanced
   */
  hasBalancedBrackets(code: string): boolean;
  
  /**
   * Detect obvious syntax errors using regex patterns
   */
  hasObviousSyntaxErrors(code: string): boolean;
  
  /**
   * Detect error handling patterns
   */
  hasErrorHandling(code: string): boolean;
  
  /**
   * Detect documentation/comments
   */
  hasDocumentation(code: string): boolean;
  
  /**
   * Calculate validation weight multiplier
   */
  calculateWeight(validation: ValidationResult): number;
}
```

### Enhanced Synthesis Engine

```typescript
// Additions to existing SynthesisEngine class

class SynthesisEngine implements ISynthesisEngine {
  // Existing fields...
  private codeDetector: CodeDetector;
  private codeSimilarityCalculator: CodeSimilarityCalculator;
  private codeValidator: CodeValidator;
  
  constructor(
    providerPool: IProviderPool,
    configManager: IConfigurationManager
  ) {
    // Existing initialization...
    this.codeDetector = new CodeDetector();
    this.codeSimilarityCalculator = new CodeSimilarityCalculator();
    this.codeValidator = new CodeValidator();
  }
  
  /**
   * Enhanced agreement calculation with code detection
   */
  private calculateAgreementLevel(exchanges: Exchange[]): number {
    if (exchanges.length <= 1) return 1.0;
    
    // Detect if responses contain code
    const hasCode = exchanges.some(e => this.codeDetector.detectCode(e.content));
    
    if (hasCode) {
      return this.calculateCodeAgreement(exchanges);
    }
    
    // Fall back to existing text similarity
    return this.calculateTextAgreement(exchanges);
  }
  
  /**
   * Calculate agreement for code responses
   */
  private calculateCodeAgreement(exchanges: Exchange[]): number {
    const codeBlocks = exchanges.map(e => 
      this.codeDetector.extractCode(e.content).join('\n')
    );
    
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < codeBlocks.length; i++) {
      for (let j = i + 1; j < codeBlocks.length; j++) {
        const similarity = this.codeSimilarityCalculator.calculateSimilarity(
          codeBlocks[i],
          codeBlocks[j]
        );
        totalSimilarity += similarity;
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }
  
  /**
   * Apply validation-based weighting
   */
  private weightByValidation(exchanges: Exchange[]): Map<string, number> {
    const weights = new Map<string, number>();
    
    for (const exchange of exchanges) {
      const codeBlocks = this.codeDetector.extractCode(exchange.content);
      
      if (codeBlocks.length === 0) {
        weights.set(exchange.councilMemberId, 1.0);
        continue;
      }
      
      // Validate all code blocks and average the weights
      let totalWeight = 0;
      for (const code of codeBlocks) {
        const validation = this.codeValidator.validateCode(code);
        totalWeight += validation.weight;
      }
      
      const avgWeight = totalWeight / codeBlocks.length;
      weights.set(exchange.councilMemberId, avgWeight);
    }
    
    return weights;
  }
  
  /**
   * Enhanced meta-synthesis with code-specific prompts
   */
  private async metaSynthesis(
    exchanges: Exchange[],
    moderatorStrategy?: ModeratorStrategy
  ): Promise<ConsensusDecision> {
    // Existing agreement calculation...
    const agreementLevel = this.calculateAgreementLevel(exchanges);
    
    try {
      const councilConfig = await this.configManager.getCouncilConfig();
      const moderator = await this.selectModerator(
        councilConfig.members,
        moderatorStrategy || { type: 'strongest' }
      );
      
      // Detect if responses contain code
      const hasCode = exchanges.some(e => this.codeDetector.detectCode(e.content));
      
      // Build prompt
      let prompt = `You are the Moderator for an AI Council. Your task is to synthesize the responses from multiple AI models into a single, coherent, and comprehensive answer.\n\n`;
      
      prompt += `Here are the responses from the council members:\n\n`;
      exchanges.forEach((exchange, index) => {
        prompt += `--- Council Member ${exchange.councilMemberId} ---\n`;
        prompt += `${exchange.content}\n\n`;
      });
      
      // Use code-specific instructions if code detected
      if (hasCode) {
        prompt += `Instructions for CODE synthesis:\n`;
        prompt += `1. Identify the functionally correct solutions (ignore style differences).\n`;
        prompt += `2. Combine the best error handling from all responses.\n`;
        prompt += `3. Include the most comprehensive edge case handling.\n`;
        prompt += `4. Prefer solutions with better time/space complexity.\n`;
        prompt += `5. Ensure the final code is syntactically valid.\n`;
        prompt += `6. Add comments explaining key decisions.\n\n`;
      } else {
        prompt += `Instructions:\n`;
        prompt += `1. Identify the core consensus among the models.\n`;
        prompt += `2. Highlight any significant disagreements or alternative perspectives.\n`;
        prompt += `3. Synthesize the best parts of each response into a final, high-quality answer.\n`;
        prompt += `4. Do not just list the responses; integrate them.\n`;
        prompt += `5. If there are conflicts, explain the trade-offs.\n\n`;
      }
      
      prompt += `Provide your synthesized response now:`;
      
      // Send to moderator and return result...
      // (existing implementation continues)
    } catch (error) {
      // Existing fallback logic...
    }
  }
}
```

## Data Models

### Code Detection Types

```typescript
// Regex patterns for code detection
const CODE_PATTERNS = {
  fencedCodeBlock: /```[\s\S]*?```/g,
  functionKeywords: /\b(function|def|class|const|let|var|import|export|async|await)\b/g,
  controlFlow: /\b(if|else|for|while|switch|case|try|catch|throw|return)\b/g,
  operators: /[=<>!+\-*/%&|^~]+/g,
  brackets: /[(){}\[\]]/g
};

// Language detection patterns
const LANGUAGE_PATTERNS: Record<string, RegExp> = {
  javascript: /\b(const|let|var|function|=>|async|await)\b/,
  typescript: /\b(interface|type|enum|namespace|implements)\b/,
  python: /\b(def|import|from|class|self|__init__|lambda)\b/,
  java: /\b(public|private|protected|class|interface|extends|implements)\b/,
  csharp: /\b(namespace|using|class|interface|public|private|protected)\b/,
  go: /\b(func|package|import|type|struct|interface)\b/,
  rust: /\b(fn|let|mut|impl|trait|struct|enum)\b/
};
```

### Function Signature Patterns

```typescript
// Regex patterns for function signature extraction
const SIGNATURE_PATTERNS = {
  javascript: /(?:function|const|let|var)\s+(\w+)\s*=?\s*(?:async\s*)?\(([^)]*)\)/g,
  typescript: /(?:function|const|let|var)\s+(\w+)\s*=?\s*(?:async\s*)?\(([^)]*)\)(?:\s*:\s*(\w+))?/g,
  python: /def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\w+))?/g,
  java: /(?:public|private|protected)?\s*(?:static)?\s*(\w+)\s+(\w+)\s*\(([^)]*)\)/g,
  csharp: /(?:public|private|protected)?\s*(?:static)?\s*(?:async)?\s*(\w+)\s+(\w+)\s*\(([^)]*)\)/g
};
```

### Validation Patterns

```typescript
// Patterns for code validation
const VALIDATION_PATTERNS = {
  // Error handling
  tryCatch: /\b(try|catch|finally|except|rescue)\b/g,
  errorCheck: /\b(if|when)\s*\([^)]*(?:error|err|exception|Error)\)/g,
  throwRaise: /\b(throw|raise|panic)\b/g,
  
  // Documentation
  singleLineComment: /\/\/|#/g,
  multiLineComment: /\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|'''[\s\S]*?'''/g,
  docstring: /@param|@return|@throws|:param|:return|:raises/g,
  
  // Syntax errors
  unclosedString: /(["'`])(?:(?=(\\?))\2.)*?(?!\1)/g,
  invalidOperator: /[=<>!+\-*/%&|^~]{3,}/g,
  malformedKeyword: /\b(functoin|calss|retrun|improt)\b/g
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Code Detection Properties

Property 1: Code block detection accuracy
*For any* response containing markdown code blocks (```...```), the system should correctly identify it as containing code
**Validates: Requirements 1.1**

Property 2: Keyword-based code detection
*For any* response containing programming keywords (function, class, def, etc.), the system should correctly identify it as containing code
**Validates: Requirements 1.2**

Property 3: Code extraction completeness
*For any* response with multiple code blocks, the system should extract all code blocks without loss
**Validates: Requirements 2.5**

Property 4: Code extraction preservation
*For any* extracted code block, the content should match the original exactly (character-for-character)
**Validates: Requirements 2.2**

### Similarity Calculation Properties

Property 5: Functional equivalence recognition
*For any* two code snippets that are functionally identical but syntactically different, the similarity score should be high (>0.8)
**Validates: Requirements 3.5**

Property 6: Signature similarity weighting
*For any* similarity calculation, function signature similarity should contribute 70% to the overall score
**Validates: Requirements 3.2**

Property 7: Logic similarity weighting
*For any* similarity calculation, logic structure similarity should contribute 20% to the overall score
**Validates: Requirements 3.3**

Property 8: Variable similarity weighting
*For any* similarity calculation, variable name similarity should contribute 10% to the overall score
**Validates: Requirements 3.4**

Property 9: Different logic detection
*For any* two code snippets with different logic, the similarity score should be low (<0.4)
**Validates: Requirements 3.6**

### Signature Comparison Properties

Property 10: Exact signature match
*For any* two function signatures that are identical, the signature similarity should be 1.0
**Validates: Requirements 4.6**

Property 11: Parameter name variation tolerance
*For any* two function signatures differing only in parameter names, the signature similarity should be 0.8
**Validates: Requirements 4.7**

Property 12: Parameter count sensitivity
*For any* two function signatures with different parameter counts, the similarity should be proportional to parameter overlap
**Validates: Requirements 4.8**

### Validation Properties

Property 13: Bracket balance detection
*For any* code with unbalanced brackets, the validation should detect the imbalance and return false
**Validates: Requirements 7.8**

Property 14: Balanced bracket confirmation
*For any* code with all bracket types balanced, the validation should return true
**Validates: Requirements 7.7**

Property 15: Unbalanced bracket penalty
*For any* code with unbalanced brackets, the validation weight should be 0.3 or less
**Validates: Requirements 6.2**

Property 16: Syntax error penalty
*For any* code with obvious syntax errors, the validation weight should be 0.5 or less
**Validates: Requirements 6.3**

Property 17: Error handling bonus
*For any* code containing error handling patterns, the validation weight should be multiplied by 1.2
**Validates: Requirements 9.4**

Property 18: Documentation bonus
*For any* code containing documentation, the validation weight should be multiplied by 1.1
**Validates: Requirements 10.5**

Property 19: Weight multiplier composition
*For any* code with multiple validation factors, the final weight should be the product of all multipliers
**Validates: Requirements 6.6**

Property 20: Minimum weight floor
*For any* validation result, the final weight should never be less than 0.1
**Validates: Requirements 11.5**

Property 21: Maximum weight ceiling
*For any* validation result, the final weight should never exceed 2.0
**Validates: Requirements 11.6**

### Synthesis Properties

Property 22: Code-aware routing
*For any* set of exchanges where at least one contains code, the system should use code-aware similarity calculation
**Validates: Requirements 1.3**

Property 23: Text-aware routing
*For any* set of exchanges where none contain code, the system should use text-based similarity calculation
**Validates: Requirements 1.4**

Property 24: Code prompt selection
*For any* meta-synthesis where exchanges contain code, the system should use code-specific prompt instructions
**Validates: Requirements 12.1**

Property 25: Text prompt selection
*For any* meta-synthesis where exchanges do not contain code, the system should use standard prompt instructions
**Validates: Requirements 12.8**

Property 26: Validation weight application
*For any* weighted-fusion synthesis with code responses, validation weights should be applied to all exchanges
**Validates: Requirements 11.1**

### Backward Compatibility Properties

Property 27: Non-code preservation
*For any* non-code response, the system should produce the same results as before the enhancement
**Validates: Requirements 14.1**

Property 28: Fallback behavior
*For any* code detection or validation failure, the system should fall back to existing behavior without errors
**Validates: Requirements 14.5**

Property 29: Existing test compatibility
*For any* existing test suite, all tests should pass without modification after the enhancement
**Validates: Requirements 14.7**

### Preset Configuration Properties

Property 30: Coding preset member count
*For any* application of the coding-council preset, the system should configure at least 3 council members
**Validates: Requirements 13.1**

Property 31: Coding preset deliberation rounds
*For any* application of the coding-council preset, the system should set deliberation rounds to 3
**Validates: Requirements 13.5**

Property 32: Coding preset timeout
*For any* application of the coding-council preset, the system should set timeout to 120 seconds
**Validates: Requirements 13.7**

Property 33: Coding preset consensus requirement
*For any* application of the coding-council preset, the system should require minimum consensus of 2 members
**Validates: Requirements 13.8**

## Error Handling

### Code Detection Errors

- **Malformed markdown**: If code blocks are malformed, extract what's possible and log warning
- **Ambiguous content**: If content is ambiguous (could be code or text), default to text similarity
- **Empty code blocks**: If code blocks are empty, treat as non-code response

### Similarity Calculation Errors

- **Extraction failure**: If code extraction fails, fall back to text similarity
- **Comparison failure**: If code comparison fails, return similarity of 0.5 (neutral)
- **Invalid signatures**: If signature extraction fails, use logic structure only

### Validation Errors

- **Validation failure**: If validation throws error, use weight of 1.0 (neutral)
- **Pattern matching failure**: If regex patterns fail, assume code is valid
- **Timeout**: If validation takes too long (>1s), skip and use weight of 1.0

### Synthesis Errors

- **Code detection failure**: Fall back to text-based synthesis
- **Weight calculation failure**: Use equal weights for all members
- **Prompt generation failure**: Use standard prompts

## Testing Strategy

### Unit Tests

- Test code detection with various markdown formats
- Test code extraction with nested blocks
- Test signature extraction for multiple languages
- Test bracket balance with complex nesting
- Test syntax error detection with common patterns
- Test error handling detection across languages
- Test documentation detection for various comment styles
- Test weight calculation with various validation results
- Test similarity calculation with functionally equivalent code
- Test similarity calculation with different logic
- Test fallback behavior when code detection fails

### Property-Based Tests

Each correctness property should be implemented as a property-based test using fast-check:

- Generate random code snippets with known properties
- Generate random markdown with code blocks
- Generate random function signatures
- Generate code with intentional syntax errors
- Generate code with/without error handling
- Generate code with/without documentation
- Verify properties hold across 100+ iterations

### Integration Tests

- Test end-to-end synthesis with code responses
- Test end-to-end synthesis with mixed code/text responses
- Test preset application and configuration
- Test backward compatibility with existing tests
- Test performance with large code blocks
- Test concurrent synthesis requests

### Edge Cases

- Empty responses
- Responses with only comments
- Responses with pseudo-code
- Responses with multiple languages
- Responses with malformed code blocks
- Responses with extremely long code
- Responses with unicode characters in code

## Performance Considerations

### Optimization Strategies

1. **Lazy code detection**: Only extract code when needed
2. **Caching**: Cache extracted code blocks per exchange
3. **Parallel validation**: Validate multiple code blocks concurrently
4. **Regex compilation**: Pre-compile all regex patterns
5. **Early termination**: Stop similarity calculation if threshold met

### Performance Targets

- Code detection: <10ms per response
- Code extraction: <50ms per response
- Similarity calculation: <100ms per pair
- Validation: <50ms per code block
- Total overhead: <500ms for typical 3-member council

### Memory Management

- Limit code block size to 100KB per block
- Limit total extracted code to 1MB per request
- Clear caches after synthesis completes
- Use streaming for large code comparisons

## Security Considerations

### Input Validation

- Sanitize code before regex matching to prevent ReDoS
- Limit regex execution time to prevent DoS
- Validate code block sizes to prevent memory exhaustion
- Escape special characters in extracted code

### Code Execution

- **Never execute extracted code**
- All validation is static analysis only
- No eval(), exec(), or similar functions
- No external process spawning

### Data Privacy

- Log only metadata, never full code content
- Redact sensitive patterns (API keys, passwords) from logs
- Clear code caches after processing
- Do not persist extracted code to database
