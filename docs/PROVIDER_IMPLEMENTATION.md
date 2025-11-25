# Provider Pool and OpenRouter Adapter Implementation

## Overview

This document describes the implementation of the provider pool and OpenRouter adapter system for the AI Council Proxy. The system uses **OpenRouter as the unified gateway** to access 300+ AI models from multiple providers through a single API.

## Architecture Change: OpenRouter-Only

**Previous Architecture**: Individual adapters for each provider (OpenAI, Anthropic, Google, xAI)  
**Current Architecture**: Single OpenRouter adapter providing unified access to all models

### Benefits of OpenRouter Integration

- **Single API Key**: Access all providers through one endpoint
- **300+ Models**: Including GPT-4, Claude, Gemini, Llama, Mistral, and more
- **Free Tier Models**: Zero-cost options (Llama 3.3, Mistral 7B, Gemma 3, etc.)
- **Simplified Configuration**: No need to manage multiple API keys
- **Consistent Interface**: Uniform request/response format across all models
- **Automatic Fallbacks**: OpenRouter handles provider outages transparently

## Components Implemented

### 1. Base Provider Adapter (`src/providers/adapters/base.ts`)

Abstract base class that provides common functionality for all provider adapters:

**Key Features:**
- Retry logic with exponential backoff
- Timeout handling per provider (converts seconds to milliseconds)
- Error code detection and classification
- Request execution with automatic retry on retryable errors
- Proper timeout cleanup to prevent memory leaks

**Retry Policy Support:**
- Configurable max attempts (must be positive)
- Exponential backoff with configurable multiplier
- Maximum delay cap
- Retryable error codes: `RATE_LIMIT`, `TIMEOUT`, `SERVICE_UNAVAILABLE`

**Timeout Handling:**
- Per-provider timeout configuration in seconds
- Automatic conversion to milliseconds for setTimeout
- Automatic request cancellation on timeout
- Timeout errors are retryable
- Proper cleanup of timeout handlers in all code paths

### 2. OpenRouter Adapter (`src/providers/adapters/openrouter.ts`)

**Primary adapter** that provides unified access to all AI models:

**Features:**
- Unified chat completions API for all providers
- Conversation context support
- Token usage tracking
- Streaming support via Server-Sent Events
- Automatic model ID mapping (e.g., `openai/gpt-4o`, `anthropic/claude-3-opus`)
- Health check via models endpoint

**API Details:**
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Authentication: Bearer token (`OPENROUTER_API_KEY`)
- Supports 300+ models from multiple providers
- Includes free-tier models with `:free` suffix

**Model ID Format:**
```
provider/model-name
Examples:
- openai/gpt-4o
- anthropic/claude-3-opus
- google/gemini-pro
- meta-llama/llama-3.3-70b-instruct:free
- mistralai/mistral-7b-instruct:free
```

**Streaming Support:**
```typescript
async *sendStreamingRequest(
  member: CouncilMember,
  prompt: string,
  context?: ConversationContext
): AsyncGenerator<StreamChunk>
```

### 3. Legacy Provider Adapters (Deprecated)

The following adapters are **deprecated** and maintained only for backward compatibility:

- `OpenAIAdapter` (`src/providers/adapters/openai.ts`) - Use OpenRouter instead
- `AnthropicAdapter` (`src/providers/adapters/anthropic.ts`) - Use OpenRouter instead
- `GoogleAdapter` (`src/providers/adapters/google.ts`) - Use OpenRouter instead
- `GrokAdapter` (`src/providers/adapters/grok.ts`) - Use OpenRouter instead

**Migration Path**: All models are now accessed through OpenRouter. Update your configuration to use `provider: 'openrouter'` with the appropriate model ID.

### 4. Provider Pool (`src/providers/pool.ts`)

Manages the OpenRouter adapter and tracks provider health:

**Key Features:**
- Initializes OpenRouter adapter from `OPENROUTER_API_KEY` environment variable
- Health tracking per provider using shared health tracker
- Automatic provider disabling after consecutive failures
- Success rate and latency tracking
- Manual provider enable/disable
- Integration with shared ProviderHealthTracker
- Model Registry integration for dynamic model discovery

**Health Tracking:**
- Status: `healthy`, `degraded`, `disabled`
- Success rate calculation (rolling window)
- Average latency tracking (last 100 requests)
- Consecutive failure counting
- Automatic disabling after 5 consecutive failures
- Shared health state across Provider Pool and Orchestration Engine

