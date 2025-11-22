# AI Council Proxy - Monitoring and Observability Guide

## Overview

This guide covers monitoring, logging, alerting, and observability best practices for the AI Council Proxy system in production environments.

## Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Council Proxy                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   API    │  │Orchestr. │  │Providers │  │Analytics │   │
│  │ Gateway  │  │  Engine  │  │   Pool   │  │  Engine  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │              │              │          │
│       └─────────────┴──────────────┴──────────────┘          │
│                         │                                     │
└─────────────────────────┼─────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Logging & Metrics   │
              │                       │
              │  ┌─────────────────┐ │
              │  │  Structured     │ │
              │  │  JSON Logs      │ │
              │  └─────────────────┘ │
              │  ┌─────────────────┐ │
              │  │  Prometheus     │ │
              │  │  Metrics        │ │
              │  └─────────────────┘ │
              │  ┌─────────────────┐ │
              │  │  Distributed    │ │
              │  │  Tracing        │ │
              │  └─────────────────┘ │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Monitoring Stack     │
              │                       │
              │  • Grafana            │
              │  • Prometheus         │
              │  • Loki               │
              │  • Jaeger/Tempo       │
              │  • AlertManager       │
              └───────────────────────┘
```

---

## Key Metrics to Monitor

### Application Metrics

#### Request Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `requests_total` | Counter | Total requests received | - |
| `requests_in_progress` | Gauge | Current requests being processed | > 100 |
| `request_duration_seconds` | Histogram | Request processing time | p95 > 60s |
| `request_errors_total` | Counter | Total failed requests | > 5% error rate |
| `consensus_agreement_level` | Histogram | Agreement level distribution | p50 < 0.5 |

#### Provider Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `provider_requests_total` | Counter | Requests per provider | - |
| `provider_errors_total` | Counter | Errors per provider | > 10% error rate |
| `provider_latency_seconds` | Histogram | Provider response time | p95 > 30s |
| `provider_health_status` | Gauge | Provider health (0=disabled, 1=degraded, 2=healthy) | < 1 |
| `provider_cost_usd` | Counter | Cost per provider | - |

#### Deliberation Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `deliberation_rounds_total` | Counter | Total deliberation rounds executed | - |
| `deliberation_duration_seconds` | Histogram | Time spent in deliberation | p95 > 45s |
| `synthesis_duration_seconds` | Histogram | Time spent in synthesis | p95 > 10s |

#### Cost Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `total_cost_usd` | Counter | Total API costs | Daily > $100 |
| `cost_per_request_usd` | Histogram | Cost distribution per request | p95 > $0.50 |
| `cost_by_provider_usd` | Counter | Cost breakdown by provider | - |

#### Session Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `active_sessions` | Gauge | Current active sessions | > 10000 |
| `session_context_tokens` | Histogram | Context window usage | p95 > 7000 |
| `expired_sessions_total` | Counter | Sessions expired due to inactivity | - |

### Infrastructure Metrics

#### Database (PostgreSQL)

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `pg_connections_active` | Gauge | Active database connections | > 80% of max |
| `pg_query_duration_seconds` | Histogram | Query execution time | p95 > 1s |
| `pg_database_size_bytes` | Gauge | Database size | > 80% of allocated |
| `pg_cache_hit_ratio` | Gauge | Cache hit ratio | < 0.9 |

#### Cache (Redis)

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `redis_connected_clients` | Gauge | Connected clients | > 1000 |
| `redis_memory_used_bytes` | Gauge | Memory usage | > 80% of max |
| `redis_keyspace_hits_total` | Counter | Cache hits | - |
| `redis_keyspace_misses_total` | Counter | Cache misses | Hit rate < 0.8 |
| `redis_evicted_keys_total` | Counter | Evicted keys | > 100/min |

#### System Resources

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `cpu_usage_percent` | Gauge | CPU utilization | > 80% |
| `memory_usage_percent` | Gauge | Memory utilization | > 85% |
| `disk_usage_percent` | Gauge | Disk utilization | > 80% |
| `network_bytes_sent` | Counter | Network egress | - |
| `network_bytes_received` | Counter | Network ingress | - |

---

## Logging

### Log Levels

| Level | Use Case | Example |
|-------|----------|---------|
| DEBUG | Development debugging | "Parsing request body: {...}" |
| INFO | Normal operations | "Request processed successfully" |
| WARN | Recoverable issues | "Provider timeout, retrying..." |
| ERROR | Errors requiring attention | "Database connection failed" |

### Structured Logging Format

All logs are output in JSON format for easy parsing:

```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "service": "ai-council-proxy",
  "version": "1.0.0",
  "environment": "production",
  "message": "Request processed successfully",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-123",
  "sessionId": "session-456",
  "duration": 3450,
  "cost": 0.0234,
  "agreementLevel": 0.92,
  "councilMembers": ["gpt4-turbo", "claude-3-opus", "gemini-pro"],
  "deliberationRounds": 1,
  "synthesisStrategy": "consensus-extraction"
}
```

### Log Categories

#### Request Logs

```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00Z",
  "category": "request",
  "event": "request_received",
  "requestId": "550e8400-...",
  "query": "What is machine learning?",
  "sessionId": "session-456"
}
```

#### Provider Logs

```json
{
  "level": "warn",
  "timestamp": "2024-01-15T10:30:01Z",
  "category": "provider",
  "event": "provider_timeout",
  "providerId": "openai",
  "model": "gpt-4-turbo",
  "requestId": "550e8400-...",
  "attempt": 1,
  "maxAttempts": 3
}
```

#### Cost Logs

```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:03Z",
  "category": "cost",
  "event": "cost_calculated",
  "requestId": "550e8400-...",
  "totalCost": 0.0234,
  "breakdown": {
    "openai": 0.0120,
    "anthropic": 0.0090,
    "google": 0.0024
  }
}
```

#### Error Logs

```json
{
  "level": "error",
  "timestamp": "2024-01-15T10:30:05Z",
  "category": "error",
  "event": "all_providers_failed",
  "requestId": "550e8400-...",
  "error": {
    "code": "ALL_PROVIDERS_FAILED",
    "message": "All council members failed to respond",
    "providers": {
      "openai": "TIMEOUT",
      "anthropic": "RATE_LIMIT",
      "google": "SERVICE_UNAVAILABLE"
    }
  },
  "stack": "Error: All providers failed\n  at OrchestrationEngine..."
}
```

### Log Aggregation

#### Using Loki (Recommended)

**docker-compose.yml:**

```yaml
services:
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yaml:/etc/loki/local-config.yaml
      - loki_data:/loki

  promtail:
    image: grafana/promtail:latest
    volumes:
      - /var/log:/var/log
      - ./promtail-config.yaml:/etc/promtail/config.yml
    command: -config.file=/etc/promtail/config.yml
