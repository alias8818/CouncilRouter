# Iterative Consensus Synthesis Strategy

## Overview

The Iterative Consensus synthesis strategy orchestrates multi-round negotiations among AI Council Members until unanimous agreement is achieved. This strategy uses semantic similarity analysis, convergence detection, and example-guided prompts to facilitate efficient consensus building.

## Features

- **Multi-Round Negotiation**: Members iteratively refine their responses until consensus is reached
- **Semantic Similarity Analysis**: Uses embeddings to measure agreement between responses
- **Convergence Detection**: Monitors negotiation progress and detects deadlocks
- **Early Termination**: Stops negotiation early when high similarity is achieved
- **Fallback Strategies**: Invokes alternative synthesis methods when consensus cannot be reached
- **Example-Guided Prompts**: Uses historical negotiation examples to guide members
- **Parallel and Sequential Modes**: Supports both concurrent and sequential negotiation

## Configuration

### IterativeConsensusConfig

```typescript
interface IterativeConsensusConfig {
  maxRounds: number; // 1-10, default: 5
  agreementThreshold: number; // 0.7-1.0, default: 0.85
  fallbackStrategy: 'meta-synthesis' | 'consensus-extraction' | 'weighted-fusion';
  embeddingModel: string; // Whitelisted models only
  earlyTerminationEnabled: boolean; // default: true
  earlyTerminationThreshold: number; // default: 0.95
  negotiationMode: 'parallel' | 'sequential';
  randomizationSeed?: number; // For deterministic testing
  perRoundTimeout: number; // seconds
  humanEscalationEnabled: boolean; // default: false
  escalationChannels?: string[]; // ['email', 'slack']
  escalationRateLimit?: number; // default: 5 per hour
  exampleCount: number; // default: 3
  promptTemplates?: {
    code?: PromptTemplate;
    text?: PromptTemplate;
    custom?: Record<string, PromptTemplate>;
  };
  tokenPriceMap?: Record<string, { input: number; output: number }>;
  customAlerts?: {
    successRateThreshold?: number;
    averageRoundsThreshold?: number;
    deadlockRateThreshold?: number;
  };
}
```

### Configuration Presets

#### Strict Consensus
- `maxRounds`: 10
- `agreementThreshold`: 0.95
- `earlyTerminationEnabled`: false
- `negotiationMode`: 'sequential'

#### Balanced Consensus (Default)
- `maxRounds`: 5
- `agreementThreshold`: 0.85
- `earlyTerminationEnabled`: true
- `earlyTerminationThreshold`: 0.95
- `negotiationMode`: 'parallel'

#### Fast Consensus
- `maxRounds`: 3
- `agreementThreshold`: 0.80
- `earlyTerminationEnabled`: true
- `earlyTerminationThreshold`: 0.90
- `negotiationMode`: 'parallel'

## How It Works

### 1. Initial Round
- All council members respond to the original query
- Responses are embedded and similarity is calculated
- If similarity exceeds `earlyTerminationThreshold`, consensus is achieved immediately

### 2. Negotiation Rounds
- Members receive prompts with:
  - Original query
  - Current responses from all members
  - Identified disagreements
  - Existing agreements
  - Relevant historical examples
- Members refine their responses based on this context
- Similarity is recalculated after each round

### 3. Convergence Detection
- Tracks similarity progression over rounds
- Calculates convergence velocity
- Detects deadlocks (flat/decreasing similarity over 3 rounds)
- Predicts rounds needed to reach consensus

### 4. Consensus Achievement
- Consensus is achieved when:
  - All pairwise similarities >= `agreementThreshold`
  - OR early termination threshold is met
- Final response is selected based on highest average similarity

### 5. Fallback Handling
- If consensus cannot be reached after `maxRounds`:
  - Deadlock detected → Human escalation (if enabled)
  - Otherwise → Fallback strategy invoked
