# Rate Limit Protection Architecture

## Overview

The AI Council Proxy now has comprehensive protection against duplicate requests that could trigger provider rate limits.

## Protection Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     User Request                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: API Gateway Idempotency Cache                     │
│  - Redis-based deduplication                                 │
│  - User-scoped keys                                          │
│  - 24-hour TTL                                               │
│  ✓ Prevents duplicate API requests                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Orchestration Engine Deduplicator                 │
│  - In-memory request tracking                                │
│  - Composite key: requestId:memberId:promptHash              │
│  - Promise reuse for concurrent duplicates                   │
│  ✓ Prevents duplicate provider calls within request         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Provider Pool                                      │
│  - Health tracking                                           │
│  - Provider selection                                        │
│  - Latency monitoring                                        │
│  ✓ Routes to healthy providers only                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Provider Adapter Retry Logic                      │
│  - Exponential backoff                                       │
│  - Configurable retry policy                                 │
│  - Error classification                                      │
│  ✓ Handles transient failures gracefully                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Provider API                                │
│  (OpenAI, Anthropic, Google, Grok)                          │
└─────────────────────────────────────────────────────────────┘
```

## Request Deduplication Flow

### Scenario: Concurrent Identical Requests

```
Time →

Request A ──┐
            ├──→ Deduplicator Check ──→ Execute ──→ Response
Request B ──┘                              │
                                           └──→ Reuse Promise ──→ Response

Result: Only 1 provider API call made
```

### Scenario: Different Members, Same Request

```
Time →

Member 1 ──→ Deduplicator (key: req1:member1:hash) ──→ Execute ──→ Response
Member 2 ──→ Deduplicator (key: req1:member2:hash) ──→ Execute ──→ Response
Member 3 ──→ Deduplicator (key: req1:member3:hash) ──→ Execute ──→ Response

Result: 3 provider API calls (one per member)
```

## Key Features

### 1. Request Deduplicator

**Purpose**: Prevent duplicate requests within the same orchestration cycle

**How it works**:
- Tracks in-flight requests using composite key
- Reuses existing promises for identical concurrent requests
- Automatically cleans up after completion
- Thread-safe using Map-based tracking

**Example**:
```typescript
// First call - executes
const result1 = await deduplicator.executeWithDeduplication(
  'request-123',
  member,
  'What is AI?',
  () => providerPool.sendRequest(member, 'What is AI?')
);

// Concurrent call - reuses promise from first call
const result2 = await deduplicator.executeWithDeduplication(
  'request-123',
  member,
  'What is AI?',
  () => providerPool.sendRequest(member, 'What is AI?')
);

// Only 1 provider API call is made
```

### 2. Idempotency Cache

**Purpose**: Prevent duplicate API requests from clients

**How it works**:
- Client sends `Idempotency-Key` header
- Redis stores request state with atomic SET NX
- Concurrent requests with same key wait for first to complete
- Results cached for 24 hours

**Example**:
```bash
# First request
curl -X POST /api/v1/requests \
  -H "Idempotency-Key: abc123" \
  -d '{"query": "What is AI?"}'
# → Processes request

# Duplicate request (within 24 hours)
curl -X POST /api/v1/requests \
  -H "Idempotency-Key: abc123" \
  -d '{"query": "What is AI?"}'
# → Returns cached result, no provider call
```

### 3. Retry Logic with Backoff

**Purpose**: Handle transient failures without overwhelming providers

**How it works**:
- Configurable retry policy per member
- Exponential backoff: 1s → 2s → 4s → 8s
- Only retries on retryable errors (RATE_LIMIT, TIMEOUT, SERVICE_UNAVAILABLE)
- Non-retryable errors fail immediately

**Example**:
```typescript
retryPolicy: {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
}
```

## Testing

### Unit Tests

```bash
npm test -- request-deduplicator
```

**Coverage**:
- ✅ Normal execution (no duplicates)
- ✅ Concurrent duplicate detection
- ✅ Different member/prompt combinations
- ✅ Cleanup verification
- ✅ Error handling
- ✅ Sequential requests
- ✅ Multiple concurrent requests

### Integration Testing

To verify the protection is working:

1. **Monitor deduplication hits**:
   ```typescript
   console.log(`[Deduplicator] Reusing in-flight request for ${member.id}`);
   ```

2. **Check provider API dashboards**:
   - OpenAI: https://platform.openai.com/usage
   - Anthropic: https://console.anthropic.com/usage
   - Google: https://console.cloud.google.com/apis/dashboard

3. **Test concurrent requests**:
   ```bash
   # Submit 10 identical requests concurrently
   for i in {1..10}; do
     curl -X POST /api/v1/requests \
       -H "Idempotency-Key: test-key" \
       -d '{"query": "Test"}' &
   done
   wait
   # Should only make 1 provider call
   ```

## Monitoring

### Recommended Metrics

```typescript
// Deduplication effectiveness
deduplication_hits_total: Counter
in_flight_requests: Gauge

// Provider health
provider_requests_total: Counter (by provider)
provider_request_rate: Rate (per second, by provider)
rate_limit_errors_total: Counter (by provider)

// Idempotency cache
idempotency_cache_hits: Counter
idempotency_cache_misses: Counter
idempotency_wait_time: Histogram
```

### Log Messages to Watch

```
✓ [Deduplicator] Reusing in-flight request for member-1 in request req-123
✓ [IdempotencyCache] Returning cached result for key abc123
✓ [ProviderAdapter] Retrying request after 2000ms (attempt 2/3)
✗ [ProviderPool] Provider openai is disabled: rate limit exceeded
```

## Configuration

### Default Configuration (No Changes Required)

The deduplication is automatic and transparent. No configuration changes needed.

### Optional: Rate Limiting Config

For additional protection, consider adding:

```typescript
{
  "rateLimiting": {
    "enabled": true,
    "maxRequestsPerSecond": 10,  // Per provider
    "burstAllowance": 5,          // Allow short bursts
    "backoffOnRateLimit": true    // Automatic backoff
  }
}
```

## Troubleshooting

### Still seeing rate limits?

1. **Check provider quotas**: Verify your API key has sufficient quota
2. **Monitor request patterns**: Look for spikes in provider dashboards
3. **Review retry configuration**: Ensure backoff is enabled
4. **Check concurrent requests**: Monitor `in_flight_requests` metric
5. **Verify idempotency keys**: Ensure clients send unique keys per unique request

### Debugging

Enable debug logging:
```bash
DEBUG=deduplicator,idempotency npm start
```

Check deduplicator state:
```typescript
console.log('In-flight requests:', deduplicator.getInFlightCount());
```

## Summary

Your system now has comprehensive protection against duplicate requests:

- ✅ **API Level**: Idempotency cache prevents duplicate API requests
- ✅ **Orchestration Level**: Deduplicator prevents duplicate provider calls
- ✅ **Provider Level**: Retry logic with exponential backoff
- ✅ **Adapter Level**: Timeout management and error classification

All changes are backward compatible and require no configuration updates.
