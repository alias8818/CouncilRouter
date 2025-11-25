# AI Council Proxy - Configuration Guide

## Overview

This guide covers all configuration options for the AI Council Proxy system, including council composition, deliberation settings, synthesis strategies, performance tuning, and transparency controls.

## Configuration Files

### Environment Variables (`.env`)

Create a `.env` file in the project root with the following variables:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/ai_council_proxy
REDIS_URL=redis://localhost:6379

# Provider API Keys
# REQUIRED: OpenRouter API key (unified access to 300+ models)
OPENROUTER_API_KEY=sk-or-v1-...
# Get your key at: https://openrouter.ai/keys

# Legacy provider keys (DEPRECATED - not used)
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_API_KEY=AIza...
# XAI_API_KEY=...

# Server Configuration
PORT=3000
ADMIN_PORT=3001
NODE_ENV=production

# Authentication
JWT_SECRET=your-secret-key-here
API_KEY_SALT=your-salt-here

# Performance
GLOBAL_TIMEOUT_SECONDS=60
ENABLE_STREAMING=true
ENABLE_METRICS_TRACKING=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

## Council Configuration

### Council Members

Configure which AI models participate in the council.

**Configuration Object:**

```typescript
interface CouncilConfig {
  members: CouncilMember[];
  minimumSize: number;
  requireMinimumForConsensus: boolean;
}

interface CouncilMember {
  id: string;
  provider: string;
  model: string;
  version?: string;
  weight?: number;
  timeout: number;
  retryPolicy: RetryPolicy;
}
```

**Example Configuration (OpenRouter):**

```json
{
  "members": [
    {
      "id": "gpt4o-member",
      "provider": "openrouter",
      "model": "openai/gpt-4o",
      "weight": 1.0,
      "timeout": 30,
      "retryPolicy": {
        "maxAttempts": 3,
        "initialDelayMs": 1000,
        "maxDelayMs": 10000,
        "backoffMultiplier": 2,
        "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
      }
    },
    {
      "id": "claude-sonnet",
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4-5-20250929",
      "weight": 1.0,
      "timeout": 30,
      "retryPolicy": {
        "maxAttempts": 3,
        "initialDelayMs": 1000,
        "maxDelayMs": 10000,
        "backoffMultiplier": 2,
        "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
      }
    },
    {
      "id": "gemini-pro",
      "provider": "openrouter",
      "model": "google/gemini-2.5-pro",
      "weight": 1.0,
      "timeout": 30,
      "retryPolicy": {
        "maxAttempts": 3,
        "initialDelayMs": 1000,
        "maxDelayMs": 10000,
        "backoffMultiplier": 2,
        "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
      }
    }
  ],
  "minimumSize": 2,
  "requireMinimumForConsensus": true
}
```

**Example Configuration (Free-Tier Models):**

```json
{
  "members": [
    {
      "id": "llama-free",
      "provider": "openrouter",
      "model": "meta-llama/llama-3.3-70b-instruct:free",
      "timeout": 30,
      "retryPolicy": {
        "maxAttempts": 2,
        "initialDelayMs": 500,
        "maxDelayMs": 5000,
        "backoffMultiplier": 2,
        "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
      }
    },
    {
      "id": "mistral-free",
      "provider": "openrouter",
      "model": "mistralai/mistral-7b-instruct:free",
      "timeout": 30,
      "retryPolicy": {
        "maxAttempts": 2,
        "initialDelayMs": 500,
        "maxDelayMs": 5000,
        "backoffMultiplier": 2,
        "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
      }
    },
    {
      "id": "gemma-free",
      "provider": "openrouter",
      "model": "google/gemma-3-12b-it:free",
      "timeout": 30,
      "retryPolicy": {
        "maxAttempts": 2,
        "initialDelayMs": 500,
        "maxDelayMs": 5000,
        "backoffMultiplier": 2,
        "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
      }
    }
  ],
  "minimumSize": 2,
  "requireMinimumForConsensus": false
}
```

**Configuration Options:**

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| members | array | List of council members | [] |
| minimumSize | number | Minimum council size | 2 |
| requireMinimumForConsensus | boolean | Fail if below minimum | false |

**Member Options:**

