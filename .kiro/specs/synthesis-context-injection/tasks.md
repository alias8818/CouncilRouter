# Implementation Plan

- [x] 1. Update interfaces for query context injection
- [x] 1.1 Update ISynthesisEngine interface to accept UserRequest parameter
  - Modify `synthesize()` method signature to include `request: UserRequest`
  - Update interface documentation with parameter descriptions
  - _Requirements: 1.1, 4.1_

- [x] 1.2 Update IDevilsAdvocateModule interface with full implementation methods
  - Add `critique()` method with query, synthesis, and responses parameters
  - Add `rewrite()` method with query, original synthesis, and critique parameters
  - Define `Critique` interface with weaknesses, suggestions, and severity
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 1.3 Update ValidationResult interface with critical error flag
  - Add `isCriticalError: boolean` field
  - Update documentation to explain critical error handling
  - _Requirements: 2.1_

- [x] 1.4 Write property test for interface consistency
  - **Property 1: Query Context Preservation Across All Strategies**
  - **Validates: Requirements 1.1, 1.2, 1.5, 4.2, 4.3**

- [x] 2. Update SynthesisEngine core implementation
- [x] 2.1 Update synthesize method signature and query extraction
  - Change method signature to accept `request: UserRequest`
  - Extract query from request: `const query = request.query`
  - Add query validation (null/empty check)
  - Pass query to all synthesis strategy calls
  - _Requirements: 1.1, 4.2, 4.5_

- [x] 2.2 Fix Consensus Extraction strategy for code responses
  - Detect code responses using existing `isCodeRequest` logic
  - For code: select single best response from majority group based on validation weight
  - For text: keep existing concatenation logic
  - _Requirements: 2.1_

- [x] 2.3 Fix Weighted Fusion strategy for code responses
  - Detect code responses using existing `isCodeRequest` logic
  - For code: select highest-weighted response (no concatenation)
  - For text: keep existing weighted concatenation logic
  - _Requirements: 2.1_

- [x] 2.4 Update Meta-Synthesis strategy with query context
  - Pass query to moderator prompt construction
  - Update prompt template to include "ORIGINAL USER QUERY:" section
  - Ensure query is sanitized before inclusion in prompt
  - _Requirements: 1.2, 1.3_

- [x] 2.5 Write property test for code non-concatenation
  - **Property 2: Code Non-Concatenation**
  - **Validates: Requirements 2.1**

- [x] 2.6 Write property test for query validation
  - **Property 8: Query Validation**
  - **Validates: Requirements 4.5**

- [x] 3. Implement production-ready code synthesis prompts
- [x] 3.1 Create specialized code synthesis prompt template
  - Define new prompt template for code synthesis
  - Include sections for: correctness, security, error handling, best practices, completeness, user constraints
  - Add explicit "CRITICAL REQUIREMENTS FOR PRODUCTION-READY CODE" section
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 5.1, 5.2_

- [x] 3.2 Update Meta-Synthesis to use code-specific prompts
  - Detect code requests using `isCodeRequest` flag
  - Use specialized code prompt template for code requests
  - Use standard prompt template for text requests
  - _Requirements: 5.1_

- [x] 3.3 Write property test for production-ready code prompt completeness
  - **Property 4: Production-Ready Code Prompt Completeness**
  - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 5.2, 5.3, 5.4, 5.5**

- [x] 3.4 Write property test for code-specific prompt template selection
  - **Property 5: Code-Specific Prompt Template Selection**
  - **Validates: Requirements 5.1**

- [x] 4. Enhance code validation with critical error detection
- [x] 4.1 Update code validator to set critical error flag
  - When `hasObviousSyntaxErrors` is true, set `isCriticalError: true`
  - When `isCriticalError` is true, set `weight: 0.0`
  - Update validation logic to reject responses with critical errors
  - _Requirements: 2.1_

- [x] 4.2 Update synthesis strategies to respect critical error flag
  - Filter out responses with `isCriticalError: true` before synthesis
  - Log when responses are rejected due to critical errors
  - _Requirements: 2.1_

- [x] 4.3 Write property test for critical error rejection
  - **Property 3: Critical Error Rejection**
  - **Validates: Requirements 2.1**

- [x] 5. Implement Devil's Advocate critique generation
- [x] 5.1 Implement critique method with LLM integration
  - Create critique prompt template
  - Call provider adapter to generate critique
  - Parse LLM response into Critique object (weaknesses, suggestions, severity)
  - Handle provider errors gracefully (return empty critique)
  - _Requirements: 3.1, 3.2_

