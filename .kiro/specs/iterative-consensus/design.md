# Design Document

## Overview

The Iterative Consensus feature introduces a novel synthesis strategy that orchestrates multi-round negotiations among Council Members until unanimous agreement is achieved. Unlike existing strategies that select majority positions or delegate synthesis to a single moderator, this approach treats consensus-building as an iterative refinement process where models explicitly review peer responses, identify disagreements, and propose improvements until convergence.

The design leverages embedding-based semantic similarity for accurate agreement measurement, structured negotiation prompts with historical examples for guided refinement, and adaptive deadlock detection with human escalation for robustness. The system balances thoroughness with cost-efficiency through configurable thresholds, early termination, and fallback strategies.

## Architecture

### High-Level Flow

```
User Request
    ↓
Orchestration Engine
    ↓
Round 0: Collect Initial Responses
    ↓
Calculate Similarity Scores
    ↓
    ├─→ [Consensus Achieved] → Return Agreed Response
    │
    └─→ [Below Threshold] → Negotiation Round
            ↓
        Construct Negotiation Prompts
            ↓
        Send to Council Members
            ↓
        Collect Refined Responses
            ↓
        Recalculate Similarity
            ↓
            ├─→ [Consensus] → Return Response
            ├─→ [Deadlock Detected] → Human Escalation (optional)
            ├─→ [Max Rounds] → Invoke Fallback
            └─→ [Continue] → Next Round
```

### Component Interactions

```
┌─────────────────────────────────────────────────────────────┐
│                   Orchestration Engine                       │
│  - Manages request lifecycle                                 │
│  - Invokes synthesis strategies                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              Iterative Consensus Synthesizer                 │
│  - Orchestrates negotiation rounds                           │
│  - Calculates similarity scores                              │
│  - Detects convergence/deadlock                              │
│  - Invokes fallback strategies                               │
└─┬───────────────┬──────────────┬────────────────┬───────────┘
  │               │              │                │
  ↓               ↓              ↓                ↓
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│Embedding │  │Negotiation│  │Convergence│  │Example       │
│Service   │  │Prompt     │  │Detector   │  │Repository    │
│          │  │Builder    │  │           │  │              │
└──────────┘  └──────────┘  └──────────┘  └──────────────┘
```

## Components and Interfaces

### 1. Iterative Consensus Synthesizer

**Purpose**: Orchestrates the negotiation loop, manages rounds, and determines consensus.

**Interface**:
```typescript
interface IIterativeConsensusSynthesizer {
  /**
   * Execute iterative consensus synthesis
   * @param request - User request with query
   * @param thread - Deliberation thread with Round 0 responses
   * @param config - Iterative consensus configuration
   * @returns Consensus decision with metadata
   */
  synthesize(
    request: UserRequest,
    thread: DeliberationThread,
    config: IterativeConsensusConfig
  ): Promise<ConsensusDecision>;

  /**
   * Execute a single negotiation round
   * @param roundNumber - Current round number
   * @param currentResponses - Council member responses from previous round
   * @param query - Original user query
   * @returns New responses from negotiation round
   */
  executeNegotiationRound(
    roundNumber: number,
    currentResponses: NegotiationResponse[],
    query: string
  ): Promise<NegotiationResponse[]>;

  /**
   * Calculate pairwise similarity scores
   * @param responses - Council member responses
   * @returns Similarity matrix and average score
   */
  calculateSimilarity(
    responses: NegotiationResponse[]
  ): Promise<SimilarityResult>;

  /**
   * Check if consensus is achieved
   * @param similarityResult - Similarity scores
   * @param threshold - Agreement threshold
   * @returns True if all pairs meet threshold
   */
  isConsensusAchieved(
    similarityResult: SimilarityResult,
    threshold: number
  ): boolean;

  /**
   * Detect potential deadlock
   * @param history - Similarity scores from recent rounds
   * @returns True if deadlock pattern detected
   */
  detectDeadlock(history: number[]): boolean;

  /**
   * Select final response from converged answers
   * @param responses - Semantically equivalent responses
   * @returns Best articulated version
   */
  selectFinalResponse(responses: NegotiationResponse[]): string;
}
```

