# Requirements Document

## Introduction

The Iterative Consensus feature extends the AI Council Proxy to require full agreement among all Council Members before returning a response. Instead of selecting a majority position or using one model to synthesize others' responses, the system orchestrates multiple negotiation rounds where models review each other's positions, identify disagreements, and iteratively refine their answers until unanimous consensus is achieved. This ensures the final response represents true collective agreement rather than a compromise or single model's interpretation.

## Glossary

- **Iterative Consensus**: A synthesis strategy where Council Members negotiate through multiple rounds until all agree on a single unified answer
- **Consensus Round**: A negotiation cycle where models review current proposals, identify disagreements, and submit refined positions
- **Agreement Threshold**: The minimum similarity score required between all Council Member responses to declare consensus achieved
- **Convergence**: The process of Council Member responses becoming increasingly similar across negotiation rounds
- **Negotiation Prompt**: A specialized prompt that asks models to review peer responses and either agree or propose refinements
- **Consensus Proposal**: A candidate answer that models evaluate and refine during negotiation
- **Deadlock**: A state where models cannot reach agreement within the configured maximum rounds
- **Fallback Strategy**: The synthesis approach used when iterative consensus fails to converge

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to enable iterative consensus mode, so that the council produces responses that all models genuinely agree upon rather than majority positions.

#### Acceptance Criteria

1. WHEN an administrator configures synthesis strategy THEN the AI Council Proxy SHALL offer Iterative Consensus as a synthesis option alongside existing strategies
2. WHEN Iterative Consensus is selected THEN the configuration interface SHALL expose settings for maximum negotiation rounds, agreement threshold, and fallback strategy
3. WHEN an administrator sets maximum negotiation rounds THEN the AI Council Proxy SHALL accept values between 1 and 10 rounds
4. WHEN an administrator sets agreement threshold THEN the AI Council Proxy SHALL accept similarity scores between 0.7 and 1.0
5. WHEN an administrator saves Iterative Consensus configuration THEN the AI Council Proxy SHALL validate settings and persist the configuration
6. WHEN Iterative Consensus is enabled THEN the AI Council Proxy SHALL apply this strategy to all subsequent requests until configuration changes

### Requirement 2

**User Story:** As the orchestration engine, I want to conduct negotiation rounds, so that Council Members can iteratively refine their positions toward agreement.

#### Acceptance Criteria

1. WHEN the Orchestrator begins Iterative Consensus THEN the AI Council Proxy SHALL collect initial responses from all Council Members as Round 0
2. WHEN initial responses are collected THEN the AI Council Proxy SHALL calculate pairwise similarity scores between all responses
3. WHEN similarity scores are below the agreement threshold THEN the AI Council Proxy SHALL initiate a negotiation round
4. WHEN a negotiation round begins THEN the AI Council Proxy SHALL send all current responses to each Council Member with a negotiation prompt
5. WHEN a Council Member receives a negotiation prompt THEN the AI Council Proxy SHALL ask the member to either agree with an existing response or propose a refined answer
6. WHEN all Council Members respond in a negotiation round THEN the AI Council Proxy SHALL recalculate similarity scores
7. WHEN similarity scores meet or exceed the agreement threshold THEN the AI Council Proxy SHALL declare consensus achieved
8. WHEN the maximum negotiation rounds is reached without consensus THEN the AI Council Proxy SHALL invoke the configured fallback strategy

### Requirement 3

**User Story:** As a Council Member, I want to receive clear negotiation prompts, so that I can effectively evaluate peer responses and contribute to consensus.

#### Acceptance Criteria

