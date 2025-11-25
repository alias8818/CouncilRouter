# Dynamic Model Pricing - Monitoring and Alerting Guide

## Overview

This guide covers monitoring, alerting, and troubleshooting for the Dynamic Model and Pricing Retrieval system. Proper monitoring ensures the system stays healthy, pricing data remains current, and issues are detected early.

---

## Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Dynamic Pricing System                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Model      │  │   Pricing    │  │    Sync      │     │
│  │  Discovery   │  │   Scraper    │  │  Scheduler   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │   Metrics & Logs         │
              │                          │
              │  • Prometheus Metrics    │
              │  • Structured Logs       │
              │  • Health Checks         │
              │  • Event Tracking        │
              └──────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │   Monitoring Stack       │
              │                          │
              │  • Grafana Dashboards    │
              │  • AlertManager          │
              │  • Log Aggregation       │
              │  • Trace Analysis        │
              └──────────────────────────┘
```

---

## Key Metrics

### Sync Job Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `model_sync_duration_seconds` | Histogram | Sync job duration | p95 > 300s |
| `model_sync_success_total` | Counter | Successful sync jobs | - |
| `model_sync_failure_total` | Counter | Failed sync jobs | > 0 in 1h |
| `model_sync_consecutive_failures` | Gauge | Consecutive failures | >= 3 |
| `models_discovered_total` | Gauge | Total models discovered | < 100 |
| `models_updated_total` | Counter | Models updated in sync | - |
| `models_deprecated_total` | Counter | Models marked deprecated | - |
| `pricing_updated_total` | Counter | Pricing records updated | - |

### Model Discovery Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `model_discovery_duration_seconds` | Histogram | Discovery duration per provider | p95 > 30s |
| `model_discovery_success_total` | Counter | Successful discoveries | - |
| `model_discovery_failure_total` | Counter | Failed discoveries | > 2 per provider |
| `models_fetched_per_provider` | Gauge | Models fetched by provider | < 10 |
| `provider_api_errors_total` | Counter | API errors by provider | > 5 in 1h |
| `provider_retry_attempts_total` | Counter | Retry attempts by provider | > 10 in 1h |

### Pricing Scraper Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `scraping_duration_seconds` | Histogram | Scraping duration per provider | p95 > 60s |
| `scraping_success_total` | Counter | Successful scrapes | - |
| `scraping_failure_total` | Counter | Failed scrapes | > 2 per provider |
| `scraping_models_extracted_total` | Gauge | Models extracted per provider | < 5 |
| `scraping_validation_failures_total` | Counter | Validation failures | > 3 consecutive |
| `scraping_strategy_used` | Counter | Strategy usage (primary/fallback) | - |
| `scraping_blocked_total` | Counter | Blocked requests (403, 429) | > 0 |

### Enrichment Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `enrichment_duration_seconds` | Histogram | Enrichment processing time | p95 > 10s |
| `fuzzy_match_success_total` | Counter | Successful fuzzy matches | - |
| `fuzzy_match_failure_total` | Counter | Failed fuzzy matches | > 20% |
| `classification_inferred_total` | Counter | Classifications inferred | - |
| `missing_pricing_total` | Counter | Models without pricing | > 10 |

### Cache Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `model_cache_hits_total` | Counter | Model cache hits | - |
| `model_cache_misses_total` | Counter | Model cache misses | Hit rate < 0.7 |
| `pricing_cache_hits_total` | Counter | Pricing cache hits | - |
| `pricing_cache_misses_total` | Counter | Pricing cache misses | Hit rate < 0.7 |
| `fallback_cache_used_total` | Counter | Fallback cache usage | > 10 in 1h |

### Database Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `models_table_size_bytes` | Gauge | Models table size | > 1GB |
| `pricing_history_rows` | Gauge | Pricing history records | > 100000 |
| `database_query_duration_seconds` | Histogram | Query execution time | p95 > 1s |
| `database_connection_errors_total` | Counter | Connection errors | > 0 |

---

## Prometheus Configuration

### Metrics Endpoint

The system exposes metrics at `/metrics`:

```typescript
import { register, Counter, Histogram, Gauge } from 'prom-client';

