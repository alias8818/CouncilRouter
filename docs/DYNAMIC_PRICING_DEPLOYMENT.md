# Dynamic Model Pricing - Deployment Guide

## Overview

This guide covers deploying the Dynamic Model and Pricing Retrieval system, including database setup, environment configuration, sync scheduling, and monitoring. The system extends the AI Council Proxy with automated model discovery and pricing tracking.

---

## Prerequisites

- AI Council Proxy base system deployed
- PostgreSQL 14+ with existing schema
- Redis 7+ for caching
- Node.js 18+ runtime
- API keys for AI providers (OpenAI, Anthropic, Google, xAI)

---

## Quick Start

### 1. Database Migration

Run the migration script to add new tables:

```bash
# Navigate to project directory
cd ai-council-proxy

# Run migration
psql -U postgres -d ai_council_proxy -f database/migrations/001_dynamic_pricing.sql
```

**Migration Script** (`database/migrations/001_dynamic_pricing.sql`):

```sql
-- Models table
CREATE TABLE IF NOT EXISTS models (
  id VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  display_name VARCHAR(255),
  classification TEXT[],
  context_window INTEGER,
  usability VARCHAR(20) NOT NULL DEFAULT 'available',
  capabilities JSONB,
  discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMP,
  CONSTRAINT check_usability CHECK (usability IN ('available', 'preview', 'deprecated'))
);

CREATE INDEX idx_models_provider ON models(provider);
CREATE INDEX idx_models_usability ON models(usability);
CREATE INDEX idx_models_classification ON models USING GIN(classification);

-- Model pricing table (current pricing)
CREATE TABLE IF NOT EXISTS model_pricing (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(255) NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  input_cost_per_million DECIMAL(10, 4) NOT NULL,
  output_cost_per_million DECIMAL(10, 4) NOT NULL,
  tier VARCHAR(50) NOT NULL DEFAULT 'standard',
  context_limit INTEGER,
  effective_date TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(model_id, tier)
);

CREATE INDEX idx_pricing_model ON model_pricing(model_id);

-- Pricing history table
CREATE TABLE IF NOT EXISTS pricing_history (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(255) NOT NULL,
  input_cost_per_million DECIMAL(10, 4) NOT NULL,
  output_cost_per_million DECIMAL(10, 4) NOT NULL,
  tier VARCHAR(50) NOT NULL,
  effective_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pricing_history_model ON pricing_history(model_id);
CREATE INDEX idx_pricing_history_dates ON pricing_history(effective_date, end_date);

-- Sync status table
CREATE TABLE IF NOT EXISTS sync_status (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL UNIQUE,
  last_sync TIMESTAMP,
  next_sync TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  models_discovered INTEGER DEFAULT 0,
  models_updated INTEGER DEFAULT 0,
  models_deprecated INTEGER DEFAULT 0,
  pricing_updated INTEGER DEFAULT 0,
  errors JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT check_status CHECK (status IN ('idle', 'running', 'failed'))
);

-- Scraping configuration table
CREATE TABLE IF NOT EXISTS scraping_config (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL UNIQUE,
  config JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert default scraping configurations
INSERT INTO scraping_config (provider, config, active) VALUES
('openai', '{
  "url": "https://openai.com/api/pricing/",
  "throttleMs": 1000,
  "timeoutMs": 30000,
  "strategies": [
    {
      "name": "primary",
      "selectors": {
        "table": "table.pricing-table",
        "rows": "tbody tr",
        "modelName": 0,
        "inputCost": 1,
        "outputCost": 2
      }
    }
  ]
}'::jsonb, true),
('anthropic', '{
  "url": "https://www.anthropic.com/pricing",
  "throttleMs": 1000,
  "timeoutMs": 30000,
  "strategies": [
    {
      "name": "primary",
      "selectors": {
        "table": "table",
        "rows": "tbody tr",
        "modelName": 0,
        "inputCost": 1,
        "outputCost": 2
      }
    }
  ]
}'::jsonb, true),
('google', '{
  "url": "https://ai.google.dev/gemini-api/docs/pricing",
  "throttleMs": 1000,
  "timeoutMs": 30000,
  "strategies": [
    {
      "name": "primary",
      "selectors": {
        "table": "table.devsite-table",
        "rows": "tbody tr",
        "modelName": 0,
        "inputCost": 1,
        "outputCost": 2
      }
    }
  ]
}'::jsonb, true),
('xai', '{
  "url": "https://docs.x.ai/docs/models",
  "throttleMs": 1000,
  "timeoutMs": 30000,
  "strategies": [
    {
      "name": "primary",
      "selectors": {
        "table": "table",
        "rows": "tbody tr",
        "modelName": 0,
        "inputCost": 1,
        "outputCost": 2
      }
    }
  ]
}'::jsonb, true)
ON CONFLICT (provider) DO NOTHING;

-- Initialize sync status for all providers
INSERT INTO sync_status (provider, status) VALUES
('openai', 'idle'),
('anthropic', 'idle'),
('google', 'idle'),
('xai', 'idle')
ON CONFLICT (provider) DO NOTHING;
```