- [x] 5.2 Implement rewrite method with LLM integration
  - Create rewrite prompt template including original synthesis and critique
  - Call provider adapter to generate rewrite
  - Return rewritten response
  - Handle provider errors gracefully (return original synthesis)
  - _Requirements: 3.3_

- [x] 5.3 Implement synthesizeWithCritique orchestration method
  - Call critique() to generate critique
  - Check critique severity and weaknesses
  - If minor/no issues, return original synthesis
  - Otherwise, call rewrite() to improve response
  - Log critique and rewrite activity
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 5.4 Write property test for active critique generation
  - **Property 6: Active Critique Generation with LLM**
  - **Validates: Requirements 3.1, 3.2**
  - Note: Covered in devils-advocate.test.ts unit tests

- [x] 5.5 Write property test for critique-based rewrite
  - **Property 7: Critique-Based Rewrite with LLM**
  - **Validates: Requirements 3.3, 3.5**
  - Note: Covered in devils-advocate.test.ts unit tests

- [x] 6. Add Devil's Advocate configuration support
- [x] 6.1 Define DevilsAdvocateConfig interface and add to ConfigurationManager
  - Create config interface with enabled, request type filters, intensity level, provider, model
  - Add to main Configuration type
  - Add validation for Devil's Advocate config
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 6.2 Update SynthesisEngine to conditionally invoke Devil's Advocate
  - Check if Devil's Advocate is enabled in configuration
  - Check if request type matches configured filters
  - If enabled and matches, call `synthesizeWithCritique()`
  - If disabled, return synthesis directly
  - _Requirements: 6.1, 6.4_

- [x] 6.3 Implement configuration hot-reload for Devil's Advocate
  - Ensure ConfigurationManager cache invalidation works for Devil's Advocate config
  - Test that config changes apply to next request without restart
  - _Requirements: 6.5_

- [x] 6.4 Write property test for Devil's Advocate configuration enforcement
  - **Property 9: Devil's Advocate Configuration Enforcement**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 7. Implement Devil's Advocate logging
- [x] 7.1 Add logging to critique method
  - Log critique content (weaknesses, suggestions, severity)
  - Include request ID in log event
  - Log timestamp and duration
  - _Requirements: 7.1, 7.4_

- [x] 7.2 Add logging to rewrite method
  - Log original synthesis length
  - Log rewritten synthesis length
  - Include request ID in log event
  - Log timestamp and duration
  - _Requirements: 7.2, 7.4_

- [x] 7.3 Add improvement indicator to synthesizeWithCritique logging
  - Calculate if rewrite differs from original (improvement indicator)
  - Log whether critique resulted in changes
  - Include total time for critique + rewrite
  - _Requirements: 7.3, 7.5_

- [x] 7.4 Write property test for Devil's Advocate logging completeness
  - **Property 10: Devil's Advocate Logging Completeness**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
  - Note: Logging is tested via integration in devils-advocate.test.ts

- [x] 8. Update OrchestrationEngine to pass UserRequest to SynthesisEngine
- [x] 8.1 Update orchestration engine synthesis call
  - Change `synthesisEngine.synthesize()` call to pass full `request` object
  - Ensure request is available at synthesis call site
  - Update error handling for new signature
  - _Requirements: 4.2_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Add database schema for Devil's Advocate logging
- [x] 10.1 Create devils_advocate_logs table
  - Add table with columns: id, request_id, critique_content, original_length, improved_length, time_taken, improved, created_at
  - Add index on request_id for fast lookups
  - Update schema.sql file
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 10.2 Update EventLogger to persist Devil's Advocate events
  - Add method to log Devil's Advocate events to database
  - Include all required fields from logging requirements
  - Handle database errors gracefully
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 11. Update existing tests for new interface signatures
- [x] 11.1 Update SynthesisEngine unit tests
  - Update all test calls to `synthesize()` to pass UserRequest
  - Add tests for query validation
  - Add tests for code vs text prompt selection
  - _Requirements: 1.1, 4.5, 5.1_

- [x] 11.2 Update OrchestrationEngine integration tests
  - Update tests to verify UserRequest is passed to SynthesisEngine
  - Add end-to-end test for code synthesis with query context
  - _Requirements: 4.2_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
