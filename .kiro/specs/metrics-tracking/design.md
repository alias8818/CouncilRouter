# Metrics Tracking - Design

## Architecture Overview

### Component Interaction
```
OrchestrationEngine
    ↓ (tracks costs & latencies)
APIGateway.processRequestAsync
    ↓ (aggregates metrics)
EventLogger.logCost
    ↓ (persists to DB)
Database (cost_records, requests.total_cost)

ProviderPool
    ↓ (tracks health after each call)
ProviderHealthTracker.recordSuccess/Failure
    ↓ (updates state)
Database (provider_health)
```

## Design Properties

### Property 1: Cost Accuracy
**Statement:** Total cost equals sum of all member costs  
**Validation:** `total_cost = SUM(cost_records.cost WHERE request_id = X)`  
**Requirement:** US-1 (AC-1.1, AC-1.2)

### Property 2: Cost Persistence
**Statement:** Every completed request has a total_cost value  
**Validation:** `SELECT COUNT(*) FROM requests WHERE status='completed' AND total_cost IS NULL` returns 0  
**Requirement:** US-1 (AC-1.3)

### Property 3: Provider Health Consistency
**Statement:** Provider health status reflects recent performance  
**Validation:** Success rate = successful_requests / total_requests (last 100)  
**Requirement:** US-2 (AC-2.3)

### Property 4: Health Update Timeliness
**Statement:** Provider health updates within 1 second of request completion  
**Validation:** `provider_health.updated_at` within 1s of request completion  
**Requirement:** US-3 (AC-3.1, AC-3.2)

### Property 5: Non-Blocking Metrics
**Statement:** Metrics tracking doesn't block request processing  
**Validation:** Request latency with metrics ≤ latency without + 50ms  
**Requirement:** NFR-1

### Property 6: Graceful Degradation
**Statement:** Metrics failures don't fail requests  
**Validation:** Request succeeds even if logCost throws error  
**Requirement:** NFR-4

## Detailed Design

### 1. Cost Tracking Flow

#### 1.1 OrchestrationEngine Enhancement
```typescript
// Track costs during request processing
interface RequestMetrics {
  memberCosts: Map<string, number>;
  memberLatencies: Map<string, number>;
  memberTokens: Map<string, { prompt: number; completion: number }>;
}

// In processRequest method:
const metrics: RequestMetrics = {
  memberCosts: new Map(),
  memberLatencies: new Map(),
  memberTokens: new Map()
};

// After each member response:
metrics.memberCosts.set(memberId, calculatedCost);
metrics.memberLatencies.set(memberId, latency);
metrics.memberTokens.set(memberId, tokenUsage);

// Return metrics with consensus decision
return { consensusDecision, metrics };
```

#### 1.2 Cost Calculation
```typescript
// Use CostCalculator to compute costs
const costCalculator = new CostCalculator();

for (const response of initialResponses) {
  const cost = costCalculator.calculateCost(
    response.councilMemberId, // provider-model format
    response.tokenUsage.promptTokens,
    response.tokenUsage.completionTokens
  );
  metrics.memberCosts.set(response.councilMemberId, cost);
}
```

#### 1.3 Cost Logging in API Gateway
```typescript
// In processRequestAsync, after consensus decision:
const totalCost = Array.from(metrics.memberCosts.values())
  .reduce((sum, cost) => sum + cost, 0);

// Create CostBreakdown
const costBreakdown: CostBreakdown = {
  totalCost,
  byMember: metrics.memberCosts,
  byProvider: aggregateByProvider(metrics.memberCosts),
  pricingVersion: '2024-11'
};

// Log to database
await this.eventLogger.logCost(userRequest.id, costBreakdown);
```

### 2. Provider Health Tracking

#### 2.1 Health Tracker Integration
```typescript
// In ProviderPool.sendRequest:
const startTime = Date.now();
try {
  const response = await adapter.sendRequest(request);
  const latency = Date.now() - startTime;
  
  // Record success
  await this.healthTracker.recordSuccess(providerId, latency);
  
  return response;
} catch (error) {
  // Record failure
  await this.healthTracker.recordFailure(providerId, error);
  throw error;
}
```

