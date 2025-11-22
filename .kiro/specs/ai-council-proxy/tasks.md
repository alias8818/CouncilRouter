# Implementation Plan

- [x] 1. Set up project structure and core interfaces
  - Create directory structure for API gateway, orchestration, providers, synthesis, session management, configuration, logging, and dashboard components
  - Define TypeScript interfaces for core data models (UserRequest, CouncilMember, InitialResponse, DeliberationThread, ConsensusDecision, etc.)
  - Set up testing framework (Jest with fast-check for property-based testing)
  - Configure database schema (PostgreSQL) and cache (Redis)
  - _Requirements: All requirements depend on this foundation_

- [x] 2. Implement provider pool and adapters
  - Create base ProviderAdapter interface with sendRequest, getHealth, and retry logic
  - Implement OpenAI provider adapter with API authentication and request formatting
  - Implement Anthropic provider adapter
  - Implement Google provider adapter
  - Add retry logic with exponential backoff
  - Add timeout handling per provider
  - _Requirements: 1.2, 9.1, 10.2, 10.3_

- [x] 2.1 Write property test for timeout enforcement
  - **Property 33: Timeout enforcement**
  - **Validates: Requirements 10.2**

- [x] 2.2 Write property test for retry attempt count
  - **Property 34: Retry attempt count**
  - **Validates: Requirements 10.3**

- [x] 3. Implement configuration manager
  - Create configuration storage and retrieval functions
  - Implement configuration validation (minimum 2 council members, valid timeout values)
  - Add configuration presets (fast-council, balanced-council, research-council)
  - Implement configuration caching in Redis
  - Add configuration versioning
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 10.1, 11.1_

- [x] 3.1 Write property test for configuration persistence round-trip
  - **Property 4: Configuration persistence round-trip**
  - **Validates: Requirements 2.3**

- [x] 3.2 Write property test for per-provider configuration support
  - **Property 36: Per-provider configuration support**
  - **Validates: Requirements 10.6**

- [x] 3.3 Write property test for configuration immediacy
  - **Property 35: Configuration immediacy**
  - **Validates: Requirements 10.5**

- [x] 4. Implement session manager
  - Create session storage and retrieval functions
  - Implement conversation history management
  - Add context window tracking and summarization logic
  - Implement session expiration based on inactivity timeout
  - Cache active sessions in Redis
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 4.1 Write property test for session history retrieval



  - **Property 25: Session history retrieval**
  - **Validates: Requirements 8.2**

- [x] 4.2 Write property test for context window summarization


  - **Property 28: Context window summarization**
  - **Validates: Requirements 8.5**

- [x] 4.3 Write property test for session expiration detection



  - **Property 29: Session expiration detection**
  - **Validates: Requirements 8.6**

- [x] 5. Implement orchestration engine core
  - Create request distribution logic to send requests to all configured council members in parallel
  - Implement response collection from council members
  - Add timeout handling for individual providers
  - Add global timeout handling with partial response synthesis
  - Implement failure tracking and automatic member disabling
  - _Requirements: 1.1, 1.2, 3.1, 9.1, 9.4, 10.2, 11.2_

- [x] 5.1 Write property test for request distribution completeness



  - **Property 1: Request distribution completeness**
  - **Validates: Requirements 1.2**



- [x] 5.2 Write property test for active configuration enforcement

  - **Property 5: Active configuration enforcement**
  - **Validates: Requirements 2.4**

- [x] 5.3 Write property test for automatic member disabling



  - **Property 31: Automatic member disabling**
  - **Validates: Requirements 9.4**

- [x] 5.4 Write property test for global timeout synthesis trigger




  - **Property 37: Global timeout synthesis trigger**
  - **Validates: Requirements 11.2**

- [x] 6. Implement deliberation logic
  - Create deliberation round orchestration
  - Implement peer response sharing mechanism
  - Add deliberation prompt generation for critique/agreement
  - Implement configurable deliberation round count (0-5 rounds)
  - Add deliberation presets (Fast=0, Balanced=1, Thorough=2, Research-grade=4)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 6.1 Write property test for deliberation round count enforcement






  - **Property 7: Deliberation round count enforcement**
  - **Validates: Requirements 3.5**

- [x] 6.2 Write property test for peer response sharing completeness





  - **Property 8: Peer response sharing completeness**
  - **Validates: Requirements 3.2**

- [x] 7. Implement synthesis engine



  - Create base synthesis interface
  - Implement Consensus Extraction strategy
  - Implement Weighted Fusion strategy with configurable weights
  - Implement Meta-Synthesis strategy with moderator selection
  - Add moderator selection logic (permanent, rotate, strongest)
  - Calculate agreement levels from responses
  - _Requirements: 1.3, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 7.1 Write property test for synthesis produces single output



  - **Property 2: Synthesis produces single output**
  - **Validates: Requirements 1.3**