### 2. Verify Migration

```bash
# Check tables were created
psql -U postgres -d ai_council_proxy -c "\dt models*"
psql -U postgres -d ai_council_proxy -c "\dt pricing*"
psql -U postgres -d ai_council_proxy -c "\dt sync_status"
psql -U postgres -d ai_council_proxy -c "\dt scraping_config"

# Check indexes
psql -U postgres -d ai_council_proxy -c "\di idx_models*"
psql -U postgres -d ai_council_proxy -c "\di idx_pricing*"
```

---

## Environment Variables

Add these environment variables to your `.env` file:

```bash
# ============================================
# Dynamic Model Pricing Configuration
# ============================================

# Sync Schedule (cron format)
# Default: Daily at 2 AM
SYNC_SCHEDULE_CRON="0 2 * * *"

# Sync Timeout (milliseconds)
# Default: 5 minutes
SYNC_TIMEOUT_MS=300000

# Scraping Configuration
SCRAPING_USER_AGENT="AI-Council-Proxy/1.0 (Dynamic-Pricing)"
SCRAPING_DELAY_MS=1000
SCRAPING_TIMEOUT_MS=30000

# Cache Configuration
MODEL_CACHE_TTL=3600              # 1 hour
PRICING_CACHE_TTL=3600            # 1 hour
FALLBACK_CACHE_TTL=604800         # 7 days

# Provider API Keys (if not already set)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
XAI_API_KEY=xai-...

# Alert Configuration
ALERT_EMAIL=admin@example.com
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/...

# Feature Flags
ENABLE_MODEL_DISCOVERY=true
ENABLE_PRICING_SCRAPING=true
ENABLE_AUTO_SYNC=true
```

### Environment Variable Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| SYNC_SCHEDULE_CRON | No | Cron schedule for sync job | "0 2 * * *" |
| SYNC_TIMEOUT_MS | No | Max sync duration | 300000 |
| SCRAPING_USER_AGENT | No | User-Agent for scraping | "AI-Council-Proxy/1.0" |
| SCRAPING_DELAY_MS | No | Delay between requests | 1000 |
| SCRAPING_TIMEOUT_MS | No | Request timeout | 30000 |
| MODEL_CACHE_TTL | No | Model cache TTL (seconds) | 3600 |
| PRICING_CACHE_TTL | No | Pricing cache TTL (seconds) | 3600 |
| FALLBACK_CACHE_TTL | No | Fallback cache TTL (seconds) | 604800 |
| ENABLE_MODEL_DISCOVERY | No | Enable model discovery | true |
| ENABLE_PRICING_SCRAPING | No | Enable pricing scraping | true |
| ENABLE_AUTO_SYNC | No | Enable automatic sync | true |

---

## Sync Schedule Configuration

### Cron Format

The sync schedule uses standard cron format:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

### Common Schedules

```bash
# Every day at 2 AM
SYNC_SCHEDULE_CRON="0 2 * * *"

# Every 6 hours
SYNC_SCHEDULE_CRON="0 */6 * * *"

# Every day at 2 AM and 2 PM
SYNC_SCHEDULE_CRON="0 2,14 * * *"

# Every Monday at 3 AM
SYNC_SCHEDULE_CRON="0 3 * * 1"

# Every hour
SYNC_SCHEDULE_CRON="0 * * * *"

# Every 30 minutes
SYNC_SCHEDULE_CRON="*/30 * * * *"
```