**Provider Management:**
- Initializes OpenRouter adapter with unified access to 300+ models
- Reads `OPENROUTER_API_KEY` from environment variables
- Prevents requests to disabled providers
- Supports manual provider recovery
- Returns all provider health statuses via `getAllProviderHealth()`
- Queries Model Registry for available models via `getAvailableModels()`

## Configuration

### Environment Variables

Required environment variable for OpenRouter:

```bash
# REQUIRED: OpenRouter API key (unified access to all providers)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Get your key at: https://openrouter.ai/keys
```

**Legacy environment variables (deprecated, not used):**
```bash
# These are no longer required or used
OPENAI_API_KEY=...      # Deprecated
ANTHROPIC_API_KEY=...   # Deprecated
GOOGLE_API_KEY=...      # Deprecated
XAI_API_KEY=...         # Deprecated
```

### Retry Policy Configuration

Default retry policy (can be customized per council member):

```typescript
{
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
}
```

## Testing

### Test Coverage

**Base Adapter Tests** (`src/providers/adapters/__tests__/base.test.ts`):
- Error code detection (timeout, rate limit, service unavailable)
- Exponential backoff calculation
- Retry logic (retryable vs non-retryable errors)
- Timeout handling
- Success after retries

**Provider Pool Tests** (`src/providers/__tests__/pool.test.ts`):
- Initialization
- Health tracking
- Provider disabling/enabling
- Request handling for unconfigured providers
- Request handling for disabled providers
- Health aggregation

### Running Tests

```bash
# Run all provider tests
npm test -- --testPathPattern="providers"

# Run specific test file
npm test -- src/providers/__tests__/pool.test.ts
```

## Usage Example

```typescript
import { ProviderPool } from './providers/pool';
import { CouncilMember } from './types/core';

// Initialize pool (automatically loads OpenRouter adapter)
const pool = new ProviderPool();

// Define a council member using OpenRouter
const member: CouncilMember = {
  id: 'gpt4-member',
  provider: 'openrouter',
  model: 'openai/gpt-4o',  // OpenRouter model ID format
  timeout: 30,  // seconds
  retryPolicy: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
  }
};

// Send a request
const response = await pool.sendRequest(
  member,
  'What is the capital of France?',
  conversationContext
);

if (response.success) {
  console.log('Response:', response.content);
  console.log('Tokens used:', response.tokenUsage.totalTokens);
} else {
  console.error('Request failed:', response.error);
}

// Check provider health
const health = pool.getProviderHealth('openrouter');
console.log('OpenRouter status:', health.status);
console.log('Success rate:', health.successRate);
console.log('Avg latency:', health.avgLatency);
```

### Using Free-Tier Models

```typescript
// Define a council member using a free model
const freeMember: CouncilMember = {
  id: 'llama-free',
  provider: 'openrouter',
  model: 'meta-llama/llama-3.3-70b-instruct:free',  // Free tier model
  timeout: 30,
  retryPolicy: {
    maxAttempts: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
  }
};

const response = await pool.sendRequest(
  freeMember,
  'Explain quantum computing',
  conversationContext
);
// Cost: $0.00
```

### Streaming Responses

```typescript
import { OpenRouterAdapter } from './providers/adapters/openrouter';

const adapter = new OpenRouterAdapter(process.env.OPENROUTER_API_KEY!);

// Stream response chunks as they arrive
for await (const chunk of adapter.sendStreamingRequest(member, prompt, context)) {
  if (!chunk.done) {
    process.stdout.write(chunk.content);  // Print incrementally
  } else {
    console.log('\n[Stream complete]');
  }
}
```

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **Requirement 1.2**: Distribution of requests to all configured council members
- **Requirement 9.1**: Logging of provider failures
- **Requirement 10.2**: Timeout handling per provider (with proper unit conversion)
- **Requirement 10.3**: Retry logic with exponential backoff
- **Bug Fix**: Timeout values correctly converted from seconds to milliseconds
- **Bug Fix**: Timeout error messages display values in seconds
- **Bug Fix**: Proper timeout cleanup prevents memory leaks
- **Bug Fix**: Shared health tracker ensures consistency across components

## Next Steps

The following tasks depend on this implementation:

- Task 3: Configuration Manager (uses provider pool)
- Task 5: Orchestration Engine (uses provider pool for request distribution)
- Task 9: Event Logger (logs provider failures)

## Notes

- All provider adapters support conversation context for multi-turn conversations
- Health tracking is automatic and requires no manual intervention
- Providers are automatically disabled after 5 consecutive failures
- Disabled providers can be manually re-enabled via `pool.enableProvider(providerId)`
- The system gracefully handles missing API keys by not initializing those providers
