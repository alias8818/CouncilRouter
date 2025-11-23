# Implementation Plan

- [x] 1. Fix critical timeout unit bugs in Orchestration Engine
  - Update timeout conversion to explicitly multiply by 1000 before setTimeout
  - Verify error messages display timeout in seconds
  - Ensure timeoutMs variable is consistently used
  - _Requirements: 1.1, 1.2_

- [x] 1.1 Write property test for orchestration engine timeout conversion
  - **Property 1: Orchestration Engine timeout conversion**
  - **Validates: Requirements 1.1**

- [x] 1.2 Write property test for orchestration engine timeout error messages
  - **Property 2: Orchestration Engine timeout error messages**
  - **Validates: Requirements 1.2**

- [x] 2. Fix critical timeout unit bugs in Base Provider Adapter
  - Update timeout conversion to multiply by 1000 before setTimeout
  - Fix error message to say "seconds" not "milliseconds"
  - Ensure consistent timeout handling across all provider adapters
  - _Requirements: 1.3, 1.4_

- [x] 2.1 Write property test for base provider adapter timeout conversion
  - **Property 3: Base Provider Adapter timeout conversion**
  - **Validates: Requirements 1.3**

- [x] 2.2 Write property test for base provider adapter timeout error messages
  - **Property 4: Base Provider Adapter timeout error messages**
  - **Validates: Requirements 1.4**

- [x] 3. Fix critical member ID attribution bug in Orchestration Engine
  - Replace placeholder member IDs with actual Council Member IDs from responses
  - Update global timeout handling to preserve member attribution
  - Ensure all deliberation exchanges have correct member IDs
  - _Requirements: 2.1, 2.2_

- [x] 3.1 Write property test for global timeout preserves member IDs
  - **Property 5: Global timeout preserves member IDs**
  - **Validates: Requirements 2.1**

- [x] 3.2 Write property test for logged responses have correct member IDs
  - **Property 6: Logged responses have correct member IDs**
  - **Validates: Requirements 2.2**

- [x] 3.3 Write property test for analytics sees correct member IDs
  - **Property 7: Analytics sees correct member IDs**
  - **Validates: Requirements 2.3**

- [x] 3.4 Write property test for cost attribution uses correct member IDs
  - **Property 8: Cost attribution uses correct member IDs**
  - **Validates: Requirements 2.4**

- [x] 4. Checkpoint - Ensure all critical bug tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Fix race condition in Session Manager cache updates
  - Update addMessage and other methods to use forUpdate=true when reading sessions
  - Ensure atomic read-modify-write operations for session updates
  - Verify all session update paths use SELECT FOR UPDATE
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 5.1 Write property test for session updates are atomic
  - **Property 9: Session updates are atomic**
  - **Validates: Requirements 3.1**

- [x] 6. Fix thread safety issue in Synthesis Engine rotation index
  - Implement mutex/lock for rotation index access
  - Ensure atomic increment operation
  - Verify no members are skipped or duplicated under concurrent access
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 6.1 Write property test for rotation sequence is correct under concurrency
  - **Property 10: Rotation sequence is correct under concurrency**
  - **Validates: Requirements 4.1, 4.3**

- [x] 7. Fix disagreement calculation logic in Analytics Engine
  - Change disagreement calculation to compare member responses directly
  - Remove consensus-based comparison logic
  - Update calculateOverlap calls to compare content1 to content2
  - Verify disagreement metric reflects actual member-to-member differences
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7.1 Write property test for disagreement measures member-to-member difference
  - **Property 11: Disagreement measures member-to-member difference**
  - **Validates: Requirements 5.1**

- [x] 7.2 Write property test for agreement matrix reflects member differences
  - **Property 12: Agreement matrix reflects member differences**
  - **Validates: Requirements 5.4**