### Recommended Schedules

| Use Case | Schedule | Cron Expression |
|----------|----------|-----------------|
| Production | Daily at 2 AM | `0 2 * * *` |
| Development | Every 6 hours | `0 */6 * * *` |
| Testing | Every hour | `0 * * * *` |
| High-frequency | Every 30 minutes | `*/30 * * * *` |

---

## Initial Sync

After deployment, run an initial sync to populate the database:

### Manual Sync via API

```bash
# Trigger manual sync
curl -X POST http://localhost:3000/api/admin/sync/trigger \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "timestamp": "2024-01-15T10:30:00Z",
  "modelsDiscovered": 127,
  "modelsUpdated": 0,
  "modelsDeprecated": 0,
  "pricingUpdated": 127,
  "errors": []
}
```

### Manual Sync via CLI

```bash
# Run sync script
npm run sync:models

# Or with specific providers
npm run sync:models -- --providers openai,anthropic
```

### Verify Initial Sync

```bash
# Check models were discovered
psql -U postgres -d ai_council_proxy -c "SELECT COUNT(*) FROM models;"

# Check pricing was scraped
psql -U postgres -d ai_council_proxy -c "SELECT COUNT(*) FROM model_pricing;"

# Check sync status
psql -U postgres -d ai_council_proxy -c "SELECT * FROM sync_status;"

# View sample models
psql -U postgres -d ai_council_proxy -c "SELECT id, provider, display_name, usability FROM models LIMIT 10;"
```

---

## Docker Deployment

### Update docker-compose.yml

Add environment variables to the app service:

```yaml
services:
  app:
    # ... existing configuration ...
    environment:
      # ... existing environment variables ...
      
      # Dynamic Pricing Configuration
      SYNC_SCHEDULE_CRON: ${SYNC_SCHEDULE_CRON:-0 2 * * *}
      SYNC_TIMEOUT_MS: ${SYNC_TIMEOUT_MS:-300000}
      SCRAPING_USER_AGENT: ${SCRAPING_USER_AGENT:-AI-Council-Proxy/1.0}
      SCRAPING_DELAY_MS: ${SCRAPING_DELAY_MS:-1000}
      SCRAPING_TIMEOUT_MS: ${SCRAPING_TIMEOUT_MS:-30000}
      MODEL_CACHE_TTL: ${MODEL_CACHE_TTL:-3600}
      PRICING_CACHE_TTL: ${PRICING_CACHE_TTL:-3600}
      FALLBACK_CACHE_TTL: ${FALLBACK_CACHE_TTL:-604800}
      ENABLE_MODEL_DISCOVERY: ${ENABLE_MODEL_DISCOVERY:-true}
      ENABLE_PRICING_SCRAPING: ${ENABLE_PRICING_SCRAPING:-true}
      ENABLE_AUTO_SYNC: ${ENABLE_AUTO_SYNC:-true}
```

### Rebuild and Deploy

```bash
# Rebuild containers
docker-compose build

# Stop existing containers
docker-compose down

# Start with new configuration
docker-compose up -d

# Check logs
docker-compose logs -f app

# Run initial sync
docker-compose exec app npm run sync:models
```

---

## Kubernetes Deployment

### ConfigMap for Environment Variables

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: dynamic-pricing-config
data:
  SYNC_SCHEDULE_CRON: "0 2 * * *"
  SYNC_TIMEOUT_MS: "300000"
  SCRAPING_USER_AGENT: "AI-Council-Proxy/1.0"
  SCRAPING_DELAY_MS: "1000"
  SCRAPING_TIMEOUT_MS: "30000"
  MODEL_CACHE_TTL: "3600"
  PRICING_CACHE_TTL: "3600"
  FALLBACK_CACHE_TTL: "604800"
  ENABLE_MODEL_DISCOVERY: "true"
  ENABLE_PRICING_SCRAPING: "true"
  ENABLE_AUTO_SYNC: "true"
