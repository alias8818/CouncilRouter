# Metrics Tracking - Implementation Tasks

## Phase 1: Cost Tracking

### Task 1.1: Enhance OrchestrationEngine to Track Costs
**Status:** [x] TODO  
**Priority:** High  
**Estimated Effort:** 2 hours

**Description:**
Modify OrchestrationEngine.processRequest to track costs, latencies, and token usage for each council member.

**Implementation Steps:**
1. Define RequestMetrics interface in orchestration/engine.ts
2. Initialize metrics tracking at start of processRequest
3. After each member response, calculate cost using CostCalculator
4. Store cost, latency, and tokens in metrics maps
5. Return metrics alongside consensusDecision

**Files to Modify:**
- `src/orchestration/engine.ts`
- `src/types/core.ts` (add RequestMetrics type)

**Acceptance Criteria:**
- OrchestrationEngine returns metrics with consensus decision
- Metrics include costs for all council members
- Token usage tracked for prompt and completion

**Tests:**
- Unit test: Verify metrics tracking for single member
- Unit test: Verify metrics aggregation for multiple members
- Integration test: End-to-end cost tracking

---

### Task 1.2: Integrate CostCalculator in Orchestration
**Status:** [x] TODO  
**Priority:** High  
**Estimated Effort:** 1 hour

**Description:**
Use existing CostCalculator to compute costs for each provider/model combination.

**Implementation Steps:**
1. Import CostCalculator in OrchestrationEngine
2. Instantiate calculator in constructor
3. Call calculateCost for each member response
4. Handle pricing errors gracefully (log and use 0 cost)

**Files to Modify:**
- `src/orchestration/engine.ts`

**Acceptance Criteria:**
- Costs calculated using current pricing
- Pricing errors don't fail requests
- Costs accurate to 4 decimal places

**Tests:**
- Unit test: Cost calculation for known provider/model
- Unit test: Graceful handling of unknown model
- Property test: Cost is always non-negative

---

### Task 1.3: Update API Gateway to Log Costs
**Status:** [x] TODO  
**Priority:** High  
**Estimated Effort:** 1.5 hours

**Description:**
Modify APIGateway.processRequestAsync to aggregate costs and call EventLogger.logCost.

**Implementation Steps:**
1. Extract metrics from orchestration result
2. Calculate totalCost from memberCosts
3. Aggregate costs by provider
4. Create CostBreakdown object
5. Call eventLogger.logCost with try-catch
6. Log errors but don't fail request

**Files to Modify:**
- `src/api/gateway.ts`

**Acceptance Criteria:**
- logCost called for every completed request
- Cost errors logged but don't fail requests
- total_cost updated in requests table
- cost_records populated with member details

**Tests:**
- Integration test: Cost logged to database
- Unit test: Error handling for logCost failure
- Property test: total_cost equals sum of cost_records

---

### Task 1.4: Fix EventLogger.logCost Token Tracking
**Status:** [x] TODO  
**Priority:** Medium  
**Estimated Effort:** 1 hour

**Description:**
Update EventLogger.logCost to accept and store token counts in cost_records.

**Implementation Steps:**
1. Add tokens parameter to logCost method signature
2. Update cost_records INSERT to include prompt_tokens, completion_tokens
3. Pass token data from API gateway

**Files to Modify:**
- `src/logging/logger.ts`
- `src/interfaces/IEventLogger.ts`
- `src/api/gateway.ts`

**Acceptance Criteria:**
- Token counts stored in cost_records
- Prompt and completion tokens tracked separately

**Tests:**
- Unit test: Token counts persisted correctly
- Integration test: End-to-end token tracking

---

## Phase 2: Provider Health Tracking

### Task 2.1: Integrate HealthTracker in ProviderPool
**Status:** [x] TODO  
**Priority:** High  
**Estimated Effort:** 2 hours

**Description:**
Modify ProviderPool.sendRequest to record success/failure with ProviderHealthTracker.

**Implementation Steps:**
1. Import ProviderHealthTracker in ProviderPool
2. Get shared tracker instance in constructor
3. Wrap sendRequest with try-catch
4. Record success with latency on successful response
5. Record failure with error on exception
6. Ensure health tracking doesn't block requests

**Files to Modify:**
- `src/providers/pool.ts`

**Acceptance Criteria:**
- Health tracked for every provider interaction
- Success includes latency measurement
- Failures include error details
- Health tracking errors don't fail requests

**Tests:**
- Unit test: Success recorded with correct latency
- Unit test: Failure recorded with error
- Integration test: Health state updates after requests

---

### Task 2.2: Implement Health Persistence
**Status:** [x] TODO  
**Priority:** High  
**Estimated Effort:** 2 hours

**Description:**
Add database persistence to ProviderHealthTracker for recordSuccess and recordFailure.

**Implementation Steps:**
1. Add Pool dependency to ProviderHealthTracker constructor
2. Implement database upsert in recordSuccess
3. Implement database upsert in recordFailure
4. Calculate success_rate from recent history
5. Calculate avg_latency_ms from recent requests
6. Update status based on consecutive failures

**Files to Modify:**
- `src/providers/health-tracker.ts`

**Acceptance Criteria:**
- provider_health table updated after each interaction
- Success rate calculated from last 100 requests
- Average latency calculated from recent requests
- Status reflects current health (healthy/degraded/disabled)

**Tests:**
- Unit test: Database upsert on success
- Unit test: Database upsert on failure
- Property test: Success rate between 0 and 1
- Integration test: Health persisted across restarts

---