- [x] 7.2 Write property test for designated moderator usage


  - **Property 20: Designated moderator usage**
  - **Validates: Requirements 7.2**


- [x] 7.3 Write property test for weighted fusion application


  - **Property 21: Weighted fusion application**
  - **Validates: Requirements 7.4**

- [x] 7.4 Write property test for strongest moderator selection



  - **Property 22: Strongest moderator selection**
  - **Validates: Requirements 7.6**

- [x] 7.5 Write property test for synthesis strategy persistence



  - **Property 23: Synthesis strategy persistence**
  - **Validates: Requirements 7.7**

- [x] 8. Checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement event logger





  - Create EventLogger class with database connection
  - Implement logRequest function to store user requests
  - Implement logCouncilResponse function to store council member responses
  - Implement logDeliberationRound function to store deliberation exchanges
  - Implement logConsensusDecision function to store final consensus
  - Implement logCost function with pricing version tracking
  - Implement logProviderFailure function for failure tracking
  - Add proper error handling and connection pooling
  - _Requirements: 4.1, 4.4, 5.1, 5.6_

- [x] 9.1 Write property test for complete logging



  - **Property 9: Complete logging**
  - **Validates: Requirements 4.1**

- [x] 9.2 Write property test for response attribution



  - **Property 10: Response attribution**
  - **Validates: Requirements 4.4**

- [x] 9.3 Write property test for pricing version tracking



  - **Property 16: Pricing version tracking**
  - **Validates: Requirements 5.6**

- [x] 10. Implement cost tracking




  - Create CostCalculator utility class
  - Implement provider pricing configuration (per token rates)
  - Add cost calculation logic based on token usage
  - Implement cost aggregation per request
  - Add cost breakdown by provider and council member
  - Implement cost threshold monitoring and alert generation
  - Support pricing version updates and historical tracking
  - Integrate cost tracking into orchestration engine
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 10.1 Write property test for cost calculation accuracy


  - **Property 13: Cost calculation accuracy**
  - **Validates: Requirements 5.1**

- [x] 10.2 Write property test for cost aggregation correctness


  - **Property 14: Cost aggregation correctness**
  - **Validates: Requirements 5.2**

- [x] 10.3 Write property test for cost alert triggering


  - **Property 15: Cost alert triggering**
  - **Validates: Requirements 5.5**

- [x] 11. Implement REST API gateway





  - Set up Express.js server with TypeScript
  - Create POST /api/v1/requests endpoint for submitting requests
  - Create GET /api/v1/requests/:requestId endpoint for retrieving results
  - Create GET /api/v1/requests/:requestId/stream endpoint for streaming responses (SSE)
  - Implement authentication middleware (JWT or API key validation)
  - Add request validation middleware
  - Implement rate limiting middleware
  - Wire up orchestration engine to API endpoints
  - Add proper error handling and status codes
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 11.1 Write property test for request identifier generation



  - **Property 17: Request identifier generation**
  - **Validates: Requirements 6.1**

- [x] 11.2 Write property test for API round-trip consistency



  - **Property 18: API round-trip consistency**
  - **Validates: Requirements 6.2**

- [x] 11.3 Write property test for authentication validation



  - **Property 19: Authentication validation**
  - **Validates: Requirements 6.4**


- [x] 12. Implement analytics engine



  - Create AnalyticsEngine class with database queries
  - Implement performance metrics calculation (p50, p95, p99 latency)
  - Implement agreement matrix computation from deliberation data
  - Add influence score calculation based on consensus decisions
  - Create cost analytics aggregation by time period
  - Add cost-per-quality analysis
  - Implement caching for expensive analytics queries
  - _Requirements: 4.5, 4.6, 4.7, 4.8, 5.3, 5.4, 11.3_

- [x] 12.1 Write property test for agreement matrix computation


  - **Property 11: Agreement matrix computation**
  - **Validates: Requirements 4.6**

- [x] 12.2 Write property test for influence score computation


  - **Property 12: Influence score computation**
  - **Validates: Requirements 4.7**

- [x] 12.3 Write property test for percentile latency computation


  - **Property 38: Percentile latency computation**
  - **Validates: Requirements 11.3**

- [x] 13. Implement admin dashboard





  - Create Dashboard class implementing IDashboard interface
  - Implement getRecentRequests with filtering support
  - Implement getDeliberationThread for detailed view
  - Implement getPerformanceMetrics using AnalyticsEngine
  - Implement getCostAnalytics using AnalyticsEngine
  - Implement getAgreementMatrix visualization data
  - Implement getInfluenceScores display
  - Add configuration interface endpoints
  - Display provider health status and warnings
  - Create basic web UI for dashboard (HTML/CSS/JS)
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 9.5_

