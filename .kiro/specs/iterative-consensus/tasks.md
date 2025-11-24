# Implementation Plan

- [x] 1. Set up core interfaces and types





- [x] 1.1 Define IterativeConsensusConfig interface in types/core.ts


  - Add configuration fields: maxRounds, agreementThreshold, fallbackStrategy, embeddingModel, etc.
  - Add validation constraints in comments
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 1.2 Define NegotiationResponse interface in types/core.ts

  - Add fields: councilMemberId, content, roundNumber, timestamp, agreesWithMemberId, embedding, tokenCount
  - _Requirements: 2.1, 2.5_

- [x] 1.3 Define SimilarityResult interface in types/core.ts

  - Add matrix, averageSimilarity, minSimilarity, maxSimilarity, belowThresholdPairs
  - _Requirements: 4.1, 4.4, 4.5_

- [x] 1.4 Define ConvergenceTrend, Agreement, and NegotiationExample interfaces

  - Add ConvergenceTrend with direction, velocity, predictedRounds, deadlockRisk
  - Add Agreement with memberIds, position, cohesion
  - Add NegotiationExample with id, category, queryContext, disagreement, resolution
  - _Requirements: 5.1, 5.2, 5.3, 3.6, 3.7_

- [x] 1.5 Extend ConsensusDecision with iterativeConsensusMetadata


  - Add optional metadata field with totalRounds, similarityProgression, consensusAchieved, fallbackUsed, etc.
  - _Requirements: 8.4, 6.5_

- [x] 1.6 Update SynthesisStrategy type to include 'iterative-consensus'


  - Add new strategy option to existing type union
  - _Requirements: 1.1_

- [-] 2. Implement Embedding Service






- [ ] 2.1 Create EmbeddingService class implementing IEmbeddingService
  - Set up provider adapter integration for embedding API calls
  - Implement embed() method with error handling
  - Implement cosineSimilarity() method
  - Implement batchEmbed() method for efficiency
  - _Requirements: 4.2, 4.3_

- [ ] 2.2 Add embedding caching with Redis
  - Implement cache key generation: `embedding:{model}:{hash(content)}`
  - Set TTL to 1 hour
  - Add cache hit/miss logging
  - _Requirements: 4.2_

- [ ] 2.3 Implement TF-IDF fallback for embedding failures
  - Add TF-IDF cosine similarity calculation
  - Detect embedding service failures and fall back automatically
  - Log degradation events
  - _Requirements: 4.7_

- [ ] 2.4 Write property test for similarity symmetry
  - **Property 3: Similarity Calculation Symmetry**
  - **Validates: Requirements 4.1, 4.2**

- [ ] 2.5 Write property test for embedding fallback
  - **Property 6: Embedding Fallback Consistency**
  - **Validates: Requirements 4.7**

- [ ] 3. Implement Negotiation Prompt Builder
- [ ] 3.1 Create NegotiationPromptBuilder class implementing INegotiationPromptBuilder
  - Implement buildPrompt() method with all required sections
  - Include query, current responses, disagreements, agreements, examples
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 3.2 Implement identifyDisagreements() method
  - Analyze similarity matrix to find low-scoring pairs
  - Extract specific disagreement points from response content
  - Format disagreements clearly for prompt inclusion
  - _Requirements: 3.3_

- [ ] 3.3 Implement extractAgreements() method
  - Identify responses with high similarity or explicit agreement
  - Group agreeing members
  - Calculate cohesion scores
  - _Requirements: 3.5, 3.6_

- [ ] 3.4 Add prompt sanitization for security
  - Remove code blocks and special characters from user queries
  - Limit query length to 2000 characters
  - Prevent prompt injection attempts
  - _Requirements: 3.1_

- [ ] 3.5 Write property test for prompt completeness
  - **Property 9: Prompt Context Completeness**
  - **Validates: Requirements 3.1, 3.2, 3.7**