- Fallback strategies:
  - `meta-synthesis`: Use meta-synthesis with moderator
  - `consensus-extraction`: Extract common elements
  - `weighted-fusion`: Weighted average of responses

## API Usage

### Using Iterative Consensus Strategy

```typescript
import { SynthesisEngine } from './synthesis/engine';

const strategy = {
  type: 'iterative-consensus',
  config: {
    maxRounds: 5,
    agreementThreshold: 0.85,
    fallbackStrategy: 'meta-synthesis',
    embeddingModel: 'text-embedding-3-large',
    earlyTerminationEnabled: true,
    earlyTerminationThreshold: 0.95,
    negotiationMode: 'parallel',
    perRoundTimeout: 30,
    exampleCount: 3
  }
};

const decision = await synthesisEngine.synthesize(request, thread, strategy);
```

### Response Format

```typescript
interface ConsensusDecision {
  content: string;
  confidence: number;
  agreementLevel: number;
  iterativeConsensusMetadata?: {
    totalRounds: number;
    similarityProgression: number[];
    consensusAchieved: boolean;
    fallbackUsed: boolean;
    fallbackReason?: string;
    deadlockDetected: boolean;
    humanEscalationTriggered: boolean;
    qualityScore: number;
  };
}
```

## Monitoring and Analytics

### Metrics Available

- **Consensus Success Rate**: Percentage of requests achieving consensus
- **Average Rounds to Consensus**: Mean number of rounds needed
- **Fallback Rate by Reason**: Breakdown of fallback invocations
- **Deadlock Rate**: Percentage of negotiations ending in deadlock
- **Early Termination Rate**: Percentage using early termination
- **Cost Savings**: Tokens and cost saved from early termination

### Dashboard Views

- **Consensus Overview**: High-level metrics and trends
- **Negotiation Details**: Round-by-round breakdown for specific requests
- **Benchmark Comparison**: Compare against other synthesis strategies
- **Fallback Warnings**: Alerts for high fallback rates

## Security Features

### Prompt Injection Prevention
- Query sanitization removes:
  - Code blocks
  - Control characters
  - Common injection patterns (e.g., "ignore previous instructions")
  - XML-like tags
  - System instruction overrides

### Model Whitelist Validation
- Only approved embedding models allowed:
  - `text-embedding-3-large`
  - `text-embedding-3-small`
  - `text-embedding-ada-002`

### Secure Escalation
- Input validation and sanitization
- Rate limiting (default: 5 escalations per hour)
- SQL injection prevention via parameterized queries

## Performance Optimizations

1. **Batch Embedding**: All responses embedded in a single API call
2. **Similarity Matrix Optimization**: Only computes upper triangle, then mirrors
3. **Parallel Negotiation**: All prompts sent concurrently (reduces latency)
4. **Early Termination**: Stops negotiation when threshold is met
5. **Redis Caching**: Embeddings cached for 1 hour

## Best Practices

1. **Choose Appropriate Thresholds**: Balance between consensus quality and latency
2. **Monitor Deadlock Rate**: High rates may indicate threshold too strict
3. **Use Early Termination**: Reduces costs and latency for easy queries
4. **Parallel Mode**: Faster but may reduce convergence quality
5. **Sequential Mode**: Better convergence but slower
6. **Example Count**: 3-5 examples typically optimal

## Troubleshooting

### High Deadlock Rate
- Lower `agreementThreshold` (e.g., 0.80)
- Increase `maxRounds`
- Enable early termination
- Review example quality

### Low Consensus Success Rate
- Check embedding model performance
- Review prompt templates
- Verify council member diversity
- Check for systematic disagreements

### Slow Performance
- Use parallel negotiation mode
- Enable early termination
- Reduce `maxRounds`
- Optimize embedding batch size

## Related Documentation

- [API Documentation](./API_DOCUMENTATION.md)
- [Configuration Guide](./CONFIGURATION_GUIDE.md)
- [Monitoring Guide](./MONITORING_GUIDE.md)