### 2. Embedding Service

**Purpose**: Computes semantic embeddings for similarity calculation with high-concurrency support.

**Interface**:
```typescript
interface IEmbeddingService {
  /**
   * Generate embedding vector for text
   * @param text - Input text
   * @param model - Embedding model (default: text-embedding-3-large)
   * @returns Embedding vector
   */
  embed(text: string, model?: string): Promise<number[]>;

  /**
   * Calculate cosine similarity between embeddings
   * @param embedding1 - First embedding vector
   * @param embedding2 - Second embedding vector
   * @returns Similarity score [0, 1]
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number;

  /**
   * Batch embed multiple texts
   * @param texts - Array of texts
   * @param model - Embedding model
   * @returns Array of embedding vectors
   */
  batchEmbed(texts: string[], model?: string): Promise<number[][]>;

  /**
   * Queue embedding request for asynchronous processing
   * @param text - Input text
   * @param model - Embedding model
   * @param priority - Queue priority (default: normal)
   * @returns Job ID for tracking
   */
  queueEmbed(text: string, model?: string, priority?: 'high' | 'normal' | 'low'): Promise<string>;

  /**
   * Retrieve embedding result from queue
   * @param jobId - Job ID from queueEmbed
   * @returns Embedding vector or null if not ready
   */
  getEmbeddingResult(jobId: string): Promise<number[] | null>;
}
```

### 3. Negotiation Prompt Builder

**Purpose**: Constructs prompts for negotiation rounds with context, examples, and dynamic templates.

**Interface**:
```typescript
interface INegotiationPromptBuilder {
  /**
   * Build negotiation prompt for a council member
   * @param query - Original user query
   * @param currentResponses - All current responses with attribution
   * @param disagreements - Identified points of disagreement
   * @param agreements - Existing agreements between members
   * @param examples - Historical examples of successful negotiations
   * @param templateOverride - Optional custom template for domain-specific negotiations
   * @returns Formatted negotiation prompt
   */
  buildPrompt(
    query: string,
    currentResponses: NegotiationResponse[],
    disagreements: string[],
    agreements: Agreement[],
    examples: NegotiationExample[],
    templateOverride?: PromptTemplate
  ): string;

  /**
   * Identify disagreements between responses
   * @param responses - Council member responses
   * @param similarityMatrix - Pairwise similarity scores
   * @returns List of disagreement descriptions
   */
  identifyDisagreements(
    responses: NegotiationResponse[],
    similarityMatrix: number[][]
  ): string[];

  /**
   * Extract agreements from responses
   * @param responses - Council member responses
   * @returns List of agreements
   */
  extractAgreements(responses: NegotiationResponse[]): Agreement[];
}
```

### 4. Convergence Detector

**Purpose**: Monitors negotiation progress and detects deadlock patterns.

**Interface**:
```typescript
interface IConvergenceDetector {
  /**
   * Analyze convergence trend
   * @param similarityHistory - Average similarity scores per round
   * @returns Convergence analysis
   */
  analyzeTrend(similarityHistory: number[]): ConvergenceTrend;

  /**
   * Detect deadlock pattern
   * @param similarityHistory - Recent similarity scores
   * @param windowSize - Number of rounds to analyze (default: 3)
   * @returns True if deadlock detected
   */
  isDeadlocked(similarityHistory: number[], windowSize?: number): boolean;

  /**
   * Calculate convergence velocity
   * @param similarityHistory - Similarity scores over time
   * @returns Rate of convergence
   */
  calculateVelocity(similarityHistory: number[]): number;

  /**
   * Predict rounds to consensus
   * @param currentSimilarity - Current average similarity
   * @param velocity - Convergence velocity
   * @param threshold - Target threshold
   * @returns Estimated rounds remaining
   */
  predictRoundsToConsensus(
    currentSimilarity: number,
    velocity: number,
    threshold: number
  ): number;
}
```

