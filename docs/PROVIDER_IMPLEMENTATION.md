# Provider Pool and Adapters Implementation

## Overview

This document describes the implementation of the provider pool and adapter system for the AI Council Proxy.

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

### 2. OpenAI Provider Adapter (`src/providers/adapters/openai.ts`)

Implements communication with OpenAI's API:

**Features:**
- Chat completions API integration
- Conversation context support
- Token usage tracking
- Health check via models endpoint

**API Details:**
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Authentication: Bearer token
- Supports conversation history

### 3. Anthropic Provider Adapter (`src/providers/adapters/anthropic.ts`)

Implements communication with Anthropic's Claude API:

**Features:**
- Messages API integration
- Conversation context support
- Token usage tracking
- Health check via minimal request

**API Details:**
- Endpoint: `https://api.anthropic.com/v1/messages`
- Authentication: x-api-key header
- API version: 2023-06-01
- Supports conversation history

### 4. Google Provider Adapter (`src/providers/adapters/google.ts`)

Implements communication with Google's Gemini API:

**Features:**
- Generate content API integration
- Conversation context support
- Token usage tracking
- Health check via minimal request

**API Details:**
- Endpoint: `https://generativelanguage.googleapis.com/v1beta`
- Authentication: API key in query parameter
- Supports conversation history

### 5. Provider Pool (`src/providers/pool.ts`)

Manages all provider adapters and tracks their health:

**Key Features:**
- Automatic adapter initialization from environment variables
- Health tracking per provider using shared health tracker
- Automatic provider disabling after consecutive failures
- Success rate and latency tracking
- Manual provider enable/disable
- Integration with shared ProviderHealthTracker

**Health Tracking:**
- Status: `healthy`, `degraded`, `disabled`
- Success rate calculation (rolling window)
- Average latency tracking (last 100 requests)
- Consecutive failure counting
- Automatic disabling after 5 consecutive failures
- Shared health state across Provider Pool and Orchestration Engine

**Provider Management:**
- Initializes adapters for OpenAI, Anthropic, and Google
- Reads API keys from environment variables
- Prevents requests to disabled providers
- Supports manual provider recovery
- Returns all provider health statuses via `getAllProviderHealth()`

## Configuration

### Environment Variables

Required environment variables for provider API keys:

```bash
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-key
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

// Initialize pool
const pool = new ProviderPool();

// Define a council member
const member: CouncilMember = {
  id: 'gpt4-member',
  provider: 'openai',
  model: 'gpt-4',
  timeout: 30000,
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
const health = pool.getProviderHealth('openai');
console.log('OpenAI status:', health.status);
console.log('Success rate:', health.successRate);
console.log('Avg latency:', health.avgLatency);
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
