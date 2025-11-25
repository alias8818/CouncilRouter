# Metrics Tracking - Requirements

## Overview
Implement comprehensive cost tracking and provider health monitoring to populate the admin dashboard with real-time metrics.

## Problem Statement
Currently, requests are processed but critical metrics are not being tracked:
- `total_cost` remains NULL in requests table
- `provider_health` table is empty
- Admin dashboard shows "No providers configured" and "N/A" for costs
- No visibility into provider performance or spending

## User Stories

### US-1: Cost Tracking
**As a** system administrator  
**I want** to see the total cost of each request and cost breakdown by provider  
**So that** I can monitor spending and optimize council configuration

**Acceptance Criteria:**
- AC-1.1: Each request shows total cost in dollars
- AC-1.2: Cost breakdown available per council member
- AC-1.3: Cost records stored in `cost_records` table
- AC-1.4: Admin dashboard displays cost metrics
- AC-1.5: Costs calculated using current pricing for each provider/model

### US-2: Provider Health Monitoring
**As a** system administrator  
**I want** to see real-time health status of all AI providers  
**So that** I can identify and respond to provider issues

**Acceptance Criteria:**
- AC-2.1: Provider health tracked in `provider_health` table
- AC-2.2: Health status: healthy, degraded, disabled
- AC-2.3: Success rate calculated from recent requests
- AC-2.4: Average latency tracked per provider
- AC-2.5: Admin dashboard shows provider health cards
- AC-2.6: Automatic provider disabling after consecutive failures

### US-3: Real-Time Metrics Updates
**As a** system administrator  
**I want** metrics to update automatically as requests are processed  
**So that** I have current visibility into system performance

**Acceptance Criteria:**
- AC-3.1: Metrics update within 1 second of request completion
- AC-3.2: Provider health updates after each provider interaction
- AC-3.3: Cost tracking happens synchronously with request processing
- AC-3.4: No performance degradation from metrics tracking

## Non-Functional Requirements

### Performance
- NFR-1: Metrics tracking adds < 50ms overhead per request
- NFR-2: Database writes are non-blocking where possible
- NFR-3: Provider health queries complete in < 100ms

### Reliability
- NFR-4: Metrics tracking failures don't fail requests
- NFR-5: Cost calculations are accurate to 4 decimal places
- NFR-6: Provider health state is consistent across components

### Scalability
- NFR-7: Metrics tracking scales to 1000+ requests/minute
- NFR-8: Provider health table supports 50+ providers

## Out of Scope
- Historical cost trending (future enhancement)
- Cost alerts and budgeting (separate feature)
- Provider health predictions (future ML feature)
- Custom metrics dashboards (future enhancement)

## Dependencies
- Existing EventLogger with logCost method
- Provider health tracker in provider pool
- Cost calculator for pricing
- Admin dashboard UI components

## Success Metrics
- 100% of requests have total_cost populated
- Provider health table has entries for all active providers
- Admin dashboard shows real metrics (no "N/A")
- Zero cost calculation errors in production