### 5. Example Repository

**Purpose**: Stores and retrieves successful negotiation examples for prompt guidance.

**Interface**:
```typescript
interface IExampleRepository {
  /**
   * Store successful negotiation example
   * @param example - Negotiation example with anonymized content
   */
  storeExample(example: NegotiationExample): Promise<void>;

  /**
   * Retrieve relevant examples
   * @param query - User query for context matching
   * @param count - Number of examples to retrieve (default: 2)
   * @returns Array of relevant examples
   */
  getRelevantExamples(query: string, count?: number): Promise<NegotiationExample[]>;

  /**
   * Get examples by category
   * @param category - Example category (endorsement, refinement, compromise)
   * @param count - Number of examples
   * @returns Array of examples
   */
  getExamplesByCategory(
    category: 'endorsement' | 'refinement' | 'compromise',
    count?: number
  ): Promise<NegotiationExample[]>;
}
```

## Data Models

### Iterative Consensus Configuration

```typescript
interface IterativeConsensusConfig {
  // Maximum negotiation rounds before fallback
  maxRounds: number; // 1-10

  // Minimum similarity threshold for consensus [0.7-1.0]
  agreementThreshold: number;

  // Fallback strategy when consensus not reached
  fallbackStrategy: 'meta-synthesis' | 'consensus-extraction' | 'weighted-fusion';

  // Embedding model for similarity calculation
  embeddingModel: string; // default: 'text-embedding-3-large'

  // Enable early termination at high similarity
  earlyTerminationEnabled: boolean;
  earlyTerminationThreshold: number; // default: 0.95

  // Negotiation mode
  negotiationMode: 'parallel' | 'sequential';

  // Randomization seed for sequential mode (optional)
  randomizationSeed?: number;

  // Per-round timeout in seconds
  perRoundTimeout: number;

  // Enable human escalation for deadlocks
  humanEscalationEnabled: boolean;
  escalationChannels?: string[]; // email, slack, etc.
  escalationRateLimit?: number; // max escalations per hour (default: 5)

  // Number of examples to include in prompts
  exampleCount: number; // default: 2

  // Custom prompt templates by query type (optional)
  promptTemplates?: {
    code?: PromptTemplate;
    text?: PromptTemplate;
    custom?: Record<string, PromptTemplate>;
  };

  // Token pricing map for accurate cost projection
  tokenPriceMap?: Record<string, { input: number; output: number }>;

  // Custom alert thresholds
  customAlerts?: {
    successRateThreshold?: number; // default: 0.7
    averageRoundsThreshold?: number; // default: 5
    deadlockRateThreshold?: number; // default: 0.2
  };
}

interface PromptTemplate {
  // Template name
  name: string;

  // Template content with placeholders
  template: string;

  // Placeholder descriptions
  placeholders: Record<string, string>;
}
```

### Negotiation Response

```typescript
interface NegotiationResponse {
  // Council member identifier
  councilMemberId: string;

  // Response content
  content: string;

  // Round number
  roundNumber: number;

  // Timestamp
  timestamp: Date;

  // Agreement indicator (if endorsing another response)
  agreesWithMemberId?: string;

  // Embedding vector (cached)
  embedding?: number[];

  // Token count
  tokenCount: number;
}
```

### Similarity Result

```typescript
interface SimilarityResult {
  // Pairwise similarity matrix
  // matrix[i][j] = similarity between response i and j
  matrix: number[][];

  // Average similarity across all pairs
  averageSimilarity: number;

  // Minimum similarity (lowest pair)
  minSimilarity: number;

  // Maximum similarity (highest pair)
  maxSimilarity: number;

  // Pairs below threshold
  belowThresholdPairs: Array<{
    member1: string;
    member2: string;
    similarity: number;
  }>;
}
```

### Convergence Trend

```typescript
interface ConvergenceTrend {
  // Trend direction
  direction: 'converging' | 'diverging' | 'stagnant';

  // Convergence velocity (change per round)
  velocity: number;

  // Predicted rounds to consensus
  predictedRounds: number;

  // Deadlock risk level
  deadlockRisk: 'low' | 'medium' | 'high';

  // Recommendation
  recommendation: string;
}
```