// Sync job metrics
const syncDuration = new Histogram({
  name: 'model_sync_duration_seconds',
  help: 'Duration of model sync job',
  labelNames: ['status'],
  buckets: [10, 30, 60, 120, 300, 600]
});

const syncSuccess = new Counter({
  name: 'model_sync_success_total',
  help: 'Total successful sync jobs'
});

const syncFailure = new Counter({
  name: 'model_sync_failure_total',
  help: 'Total failed sync jobs',
  labelNames: ['provider', 'stage']
});

const consecutiveFailures = new Gauge({
  name: 'model_sync_consecutive_failures',
  help: 'Number of consecutive sync failures'
});

// Discovery metrics
const discoveryDuration = new Histogram({
  name: 'model_discovery_duration_seconds',
  help: 'Duration of model discovery per provider',
  labelNames: ['provider'],
  buckets: [1, 5, 10, 20, 30, 60]
});

const modelsFetched = new Gauge({
  name: 'models_fetched_per_provider',
  help: 'Number of models fetched per provider',
  labelNames: ['provider']
});

// Scraping metrics
const scrapingDuration = new Histogram({
  name: 'scraping_duration_seconds',
  help: 'Duration of pricing scraping per provider',
  labelNames: ['provider', 'strategy'],
  buckets: [1, 5, 10, 30, 60, 120]
});

const scrapingSuccess = new Counter({
  name: 'scraping_success_total',
  help: 'Total successful scrapes',
  labelNames: ['provider', 'strategy']
});

const scrapingFailure = new Counter({
  name: 'scraping_failure_total',
  help: 'Total failed scrapes',
  labelNames: ['provider', 'reason']
});

// Cache metrics
const cacheHits = new Counter({
  name: 'model_cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type']
});

const cacheMisses = new Counter({
  name: 'model_cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_type']
});
```

### Scrape Configuration

**prometheus.yml:**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'ai-council-proxy'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

---

## Alert Rules

### AlertManager Configuration

**alertmanager.yml:**

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'

route:
  group_by: ['alertname', 'severity', 'provider']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'slack-notifications'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true
    - match:
        severity: warning
      receiver: 'slack-notifications'

receivers:
  - name: 'slack-notifications'
    slack_configs:
      - channel: '#ai-council-alerts'
        title: 'Dynamic Pricing Alert'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
        send_resolved: true

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
        description: '{{ .CommonAnnotations.summary }}'
```

### Alert Rules

**dynamic-pricing-alerts.yml:**