| Option | Type | Description | Required |
|--------|------|-------------|----------|
| id | string | Unique identifier | Yes |
| provider | string | Provider name (use 'openrouter' for all models) | Yes |
| model | string | OpenRouter model ID (format: `provider/model-name`) | Yes |
| version | string | Model version (deprecated, use model ID) | No |
| weight | number | Weight for weighted fusion (0-1) | No |
| timeout | number | Timeout in seconds | Yes |
| retryPolicy | object | Retry configuration | Yes |

**OpenRouter Model ID Format:**
- OpenAI models: `openai/gpt-4o`, `openai/gpt-4o-mini`
- Anthropic models: `anthropic/claude-sonnet-4-5-20250929`, `anthropic/claude-opus-4-5-20251101`
- Google models: `google/gemini-2.5-pro`, `google/gemini-2.0-flash`
- Free models: `meta-llama/llama-3.3-70b-instruct:free`, `mistralai/mistral-7b-instruct:free`
- Full list: https://openrouter.ai/models

---

## Deliberation Configuration

Configure how many rounds of deliberation occur before synthesis.

**Configuration Object:**

```typescript
interface DeliberationConfig {
  rounds: number; // 0-5
  preset: 'fast' | 'balanced' | 'thorough' | 'research-grade';
}
```

**Presets:**

| Preset | Rounds | Use Case | Avg Latency |
|--------|--------|----------|-------------|
| fast | 0 | Quick responses, simple queries | 2-5s |
| balanced | 1 | General purpose, good quality | 5-10s |
| thorough | 2 | Complex topics, high quality | 10-20s |
| research-grade | 4 | Research, critical decisions | 20-40s |

**Example Configuration:**

```json
{
  "rounds": 1,
  "preset": "balanced"
}
```

**Custom Configuration:**

```json
{
  "rounds": 3,
  "preset": "custom"
}
```

---

## Synthesis Configuration

Configure how council member responses are combined into consensus.

**Configuration Object:**

```typescript
interface SynthesisConfig {
  strategy: SynthesisStrategy;
  moderatorStrategy?: ModeratorStrategy;
  weights?: Map<string, number>;
}

type SynthesisStrategy = 
  | { type: 'consensus-extraction' }
  | { type: 'weighted-fusion'; weights: Map<string, number> }
  | { type: 'meta-synthesis'; moderatorStrategy: ModeratorStrategy };

type ModeratorStrategy =
  | { type: 'permanent'; memberId: string }
  | { type: 'rotate' }
  | { type: 'strongest' };
```

### Strategy 1: Consensus Extraction

Extracts areas of agreement and disagreement, produces response reflecting majority or strongest positions.

**Configuration:**

```json
{
  "strategy": {
    "type": "consensus-extraction"
  }
}
```

**Best For:**
- General purpose use
- Balanced perspectives
- Democratic decision-making

### Strategy 2: Weighted Fusion

Weights each council member's contribution according to configured weights.

**Configuration:**

```json
{
  "strategy": {
    "type": "weighted-fusion",
    "weights": {
      "gpt4-turbo": 0.4,
      "claude-3-opus": 0.4,
      "gemini-pro": 0.2
    }
  }
}
```

**Best For:**
- Trusting certain models more
- Domain-specific expertise
- Cost optimization (weight cheaper models lower)

### Strategy 3: Meta-Synthesis

Uses a designated council member to synthesize all responses.

**Configuration (Permanent Moderator):**

```json
{
  "strategy": {
    "type": "meta-synthesis",
    "moderatorStrategy": {
      "type": "permanent",
      "memberId": "gpt4-turbo"
    }
  }
}
```

**Configuration (Rotating Moderator):**

```json
{
  "strategy": {
    "type": "meta-synthesis",
    "moderatorStrategy": {
      "type": "rotate"
    }
  }
}
```

**Configuration (Strongest Model):**

```json
{
  "strategy": {
    "type": "meta-synthesis",
    "moderatorStrategy": {
      "type": "strongest"
    }
  }
}
```

**Best For:**
- Leveraging strongest model for final synthesis
- Consistent synthesis style
- Complex multi-perspective synthesis

### Strategy 4: Iterative Consensus

Orchestrates multi-round negotiations among Council Members until unanimous agreement is achieved. Uses semantic similarity analysis, convergence detection, and example-guided prompts.

**Configuration:**