1. WHEN constructing a negotiation prompt THEN the AI Council Proxy SHALL include the original user query
2. WHEN constructing a negotiation prompt THEN the AI Council Proxy SHALL include all current Council Member responses with clear attribution
3. WHEN constructing a negotiation prompt THEN the AI Council Proxy SHALL identify specific points of disagreement between responses
4. WHEN constructing a negotiation prompt THEN the AI Council Proxy SHALL ask the Council Member to either endorse an existing response or propose a refined answer that addresses disagreements
5. WHEN a Council Member has already agreed with another response THEN the AI Council Proxy SHALL note this agreement in subsequent prompts
6. WHEN multiple Council Members agree on the same response THEN the AI Council Proxy SHALL highlight this emerging consensus in negotiation prompts
7. WHEN constructing a negotiation prompt THEN the AI Council Proxy SHALL include one to two anonymized examples of effective endorsements or refinements from prior successful negotiations to guide constructive responses

### Requirement 4

**User Story:** As the synthesis engine, I want to measure agreement levels accurately, so that I can determine when consensus is achieved.

#### Acceptance Criteria

1. WHEN calculating agreement THEN the AI Council Proxy SHALL compute pairwise similarity scores between all Council Member responses
2. WHEN computing similarity for text responses THEN the AI Council Proxy SHALL use cosine similarity on embeddings from a configured model with TF-IDF as a lightweight fallback for edge cases
3. WHEN computing similarity for code responses THEN the AI Council Proxy SHALL use structural code similarity metrics normalized via embeddings for comments and descriptions
4. WHEN all pairwise similarity scores meet or exceed the agreement threshold THEN the AI Council Proxy SHALL declare consensus achieved
5. WHEN at least one pairwise similarity score falls below the agreement threshold THEN the AI Council Proxy SHALL continue negotiation
6. WHEN calculating agreement THEN the AI Council Proxy SHALL normalize responses to ignore formatting differences that do not affect semantic meaning
7. WHEN the configured embedding model is unavailable THEN the AI Council Proxy SHALL fall back to TF-IDF cosine similarity and log the degradation

### Requirement 5

**User Story:** As the synthesis engine, I want to detect convergence patterns, so that I can optimize negotiation and identify potential deadlocks early.

#### Acceptance Criteria

1. WHEN a negotiation round completes THEN the AI Council Proxy SHALL calculate the average similarity score across all pairs
2. WHEN average similarity increases between rounds THEN the AI Council Proxy SHALL log convergence progress
3. WHEN average similarity decreases or remains flat for three consecutive rounds THEN the AI Council Proxy SHALL flag potential deadlock
4. WHEN potential deadlock is detected THEN the AI Council Proxy SHALL modify negotiation prompts to emphasize finding common ground and optionally queue the request for human review by notifying administrators via configured channels
5. WHEN a Council Member response is identical to a previous round THEN the AI Council Proxy SHALL recognize this as implicit agreement
6. WHEN all Council Members produce identical responses THEN the AI Council Proxy SHALL immediately declare consensus without further similarity calculation

### Requirement 6

**User Story:** As a system administrator, I want to configure fallback strategies, so that the system handles deadlock situations gracefully.

#### Acceptance Criteria

1. WHEN configuring Iterative Consensus THEN the AI Council Proxy SHALL require selection of a fallback strategy
2. WHEN fallback strategies are displayed THEN the AI Council Proxy SHALL offer Meta-Synthesis, Consensus Extraction, and Weighted Fusion as options
3. WHEN maximum rounds are reached without consensus THEN the AI Council Proxy SHALL invoke the configured fallback strategy
4. WHEN fallback strategy is invoked THEN the AI Council Proxy SHALL log the failure to reach consensus and the reason
5. WHEN fallback strategy produces a response THEN the AI Council Proxy SHALL mark the consensus decision with a flag indicating fallback was used
6. WHEN fallback is used THEN the Dashboard SHALL display a warning that full consensus was not achieved

### Requirement 7

**User Story:** As a developer, I want to track negotiation metrics, so that I can analyze consensus-building patterns and optimize the process.

#### Acceptance Criteria