```yaml
groups:
  - name: dynamic_pricing_alerts
    interval: 30s
    rules:
      # ============================================
      # Sync Job Alerts
      # ============================================
      
      - alert: SyncJobFailed
        expr: increase(model_sync_failure_total[1h]) > 0
        for: 5m
        labels:
          severity: warning
          component: sync
        annotations:
          summary: "Model sync job failed"
          description: "Sync job has failed {{ $value }} times in the last hour"
          runbook: "Check sync logs and provider API status"

      - alert: SyncJobConsecutiveFailures
        expr: model_sync_consecutive_failures >= 3
        labels:
          severity: critical
          component: sync
        annotations:
          summary: "Multiple consecutive sync failures"
          description: "Sync job has failed {{ $value }} times consecutively"
          runbook: "Immediate investigation required. Check provider APIs, database, and scraping configs"

      - alert: SyncJobTimeout
        expr: |
          histogram_quantile(0.95, 
            rate(model_sync_duration_seconds_bucket[5m])
          ) > 300
        for: 10m
        labels:
          severity: warning
          component: sync
        annotations:
          summary: "Sync job taking too long"
          description: "P95 sync duration: {{ $value }}s (threshold: 300s)"
          runbook: "Check provider API latency and scraping performance"

      # ============================================
      # Model Discovery Alerts
      # ============================================

      - alert: ModelDiscoveryFailed
        expr: |
          rate(model_discovery_failure_total[1h]) > 0.2
        for: 10m
        labels:
          severity: warning
          component: discovery
        annotations:
          summary: "High model discovery failure rate"
          description: "Discovery failure rate: {{ $value | humanizePercentage }} for {{ $labels.provider }}"
          runbook: "Check provider API keys and network connectivity"

      - alert: LowModelCount
        expr: models_discovered_total < 100
        for: 1h
        labels:
          severity: warning
          component: discovery
        annotations:
          summary: "Low total model count"
          description: "Only {{ $value }} models discovered (expected >100)"
          runbook: "Check if providers are returning all models"

      - alert: ProviderModelCountDrop
        expr: |
          (models_fetched_per_provider - models_fetched_per_provider offset 24h) / 
          models_fetched_per_provider offset 24h < -0.2
        for: 30m
        labels:
          severity: warning
          component: discovery
        annotations:
          summary: "Significant drop in models for {{ $labels.provider }}"
          description: "Model count dropped by {{ $value | humanizePercentage }}"
          runbook: "Check if provider deprecated models or API changed"

      # ============================================
      # Scraping Alerts
      # ============================================

      - alert: ScrapingFailed
        expr: |
          rate(scraping_failure_total[1h]) > 0.5
        for: 10m
        labels:
          severity: warning
          component: scraping
        annotations:
          summary: "High scraping failure rate for {{ $labels.provider }}"
          description: "Scraping failure rate: {{ $value | humanizePercentage }}"
          runbook: "Check scraping configuration and website structure"

      - alert: ScrapingValidationFailures
        expr: |
          increase(scraping_validation_failures_total[1h]) >= 3
        labels:
          severity: warning
          component: scraping
        annotations:
          summary: "Multiple scraping validation failures"
          description: "{{ $value }} validation failures for {{ $labels.provider }}"
          runbook: "Website structure may have changed. Update scraping selectors"

      - alert: ScrapingBlocked
        expr: increase(scraping_blocked_total[1h]) > 0
        labels:
          severity: critical
          component: scraping
        annotations:
          summary: "Scraping blocked by {{ $labels.provider }}"
          description: "Received {{ $value }} blocking responses (403/429)"
          runbook: "Check rate limiting, User-Agent, and ToS compliance"

      - alert: LowModelsExtracted
        expr: scraping_models_extracted_total < 5
        for: 30m
        labels:
          severity: warning
          component: scraping
        annotations:
          summary: "Low models extracted from {{ $labels.provider }}"
          description: "Only {{ $value }} models extracted (expected >5)"
          runbook: "Check scraping selectors and validation rules"

      - alert: FallbackStrategyUsed
        expr: |
          rate(scraping_strategy_used{strategy!="primary"}[1h]) > 0.5
        for: 30m
        labels:
          severity: info
          component: scraping
        annotations:
          summary: "Fallback scraping strategy in use"
          description: "Using {{ $labels.strategy }} for {{ $labels.provider }}"
          runbook: "Primary strategy may be failing. Consider updating primary selectors"

      # ============================================
      # Enrichment Alerts
      # ============================================

      - alert: HighFuzzyMatchFailureRate
        expr: |
          rate(fuzzy_match_failure_total[1h]) / 
          (rate(fuzzy_match_success_total[1h]) + rate(fuzzy_match_failure_total[1h])) > 0.2
        for: 30m
        labels:
          severity: warning
          component: enrichment
        annotations:
          summary: "High fuzzy matching failure rate"
          description: "Fuzzy match failure rate: {{ $value | humanizePercentage }}"
          runbook: "Check model name variations and fuzzy matching threshold"

      - alert: ManyModelsMissingPricing
        expr: missing_pricing_total > 10
        for: 1h
        labels:
          severity: warning
          component: enrichment
        annotations:
          summary: "Many models missing pricing data"
          description: "{{ $value }} models have no pricing information"
          runbook: "Check scraping success and fuzzy matching accuracy"

      # ============================================
      # Cache Alerts
      # ============================================

      - alert: LowCacheHitRate
        expr: |
          rate(model_cache_hits_total[5m]) / 
          (rate(model_cache_hits_total[5m]) + rate(model_cache_misses_total[5m])) < 0.7
        for: 15m
        labels:
          severity: info
          component: cache
        annotations:
          summary: "Low cache hit rate"
          description: "Cache hit rate: {{ $value | humanizePercentage }}"
          runbook: "Check cache TTL settings and Redis memory"

      - alert: FallbackCacheUsedFrequently
        expr: increase(fallback_cache_used_total[1h]) > 10
        labels:
          severity: warning
          component: cache
        annotations:
          summary: "Fallback cache used frequently"
          description: "Fallback cache used {{ $value }} times in last hour"
          runbook: "Scraping may be failing. Check scraping status"

      # ============================================
      # Database Alerts
      # ============================================

      - alert: DatabaseQuerySlow
        expr: |
          histogram_quantile(0.95, 
            rate(database_query_duration_seconds_bucket[5m])
          ) > 1
        for: 10m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "Slow database queries"
          description: "P95 query duration: {{ $value }}s"
          runbook: "Check database indexes and query optimization"

      - alert: DatabaseConnectionErrors
        expr: increase(database_connection_errors_total[5m]) > 0
        labels:
          severity: critical
          component: database
        annotations:
          summary: "Database connection errors"
          description: "{{ $value }} connection errors in last 5 minutes"
          runbook: "Check database availability and connection pool settings"

      - alert: PricingHistoryTableLarge
        expr: pricing_history_rows > 100000
        labels:
          severity: info
          component: database
        annotations:
          summary: "Pricing history table growing large"
          description: "{{ $value }} rows in pricing_history table"
          runbook: "Consider archiving old pricing data"
```