```json
{
  "strategy": {
    "type": "iterative-consensus",
    "config": {
      "maxRounds": 5,
      "agreementThreshold": 0.85,
      "fallbackStrategy": "meta-synthesis",
      "embeddingModel": "text-embedding-3-large",
      "earlyTerminationEnabled": true,
      "earlyTerminationThreshold": 0.95,
      "negotiationMode": "parallel",
      "perRoundTimeout": 30,
      "exampleCount": 3,
      "humanEscalationEnabled": false
    }
  }
}
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| maxRounds | number | 5 | Maximum negotiation rounds (1-10) |
| agreementThreshold | number | 0.85 | Similarity threshold for consensus (0.7-1.0) |
| fallbackStrategy | string | 'meta-synthesis' | Strategy when consensus fails |
| embeddingModel | string | 'text-embedding-3-large' | Model for semantic similarity |
| earlyTerminationEnabled | boolean | true | Stop early if threshold met |
| earlyTerminationThreshold | number | 0.95 | Early termination similarity (0.7-1.0) |
| negotiationMode | string | 'parallel' | 'parallel' or 'sequential' |
| perRoundTimeout | number | 30 | Timeout per round (seconds) |
| exampleCount | number | 3 | Historical examples to include |
| humanEscalationEnabled | boolean | false | Enable human review on deadlock |

**Presets:**

- **Strict Consensus**: `maxRounds: 10`, `agreementThreshold: 0.95`, `earlyTerminationEnabled: false`
- **Balanced Consensus**: `maxRounds: 5`, `agreementThreshold: 0.85`, `earlyTerminationEnabled: true`
- **Fast Consensus**: `maxRounds: 3`, `agreementThreshold: 0.80`, `earlyTerminationThreshold: 0.90`

**Best For:**
- High-stakes decisions requiring unanimous agreement
- Complex queries with multiple valid perspectives
- Situations where consensus quality is critical
- When you need transparency in negotiation process

**See Also:** [Iterative Consensus Documentation](./ITERATIVE_CONSENSUS.md)

---

## Performance Configuration

Configure timeouts, streaming, and performance optimizations.

**Configuration Object:**

```typescript
interface PerformanceConfig {
  globalTimeout: number; // seconds
  enableFastFallback: boolean;
  streamingEnabled: boolean;
}
```

**Example Configuration:**

```json
{
  "globalTimeout": 60,
  "enableFastFallback": true,
  "streamingEnabled": true
}
```

**Options:**

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| globalTimeout | number | Max time for entire request (seconds) | 60 |
| enableFastFallback | boolean | Use partial responses on timeout | true |
| streamingEnabled | boolean | Enable SSE streaming | true |

---

## Session Configuration

Configure session management and context handling.

**Configuration:**

```json
{
  "maxContextTokens": 8000,
  "inactivityTimeoutMinutes": 30,
  "enableAutoSummarization": true
}
```

**Options:**

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| maxContextTokens | number | Max tokens in context window | 8000 |
| inactivityTimeoutMinutes | number | Session expiry time | 30 |
| enableAutoSummarization | boolean | Auto-summarize old messages | true |

---

## Cost Configuration

Configure cost tracking and alerts.

**Configuration:**

```json
{
  "enableCostTracking": true,
  "costAlerts": [
    {
      "threshold": 100.0,
      "period": "daily",
      "notificationEmail": "admin@example.com"
    },
    {
      "threshold": 1000.0,
      "period": "monthly",
      "notificationEmail": "admin@example.com"
    }
  ],
  "pricingVersion": "2024-01"
}
```

**Provider Pricing (USD per 1K tokens):**

| Provider | Model | Input | Output |
|----------|-------|-------|--------|
| OpenAI | gpt-4-turbo | $0.01 | $0.03 |
| OpenAI | gpt-3.5-turbo | $0.0005 | $0.0015 |
| Anthropic | claude-3-opus | $0.015 | $0.075 |
| Anthropic | claude-3-sonnet | $0.003 | $0.015 |
| Google | gemini-pro | $0.00025 | $0.0005 |

---

## Transparency Configuration

Configure deliberation visibility and transparency features.

**Configuration:**

```json
{
  "defaultTransparencyMode": false,
  "allowUserToggle": true,
  "forcedTransparency": false,
  "showCouncilMemberAttribution": true
}
```

**Options:**

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| defaultTransparencyMode | boolean | Show deliberations by default | false |
| allowUserToggle | boolean | Allow users to toggle | true |
| forcedTransparency | boolean | Always show deliberations | false |
| showCouncilMemberAttribution | boolean | Show member IDs | true |

---

## Devil's Advocate Configuration

Configure the Devil's Advocate module for critique-based synthesis improvement. The Devil's Advocate acts as a critical reviewer that analyzes the consensus output and suggests improvements.

**Configuration:**

```json
{
  "enabled": true,
  "applyToCodeRequests": true,
  "applyToTextRequests": false,
  "intensityLevel": "moderate",
  "provider": "anthropic",
  "model": "claude-3-opus-20240229"
}
```

**Options:**

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| enabled | boolean | Enable Devil's Advocate | false |
| applyToCodeRequests | boolean | Apply to code generation requests | true |
| applyToTextRequests | boolean | Apply to text-only requests | false |
| intensityLevel | string | Critique intensity: `"light"`, `"moderate"`, `"thorough"` | `"moderate"` |
| provider | string | LLM provider for critique (must be available in council) | - |
| model | string | Specific model to use for critique | - |

**Intensity Levels:**

- **`light`**: Quick review focusing on obvious issues
- **`moderate`**: Balanced critique identifying weaknesses and improvements
- **`thorough`**: Deep analysis with comprehensive edge case coverage

**How It Works:**

1. After synthesis completes, if Devil's Advocate is enabled and matches the request type (code vs text), the configured model is used as the Devil's Advocate
2. The Devil's Advocate analyzes the consensus output and generates a critique identifying weaknesses, edge cases, and potential improvements
3. Based on the critique severity, the Devil's Advocate may rewrite the synthesis with improvements
4. The improved content replaces the original synthesis if it differs significantly

**Use Cases:**

- **Code Generation**: Enable `applyToCodeRequests` to catch bugs, edge cases, and security issues
- **Critical Decisions**: Enable for both code and text to ensure robust reasoning
- **Quality Assurance**: Use a strong model (e.g., Claude Opus) for highest-quality critique

**Performance Impact:**

- Adds 1-2 additional API calls per request (critique + optional rewrite)
- Increases latency by ~2-5 seconds
- Increases cost by ~$0.01-0.03 per request (depending on model)

**Example:**

```typescript
// Enable Devil's Advocate for code requests only
await configManager.updateDevilsAdvocateConfig({
  enabled: true,
  applyToCodeRequests: true,
  applyToTextRequests: false,
  intensityLevel: 'moderate',
  provider: 'anthropic',
  model: 'claude-3-opus-20240229'
});
```

**Note:** The provider and model must be available in your council configuration. The Devil's Advocate selection strategy (designated, strongest, random, rotate) is configured at the module level when instantiating `DevilsAdvocateModule`.

---

## Red Team Testing Configuration

Configure security testing and prompt injection detection.

**Configuration:**

```json
{
  "enabled": true,
  "schedule": "0 2 * * *",
  "testCategories": [
    "prompt-injection",
    "jailbreak",
    "data-extraction",
    "harmful-content"
  ],
  "alertThreshold": 0.3
}
```

**Options:**

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| enabled | boolean | Enable red team testing | false |
| schedule | string | Cron schedule | "0 2 * * *" |
| testCategories | array | Test categories to run | all |
| alertThreshold | number | Alert if resistance < threshold | 0.3 |

---

## Configuration Presets

### Fast Council (Low Cost, Quick Responses)

```json
{
  "council": {
    "members": [
      {"id": "gpt-3.5", "provider": "openai", "model": "gpt-3.5-turbo", "timeout": 10000},
      {"id": "gemini", "provider": "google", "model": "gemini-pro", "timeout": 10000}
    ],
    "minimumSize": 2
  },
  "deliberation": {
    "rounds": 0,
    "preset": "fast"
  },
  "synthesis": {
    "strategy": {"type": "consensus-extraction"}
  },
  "performance": {
    "globalTimeout": 30,
    "streamingEnabled": true
  }
}
```

**Characteristics:**
- 2 fast, inexpensive models
- No deliberation rounds
- ~$0.002-0.005 per request
- 2-5 second latency

### Balanced Council (Good Quality, Moderate Cost)

```json
{
  "council": {
    "members": [
      {"id": "gpt4", "provider": "openai", "model": "gpt-4-turbo-preview", "timeout": 30000},
      {"id": "claude", "provider": "anthropic", "model": "claude-3-sonnet", "timeout": 30000},
      {"id": "gemini", "provider": "google", "model": "gemini-pro", "timeout": 30000}
    ],
    "minimumSize": 2
  },
  "deliberation": {
    "rounds": 1,
    "preset": "balanced"
  },
  "synthesis": {
    "strategy": {"type": "consensus-extraction"}
  },
  "performance": {
    "globalTimeout": 60,
    "streamingEnabled": true
  }
}
```

**Characteristics:**
- 3 capable models
- 1 deliberation round
- ~$0.02-0.05 per request
- 5-15 second latency

### Research Council (Highest Quality, Higher Cost)

```json
{
  "council": {
    "members": [
      {"id": "gpt4", "provider": "openai", "model": "gpt-4-turbo-preview", "timeout": 45000},
      {"id": "claude-opus", "provider": "anthropic", "model": "claude-3-opus", "timeout": 45000},
      {"id": "claude-sonnet", "provider": "anthropic", "model": "claude-3-sonnet", "timeout": 45000},
      {"id": "gemini", "provider": "google", "model": "gemini-pro", "timeout": 45000}
    ],
    "minimumSize": 3
  },
  "deliberation": {
    "rounds": 4,
    "preset": "research-grade"
  },
  "synthesis": {
    "strategy": {
      "type": "meta-synthesis",
      "moderatorStrategy": {"type": "strongest"}
    }
  },
  "performance": {
    "globalTimeout": 120,
    "streamingEnabled": true
  }
}
```

**Characteristics:**
- 4 top-tier models
- 4 deliberation rounds
- ~$0.10-0.30 per request
- 20-60 second latency

---

## Applying Configuration

### Via Configuration Manager API

```typescript
import { ConfigurationManager } from './config/manager';