- [x] 8. Fix null handling in Analytics Engine query results
  - Add null checks before accessing row.consensus_decision
  - Add null checks before accessing row.member1_content and row.member2_content
  - Skip invalid rows gracefully without throwing errors
  - Add defensive programming throughout analytics queries
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 8.1 Write property test for analytics handles null values safely
  - **Property 13: Analytics handles null values safely**
  - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 9. Checkpoint - Ensure all major bug tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Fix authorization error paths in API Gateway
  - Add explicit return statements after sending 401 Unauthorized responses
  - Ensure execution terminates immediately after authorization failures
  - Review all error response paths for explicit returns
  - _Requirements: 11.1, 11.2_

- [x] 10.1 Write property test for authorization error paths terminate execution
  - **Property 25: Authorization error paths terminate execution**
  - **Validates: Requirements 11.1, 11.2**

- [x] 11. Fix word filtering comment mismatch in Synthesis Engine
  - Update comment to accurately state "1 and 2 chars" instead of "1-2 chars"
  - Verify comment matches the filter logic (word.length > 2)
  - _Requirements: 7.1, 7.2_

- [x] 12. Fix retry policy validation in Configuration Manager
  - Change validation condition from < 0 to <= 0
  - Update error message to say "must be positive" instead of "must be non-negative"
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 12.1 Write property test for retry policy rejects invalid maxAttempts
  - **Property 14: Retry policy rejects invalid maxAttempts**
  - **Validates: Requirements 8.1**

- [x] 13. Fix cost alert period matching in Cost Calculator
  - Replace substring matching (includes) with exact matching (===)
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 13.1 Write property test for cost period matching is exact
  - **Property 15: Cost period matching is exact**
  - **Validates: Requirements 9.1**

- [x] 14. Fix inconsistent failure tracking between Provider Pool and Orchestration Engine
  - Create shared ProviderHealthTracker service in src/providers/health-tracker.ts
  - Implement centralized failure counting and disabled state management
  - Update Provider Pool to use shared tracker
  - Update Orchestration Engine to use shared tracker
  - Ensure both components see consistent failure counts and disabled state
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 14.1 Write property test for failure tracking is consistent
  - **Property 17: Failure tracking is consistent**
  - **Validates: Requirements 10.1**

- [x] 14.2 Write property test for disabled state is synchronized
  - **Property 18: Disabled state is synchronized**
  - **Validates: Requirements 10.2**

- [x] 15. Fix percentile calculation in Analytics Engine
  - Replace Math.ceil approach with linear interpolation
  - Handle edge cases for small datasets (0, 1, 2 elements)
  - Use standard percentile calculation method
  - _Requirements: 13.1, 13.2, 13.3_

- [x] 15.1 Write property test for percentile calculation is mathematically correct
  - **Property 21: Percentile calculation is mathematically correct**
  - **Validates: Requirements 13.1, 13.3**

- [x] 16. Add preset validation in Configuration Manager
  - Validate preset name before calling getPresetConfigurations
  - Throw ConfigurationValidationError for invalid presets
  - _Requirements: 14.1, 14.2, 14.3_

- [x] 16.1 Write property test for preset validation occurs first
  - **Property 16: Preset validation occurs first**
  - **Validates: Requirements 14.1**

- [x] 17. Improve token estimation in Session Manager
  - Install @dqbd/tiktoken package
  - Implement encoder caching per model
  - Replace simple heuristic with tiktoken-based estimation
  - Add fallback for unknown models
  - _Requirements: 12.1, 12.2, 12.3_

- [x] 17.1 Write property test for token estimation handles non-English text
  - **Property 19: Token estimation handles non-English text**
  - **Validates: Requirements 12.2**

- [x] 17.2 Write property test for token estimation handles code content
  - **Property 20: Token estimation handles code content**
  - **Validates: Requirements 12.3**

- [x] 18. Checkpoint - Ensure all moderate and minor bug tests pass
  - Ensure all tests pass, ask the user if questions arise.