```

### Update Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-council-proxy
spec:
  template:
    spec:
      containers:
      - name: app
        # ... existing configuration ...
        envFrom:
        - configMapRef:
            name: dynamic-pricing-config
        - secretRef:
            name: ai-council-secrets
```

### CronJob for Manual Sync (Optional)

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: model-sync
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: sync
            image: your-registry/ai-council-proxy:latest
            command: ["npm", "run", "sync:models"]
            envFrom:
            - configMapRef:
                name: dynamic-pricing-config
            - secretRef:
                name: ai-council-secrets
          restartPolicy: OnFailure
```

---

## Monitoring and Alerting

### Health Check

The system exposes sync status in the health endpoint:

```bash
curl http://localhost:3000/health
```

Response includes sync status:
```json
{
  "status": "healthy",
  "services": {
    "modelSync": {
      "status": "healthy",
      "lastSync": "2024-01-15T02:00:00Z",
      "nextSync": "2024-01-16T02:00:00Z",
      "modelsDiscovered": 127
    }
  }
}
```

### Prometheus Metrics

The system exposes metrics at `/metrics`:

```promql
# Sync job metrics
model_sync_duration_seconds
model_sync_success_total
model_sync_failure_total
models_discovered_total
models_deprecated_total
pricing_updated_total

# Scraping metrics
scraping_duration_seconds
scraping_success_total
scraping_failure_total
scraping_models_extracted_total