### Agreement

```typescript
interface Agreement {
  // Members who agree
  memberIds: string[];

  // Agreed position
  position: string;

  // Similarity score among agreeing members
  cohesion: number;
}
```

### Negotiation Example

```typescript
interface NegotiationExample {
  // Example ID
  id: string;

  // Category
  category: 'endorsement' | 'refinement' | 'compromise';

  // Anonymized query context
  queryContext: string;

  // Example disagreement
  disagreement: string;

  // Example resolution
  resolution: string;

  // Success metrics
  roundsToConsensus: number;
  finalSimilarity: number;

  // Created timestamp
  createdAt: Date;
}
```

### Consensus Decision (Extended)

```typescript
interface ConsensusDecision {
  // Response content
  content: string;

  // Confidence level
  confidence: 'high' | 'medium' | 'low';

  // Agreement level
  agreementLevel: number;

  // Synthesis strategy used
  synthesisStrategy: SynthesisStrategy;

  // Contributing members
  contributingMembers: string[];

  // Timestamp
  timestamp: Date;

  // Iterative consensus metadata
  iterativeConsensusMetadata?: {
    // Total negotiation rounds
    totalRounds: number;

    // Similarity progression
    similarityProgression: number[];

    // Consensus achieved flag
    consensusAchieved: boolean;

    // Fallback used flag
    fallbackUsed: boolean;

    // Fallback reason
    fallbackReason?: string;

    // Cost savings from early termination
    costSavings?: {
      tokensAvoided: number;
      estimatedCostSaved: number;
      costBreakdownByMember?: Record<string, number>;
    };

    // Deadlock detected flag
    deadlockDetected: boolean;

    // Human escalation triggered
    humanEscalationTriggered: boolean;

    // Quality score (0-1) derived from similarity and efficiency
    qualityScore: number;
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Consensus Threshold Enforcement

*For any* set of Council Member responses and agreement threshold, when consensus is declared achieved, all pairwise similarity scores must meet or exceed the threshold.

**Validates: Requirements 4.4**

### Property 2: Negotiation Round Progression

*For any* negotiation sequence, the round number must strictly increase by 1 for each iteration, and the total rounds must not exceed the configured maximum.

**Validates: Requirements 2.1, 2.3, 2.8**

### Property 3: Similarity Calculation Symmetry

*For any* two responses A and B, the similarity score from A to B must equal the similarity score from B to A (symmetry property).

**Validates: Requirements 4.1, 4.2**

### Property 4: Early Termination Correctness

*For any* negotiation where early termination occurs, the average similarity at termination must exceed the early termination threshold (0.95).

**Validates: Requirements 10.7**

### Property 5: Fallback Invocation Conditions

*For any* negotiation that invokes fallback, either the maximum rounds must be reached OR fewer than two active members remain.

**Validates: Requirements 2.8, 6.3, 9.3**

### Property 6: Embedding Fallback Consistency

*For any* text where embedding generation fails, the system must fall back to TF-IDF and produce a valid similarity score in the range [0, 1].

**Validates: Requirements 4.7**

### Property 7: Deadlock Detection Accuracy

*For any* similarity history where deadlock is flagged, the average similarity must have decreased or remained flat (within 0.01) for at least three consecutive rounds.

**Validates: Requirements 5.3, 5.4**

### Property 8: Agreement Transitivity

*For any* three responses A, B, and C, if A agrees with B (similarity ≥ threshold) and B agrees with C (similarity ≥ threshold), then A and C must have similarity ≥ threshold - 0.1 (allowing for small transitivity gaps).

**Validates: Requirements 4.4**

### Property 9: Prompt Context Completeness

*For any* negotiation prompt, it must include the original query, all current responses with attribution, and at least one example (when available).

**Validates: Requirements 3.1, 3.2, 3.7**

### Property 10: Sequential Randomization Fairness

*For any* sequential negotiation with N members over M rounds, each member must appear in each position approximately M/N times (within ±1), ensuring no positional bias.

**Validates: Requirements 10.8**

### Property 11: Cost Projection Accuracy

*For any* early termination event, the projected cost savings must equal (remaining rounds × average tokens per round × token price).

**Validates: Requirements 10.7**

### Property 12: Convergence Monotonicity

*For any* successful consensus, the average similarity must be non-decreasing across rounds (allowing for small fluctuations ≤ 0.05).

**Validates: Requirements 5.1, 5.2**

### Property 13: Sequential Randomization Position Fairness

*For any* sequential negotiation with N members over M rounds, no member must appear in the first position more than 20% more frequently than the average (M/N) across all rounds.

**Validates: Requirements 10.8**

## Error Handling

### Embedding Service Failures

- **Scenario**: Embedding API unavailable or rate-limited
- **Handling**: Fall back to TF-IDF cosine similarity, log degradation, continue negotiation
- **Recovery**: Retry embedding on next round if service recovers

### Council Member Failures

- **Scenario**: Member fails to respond during negotiation
- **Handling**: 
  - Request one retry with shorter timeout
  - If retry fails, exclude member from current round
  - Adjust agreement threshold proportionally: `newThreshold = threshold × (activeMembers / totalMembers)`
  - Continue with remaining members
- **Termination**: If fewer than 2 members remain, invoke fallback immediately

### Timeout Exceeded

- **Scenario**: Per-round timeout exceeded
- **Handling**:
  - Use responses received so far
  - Mark missing responses as excluded
  - Continue to next round or invoke fallback if too many missing

### Deadlock Detected

- **Scenario**: Similarity stagnant for 3+ rounds
- **Handling**:
  - Modify prompts to emphasize common ground
  - If human escalation enabled, queue for admin review
  - Continue for 1-2 more rounds
  - If still deadlocked, invoke fallback

### Invalid Responses

- **Scenario**: Member returns empty, corrupted, or off-topic response
- **Handling**:
  - Request one retry with clarified prompt
  - If retry fails, exclude member
  - Log invalid response for analysis

## Testing Strategy

### Unit Tests

1. **Similarity Calculation**
   - Test embedding-based cosine similarity
   - Test TF-IDF fallback
   - Test code similarity with structural metrics
   - Test normalization for formatting differences

2. **Prompt Construction**
   - Test prompt includes all required elements
   - Test disagreement identification
   - Test agreement extraction
   - Test example integration
   - Test custom template injection

3. **Convergence Detection**
   - Test deadlock detection with flat similarity
   - Test convergence trend analysis
   - Test velocity calculation
   - Test prediction accuracy

4. **Configuration Validation**
   - Test threshold bounds [0.7, 1.0]
   - Test max rounds bounds [1, 10]
   - Test fallback strategy validation
   - Test custom alert threshold validation

5. **Quality Score Calculation**
   - Test quality score formula: (finalSimilarity × 0.7) + (1 / totalRounds × 0.3)
   - Test score bounds [0, 1]
   - Test score correlation with consensus success

### Property-Based Tests

Each correctness property will be implemented as a property-based test using fast-check with minimum 100 iterations:

1. **Property 1**: Generate random responses and thresholds, verify consensus declaration only when all pairs meet threshold
2. **Property 2**: Generate random negotiation sequences, verify round progression
3. **Property 3**: Generate random response pairs, verify similarity symmetry
4. **Property 4**: Generate random negotiations with early termination, verify threshold exceeded
5. **Property 5**: Generate random negotiations with fallback, verify invocation conditions
6. **Property 6**: Simulate embedding failures, verify TF-IDF fallback produces valid scores
7. **Property 7**: Generate similarity histories, verify deadlock detection accuracy
8. **Property 8**: Generate response triplets, verify agreement transitivity
9. **Property 9**: Generate random negotiation contexts, verify prompt completeness
10. **Property 10**: Generate sequential negotiations, verify position distribution fairness
11. **Property 11**: Generate early termination scenarios, verify cost projection accuracy with provider-specific pricing
12. **Property 12**: Generate successful consensus sequences, verify monotonic convergence
13. **Property 13**: Generate sequential negotiations with permutation tracking, verify no member appears in first position >20% more than average

### Fuzz Testing

Supplement property-based tests with fuzzing for robustness against adversarial inputs:

1. **Disagreement Identification Fuzzing**
   - Use hypothesis.js to generate malformed responses
   - Test with corrupted JSON, excessive whitespace, special characters
   - Verify graceful handling without crashes

2. **Prompt Injection Fuzzing**
   - Generate adversarial queries with code blocks, escape sequences
   - Verify sanitization prevents prompt manipulation
   - Test with Unicode edge cases and encoding attacks

### Integration Tests

1. **End-to-End Consensus**
   - Submit request with 4 council members
   - Verify negotiation rounds execute
   - Verify consensus achieved
   - Verify final response quality

2. **Fallback Invocation**
   - Submit request with divergent initial responses
   - Verify max rounds reached
   - Verify fallback strategy invoked
   - Verify response returned

3. **Early Termination**
   - Submit request with similar initial responses
   - Verify early termination at 0.95 similarity
   - Verify cost savings logged

4. **Deadlock Handling**
   - Submit request designed to cause deadlock
   - Verify deadlock detection
   - Verify human escalation (if enabled)
   - Verify fallback invocation

## Database Schema

### negotiation_rounds Table

```sql
CREATE TABLE negotiation_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id),
  round_number INTEGER NOT NULL,
  average_similarity DECIMAL(5,4) NOT NULL,
  min_similarity DECIMAL(5,4) NOT NULL,
  max_similarity DECIMAL(5,4) NOT NULL,
  below_threshold_count INTEGER NOT NULL,
  convergence_velocity DECIMAL(6,4),
  deadlock_risk VARCHAR(10), -- 'low', 'medium', 'high'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_request_round UNIQUE(request_id, round_number)
);

