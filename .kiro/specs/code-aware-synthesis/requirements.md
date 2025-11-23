# Requirements Document

## Introduction

This specification defines enhancements to the AI Council Proxy synthesis engine to improve its effectiveness for agentic coding tasks. The current system uses text-based similarity (TF-IDF) which fails to recognize functionally equivalent code with different syntax or style. This enhancement adds code-aware similarity detection, validation-based weighting, and optimized configuration for code generation tasks.

## Glossary

- **System**: The AI Council Proxy application
- **Synthesis Engine**: Component that combines council member responses into consensus
- **Code Block**: Fenced code section in markdown (```language ... ```)
- **Functional Equivalence**: Code that produces the same output for the same input, regardless of syntax differences
- **Validation Weight**: Multiplier applied to response based on code quality metrics
- **Agreement Level**: Numeric score (0.0-1.0) indicating consensus among council members
- **Code-Aware Similarity**: Similarity calculation that recognizes functionally equivalent code
- **Balanced Brackets**: Matching pairs of (), {}, []
- **Syntax Error**: Code that violates language grammar rules
- **Error Handling**: Code patterns for catching and managing exceptions
- **Documentation**: Comments, docstrings, or inline explanations in code
- **Coding Preset**: Pre-configured council settings optimized for code generation

## Requirements

### Requirement 1: Code Detection and Classification

**User Story:** As a developer using the council for code generation, I want the system to automatically detect when responses contain code, so that appropriate similarity algorithms are applied.

#### Acceptance Criteria

1. WHEN a response contains markdown code blocks (```language ... ```) THEN the System SHALL classify it as a code response
2. WHEN a response contains programming language keywords (function, class, def, import, const, let, var) THEN the System SHALL classify it as a code response
3. WHEN a response is classified as code THEN the System SHALL use code-aware similarity calculation
4. WHEN a response is classified as non-code THEN the System SHALL use text-based similarity calculation
5. WHEN responses are mixed (some code, some text) THEN the System SHALL use code-aware similarity for the entire set

### Requirement 2: Code Extraction

**User Story:** As a developer, I want the system to extract code blocks from responses, so that similarity can be calculated on the actual code rather than surrounding text.

#### Acceptance Criteria

1. WHEN extracting code from markdown THEN the System SHALL identify all fenced code blocks (```...```)
2. WHEN extracting code from markdown THEN the System SHALL preserve the code content exactly
3. WHEN extracting code from markdown THEN the System SHALL identify the language if specified
4. WHEN no code blocks are present THEN the System SHALL attempt to identify inline code patterns
5. WHEN multiple code blocks exist in one response THEN the System SHALL extract all blocks
6. WHEN code extraction fails THEN the System SHALL fall back to full response text

### Requirement 3: Code-Aware Similarity Calculation

**User Story:** As a developer, I want functionally equivalent code to be recognized as similar, so that consensus is based on logic rather than syntax style.

#### Acceptance Criteria

1. WHEN comparing code responses THEN the System SHALL calculate similarity based on functional equivalence
2. WHEN function signatures match (name and parameters) THEN the System SHALL weight this at 70% of similarity score
3. WHEN logic structure is similar (control flow, operations) THEN the System SHALL weight this at 20% of similarity score
4. WHEN variable names are similar THEN the System SHALL weight this at 10% of similarity score
5. WHEN code is functionally identical but styled differently THEN the System SHALL return high similarity (>0.8)
6. WHEN code has different logic THEN the System SHALL return low similarity (<0.4)
7. WHEN code similarity calculation fails THEN the System SHALL fall back to text-based similarity

### Requirement 4: Function Signature Extraction

**User Story:** As a developer, I want the system to compare function signatures, so that solutions implementing the same interface are recognized as similar.

#### Acceptance Criteria

1. WHEN extracting function signatures THEN the System SHALL identify function names
2. WHEN extracting function signatures THEN the System SHALL identify parameter names and count
3. WHEN extracting function signatures THEN the System SHALL identify return types if present
4. WHEN comparing signatures THEN the System SHALL normalize whitespace and formatting
5. WHEN comparing signatures THEN the System SHALL consider parameter order
6. WHEN signatures match exactly THEN the System SHALL return similarity score of 1.0
7. WHEN signatures differ in parameter names only THEN the System SHALL return similarity score of 0.8
8. WHEN signatures differ in parameter count THEN the System SHALL return similarity score proportional to overlap