- [x] 13.1 Write property test for disabled member warnings



  - **Property 32: Disabled member warnings**
  - **Validates: Requirements 9.5**

- [x] 14. Implement user interface




  - Create basic web UI for user requests
  - Implement request submission form with session management
  - Implement response display with consensus decision
  - Add transparency mode toggle for revealing deliberation threads
  - Ensure deliberation details are hidden by default
  - Add streaming response support (SSE client)
  - Wire up to REST API endpoints
  - _Requirements: 1.1, 1.4, 1.5, 8.1, 12.1, 12.2, 12.4_

- [x] 14.1 Write property test for user interface hides deliberation by default


  - **Property 3: User interface hides deliberation by default**
  - **Validates: Requirements 1.5**

- [x] 14.2 Write property test for session identifier inclusion


  - **Property 24: Session identifier inclusion**
  - **Validates: Requirements 8.1**

- [x] 14.3 Write property test for transparency mode button display


  - **Property 40: Transparency mode button display**
  - **Validates: Requirements 12.1**

- [x] 14.4 Write property test for deliberation hiding when disabled


  - **Property 42: Deliberation hiding when disabled**
  - **Validates: Requirements 12.4**

- [x] 15. Implement red-team testing system





  - Create RedTeamTester class
  - Create secure storage for red-team prompts in database
  - Implement scheduled red-team test execution (cron job or scheduler)
  - Add result recording (resisted vs. compromised)
  - Create resistance rate calculation per member and attack category
  - Add security warning generation for failing members
  - Display red-team results in dashboard
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 15.1 Write property test for red-team prompt secure storage


  - **Property 44: Red-team prompt secure storage**
  - **Validates: Requirements 13.1**

- [x] 15.2 Write property test for red-team result recording


  - **Property 46: Red-team result recording**
  - **Validates: Requirements 13.3**


- [x] 15.3 Write property test for security warning generation


  - **Property 48: Security warning generation**
  - **Validates: Requirements 13.5**

- [x] 16. Implement transparency features




  - Add forced transparency configuration option to ConfigurationManager
  - Implement deliberation thread chronological ordering in Dashboard
  - Add council member attribution to all contributions
  - Ensure transparency override works correctly in UI
  - Update user interface to respect transparency settings
  - _Requirements: 12.1, 12.2, 12.3, 12.5_

- [x] 16.1 Write property test for deliberation thread chronological ordering



  - **Property 41: Deliberation thread chronological ordering**
  - **Validates: Requirements 12.2**

- [x] 16.2 Write property test for forced transparency override



  - **Property 43: Forced transparency override**
  - **Validates: Requirements 12.5**

- [x] 17. Verify context propagation




  - Review orchestration engine to ensure context is included when distributing to council members
  - Review session manager to ensure response storage in session history
  - Add integration test to verify context flows through entire request lifecycle
  - _Requirements: 8.3, 8.4_

- [x] 17.1 Write property test for context inclusion in distribution



  - **Property 26: Context inclusion in distribution**
  - **Validates: Requirements 8.3**

- [x] 17.2 Write property test for response storage in history



  - **Property 27: Response storage in history**
  - **Validates: Requirements 8.4**

- [x] 18. Integration testing and end-to-end validation




  - Create end-to-end integration tests for complete request flow
  - Test graceful degradation with partial responses
  - Test minimum quorum enforcement
  - Test zero deliberation rounds edge case
  - Test authentication failure scenarios
  - Test total council failure scenario
  - Test streaming functionality end-to-end
  - _Requirements: 3.6, 6.5, 9.2, 9.3, 9.6, 11.6_

- [x] 18.1 Write property test for graceful degradation with partial responses



  - **Property 30: Graceful degradation with partial responses**
  - **Validates: Requirements 9.2**

- [x] 18.2 Write property test for streaming initiation timing



  - **Property 39: Streaming initiation timing**
  - **Validates: Requirements 11.6**
-

- [x] 19. Final checkpoint - Ensure all tests pass
  - Run full test suite
  - Verify all property tests pass with 100+ iterations
  - Ensure all integration tests pass
  - Ask the user if questions arise

- [x] 20. Fix failing property test for security warning generation





  - Debug and fix the security-warning.property.test.ts test that's failing
  - The test is failing on edge cases with member IDs containing whitespace
  - Ensure the test properly handles all generated member IDs
  - _Requirements: 13.5_

- [x] 21. Documentation and deployment preparation





  - Create API documentation
  - Document configuration options and presets
  - Create deployment guide (Docker, environment variables)
  - Document database setup and migrations
  - Create monitoring and observability guide
  - _Requirements: All requirements depend on proper deployment_