```

#### Using ELK Stack

**Filebeat configuration:**

```yaml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/ai-council-proxy/*.log
  json.keys_under_root: true
  json.add_error_key: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

---

## Distributed Tracing

### OpenTelemetry Integration

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'ai-council-proxy',
  }),
});

const exporter = new JaegerExporter({
  endpoint: 'http://jaeger:14268/api/traces',
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();
```

### Trace Example

```
Request: 550e8400-e29b-41d4-a716-446655440000
├─ orchestration.processRequest (3450ms)
│  ├─ orchestration.distributeToCouncil (2100ms)
│  │  ├─ provider.sendRequest[openai] (1200ms)
│  │  ├─ provider.sendRequest[anthropic] (1800ms)
│  │  └─ provider.sendRequest[google] (900ms)
│  ├─ orchestration.conductDeliberation (1000ms)
│  │  ├─ provider.sendRequest[openai] (450ms)
│  │  ├─ provider.sendRequest[anthropic] (550ms)
│  │  └─ provider.sendRequest[google] (400ms)
│  └─ synthesis.synthesize (350ms)
│     └─ synthesis.consensusExtraction (350ms)
└─ logger.logConsensusDecision (5ms)
```

---

## Prometheus Metrics

### Metrics Endpoint

Expose metrics at `/metrics`:

```typescript
import { register, Counter, Histogram, Gauge } from 'prom-client';

// Request counter
const requestsTotal = new Counter({
  name: 'ai_council_requests_total',
  help: 'Total number of requests',
  labelNames: ['status', 'method'],
});

// Request duration histogram
const requestDuration = new Histogram({
  name: 'ai_council_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

// Active requests gauge
const activeRequests = new Gauge({
  name: 'ai_council_requests_in_progress',
  help: 'Number of requests currently being processed',
});

// Expose metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Prometheus Configuration

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
```

---

## Grafana Dashboards

### Dashboard 1: Overview

**Panels:**
- Request rate (requests/second)
- Error rate (%)
- P50/P95/P99 latency
- Active requests
- Cost per hour
- Provider health status

**Example Query (Request Rate):**
```promql
rate(ai_council_requests_total[5m])
```

**Example Query (Error Rate):**
```promql
rate(ai_council_requests_total{status="error"}[5m]) / 
rate(ai_council_requests_total[5m]) * 100
```

### Dashboard 2: Provider Performance

**Panels:**
- Requests per provider
- Latency per provider
- Error rate per provider
- Cost per provider
- Provider health timeline

**Example Query (Provider Latency):**
```promql
histogram_quantile(0.95, 
  rate(ai_council_provider_latency_seconds_bucket[5m])
)
```

### Dashboard 3: Cost Analytics

**Panels:**
- Total cost over time
- Cost per request
- Cost breakdown by provider
- Cost breakdown by model
- Daily/weekly/monthly trends

**Example Query (Hourly Cost):**
```promql
increase(ai_council_total_cost_usd[1h])
```

### Dashboard 4: Deliberation Analytics

**Panels:**
- Agreement level distribution
- Deliberation rounds distribution
- Synthesis strategy usage
- Deliberation duration
- Consensus quality metrics

---

## Alerting

### AlertManager Configuration

**alertmanager.yml:**

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'slack-notifications'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
    - match:
        severity: warning
      receiver: 'slack-notifications'

receivers:
  - name: 'slack-notifications'
    slack_configs:
      - channel: '#ai-council-alerts'
        title: 'AI Council Alert'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
```

### Alert Rules

**alerts.yml:**

```yaml
groups:
  - name: ai_council_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          rate(ai_council_requests_total{status="error"}[5m]) / 
          rate(ai_council_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # High latency
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, 
            rate(ai_council_request_duration_seconds_bucket[5m])
          ) > 60
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High request latency"
          description: "P95 latency is {{ $value }}s"

      # Provider down
      - alert: ProviderDown
        expr: ai_council_provider_health_status < 1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Provider {{ $labels.provider }} is down"
          description: "Provider has been unhealthy for 2 minutes"

      # High cost
      - alert: HighDailyCost
        expr: increase(ai_council_total_cost_usd[24h]) > 100
        labels:
          severity: warning
        annotations:
          summary: "Daily cost exceeded threshold"
          description: "Cost in last 24h: ${{ $value }}"

      # Database connection issues
      - alert: DatabaseConnectionHigh
        expr: pg_connections_active / pg_connections_max > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database connection pool near capacity"
          description: "{{ $value | humanizePercentage }} of connections in use"

      # Redis memory high
      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Redis memory usage high"
          description: "{{ $value | humanizePercentage }} of memory in use"

      # Low agreement level
      - alert: LowAgreementLevel
        expr: |
          histogram_quantile(0.50, 
            rate(ai_council_consensus_agreement_level_bucket[1h])
          ) < 0.5
        for: 30m
        labels:
          severity: info
        annotations:
          summary: "Low consensus agreement detected"
          description: "Median agreement level: {{ $value }}"
```

---

## Health Checks

### Application Health Endpoint

**GET /health**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "uptime": 86400,
  "services": {
    "database": {
      "status": "healthy",
      "latency": 5
    },
    "redis": {
      "status": "healthy",
      "latency": 2
    },
    "providers": {
      "openai": {
        "status": "healthy",
        "successRate": 0.98,
        "avgLatency": 1250
      },
      "anthropic": {
        "status": "healthy",
        "successRate": 0.97,
        "avgLatency": 1800
      },
      "google": {
        "status": "degraded",
        "successRate": 0.85,
        "avgLatency": 2500
      }
    }
  }
}
```

### Kubernetes Liveness/Readiness Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2
```

---

## Performance Monitoring

### Key Performance Indicators (KPIs)

| KPI | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.9% | Uptime monitoring |
| P95 Latency | < 10s | Request duration histogram |
| Error Rate | < 1% | Error counter / total requests |
| Provider Health | > 95% | Provider health gauge |
| Cost per Request | < $0.10 | Cost counter / request counter |
| Agreement Level | > 0.7 | Agreement histogram median |

### SLIs and SLOs

**Service Level Indicators (SLIs):**
- Request success rate
- Request latency (P50, P95, P99)
- Provider availability
- Data freshness

**Service Level Objectives (SLOs):**
- 99.9% of requests succeed
- 95% of requests complete in < 10s
- 99% of requests complete in < 60s
- Providers available 99% of the time

---

## Troubleshooting Runbooks

### High Error Rate

1. Check provider health: `curl http://localhost:3000/health`
2. Review error logs: `docker logs ai-council-app | grep ERROR`
3. Check provider API status pages
4. Verify API keys are valid
5. Check rate limits
6. Review recent configuration changes

### High Latency

1. Check deliberation rounds configuration
2. Review provider latencies in metrics
3. Check database query performance
4. Verify Redis cache hit rate
5. Check for network issues
6. Review timeout configurations

### Database Connection Issues

1. Check active connections: `SELECT count(*) FROM pg_stat_activity`
2. Check for long-running queries
3. Verify connection pool settings
4. Check database resource usage
5. Review slow query log

### Cost Spike

1. Check request volume
2. Review deliberation rounds configuration
3. Check which providers are being used
4. Review cost per request metrics
5. Check for unusual query patterns
6. Verify cost alerts are configured

---

## Best Practices

1. **Set Up Comprehensive Monitoring** - Monitor all layers (application, database, cache, infrastructure)
2. **Use Structured Logging** - JSON logs for easy parsing and searching
3. **Implement Distributed Tracing** - Track requests across services
4. **Define Clear SLOs** - Set measurable service level objectives
5. **Create Actionable Alerts** - Alerts should be actionable, not noisy
6. **Build Dashboards** - Visualize key metrics for quick insights
7. **Regular Review** - Review metrics and alerts weekly
8. **Document Runbooks** - Create troubleshooting guides for common issues
9. **Test Alerts** - Regularly test alert configurations
10. **Monitor Costs** - Track and optimize API costs continuously

---

## Support

For monitoring assistance:
- Documentation: https://docs.example.com/monitoring
- Support: support@example.com
- Status Page: https://status.example.com