### Requirement 5: Logic Structure Comparison

**User Story:** As a developer, I want the system to compare control flow structures, so that algorithmically similar solutions are recognized.

#### Acceptance Criteria

1. WHEN comparing logic structure THEN the System SHALL identify control flow keywords (if, for, while, switch)
2. WHEN comparing logic structure THEN the System SHALL count nesting depth
3. WHEN comparing logic structure THEN the System SHALL identify loop patterns
4. WHEN comparing logic structure THEN the System SHALL identify conditional patterns
5. WHEN control flow patterns match THEN the System SHALL increase similarity score
6. WHEN nesting depth is similar THEN the System SHALL increase similarity score
7. WHEN logic structure differs significantly THEN the System SHALL decrease similarity score

### Requirement 6: Basic Code Validation

**User Story:** As a developer, I want responses with syntactically correct code to be weighted higher, so that the consensus favors working solutions.

#### Acceptance Criteria

1. WHEN validating code THEN the System SHALL check for balanced brackets (), {}, []
2. WHEN brackets are unbalanced THEN the System SHALL apply weight multiplier of 0.3
3. WHEN code has obvious syntax errors THEN the System SHALL apply weight multiplier of 0.5
4. WHEN code passes basic validation THEN the System SHALL maintain weight of 1.0
5. WHEN validation cannot be performed THEN the System SHALL maintain weight of 1.0
6. WHEN multiple validation checks fail THEN the System SHALL multiply weight factors

### Requirement 7: Bracket Balance Validation

**User Story:** As a developer, I want the system to detect unbalanced brackets, so that syntactically invalid code is deprioritized.

#### Acceptance Criteria

1. WHEN checking bracket balance THEN the System SHALL count opening parentheses (
2. WHEN checking bracket balance THEN the System SHALL count closing parentheses )
3. WHEN checking bracket balance THEN the System SHALL count opening braces {
4. WHEN checking bracket balance THEN the System SHALL count closing braces }
5. WHEN checking bracket balance THEN the System SHALL count opening brackets [
6. WHEN checking bracket balance THEN the System SHALL count closing brackets ]
7. WHEN all bracket types are balanced THEN the System SHALL return true
8. WHEN any bracket type is unbalanced THEN the System SHALL return false

### Requirement 8: Syntax Error Detection

**User Story:** As a developer, I want the system to detect obvious syntax errors, so that clearly broken code is deprioritized.

#### Acceptance Criteria

1. WHEN detecting syntax errors THEN the System SHALL check for unclosed strings
2. WHEN detecting syntax errors THEN the System SHALL check for invalid operators
3. WHEN detecting syntax errors THEN the System SHALL check for malformed keywords
4. WHEN detecting syntax errors THEN the System SHALL use regex patterns for common errors
5. WHEN obvious syntax errors are found THEN the System SHALL return true
6. WHEN no obvious syntax errors are found THEN the System SHALL return false
7. WHEN error detection is uncertain THEN the System SHALL return false (assume valid)

### Requirement 9: Error Handling Detection

**User Story:** As a developer, I want responses with error handling to be weighted higher, so that robust solutions are preferred.

#### Acceptance Criteria

1. WHEN detecting error handling THEN the System SHALL check for try-catch blocks
2. WHEN detecting error handling THEN the System SHALL check for error checking conditionals
3. WHEN detecting error handling THEN the System SHALL check for exception keywords (throw, raise, except)
4. WHEN error handling is present THEN the System SHALL apply weight multiplier of 1.2
5. WHEN no error handling is present THEN the System SHALL maintain weight of 1.0
6. WHEN multiple error handling patterns exist THEN the System SHALL apply multiplier once (not compound)

### Requirement 10: Documentation Detection

**User Story:** As a developer, I want responses with documentation to be weighted higher, so that maintainable solutions are preferred.

#### Acceptance Criteria