const configManager = new ConfigurationManager(db, redis);

// Apply a preset
await configManager.applyPreset('balanced-council');

// Or set custom configuration
await configManager.updateCouncilConfig({
  members: [...],
  minimumSize: 2,
  requireMinimumForConsensus: true
});

await configManager.updateDeliberationConfig({
  rounds: 2,
  preset: 'custom'
});

await configManager.updateSynthesisConfig({
  strategy: {
    type: 'weighted-fusion',
    weights: new Map([
      ['gpt4-turbo', 0.5],
      ['claude-3-opus', 0.5]
    ])
  }
});
```

### Via Admin Dashboard

1. Navigate to Configuration section
2. Select preset or customize settings
3. Click "Save Configuration"
4. Changes apply immediately to new requests

---

## Configuration Validation

The system validates all configuration changes:

**Council Validation:**
- Minimum 2 council members required
- All members must have valid provider and model
- Timeout must be > 0
- Retry policy must be valid

**Deliberation Validation:**
- Rounds must be 0-5
- Preset must be valid

**Synthesis Validation:**
- Strategy type must be valid
- Weights must sum to 1.0 (for weighted-fusion)
- Moderator member must exist (for permanent moderator)

**Performance Validation:**
- Global timeout must be > 0
- Global timeout should be > max member timeout

---

## Best Practices

1. **Start with Presets** - Use built-in presets before customizing
2. **Monitor Costs** - Track spending and adjust council composition
3. **Balance Quality vs Speed** - More deliberation = better quality but slower
4. **Use Appropriate Models** - Match model capability to task complexity
5. **Set Reasonable Timeouts** - Allow enough time for deliberation
6. **Enable Streaming** - Better UX for long-running requests
7. **Test Configuration Changes** - Verify changes in staging before production
8. **Version Configurations** - Keep track of configuration changes over time
9. **Monitor Agreement Levels** - Low agreement may indicate need for more deliberation
10. **Use Weighted Fusion Carefully** - Ensure weights reflect actual model capabilities

---

## Troubleshooting

### High Costs

- Reduce deliberation rounds
- Use faster/cheaper models
- Implement request filtering
- Set cost alerts

### Slow Responses

- Reduce deliberation rounds
- Lower timeouts
- Use faster models
- Enable streaming

### Low Agreement

- Increase deliberation rounds
- Add more diverse models
- Check if topic is controversial
- Review synthesis strategy

### Frequent Timeouts

- Increase timeouts
- Reduce deliberation rounds
- Check provider health
- Enable fast fallback

---

## Support

For configuration assistance:
- Documentation: https://docs.example.com/configuration
- Support: support@example.com