# Cache metrics
model_cache_hits_total
model_cache_misses_total
pricing_cache_hits_total
pricing_cache_misses_total
```

### Alert Rules

**prometheus-alerts.yml:**

```yaml
groups:
  - name: dynamic_pricing_alerts
    rules:
      # Sync failure alert
      - alert: ModelSyncFailed
        expr: |
          increase(model_sync_failure_total[1h]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Model sync job failed"
          description: "Sync job has failed {{ $value }} times in the last hour"

      # Consecutive sync failures
      - alert: ModelSyncConsecutiveFailures
        expr: |
          model_sync_consecutive_failures >= 3
        labels:
          severity: critical
        annotations:
          summary: "Multiple consecutive sync failures"
          description: "Sync job has failed {{ $value }} times consecutively"

      # Scraping failure alert
      - alert: ScrapingFailed
        expr: |
          rate(scraping_failure_total[1h]) > 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High scraping failure rate"
          description: "Scraping failure rate: {{ $value | humanizePercentage }}"

      # Low model count
      - alert: LowModelCount
        expr: |
          models_discovered_total < 100
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Low model count detected"
          description: "Only {{ $value }} models discovered (expected >100)"

      # Cache miss rate high
      - alert: HighCacheMissRate
        expr: |
          rate(model_cache_misses_total[5m]) / 
          (rate(model_cache_hits_total[5m]) + rate(model_cache_misses_total[5m])) > 0.5
        for: 15m
        labels:
          severity: info
        annotations:
          summary: "High cache miss rate"
          description: "Cache miss rate: {{ $value | humanizePercentage }}"
```

### Grafana Dashboard

Create a dashboard with these panels:

1. **Sync Status**
   - Last sync timestamp
   - Next sync timestamp
   - Models discovered
   - Sync success rate

2. **Scraping Performance**
   - Scraping duration per provider
   - Success rate per provider
   - Models extracted per provider

3. **Model Statistics**
   - Total models by provider
   - Models by classification
   - Models by usability status
   - Model discovery timeline

4. **Pricing Statistics**
   - Pricing updates over time
   - Price changes detected
   - Average cost per provider

5. **Cache Performance**
   - Cache hit rate
   - Cache size
   - Cache evictions

---

## Troubleshooting

### Sync Job Not Running

**Check scheduler status:**
```bash
# View logs
docker-compose logs app | grep "sync"

# Check cron schedule
echo $SYNC_SCHEDULE_CRON

# Verify scheduler is enabled
echo $ENABLE_AUTO_SYNC
```

**Solutions:**
1. Verify `ENABLE_AUTO_SYNC=true`
2. Check cron expression is valid
3. Restart application
4. Trigger manual sync to test

### No Models Discovered

**Check provider API access:**
```bash
# Test OpenAI API
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Test Anthropic API
curl https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY"

# Test Google API
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_API_KEY"
```

**Solutions:**
1. Verify API keys are valid
2. Check API key permissions
3. Verify network connectivity
4. Check rate limits

### Scraping Failures

**Check scraping configuration:**
```sql
-- View scraping config
SELECT provider, config, active 
FROM scraping_config 
WHERE provider = 'openai';

-- Check sync errors
SELECT provider, errors 
FROM sync_status 
WHERE errors IS NOT NULL;
```

**Test scraping manually:**
```bash
# Download pricing page
curl https://openai.com/api/pricing/ > pricing.html

# Inspect HTML structure
grep -i "pricing\|table" pricing.html
```

**Solutions:**
1. Update scraping selectors
2. Add fallback strategies
3. Check for website changes
4. Verify User-Agent header

### Database Connection Issues

**Check connection:**
```bash
# Test database connection
psql -U postgres -d ai_council_proxy -c "SELECT 1"

# Check table exists
psql -U postgres -d ai_council_proxy -c "\dt models"

# Check permissions
psql -U postgres -d ai_council_proxy -c "SELECT current_user, current_database()"
```

**Solutions:**
1. Verify DATABASE_URL is correct
2. Check database is running
3. Verify user has permissions
4. Run migrations if tables missing

---

## Rollback Procedure

If issues occur after deployment:

### 1. Disable Auto-Sync

```bash
# Set environment variable
export ENABLE_AUTO_SYNC=false

# Restart application
docker-compose restart app
```

### 2. Revert Database Changes

```bash
# Backup current data
pg_dump -U postgres -d ai_council_proxy -t models -t model_pricing -t pricing_history > backup.sql

# Drop new tables
psql -U postgres -d ai_council_proxy -c "DROP TABLE IF EXISTS pricing_history CASCADE;"
psql -U postgres -d ai_council_proxy -c "DROP TABLE IF EXISTS model_pricing CASCADE;"
psql -U postgres -d ai_council_proxy -c "DROP TABLE IF EXISTS models CASCADE;"
psql -U postgres -d ai_council_proxy -c "DROP TABLE IF EXISTS sync_status CASCADE;"
psql -U postgres -d ai_council_proxy -c "DROP TABLE IF EXISTS scraping_config CASCADE;"
```

### 3. Restore Previous Version

```bash
# Checkout previous version
git checkout previous-version

# Rebuild and deploy
docker-compose build
docker-compose up -d
```

---

## Performance Optimization

### Database Optimization

```sql
-- Analyze tables for query optimization
ANALYZE models;
ANALYZE model_pricing;
ANALYZE pricing_history;

-- Vacuum tables
VACUUM ANALYZE models;
VACUUM ANALYZE model_pricing;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename IN ('models', 'model_pricing', 'pricing_history')
ORDER BY idx_scan DESC;
```

### Cache Optimization

```bash
# Monitor cache hit rate
redis-cli INFO stats | grep keyspace

# Check cache size
redis-cli DBSIZE

# Monitor cache memory
redis-cli INFO memory
```

### Sync Optimization

1. **Reduce Sync Frequency** - Change from hourly to daily
2. **Parallel Provider Queries** - Already implemented
3. **Increase Cache TTL** - Reduce database queries
4. **Optimize Scraping** - Use more specific selectors

---

## Security Considerations

1. **API Key Security**
   - Store in environment variables
   - Never commit to version control
   - Rotate regularly
   - Use separate keys for dev/prod

2. **Database Security**
   - Use strong passwords
   - Limit network access
   - Enable SSL connections
   - Regular backups

3. **Scraping Compliance**
   - Respect robots.txt
   - Use appropriate User-Agent
   - Implement rate limiting
   - Cache aggressively

4. **Access Control**
   - Require authentication for admin endpoints
   - Implement rate limiting
   - Log all sync operations
   - Monitor for abuse

---

## Support

For deployment assistance:
- Documentation: https://docs.example.com/dynamic-pricing
- Support: support@example.com
- GitHub Issues: https://github.com/your-org/ai-council-proxy/issues