1. WHEN detecting documentation THEN the System SHALL check for single-line comments (//, #)
2. WHEN detecting documentation THEN the System SHALL check for multi-line comments (/* */, """)
3. WHEN detecting documentation THEN the System SHALL check for docstrings
4. WHEN detecting documentation THEN the System SHALL check for JSDoc/JavaDoc patterns
5. WHEN documentation is present THEN the System SHALL apply weight multiplier of 1.1
6. WHEN no documentation is present THEN the System SHALL maintain weight of 1.0
7. WHEN multiple documentation patterns exist THEN the System SHALL apply multiplier once (not compound)

### Requirement 11: Validation Weight Application

**User Story:** As a developer, I want validation weights to be applied during synthesis, so that higher quality code influences the consensus more.

#### Acceptance Criteria

1. WHEN synthesizing with weighted-fusion strategy THEN the System SHALL apply validation weights
2. WHEN synthesizing with consensus-extraction strategy THEN the System SHALL apply validation weights
3. WHEN synthesizing with meta-synthesis strategy THEN the System SHALL apply validation weights
4. WHEN validation weights are applied THEN the System SHALL multiply base weights by validation factors
5. WHEN validation weights result in zero THEN the System SHALL use minimum weight of 0.1
6. WHEN validation weights exceed 2.0 THEN the System SHALL cap at 2.0
7. WHEN validation fails THEN the System SHALL log warning and use weight of 1.0

### Requirement 12: Code-Aware Meta-Synthesis Prompts

**User Story:** As a developer, I want the meta-synthesis moderator to receive code-specific instructions, so that the final synthesis prioritizes correctness and completeness.

#### Acceptance Criteria

1. WHEN meta-synthesis detects code responses THEN the System SHALL use code-specific prompt instructions
2. WHEN using code-specific prompts THEN the System SHALL instruct moderator to identify functionally correct solutions
3. WHEN using code-specific prompts THEN the System SHALL instruct moderator to combine best error handling
4. WHEN using code-specific prompts THEN the System SHALL instruct moderator to include comprehensive edge cases
5. WHEN using code-specific prompts THEN the System SHALL instruct moderator to prefer better time/space complexity
6. WHEN using code-specific prompts THEN the System SHALL instruct moderator to ensure syntactic validity
7. WHEN using code-specific prompts THEN the System SHALL instruct moderator to add explanatory comments
8. WHEN meta-synthesis detects non-code responses THEN the System SHALL use standard prompt instructions

### Requirement 13: Coding Council Preset

**User Story:** As a developer, I want a pre-configured "coding-council" preset, so that I can easily optimize the council for code generation tasks.

#### Acceptance Criteria

1. WHEN applying coding-council preset THEN the System SHALL configure 3 council members minimum
2. WHEN applying coding-council preset THEN the System SHALL include Claude Sonnet 4.5 (coding specialist)
3. WHEN applying coding-council preset THEN the System SHALL include GPT-5.1 (general purpose)
4. WHEN applying coding-council preset THEN the System SHALL include DeepSeek-v3 (open source)
5. WHEN applying coding-council preset THEN the System SHALL set deliberation rounds to 3
6. WHEN applying coding-council preset THEN the System SHALL set synthesis strategy to weighted-fusion
7. WHEN applying coding-council preset THEN the System SHALL set timeout to 120 seconds
8. WHEN applying coding-council preset THEN the System SHALL require minimum consensus of 2 members
9. WHEN applying coding-council preset THEN the System SHALL enable code-aware similarity
10. WHEN applying coding-council preset THEN the System SHALL enable validation weighting

### Requirement 14: Backward Compatibility

**User Story:** As a system administrator, I want existing functionality to remain unchanged, so that non-coding use cases continue to work correctly.

#### Acceptance Criteria

1. WHEN processing non-code responses THEN the System SHALL use existing text-based similarity
2. WHEN code detection is disabled THEN the System SHALL use existing text-based similarity
3. WHEN validation weighting is disabled THEN the System SHALL use existing weight calculation
4. WHEN using existing presets THEN the System SHALL maintain current behavior
5. WHEN code-aware features fail THEN the System SHALL fall back to existing behavior
6. WHEN API requests do not specify code mode THEN the System SHALL auto-detect based on content
7. WHEN existing tests run THEN the System SHALL pass without modification
