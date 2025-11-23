# Implementation Plan

- [x] 1. Implement idempotency cache infrastructure
  - Create IdempotencyCache class with Redis connection
  - Implement checkKey function to detect duplicate requests
  - Implement cacheResult function with 24-hour TTL
  - Implement cacheError function for failed requests
  - Implement waitForCompletion for concurrent request handling
  - Add distributed locking for concurrent key access
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 1.1 Write property test for idempotency key detection
  - **Property 1: Idempotency key detection**
  - **Validates: Requirements 1.1**

- [x] 1.2 Write property test for cached result return
  - **Property 2: Cached result return**
  - **Validates: Requirements 1.2**

- [x] 1.3 Write property test for concurrent request handling
  - **Property 3: Concurrent request handling**
  - **Validates: Requirements 1.3**

- [x] 1.4 Write property test for result caching with TTL
  - **Property 4: Result caching with TTL**
  - **Validates: Requirements 1.4**

- [x] 1.5 Write property test for error caching
  - **Property 5: Error caching**
  - **Validates: Requirements 1.5**

- [x] 2. Integrate idempotency into API gateway
  - Extend API gateway to accept Idempotency-Key header
  - Add idempotency check before request processing
  - Return cached results for duplicate keys
  - Handle concurrent requests with same key
  - Add fromCache flag to API responses
  - _Requirements: 1.1, 1.2, 1.3, 1.6_

- [x] 2.1 Write property test for normal processing without key
  - **Property 6: Normal processing without key**
  - **Validates: Requirements 1.6**

- [ ] 3. Implement tool execution engine
  - Create ToolExecutionEngine class
  - Implement tool registry for available tools
  - Create ToolDefinition and ToolParameter types
  - Implement executeTool function with timeout handling
  - Implement executeParallel for concurrent tool calls
  - Add tool result tracking per request
  - Create tool adapter interface for extensibility
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 3.1 Write property test for tool definition inclusion
  - **Property 7: Tool definition inclusion**
  - **Validates: Requirements 2.1**

- [ ] 3.2 Write property test for tool execution and result delivery
  - **Property 8: Tool execution and result delivery**
  - **Validates: Requirements 2.2**

- [ ] 3.3 Write property test for parallel tool execution
  - **Property 9: Parallel tool execution**
  - **Validates: Requirements 2.3**

- [ ] 4. Integrate tool use into orchestration engine
  - Extend orchestration engine to include tool definitions in council member requests
  - Implement tool call detection in council member responses
  - Execute tool calls and provide results back to council members
  - Share tool usage across council members during deliberation
  - Allow follow-up tool calls during deliberation rounds
  - Include tool results in synthesis context
  - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6_

- [ ] 4.1 Write property test for tool result sharing
  - **Property 10: Tool result sharing**
  - **Validates: Requirements 2.4**

- [ ] 4.2 Write property test for follow-up tool calls
  - **Property 11: Follow-up tool calls**
  - **Validates: Requirements 2.5**

- [ ] 4.3 Write property test for tool insights in synthesis
  - **Property 12: Tool insights in synthesis**
  - **Validates: Requirements 2.6**

- [ ] 5. Add tool usage logging and dashboard display
  - Create tool_usage database table
  - Implement tool usage logging in event logger
  - Add getToolUsageForRequest function
  - Extend dashboard to display tool calls per request
  - Show tool results and latency in dashboard
  - Add tool usage analytics (most used tools, success rates)
  - _Requirements: 2.7_

- [ ] 5.1 Write property test for tool usage dashboard display
  - **Property 13: Tool usage dashboard display**
  - **Validates: Requirements 2.7**

- [ ] 6. Implement budget enforcer
  - Create BudgetEnforcer class with database connection
  - Implement checkBudget function to validate spending limits
  - Implement recordSpending function to track costs
  - Create budget_caps and budget_spending database tables
  - Implement budget period tracking (daily, weekly, monthly)
  - Add budget-disabled marking for over-budget members
  - Implement automatic re-enabling on period reset
  - _Requirements: 4.1, 4.2, 4.3, 4.6_

- [ ] 6.1 Write property test for budget cap configuration
  - **Property 19: Budget cap configuration**
  - **Validates: Requirements 4.1**

- [ ] 6.2 Write property test for budget cap enforcement
  - **Property 20: Budget cap enforcement**
  - **Validates: Requirements 4.2**

- [ ] 6.3 Write property test for budget-disabled exclusion
  - **Property 21: Budget-disabled exclusion**
  - **Validates: Requirements 4.3**

- [ ] 6.4 Write property test for budget period reset
  - **Property 24: Budget period reset**
  - **Validates: Requirements 4.6**

- [ ] 7. Integrate budget enforcement into orchestration
  - Add budget check before council member API calls
  - Reject calls that would exceed budget caps
  - Exclude budget-disabled members from council
  - Return 429 error when all members are budget-disabled
  - Log budget rejections for monitoring
  - _Requirements: 4.2, 4.3, 4.7_

- [ ] 7.1 Write property test for unlimited spending without caps
  - **Property 25: Unlimited spending without caps**
  - **Validates: Requirements 4.7**

- [ ] 8. Implement budget dashboard and alerts
  - Extend dashboard to display budget status
  - Show current spending vs. budget caps
  - Add visual warnings at 75% and 90% thresholds
  - Implement alert generation when caps are reached
  - Display budget-disabled members with reset times
  - Add budget analytics (spending trends, projections)
  - _Requirements: 4.4, 4.5_