- [ ] 4. Implement Convergence Detector
- [ ] 4.1 Create ConvergenceDetector class implementing IConvergenceDetector
  - Implement analyzeTrend() method
  - Implement isDeadlocked() method with 3-round window
  - Implement calculateVelocity() method
  - Implement predictRoundsToConsensus() method
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 4.2 Add deadlock detection logic
  - Check for flat or decreasing similarity over 3 rounds
  - Flag potential deadlock with risk level
  - Generate recommendations for prompt modification
  - _Requirements: 5.3, 5.4_

- [ ] 4.3 Implement convergence velocity calculation
  - Calculate rate of similarity increase per round
  - Use for prediction and early warning
  - _Requirements: 5.1, 5.2_

- [ ] 4.4 Write property test for deadlock detection
  - **Property 7: Deadlock Detection Accuracy**
  - **Validates: Requirements 5.3, 5.4**

- [ ] 4.5 Write property test for convergence monotonicity
  - **Property 12: Convergence Monotonicity**
  - **Validates: Requirements 5.1, 5.2**

- [ ] 5. Implement Example Repository
- [ ] 5.1 Create ExampleRepository class implementing IExampleRepository
  - Implement storeExample() method with database persistence
  - Implement getRelevantExamples() using embedding similarity search
  - Implement getExamplesByCategory() method
  - _Requirements: 3.7_

- [ ] 5.2 Add example anonymization logic
  - Strip PII from examples before storage
  - Replace specific names, dates, locations with placeholders
  - Validate anonymization completeness
  - _Requirements: 3.7_

- [ ] 5.3 Implement embedding-based example retrieval
  - Embed query context
  - Search negotiation_examples table using vector similarity
  - Return top N most relevant examples
  - _Requirements: 3.7_

- [ ] 5.4 Seed initial example set
  - Create 10-15 high-quality examples across categories
  - Include endorsement, refinement, and compromise examples
  - Store in database with embeddings
  - _Requirements: 3.7_

- [ ] 6. Implement Iterative Consensus Synthesizer
- [ ] 6.1 Create IterativeConsensusSynthesizer class implementing IIterativeConsensusSynthesizer
  - Set up constructor with dependencies (embeddingService, promptBuilder, convergenceDetector, exampleRepository)
  - Initialize configuration
  - _Requirements: 1.1, 1.6_

- [ ] 6.2 Implement synthesize() main orchestration method
  - Extract Round 0 responses from deliberation thread
  - Calculate initial similarity scores
  - Check for immediate consensus (Round 0 agreement)
  - Enter negotiation loop if needed
  - Return ConsensusDecision with metadata
  - _Requirements: 2.1, 2.2, 2.7, 9.6_

- [ ] 6.3 Implement executeNegotiationRound() method
  - Build negotiation prompts for each member
  - Send prompts in parallel or sequential mode
  - Collect responses with timeout handling
  - Handle member failures gracefully
  - Return new NegotiationResponse array
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 10.3, 10.4, 10.5_

- [ ] 6.4 Implement calculateSimilarity() method
  - Batch embed all responses
  - Compute pairwise similarity matrix
  - Calculate average, min, max similarity
  - Identify below-threshold pairs
  - Return SimilarityResult
  - _Requirements: 4.1, 4.2, 4.3, 4.6_

- [ ] 6.5 Implement isConsensusAchieved() method
  - Check if all pairwise scores meet threshold
  - Handle edge case of identical responses
  - Return boolean result
  - _Requirements: 4.4, 5.6_

- [ ] 6.6 Implement detectDeadlock() method
  - Use ConvergenceDetector to analyze similarity history
  - Modify prompts if deadlock detected
  - Trigger human escalation if configured
  - _Requirements: 5.3, 5.4_

- [ ] 6.7 Implement selectFinalResponse() method
  - Choose most clearly articulated version from converged responses
  - Use readability metrics or select shortest
  - Return final response string
  - _Requirements: 8.3_

- [ ] 6.8 Add early termination logic
  - Check if average similarity exceeds 0.95 mid-round
  - Calculate cost savings (tokens avoided)
  - Log early termination event
  - Return consensus immediately
  - _Requirements: 10.7_