### Task 2.3: Add Health Status Calculation
**Status:** [x] TODO  
**Priority:** Medium  
**Estimated Effort:** 1 hour

**Description:**
Implement logic to determine provider status based on success rate and consecutive failures.

**Implementation Steps:**
1. Add getStatus method to ProviderHealthTracker
2. Return 'disabled' if consecutiveFailures >= 5
3. Return 'degraded' if successRate < 0.8
4. Return 'healthy' otherwise
5. Update status in database on each health update

**Files to Modify:**
- `src/providers/health-tracker.ts`

**Acceptance Criteria:**
- Status correctly reflects provider health
- Automatic disabling after 5 consecutive failures
- Degraded status for success rate < 80%

**Tests:**
- Unit test: Status calculation for various scenarios
- Property test: Status transitions are valid
- Integration test: Provider disabled after failures

---

### Task 2.4: Initialize Provider Health on Startup
**Status:** [x] TODO  
**Priority:** Low  
**Estimated Effort:** 0.5 hours

**Description:**
Ensure all configured providers have entries in provider_health table on startup.

**Implementation Steps:**
1. Add initializeProviderHealth method to ProviderPool
2. Query configured providers from council config
3. Insert initial health records if not exists
4. Call during ProviderPool construction

**Files to Modify:**
- `src/providers/pool.ts`

**Acceptance Criteria:**
- All providers have health entries on startup
- Initial status is 'healthy'
- No duplicate entries created

**Tests:**
- Integration test: Health initialized for all providers
- Unit test: Idempotent initialization

---

## Phase 3: Admin Dashboard Integration

### Task 3.1: Verify Dashboard Queries
**Status:** [x] TODO  
**Priority:** Medium  
**Estimated Effort:** 0.5 hours

**Description:**
Test that admin dashboard queries work correctly with populated metrics data.

**Implementation Steps:**
1. Process test requests with API keys configured
2. Verify Overview tab shows non-zero costs
3. Verify Providers tab shows health status
4. Verify Activity tab shows cost and latency
5. Fix any query issues discovered

**Files to Modify:**
- `src/dashboard/admin-server.ts` (if queries need fixes)

**Acceptance Criteria:**
- Overview shows accurate cost totals
- Providers show health status and metrics
- Activity shows per-request costs and latencies
- No "N/A" values for completed requests

**Tests:**
- Manual testing with live requests
- Integration test: Dashboard data accuracy

---

### Task 3.2: Add Metrics Refresh Indicator
**Status:** [x] TODO  
**Priority:** Low  
**Estimated Effort:** 0.5 hours

**Description:**
Add visual indicator in admin dashboard when metrics are refreshing.

**Implementation Steps:**
1. Add loading spinner to admin.html
2. Show spinner during API calls
3. Hide spinner when data loaded
4. Add last-updated timestamp

**Files to Modify:**
- `src/dashboard/public/admin.html`
- `src/dashboard/public/admin.js`

**Acceptance Criteria:**
- Loading indicator visible during refresh
- Last updated time displayed
- Smooth user experience

**Tests:**
- Manual testing of UI behavior

---

## Testing Tasks

### Task T.1: Property Tests for Cost Accuracy
**Status:** [x] TODO  
**Priority:** High  
**Estimated Effort:** 1 hour

**Description:**
Write property-based tests to verify cost calculation accuracy.

**Implementation Steps:**
1. Create cost-tracking.property.test.ts
2. Test: total_cost = sum of member costs
3. Test: costs are non-negative
4. Test: costs have max 4 decimal places
5. Run with 100+ iterations

**Files to Create:**
- `src/orchestration/__tests__/cost-tracking.property.test.ts`

---

### Task T.2: Integration Tests for End-to-End Tracking
**Status:** [x] TODO  
**Priority:** High  
**Estimated Effort:** 1.5 hours

**Description:**
Write integration tests for complete metrics tracking flow.

**Implementation Steps:**
1. Create metrics-tracking.integration.test.ts
2. Test: Request completion populates all metrics
3. Test: Provider health updates after request
4. Test: Admin dashboard queries return data
5. Mock provider responses for consistency

**Files to Create:**
- `src/__tests__/metrics-tracking.integration.test.ts`

---

## Rollout Tasks

### Task R.1: Add Feature Flag
**Status:** [x] TODO  
**Priority:** Medium  
**Estimated Effort:** 0.5 hours

**Description:**
Add environment variable to enable/disable metrics tracking.

**Implementation Steps:**
1. Add ENABLE_METRICS_TRACKING to .env.example
2. Check flag before logging costs/health
3. Default to enabled in production

**Files to Modify:**
- `.env.example`
- `src/api/gateway.ts`
- `src/providers/pool.ts`

---

### Task R.2: Performance Monitoring
**Status:** [x] TODO  
**Priority:** Medium  
**Estimated Effort:** 1 hour

**Description:**
Add logging to measure metrics tracking overhead.

**Implementation Steps:**
1. Log time before/after cost calculation
2. Log time before/after health updates
3. Alert if overhead > 50ms
4. Monitor in production

**Files to Modify:**
- `src/api/gateway.ts`
- `src/providers/pool.ts`

---

## Summary

**Total Estimated Effort:** 15.5 hours

**Critical Path:**
1. Task 1.1 → 1.2 → 1.3 (Cost tracking)
2. Task 2.1 → 2.2 → 2.3 (Health tracking)
3. Task 3.1 (Dashboard verification)

**Dependencies:**
- All Phase 1 tasks must complete before Phase 3
- All Phase 2 tasks must complete before Phase 3
- Testing tasks can run in parallel with implementation