- [ ] 8.1 Write property test for budget warning thresholds
  - **Property 22: Budget warning thresholds**
  - **Validates: Requirements 4.4**

- [ ] 8.2 Write property test for budget cap alert generation
  - **Property 23: Budget cap alert generation**
  - **Validates: Requirements 4.5**

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement devil's advocate module
  - Create DevilsAdvocateModule class
  - Implement selectDevilsAdvocate function with strategy support
  - Implement generateCritiquePrompt function
  - Implement synthesizeWithCritique function
  - Implement adjustConfidence based on critique strength
  - Create devils_advocate_critiques database table
  - _Requirements: 3.2, 3.3, 3.4, 3.6_

- [ ] 10.1 Write property test for critique prompt generation
  - **Property 14: Critique prompt generation**
  - **Validates: Requirements 3.2**

- [ ] 10.2 Write property test for separate synthesizer
  - **Property 15: Separate synthesizer**
  - **Validates: Requirements 3.3**

- [ ] 10.3 Write property test for strongest devil's advocate selection
  - **Property 16: Strongest devil's advocate selection**
  - **Validates: Requirements 3.4**

- [ ] 10.4 Write property test for confidence adjustment
  - **Property 18: Confidence adjustment**
  - **Validates: Requirements 3.6**

- [ ] 11. Integrate devil's advocate into synthesis engine
  - Extend synthesis engine to support devil's advocate strategy
  - Add devil's advocate option to synthesis configuration
  - Implement two-phase synthesis (critique then final)
  - Ensure devil's advocate is different from final synthesizer
  - Track devil's advocate effectiveness metrics
  - _Requirements: 3.2, 3.3, 3.4, 3.6_

- [ ] 12. Add devil's advocate dashboard display
  - Extend dashboard to show devil's advocate usage
  - Highlight devil's advocate critique in deliberation view
  - Show confidence adjustments from critiques
  - Add devil's advocate effectiveness analytics
  - Display which member served as devil's advocate per request
  - _Requirements: 3.5_

- [ ] 12.1 Write property test for devil's advocate dashboard identification
  - **Property 17: Devil's advocate dashboard identification**
  - **Validates: Requirements 3.5**

- [ ] 13. Implement per-request transparency
  - Extend API request interface to accept transparency parameter
  - Modify orchestration engine to track per-request transparency setting
  - Update response formatting to include/exclude deliberation based on parameter
  - Implement transparency override logic (per-request vs. global vs. forced)
  - Add transparency flag to request logging
  - _Requirements: 5.1, 5.2, 5.3, 5.6_

- [ ] 13.1 Write property test for per-request transparency enabled
  - **Property 26: Per-request transparency enabled**
  - **Validates: Requirements 5.1**

- [ ] 13.2 Write property test for per-request transparency disabled
  - **Property 27: Per-request transparency disabled**
  - **Validates: Requirements 5.2**

- [ ] 13.3 Write property test for default transparency behavior
  - **Property 28: Default transparency behavior**
  - **Validates: Requirements 5.3**

- [ ] 13.4 Write property test for forced transparency override
  - **Property 31: Forced transparency override**
  - **Validates: Requirements 5.6**

- [ ] 14. Implement streaming with per-request transparency
  - Extend streaming endpoint to support per-request transparency
  - Stream deliberation exchanges when transparency is enabled
  - Ensure proper SSE formatting for deliberation data
  - Add transparency metadata to streamed events
  - _Requirements: 5.4_

- [ ] 14.1 Write property test for streaming with transparency
  - **Property 29: Streaming with transparency**
  - **Validates: Requirements 5.4**

- [ ] 15. Add transparency tracking to dashboard
  - Extend dashboard to show transparency flag per request
  - Add transparency usage analytics
  - Show which requests used per-request transparency override
  - Display transparency patterns over time
  - _Requirements: 5.5_

- [ ] 15.1 Write property test for transparency flag in dashboard
  - **Property 30: Transparency flag in dashboard**
  - **Validates: Requirements 5.5**

- [ ] 16. Implement feature flags for all enhancements
  - Add feature flag configuration for each enhancement
  - Implement feature flag checking in relevant components
  - Add feature flag status to dashboard
  - Document feature flag usage in configuration guide
  - _Requirements: All requirements depend on controlled rollout_

- [ ] 17. Integration testing for enhancements
  - Test idempotency with concurrent requests
  - Test tool use across multiple council members
  - Test budget enforcement with multiple requests
  - Test devil's advocate synthesis end-to-end
  - Test per-request transparency with streaming
  - Test feature flag toggling
  - Test interaction between enhancements (e.g., tool use + budget caps)

- [ ] 18. Update documentation
  - Document idempotency key usage in API documentation
  - Document tool registration and execution
  - Document budget cap configuration
  - Document devil's advocate synthesis strategy
  - Document per-request transparency parameter
  - Create migration guide for existing deployments
  - Update deployment guide with new Redis requirements

- [ ] 19. Final checkpoint - Ensure all tests pass
  - Run full test suite including base system and enhancements
  - Verify all property tests pass with 100+ iterations
  - Ensure all integration tests pass
  - Verify backward compatibility with base system
  - Ask the user if questions arise