- [ ] 6.9 Implement fallback invocation
  - Detect max rounds reached or insufficient members
  - Invoke configured fallback strategy (meta-synthesis, consensus-extraction, weighted-fusion)
  - Mark response with fallback flag and reason
  - Log fallback event
  - _Requirements: 2.8, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 6.10 Add sequential negotiation with randomization
  - Implement member order randomization per round
  - Support optional seed for deterministic testing
  - Send prompts one at a time in randomized order
  - _Requirements: 10.5, 10.8_

- [ ] 6.11 Handle edge cases
  - Proportional threshold adjustment for member failures
  - Retry logic for invalid responses
  - Immediate fallback when fewer than 2 members
  - Timeout acceleration when global timeout approaching
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ]* 6.12 Write property test for consensus threshold enforcement
  - **Property 1: Consensus Threshold Enforcement**
  - **Validates: Requirements 4.4**

- [ ]* 6.13 Write property test for negotiation round progression
  - **Property 2: Negotiation Round Progression**
  - **Validates: Requirements 2.1, 2.3, 2.8**

- [ ]* 6.14 Write property test for early termination correctness
  - **Property 4: Early Termination Correctness**
  - **Validates: Requirements 10.7**

- [ ]* 6.15 Write property test for fallback invocation conditions
  - **Property 5: Fallback Invocation Conditions**
  - **Validates: Requirements 2.8, 6.3, 9.3**

- [ ]* 6.16 Write property test for agreement transitivity
  - **Property 8: Agreement Transitivity**
  - **Validates: Requirements 4.4**

- [ ]* 6.17 Write property test for sequential randomization fairness
  - **Property 10: Sequential Randomization Fairness**
  - **Validates: Requirements 10.8**

- [ ]* 6.18 Write property test for cost projection accuracy
  - **Property 11: Cost Projection Accuracy**
  - **Validates: Requirements 10.7**

- [ ] 7. Integrate with Configuration Manager
- [ ] 7.1 Add IterativeConsensusConfig to Configuration type
  - Extend main Configuration interface
  - Add default values for all fields
  - _Requirements: 1.1, 1.2_

- [ ] 7.2 Implement configuration validation
  - Validate maxRounds in range [1, 10]
  - Validate agreementThreshold in range [0.7, 1.0]
  - Validate fallbackStrategy is valid option
  - Validate embeddingModel is whitelisted
  - _Requirements: 1.3, 1.4, 1.5_

- [ ] 7.3 Add configuration presets
  - Create "strict-consensus" preset (threshold 0.9, max 5 rounds)
  - Create "balanced-consensus" preset (threshold 0.8, max 3 rounds)
  - Create "fast-consensus" preset (threshold 0.75, max 2 rounds)
  - _Requirements: 1.1_

- [ ] 7.4 Implement configuration persistence and caching
  - Store in database
  - Cache in Redis
  - Invalidate cache on updates
  - _Requirements: 1.5, 1.6_

- [ ] 8. Update Synthesis Engine
- [ ] 8.1 Add 'iterative-consensus' case to synthesize() method
  - Detect iterative-consensus strategy
  - Instantiate IterativeConsensusSynthesizer
  - Pass request, thread, and config
  - Return ConsensusDecision with metadata
  - _Requirements: 1.1, 1.6_

- [ ] 8.2 Update synthesis strategy selection logic
  - Add iterative-consensus to available strategies
  - Ensure proper initialization
  - _Requirements: 1.1_

- [ ] 9. Create database schema
- [ ] 9.1 Create negotiation_rounds table
  - Add columns: id, request_id, round_number, average_similarity, min_similarity, max_similarity, below_threshold_count, convergence_velocity, deadlock_risk, created_at
  - Add indexes on request_id and average_similarity
  - Add unique constraint on (request_id, round_number)
  - _Requirements: 7.1, 7.4_

- [ ] 9.2 Create negotiation_responses table
  - Add columns: id, request_id, round_number, council_member_id, content, agrees_with_member_id, token_count, embedding_model, created_at
  - Add indexes on request_id and (request_id, round_number)
  - Add unique constraint on (request_id, round_number, council_member_id)
  - _Requirements: 7.1, 7.4_