---

## Logging

### Log Levels and Categories

| Level | Category | Example |
|-------|----------|---------|
| DEBUG | sync | "Starting sync job for provider: openai" |
| INFO | discovery | "Discovered 45 models from openai" |
| INFO | scraping | "Successfully scraped pricing from anthropic" |
| WARN | enrichment | "Failed to match pricing for model: gpt-4-vision" |
| ERROR | sync | "Sync job failed: All providers unavailable" |

### Structured Log Format

```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "category": "sync",
  "event": "sync_completed",
  "provider": "openai",
  "duration": 45230,
  "modelsDiscovered": 45,
  "modelsUpdated": 3,
  "modelsDeprecated": 1,
  "pricingUpdated": 45,
  "errors": []
}
```

### Key Log Events

#### Sync Events

```json
// Sync started
{
  "level": "info",
  "category": "sync",
  "event": "sync_started",
  "providers": ["openai", "anthropic", "google", "xai"]
}

// Sync completed
{
  "level": "info",
  "category": "sync",
  "event": "sync_completed",
  "duration": 125340,
  "modelsDiscovered": 127,
  "modelsUpdated": 8,
  "modelsDeprecated": 2,
  "pricingUpdated": 127
}

// Sync failed
{
  "level": "error",
  "category": "sync",
  "event": "sync_failed",
  "error": "All providers failed",
  "providers": {
    "openai": "TIMEOUT",
    "anthropic": "RATE_LIMIT",
    "google": "SERVICE_UNAVAILABLE",
    "xai": "AUTH_ERROR"
  }
}
```

#### Discovery Events

```json
// Discovery success
{
  "level": "info",
  "category": "discovery",
  "event": "discovery_success",
  "provider": "openai",
  "modelsFound": 45,
  "duration": 2340
}

// Discovery failure
{
  "level": "error",
  "category": "discovery",
  "event": "discovery_failed",
  "provider": "anthropic",
  "error": "RATE_LIMIT",
  "retryAfter": 60
}
```

#### Scraping Events