CREATE INDEX idx_negotiation_rounds_request ON negotiation_rounds(request_id);
CREATE INDEX idx_negotiation_rounds_similarity ON negotiation_rounds(average_similarity);
```

### negotiation_responses Table

```sql
CREATE TABLE negotiation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id),
  round_number INTEGER NOT NULL,
  council_member_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  agrees_with_member_id VARCHAR(255),
  token_count INTEGER NOT NULL,
  embedding_model VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_member_round UNIQUE(request_id, round_number, council_member_id)
);

CREATE INDEX idx_negotiation_responses_request ON negotiation_responses(request_id);
CREATE INDEX idx_negotiation_responses_round ON negotiation_responses(request_id, round_number);
```

### negotiation_examples Table

```sql
CREATE TABLE negotiation_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL, -- 'endorsement', 'refinement', 'compromise'
  query_context TEXT NOT NULL,
  disagreement TEXT NOT NULL,
  resolution TEXT NOT NULL,
  rounds_to_consensus INTEGER NOT NULL,
  final_similarity DECIMAL(5,4) NOT NULL,
  embedding VECTOR(1536), -- For similarity search
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_negotiation_examples_category ON negotiation_examples(category);
CREATE INDEX idx_negotiation_examples_category_created ON negotiation_examples(category, created_at DESC);
CREATE INDEX idx_negotiation_examples_embedding ON negotiation_examples USING ivfflat (embedding vector_cosine_ops);
```

### consensus_metadata Table

```sql
CREATE TABLE consensus_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) UNIQUE,
  total_rounds INTEGER NOT NULL,
  consensus_achieved BOOLEAN NOT NULL,
  fallback_used BOOLEAN NOT NULL,
  fallback_reason TEXT,
  tokens_avoided INTEGER,
  estimated_cost_saved DECIMAL(10,4),
  deadlock_detected BOOLEAN NOT NULL,
  human_escalation_triggered BOOLEAN NOT NULL,
  final_similarity DECIMAL(5,4) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_consensus_metadata_request ON consensus_metadata(request_id);