- [ ] 9.3 Create negotiation_examples table
  - Add columns: id, category, query_context, disagreement, resolution, rounds_to_consensus, final_similarity, embedding (VECTOR), created_at
  - Add index on category
  - Add vector index on embedding for similarity search
  - _Requirements: 3.7_

- [ ] 9.4 Create consensus_metadata table
  - Add columns: id, request_id, total_rounds, consensus_achieved, fallback_used, fallback_reason, tokens_avoided, estimated_cost_saved, deadlock_detected, human_escalation_triggered, final_similarity, created_at
  - Add indexes on request_id, consensus_achieved, fallback_used
  - Add unique constraint on request_id
  - _Requirements: 7.2, 7.3, 8.4_

- [ ] 10. Implement logging and persistence
- [ ] 10.1 Add negotiation round logging to EventLogger
  - Log round number, similarity scores, convergence metrics
  - Persist to negotiation_rounds table
  - _Requirements: 7.1_

- [ ] 10.2 Add negotiation response logging
  - Log each member response per round
  - Persist to negotiation_responses table
  - _Requirements: 7.1_

- [ ] 10.3 Add consensus metadata logging
  - Log final consensus metadata
  - Persist to consensus_metadata table
  - Include cost savings, fallback info, deadlock detection
  - _Requirements: 7.2, 7.3_

- [ ] 10.4 Add fallback invocation logging
  - Log fallback reason and final similarity scores
  - _Requirements: 7.3_

- [ ] 11. Update Dashboard
- [ ] 11.1 Add Iterative Consensus metrics to analytics
  - Calculate consensus success rate
  - Calculate average rounds to consensus
  - Calculate fallback rate by reason
  - Calculate deadlock rate
  - Calculate early termination rate
  - Calculate cost savings
  - _Requirements: 7.5, 7.6, 7.7_

- [ ] 11.2 Create Consensus Overview dashboard section
  - Display success rate trend chart
  - Display average rounds over time
  - Display fallback breakdown pie chart
  - _Requirements: 7.5, 7.6_

- [ ] 11.3 Create Negotiation Details view
  - Display round-by-round similarity progression
  - Display convergence velocity chart
  - Display member responses per round
  - Highlight agreements and disagreements
  - _Requirements: 7.4, 8.7_

- [ ] 11.4 Add benchmark comparison view
  - Compare iterative consensus vs fallback strategies
  - Show metrics: round count, response quality, cost, latency
  - Display side-by-side comparison charts
  - _Requirements: 7.7_

- [ ] 11.5 Add fallback warning indicators
  - Display warning when fallback used
  - Show fallback reason
  - Highlight on request details page
  - _Requirements: 6.6, 8.6_

- [ ] 12. Update UI for transparency mode
- [ ] 12.1 Add collapsible negotiation rounds to deliberation view
  - Render each round as collapsible section
  - Display round number and similarity score
  - Show member responses within each round
  - Highlight similarity improvements
  - _Requirements: 8.5, 8.7_

- [ ] 12.2 Add consensus metadata display
  - Show total rounds required
  - Show final similarity score
  - Show consensus achieved badge
  - Show fallback indicator if used
  - _Requirements: 8.4, 8.6_

- [ ] 12.3 Add similarity progression visualization
  - Display line chart of similarity over rounds
  - Mark consensus threshold line
  - Highlight early termination point if applicable
  - _Requirements: 8.7_

- [ ] 13. Implement human escalation
- [ ] 13.1 Add escalation queue to database
  - Create escalation_queue table with request_id, reason, status, created_at
  - Add indexes for efficient querying
  - _Requirements: 5.4_

- [ ] 13.2 Implement escalation notification service
  - Support email notifications
  - Support Slack notifications (optional)
  - Include request details and deadlock info
  - _Requirements: 5.4_

- [ ] 13.3 Add admin escalation review interface
  - Display pending escalations
  - Allow manual resolution or override
  - Log admin actions
  - _Requirements: 5.4_