```json
// Scraping success
{
  "level": "info",
  "category": "scraping",
  "event": "scraping_success",
  "provider": "google",
  "strategy": "primary",
  "modelsExtracted": 12,
  "duration": 3450
}

// Scraping validation failure
{
  "level": "warn",
  "category": "scraping",
  "event": "validation_failed",
  "provider": "openai",
  "strategy": "primary",
  "reason": "minRows not met",
  "rowsFound": 2,
  "minRows": 5
}

// Scraping blocked
{
  "level": "error",
  "category": "scraping",
  "event": "scraping_blocked",
  "provider": "anthropic",
  "statusCode": 429,
  "retryAfter": 120
}
```

---

## Grafana Dashboards

### Dashboard 1: Sync Overview

**Panels:**

1. **Sync Status** (Stat)
   ```promql
   model_sync_consecutive_failures
   ```

2. **Last Sync Time** (Stat)
   ```promql
   time() - model_sync_last_timestamp
   ```

3. **Models Discovered** (Graph)
   ```promql
   models_discovered_total
   ```

4. **Sync Duration** (Graph)
   ```promql
   histogram_quantile(0.95, rate(model_sync_duration_seconds_bucket[5m]))
   ```

5. **Sync Success Rate** (Graph)
   ```promql
   rate(model_sync_success_total[5m]) / 
   (rate(model_sync_success_total[5m]) + rate(model_sync_failure_total[5m]))
   ```

### Dashboard 2: Provider Performance

**Panels:**

1. **Models per Provider** (Bar Gauge)
   ```promql
   models_fetched_per_provider
   ```

2. **Discovery Duration by Provider** (Graph)
   ```promql
   histogram_quantile(0.95, 
     rate(model_discovery_duration_seconds_bucket[5m])
   ) by (provider)
   ```

3. **Scraping Success Rate by Provider** (Graph)
   ```promql
   rate(scraping_success_total[5m]) by (provider) /
   (rate(scraping_success_total[5m]) + rate(scraping_failure_total[5m])) by (provider)
   ```

4. **Provider API Errors** (Graph)
   ```promql
   rate(provider_api_errors_total[5m]) by (provider)
   ```

### Dashboard 3: Scraping Performance

**Panels:**

1. **Scraping Strategy Usage** (Pie Chart)
   ```promql
   sum(rate(scraping_strategy_used[5m])) by (strategy)
   ```

2. **Models Extracted per Provider** (Bar Gauge)
   ```promql
   scraping_models_extracted_total by (provider)
   ```

3. **Validation Failures** (Graph)
   ```promql
   rate(scraping_validation_failures_total[5m]) by (provider)
   ```

4. **Scraping Duration** (Heatmap)
   ```promql
   rate(scraping_duration_seconds_bucket[5m]) by (provider, le)
   ```

### Dashboard 4: Cache Performance

**Panels:**

1. **Cache Hit Rate** (Gauge)
   ```promql
   rate(model_cache_hits_total[5m]) /
   (rate(model_cache_hits_total[5m]) + rate(model_cache_misses_total[5m]))
   ```

2. **Cache Hits vs Misses** (Graph)
   ```promql
   rate(model_cache_hits_total[5m])
   rate(model_cache_misses_total[5m])
   ```

3. **Fallback Cache Usage** (Graph)
   ```promql
   rate(fallback_cache_used_total[5m])
   ```

---

## Troubleshooting Guide

### Issue: Sync Job Not Running

**Symptoms:**
- No recent sync timestamp
- Models not updating
- `model_sync_consecutive_failures` = 0

**Diagnosis:**
```bash
# Check scheduler status
docker logs ai-council-app | grep "sync"

# Check cron schedule
echo $SYNC_SCHEDULE_CRON

# Verify auto-sync enabled
echo $ENABLE_AUTO_SYNC
```

**Resolution:**
1. Verify `ENABLE_AUTO_SYNC=true`
2. Check cron expression is valid
3. Restart application
4. Trigger manual sync to test

### Issue: High Scraping Failure Rate