1. WHEN a negotiation round completes THEN the AI Council Proxy SHALL log the round number, average similarity score, and individual Council Member responses
2. WHEN consensus is achieved THEN the AI Council Proxy SHALL log the total number of rounds required
3. WHEN fallback is invoked THEN the AI Council Proxy SHALL log the final similarity scores and reasons for failure
4. WHEN the Dashboard displays request details THEN the AI Council Proxy SHALL show negotiation round history with similarity scores
5. WHEN the Dashboard displays analytics THEN the AI Council Proxy SHALL show average rounds to consensus across requests
6. WHEN the Dashboard displays analytics THEN the AI Council Proxy SHALL show consensus success rate and common deadlock patterns
7. WHEN the Dashboard displays analytics THEN the AI Council Proxy SHALL include benchmarks comparing Iterative Consensus performance against fallback strategies on key metrics including round count and response quality

### Requirement 8

**User Story:** As a user, I want to receive the genuinely agreed-upon answer, so that I can trust the response represents collective AI wisdom.

#### Acceptance Criteria

1. WHEN consensus is achieved THEN the AI Council Proxy SHALL return the agreed-upon response as the Consensus Decision
2. WHEN multiple Council Members converged to the same answer THEN the AI Council Proxy SHALL return that answer without modification
3. WHEN Council Members converged to semantically equivalent but differently worded answers THEN the AI Council Proxy SHALL select the most clearly articulated version
4. WHEN the response is returned THEN the Consensus Decision SHALL include metadata indicating consensus was achieved and the number of rounds required
5. WHEN transparency mode is enabled THEN the User Interface SHALL display the negotiation history showing how consensus was reached
6. WHEN fallback was used THEN the User Interface SHALL clearly indicate that full consensus was not achieved
7. WHEN transparency mode is enabled THEN the User Interface SHALL render negotiation rounds as collapsible sections highlighting similarity score improvements per round

### Requirement 9

**User Story:** As the orchestration engine, I want to handle edge cases gracefully, so that the system remains robust during consensus building.

#### Acceptance Criteria

1. WHEN a Council Member fails to respond during negotiation THEN the AI Council Proxy SHALL continue with remaining members and adjust agreement threshold proportionally
2. WHEN a Council Member response is invalid or empty THEN the AI Council Proxy SHALL request a retry once before excluding that member
3. WHEN fewer than two Council Members remain active THEN the AI Council Proxy SHALL immediately invoke fallback strategy
4. WHEN a Council Member produces an error during negotiation THEN the AI Council Proxy SHALL log the error and continue without that member
5. WHEN the global timeout is approaching THEN the AI Council Proxy SHALL accelerate negotiation by reducing maximum rounds
6. WHEN all Council Members agree in Round 0 THEN the AI Council Proxy SHALL skip negotiation and immediately return the consensus

### Requirement 10

**User Story:** As a system administrator, I want to optimize negotiation performance, so that consensus building completes within acceptable timeframes.

#### Acceptance Criteria

1. WHEN configuring Iterative Consensus THEN the AI Council Proxy SHALL allow setting per-round timeout values
2. WHEN a negotiation round exceeds the per-round timeout THEN the AI Council Proxy SHALL use responses received so far and continue
3. WHEN configuring Iterative Consensus THEN the AI Council Proxy SHALL allow enabling parallel negotiation where Council Members respond simultaneously
4. WHEN parallel negotiation is enabled THEN the AI Council Proxy SHALL send negotiation prompts to all members concurrently
5. WHEN sequential negotiation is configured THEN the AI Council Proxy SHALL send prompts one at a time allowing each member to see the previous member's response
6. WHEN the Dashboard displays performance metrics THEN the AI Council Proxy SHALL show average time per negotiation round and total consensus time
7. WHEN average similarity exceeds 0.95 mid-round THEN the AI Council Proxy SHALL optionally terminate negotiation early and log the projected cost savings computed using current token usage against estimated full-round costs
8. WHEN sequential negotiation is configured THEN the AI Council Proxy SHALL randomize Council Member order per round to avoid positional influence bias and support an optional randomization seed for deterministic testing defaulting to a cryptographically secure random value