CREATE INDEX idx_consensus_metadata_consensus ON consensus_metadata(consensus_achieved);
CREATE INDEX idx_consensus_metadata_fallback ON consensus_metadata(fallback_used);
```

## Performance Considerations

### Embedding Caching

- Cache embeddings for responses to avoid recomputation
- Use in-memory cache (Redis) with TTL of 1 hour
- Key format: `embedding:{model}:{hash(content)}`

### Batch Embedding

- Batch embed all responses in a round simultaneously
- Reduces API calls from N to 1 per round
- Improves latency by 50-70%

### Parallel Negotiation

- Send prompts to all members concurrently
- Wait for all responses with timeout
- Reduces round latency from sum(member_times) to max(member_times)

### Early Termination

- Check similarity after each response in parallel mode
- Terminate immediately if 0.95 threshold met
- Saves 1-3 rounds on average for high-agreement queries

### Similarity Matrix Optimization

- Use symmetric property: only compute upper triangle
- Reduces comparisons from N² to N(N-1)/2
- Cache matrix for reuse in disagreement identification

## Security Considerations

### Prompt Injection Prevention

- Sanitize user queries before including in negotiation prompts
- Remove code blocks, special characters that could manipulate prompts
- Limit query length to 2000 characters

### Example Anonymization

- Strip all PII from stored examples
- Replace specific names, dates, locations with placeholders
- Review examples before storage

### Escalation Channel Security

- Validate escalation channel configurations
- Use encrypted channels for sensitive notifications
- Rate-limit escalation to prevent spam (default: 5 per hour per channel)
- Implement Redis-based counter for rate limiting
- Log all escalation attempts for audit trail

### Embedding Model Security

- Validate embedding model names against whitelist
- Prevent arbitrary model injection
- Use authenticated API calls only

## Monitoring and Observability

### Key Metrics

1. **Consensus Success Rate**: Percentage of requests achieving consensus
2. **Average Rounds to Consensus**: Mean rounds for successful consensus
3. **Fallback Rate**: Percentage of requests requiring fallback
4. **Deadlock Rate**: Percentage of requests with deadlock detection
5. **Early Termination Rate**: Percentage of requests with early termination
6. **Average Similarity Progression**: Mean similarity increase per round
7. **Cost Savings**: Total tokens/cost saved via early termination
8. **Embedding Service Availability**: Uptime of embedding API

### Dashboards

1. **Consensus Overview**
   - Success rate trend
   - Average rounds over time
   - Fallback breakdown by reason

2. **Performance Analysis**
   - Round latency distribution
   - Embedding service latency
   - Parallel vs sequential comparison

3. **Quality Metrics**
   - Final similarity distribution
   - Convergence velocity trends
   - Agreement threshold effectiveness

4. **Cost Analysis**
   - Tokens per round
   - Cost per consensus
   - Savings from early termination
   - Comparison with fallback strategies

### Alerts

- Consensus success rate drops below 70%
- Average rounds exceeds 5
- Embedding service failures exceed 10%
- Deadlock rate exceeds 20%
- Human escalation queue exceeds 10 pending

## Migration and Rollout

### Phase 1: Infrastructure Setup

1. Deploy embedding service integration
2. Create database tables
3. Set up example repository
4. Configure monitoring

### Phase 2: Core Implementation

1. Implement similarity calculation
2. Implement negotiation loop
3. Implement convergence detection
4. Implement fallback integration

### Phase 3: Testing and Validation

1. Run property-based tests
2. Execute integration tests
3. Perform load testing
4. Validate cost projections

### Phase 4: Gradual Rollout

1. Enable for 10% of requests (A/B test) with feature flag
2. Monitor metrics and compare with existing strategies
3. Implement per-request opt-out via feature flag for instant rollback
4. Integrate with Sentry for real-time error tracking
5. Increase to 50% if metrics positive
6. Full rollout with admin toggle and rollback mechanism

### Phase 5: Optimization

1. Tune thresholds based on data
2. Optimize prompt templates
3. Expand example repository
4. Refine deadlock detection