**Symptoms:**
- `scraping_failure_total` increasing
- `scraping_validation_failures_total` > 0
- Fallback strategies being used

**Diagnosis:**
```bash
# Check scraping logs
docker logs ai-council-app | grep "scraping_failed"

# Test scraping manually
curl https://openai.com/api/pricing/ > pricing.html
grep -i "table\|pricing" pricing.html

# Check scraping config
psql -U postgres -d ai_council_proxy -c \
  "SELECT provider, config FROM scraping_config WHERE provider='openai';"
```

**Resolution:**
1. Inspect HTML structure for changes
2. Update scraping selectors
3. Add new fallback strategy
4. Test configuration before deploying

### Issue: Models Missing Pricing

**Symptoms:**
- `missing_pricing_total` > 10
- Models have "TBD" pricing
- `fuzzy_match_failure_total` increasing

**Diagnosis:**
```bash
# Check models without pricing
psql -U postgres -d ai_council_proxy -c \
  "SELECT m.id, m.provider FROM models m 
   LEFT JOIN model_pricing p ON m.id = p.model_id 
   WHERE p.id IS NULL;"

# Check fuzzy matching logs
docker logs ai-council-app | grep "fuzzy_match_failed"
```

**Resolution:**
1. Check if scraped model names match API names
2. Adjust fuzzy matching threshold
3. Add manual pricing mappings
4. Update scraping to extract correct model names

### Issue: Database Performance Degradation

**Symptoms:**
- `database_query_duration_seconds` p95 > 1s
- Slow sync jobs
- High CPU on database

**Diagnosis:**
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename IN ('models', 'model_pricing', 'pricing_history')
ORDER BY idx_scan ASC;

-- Check table sizes
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass))
FROM pg_tables
WHERE tablename IN ('models', 'model_pricing', 'pricing_history');
```

**Resolution:**
1. Add missing indexes
2. Vacuum and analyze tables
3. Archive old pricing history
4. Optimize slow queries

### Issue: Cache Not Working

**Symptoms:**
- Cache hit rate < 0.7
- High database load
- Slow API responses

**Diagnosis:**
```bash
# Check Redis connection
redis-cli PING

# Check cache keys
redis-cli KEYS "model:*"
redis-cli KEYS "pricing:*"

# Check cache TTL
redis-cli TTL "model:openai:list"

# Check Redis memory
redis-cli INFO memory
```

**Resolution:**
1. Verify Redis is running
2. Check REDIS_URL is correct
3. Verify cache TTL settings
4. Check Redis memory limits
5. Restart Redis if needed

---

## Best Practices

### Monitoring

1. **Set Up Comprehensive Dashboards** - Monitor all key metrics
2. **Configure Actionable Alerts** - Alerts should require action
3. **Monitor Trends** - Track metrics over time
4. **Regular Review** - Review dashboards weekly
5. **Document Runbooks** - Create troubleshooting guides

### Alerting

1. **Avoid Alert Fatigue** - Don't alert on every issue
2. **Use Severity Levels** - Critical, Warning, Info
3. **Group Related Alerts** - Group by component/provider
4. **Set Appropriate Thresholds** - Based on historical data
5. **Test Alerts** - Regularly test alert configurations

### Logging

1. **Use Structured Logging** - JSON format for parsing
2. **Include Context** - Provider, duration, error details
3. **Log at Appropriate Levels** - DEBUG, INFO, WARN, ERROR
4. **Aggregate Logs** - Use log aggregation tools
5. **Retain Logs** - Keep logs for 30+ days

### Performance

1. **Monitor Resource Usage** - CPU, memory, disk
2. **Track Query Performance** - Database query times
3. **Optimize Slow Operations** - Scraping, enrichment
4. **Use Caching Effectively** - Reduce database load
5. **Scale Appropriately** - Add resources as needed

---

## Support

For monitoring assistance:
- Documentation: https://docs.example.com/monitoring
- Support: support@example.com
- Runbooks: https://runbooks.example.com/dynamic-pricing