- [ ] 14. Add monitoring and alerts
- [ ] 14.1 Implement Prometheus metrics
  - Add consensus_success_rate gauge
  - Add average_rounds_to_consensus histogram
  - Add fallback_rate_by_reason counter
  - Add deadlock_rate gauge
  - Add early_termination_rate gauge
  - Add cost_savings_total counter
  - _Requirements: 7.5, 7.6_

- [ ] 14.2 Configure alerts
  - Alert when consensus success rate < 70%
  - Alert when average rounds > 5
  - Alert when embedding service failures > 10%
  - Alert when deadlock rate > 20%
  - Alert when escalation queue > 10 pending
  - _Requirements: 7.5, 7.6_

- [ ] 15. Write integration tests
- [ ]* 15.1 Test end-to-end consensus achievement
  - Submit request with 4 council members
  - Verify negotiation rounds execute
  - Verify consensus achieved
  - Verify response quality
  - _Requirements: 2.1, 2.7, 8.1, 8.2_

- [ ]* 15.2 Test fallback invocation
  - Submit request with divergent responses
  - Verify max rounds reached
  - Verify fallback strategy invoked
  - Verify response returned with fallback flag
  - _Requirements: 2.8, 6.3, 6.4, 6.5_

- [ ]* 15.3 Test early termination
  - Submit request with similar initial responses
  - Verify early termination at 0.95 similarity
  - Verify cost savings logged
  - _Requirements: 10.7_

- [ ]* 15.4 Test deadlock handling
  - Submit request designed to cause deadlock
  - Verify deadlock detection
  - Verify human escalation (if enabled)
  - Verify fallback invocation
  - _Requirements: 5.3, 5.4, 6.3_

- [ ]* 15.5 Test member failure handling
  - Simulate member failures during negotiation
  - Verify proportional threshold adjustment
  - Verify continuation with remaining members
  - _Requirements: 9.1, 9.2, 9.4_

- [ ]* 15.6 Test sequential randomization
  - Run multiple sequential negotiations
  - Verify member order randomization
  - Verify position distribution fairness
  - _Requirements: 10.5, 10.8_

- [ ] 16. Performance optimization
- [ ] 16.1 Implement embedding batch processing
  - Batch all responses in a round for single API call
  - Reduce API calls from N to 1 per round
  - _Requirements: 4.2_

- [ ] 16.2 Optimize similarity matrix calculation
  - Use symmetric property to compute only upper triangle
  - Cache matrix for reuse in disagreement identification
  - _Requirements: 4.1_

- [ ] 16.3 Add parallel negotiation optimization
  - Send prompts to all members concurrently
  - Wait for all with timeout
  - Reduce round latency to max(member_times)
  - _Requirements: 10.3, 10.4_

- [ ] 16.4 Implement early similarity checking in parallel mode
  - Check similarity after each response arrives
  - Terminate immediately if 0.95 threshold met
  - _Requirements: 10.7_

- [ ] 17. Security hardening
- [ ] 17.1 Implement prompt injection prevention
  - Sanitize user queries before prompt inclusion
  - Remove code blocks and special characters
  - Limit query length to 2000 characters
  - _Requirements: 3.1_

- [ ] 17.2 Validate embedding model whitelist
  - Maintain list of approved embedding models
  - Reject arbitrary model names
  - _Requirements: 4.2_

- [ ] 17.3 Secure escalation channels
  - Validate channel configurations
  - Use encrypted channels for notifications
  - Rate-limit escalation to prevent spam
  - _Requirements: 5.4_

- [ ] 18. Documentation
- [ ] 18.1 Write API documentation for new endpoints
  - Document iterative consensus configuration
  - Document negotiation round retrieval
  - Document example management
  - _Requirements: 1.1_

- [ ] 18.2 Write admin guide for iterative consensus
  - Explain configuration options
  - Provide tuning recommendations
  - Document monitoring and troubleshooting
  - _Requirements: 1.1, 1.2_

- [ ] 18.3 Update user documentation
  - Explain iterative consensus in transparency mode
  - Show example negotiation visualizations
  - _Requirements: 8.5, 8.7_

- [ ] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