#### 2.2 Health Persistence
```typescript
// In ProviderHealthTracker.recordSuccess:
async recordSuccess(providerId: string, latency: number): Promise<void> {
  // Update in-memory state
  this.updateSuccessRate(providerId);
  this.updateAverageLatency(providerId, latency);
  
  // Persist to database
  await this.db.query(`
    INSERT INTO provider_health (
      provider_id, status, success_rate, avg_latency_ms, updated_at
    ) VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (provider_id) DO UPDATE SET
      status = EXCLUDED.status,
      success_rate = EXCLUDED.success_rate,
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      updated_at = EXCLUDED.updated_at
  `, [providerId, this.getStatus(providerId), this.getSuccessRate(providerId), latency]);
}
```

#### 2.3 Health Status Calculation
```typescript
getStatus(providerId: string): 'healthy' | 'degraded' | 'disabled' {
  const successRate = this.getSuccessRate(providerId);
  const consecutiveFailures = this.getConsecutiveFailures(providerId);
  
  if (consecutiveFailures >= 5) return 'disabled';
  if (successRate < 0.8) return 'degraded';
  return 'healthy';
}
```

### 3. Database Schema Usage

#### 3.1 cost_records Table
```sql
-- Populated by EventLogger.logCost
INSERT INTO cost_records (
  id, request_id, provider, model,
  prompt_tokens, completion_tokens, cost,
  pricing_version, created_at
) VALUES (...)
```

#### 3.2 provider_health Table
```sql
-- Updated by ProviderHealthTracker
INSERT INTO provider_health (
  provider_id, status, success_rate, avg_latency_ms,
  last_failure_at, disabled_reason, updated_at
) VALUES (...)
ON CONFLICT (provider_id) DO UPDATE SET ...
```

### 4. Error Handling

#### 4.1 Cost Tracking Errors
```typescript
try {
  await this.eventLogger.logCost(requestId, costBreakdown);
} catch (error) {
  // Log error but don't fail request
  console.error('Failed to log cost:', error);
  // Continue processing
}
```

#### 4.2 Health Tracking Errors
```typescript
try {
  await this.healthTracker.recordSuccess(providerId, latency);
} catch (error) {
  // Log error but don't fail request
  console.error('Failed to update provider health:', error);
  // Continue processing
}
```

## Implementation Phases

### Phase 1: Cost Tracking (Priority: High)
1. Enhance OrchestrationEngine to track member costs
2. Integrate CostCalculator in orchestration flow
3. Update API Gateway to call logCost
4. Test cost accuracy with property tests

### Phase 2: Provider Health (Priority: High)
5. Integrate ProviderHealthTracker in ProviderPool
6. Implement health persistence to database
7. Add health status calculation logic
8. Test health tracking with various failure scenarios

### Phase 3: Admin Dashboard Integration (Priority: Medium)
9. Verify admin dashboard queries work with populated data
10. Add real-time refresh for metrics
11. Test end-to-end with live requests

## Testing Strategy

### Unit Tests
- Cost calculation accuracy
- Health status determination
- Error handling for metrics failures

### Integration Tests
- End-to-end cost tracking from request to database
- Provider health updates across multiple requests
- Admin dashboard data retrieval

### Property Tests
- Property 1: Cost accuracy (total = sum of parts)
- Property 2: Cost persistence (no NULL costs)
- Property 3: Health consistency (success rate calculation)
- Property 5: Non-blocking (latency overhead < 50ms)

## Performance Considerations

### Database Optimization
- Use ON CONFLICT for upserts (avoid race conditions)
- Index on provider_health.provider_id
- Index on cost_records.request_id

### Caching Strategy
- Cache provider health in memory (update every 5s)
- No caching for costs (write-once data)

### Async Operations
- Cost logging can be async (fire-and-forget with error logging)
- Health updates should be synchronous for consistency

## Rollout Plan

1. Deploy with feature flag disabled
2. Enable for 10% of traffic
3. Monitor for errors and performance impact
4. Gradually increase to 100%
5. Verify admin dashboard shows correct data
