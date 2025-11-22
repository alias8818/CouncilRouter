# AI Council Proxy - Database Setup Guide

## Overview

This guide covers setting up and managing the PostgreSQL database and Redis cache for the AI Council Proxy system.

## Database Architecture

The system uses two data stores:

1. **PostgreSQL** - Primary persistent storage for requests, responses, sessions, and analytics
2. **Redis** - High-performance cache for sessions, configuration, and provider health

---

## PostgreSQL Setup

### Local Development Setup

#### Option 1: Using Docker

```bash
# Start PostgreSQL container
docker run -d \
  --name ai-council-postgres \
  -e POSTGRES_DB=ai_council_proxy \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:14-alpine

# Verify it's running
docker ps | grep ai-council-postgres
```

#### Option 2: Native Installation

**macOS (Homebrew):**
```bash
brew install postgresql@14
brew services start postgresql@14
createdb ai_council_proxy
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-14
sudo systemctl start postgresql
sudo -u postgres createdb ai_council_proxy
```

**Windows:**
Download and install from https://www.postgresql.org/download/windows/

### Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE ai_council_proxy;

# Create user (optional)
CREATE USER ai_council WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE ai_council_proxy TO ai_council;

# Exit
\q
```

### Run Schema Migration

```bash
# From project root
psql -U postgres -d ai_council_proxy -f database/schema.sql

# Or using Docker
docker exec -i ai-council-postgres psql -U postgres -d ai_council_proxy < database/schema.sql
```

### Verify Schema

```bash
# Connect to database
psql -U postgres -d ai_council_proxy

# List tables
\dt

# Expected tables:
# - requests
# - council_responses
# - deliberation_exchanges
# - sessions
# - session_history
# - configurations
# - provider_health
# - cost_records
# - red_team_tests

# Describe a table
\d requests

# Exit
\q
```

---

## Database Schema Details

### Tables Overview

#### 1. requests

Stores user requests and consensus decisions.

```sql
CREATE TABLE requests (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255),
  session_id UUID,
  query TEXT NOT NULL,
  status VARCHAR(50) NOT NULL,
  consensus_decision TEXT,
  agreement_level DECIMAL(3,2),
  total_cost DECIMAL(10,4),
  total_latency_ms INTEGER,
  created_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  config_snapshot JSONB NOT NULL
);
```

**Indexes:**
- `idx_requests_user_id` on `user_id`
- `idx_requests_session_id` on `session_id`
- `idx_requests_created_at` on `created_at`

#### 2. council_responses

Stores individual council member responses.

```sql
CREATE TABLE council_responses (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  council_member_id VARCHAR(255) NOT NULL,
  round_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_usage JSONB NOT NULL,
  latency_ms INTEGER NOT NULL,
  cost DECIMAL(10,4),
  created_at TIMESTAMP NOT NULL
);
```

**Indexes:**
- `idx_council_responses_request_id` on `request_id`

#### 3. deliberation_exchanges

Stores deliberation round exchanges.

```sql
CREATE TABLE deliberation_exchanges (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  round_number INTEGER NOT NULL,
  council_member_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  references_to TEXT[],
  token_usage JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

**Indexes:**
- `idx_deliberation_exchanges_request_id` on `request_id`

#### 4. sessions

Stores user conversation sessions.

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP NOT NULL,
  context_window_used INTEGER NOT NULL,
  expired BOOLEAN DEFAULT FALSE
);
```

#### 5. session_history

Stores session message history.

```sql
CREATE TABLE session_history (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  request_id UUID,
  created_at TIMESTAMP NOT NULL
);
```

**Indexes:**
- `idx_session_history_session_id` on `session_id`

#### 6. configurations

Stores system configuration versions.

```sql
CREATE TABLE configurations (
  id UUID PRIMARY KEY,
  config_type VARCHAR(100) NOT NULL,
  config_data JSONB NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL,
  active BOOLEAN DEFAULT TRUE
);
```

#### 7. provider_health

Tracks provider health status.

```sql
CREATE TABLE provider_health (
  provider_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL,
  success_rate DECIMAL(5,4),
  avg_latency_ms INTEGER,
  last_failure_at TIMESTAMP,
  disabled_reason TEXT,
  updated_at TIMESTAMP NOT NULL
);
```

#### 8. cost_records

Tracks API costs per request.

```sql
CREATE TABLE cost_records (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  provider VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  cost DECIMAL(10,4) NOT NULL,
  pricing_version VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

**Indexes:**
- `idx_cost_records_request_id` on `request_id`
- `idx_cost_records_created_at` on `created_at`

#### 9. red_team_tests

Stores security test results.

```sql
CREATE TABLE red_team_tests (
  id UUID PRIMARY KEY,
  test_name VARCHAR(255) NOT NULL,
  prompt TEXT NOT NULL,
  attack_category VARCHAR(100) NOT NULL,
  council_member_id VARCHAR(255) NOT NULL,
  response TEXT NOT NULL,
  compromised BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

---

## Redis Setup

### Local Development Setup

#### Option 1: Using Docker

```bash
# Start Redis container
docker run -d \
  --name ai-council-redis \
  -p 6379:6379 \
  redis:7-alpine redis-server --appendonly yes

# Verify it's running
docker ps | grep ai-council-redis

# Test connection
docker exec -it ai-council-redis redis-cli ping
# Should return: PONG
```

#### Option 2: Native Installation

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

**Windows:**
Download from https://github.com/microsoftarchive/redis/releases

### Verify Redis

```bash
# Connect to Redis
redis-cli

# Test
127.0.0.1:6379> PING
PONG

# Check info
127.0.0.1:6379> INFO server

# Exit
127.0.0.1:6379> EXIT
```

---

## Redis Cache Schema

### Cache Keys

#### Session Cache

**Key Pattern:** `session:{sessionId}`

**Value Structure:**
```json
{
  "userId": "user-123",
  "history": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": "2024-01-15T10:30:00Z"
    },
    {
      "role": "assistant",
      "content": "Hi there!",
      "timestamp": "2024-01-15T10:30:02Z"
    }
  ],
  "lastActivityAt": "2024-01-15T10:30:02Z",
  "contextWindowUsed": 150
}
```

**TTL:** 30 days (2592000 seconds)

**Example:**
```bash
# Set session
redis-cli SET "session:550e8400-e29b-41d4-a716-446655440000" '{"userId":"user-123","history":[]}'
redis-cli EXPIRE "session:550e8400-e29b-41d4-a716-446655440000" 2592000

# Get session
redis-cli GET "session:550e8400-e29b-41d4-a716-446655440000"
```

#### Configuration Cache

**Key Patterns:**
- `config:council` - Council configuration
- `config:deliberation` - Deliberation configuration
- `config:synthesis` - Synthesis configuration
- `config:performance` - Performance configuration

**TTL:** No expiry (invalidate on update)

**Example:**
```bash
# Set config
redis-cli SET "config:council" '{"members":[...],"minimumSize":2}'

# Get config
redis-cli GET "config:council"

# Invalidate on update
redis-cli DEL "config:council"
```

#### Provider Health Cache

**Key Pattern:** `provider:health:{providerId}`

**Value Structure:**
```json
{
  "providerId": "openai",
  "status": "healthy",
  "successRate": 0.98,
  "avgLatency": 1250,
  "lastFailure": null
}
```

**TTL:** 5 minutes (300 seconds)

**Example:**
```bash
# Set provider health
redis-cli SETEX "provider:health:openai" 300 '{"status":"healthy","successRate":0.98}'

# Get provider health
redis-cli GET "provider:health:openai"
```

#### Request Status Cache

**Key Pattern:** `request:status:{requestId}`

**Value Structure:**
```json
{
  "status": "processing",
  "progress": 0.5
}
```

**TTL:** 1 hour (3600 seconds)

**Example:**
```bash
# Set request status
redis-cli SETEX "request:status:550e8400-..." 3600 '{"status":"processing","progress":0.5}'

# Get request status
redis-cli GET "request:status:550e8400-..."
```

---

## Database Maintenance

### Backup

#### PostgreSQL Backup

```bash
# Full database backup
pg_dump -U postgres ai_council_proxy > backup_$(date +%Y%m%d).sql

# Compressed backup
pg_dump -U postgres ai_council_proxy | gzip > backup_$(date +%Y%m%d).sql.gz

# Backup specific tables
pg_dump -U postgres -t requests -t council_responses ai_council_proxy > backup_requests.sql

# Docker backup
docker exec ai-council-postgres pg_dump -U postgres ai_council_proxy > backup.sql
```

#### Redis Backup

```bash
# Trigger save
redis-cli BGSAVE

# Copy RDB file
cp /var/lib/redis/dump.rdb backup_$(date +%Y%m%d).rdb

# Docker backup
docker exec ai-council-redis redis-cli BGSAVE
docker cp ai-council-redis:/data/dump.rdb backup.rdb
```

### Restore

#### PostgreSQL Restore

```bash
# Drop and recreate database
dropdb -U postgres ai_council_proxy
createdb -U postgres ai_council_proxy

# Restore from backup
psql -U postgres ai_council_proxy < backup.sql

# Docker restore
docker exec -i ai-council-postgres psql -U postgres ai_council_proxy < backup.sql
```

#### Redis Restore

```bash
# Stop Redis
redis-cli SHUTDOWN

# Replace RDB file
cp backup.rdb /var/lib/redis/dump.rdb

# Start Redis
redis-server

# Docker restore
docker stop ai-council-redis
docker cp backup.rdb ai-council-redis:/data/dump.rdb
docker start ai-council-redis
```

### Automated Backups

#### Cron Job (Linux/macOS)

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /usr/bin/pg_dump -U postgres ai_council_proxy | gzip > /backups/ai_council_$(date +\%Y\%m\%d).sql.gz

# Add weekly Redis backup
0 3 * * 0 /usr/bin/redis-cli BGSAVE && cp /var/lib/redis/dump.rdb /backups/redis_$(date +\%Y\%m\%d).rdb
```

---

## Performance Optimization

### PostgreSQL Optimization

#### Connection Pooling

Configure in application:

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

#### Indexes

Ensure all indexes are created (included in schema.sql):

```sql
-- Check existing indexes
SELECT tablename, indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public';

-- Add missing indexes if needed
CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at);
```

#### Vacuum and Analyze

```bash
# Manual vacuum
psql -U postgres -d ai_council_proxy -c "VACUUM ANALYZE;"

# Auto-vacuum (enabled by default in PostgreSQL 14+)
# Check settings
psql -U postgres -d ai_council_proxy -c "SHOW autovacuum;"
```

### Redis Optimization

#### Memory Management

```bash
# Check memory usage
redis-cli INFO memory

# Set max memory (e.g., 2GB)
redis-cli CONFIG SET maxmemory 2gb

# Set eviction policy
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

#### Persistence Configuration

```bash
# Configure RDB snapshots
redis-cli CONFIG SET save "900 1 300 10 60 10000"

# Configure AOF
redis-cli CONFIG SET appendonly yes
redis-cli CONFIG SET appendfsync everysec
```

---

## Monitoring

### PostgreSQL Monitoring

#### Check Database Size

```sql
SELECT pg_size_pretty(pg_database_size('ai_council_proxy'));
```

#### Check Table Sizes

```sql
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Check Active Connections

```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'ai_council_proxy';
```

#### Slow Query Log

```sql
-- Enable slow query logging
ALTER DATABASE ai_council_proxy SET log_min_duration_statement = 1000;

-- View slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### Redis Monitoring

#### Check Memory Usage

```bash
redis-cli INFO memory | grep used_memory_human
```

#### Check Key Count

```bash
redis-cli DBSIZE
```

#### Monitor Commands

```bash
redis-cli MONITOR
```

#### Check Hit Rate

```bash
redis-cli INFO stats | grep keyspace
```

---

## Troubleshooting

### PostgreSQL Issues

#### Connection Refused

```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Check logs
tail -f /var/log/postgresql/postgresql-14-main.log

# Docker logs
docker logs ai-council-postgres
```

#### Too Many Connections

```sql
-- Check current connections
SELECT count(*) FROM pg_stat_activity;

-- Increase max connections
ALTER SYSTEM SET max_connections = 200;
SELECT pg_reload_conf();
```

#### Slow Queries

```sql
-- Find long-running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;

-- Kill a query
SELECT pg_terminate_backend(pid);
```

### Redis Issues

#### Connection Refused

```bash
# Check if Redis is running
redis-cli ping

# Check logs
tail -f /var/log/redis/redis-server.log

# Docker logs
docker logs ai-council-redis
```

#### Memory Issues

```bash
# Check memory
redis-cli INFO memory

# Clear all keys (CAUTION!)
redis-cli FLUSHALL

# Clear specific pattern
redis-cli --scan --pattern "session:*" | xargs redis-cli DEL
```

#### High CPU Usage

```bash
# Check slow log
redis-cli SLOWLOG GET 10

# Identify expensive commands
redis-cli --latency
```

---

## Migration Scripts

### Adding New Columns

```sql
-- Add column to requests table
ALTER TABLE requests ADD COLUMN new_field VARCHAR(255);

-- Add with default value
ALTER TABLE requests ADD COLUMN new_field VARCHAR(255) DEFAULT 'default_value';

-- Add NOT NULL with default
ALTER TABLE requests ADD COLUMN new_field VARCHAR(255) NOT NULL DEFAULT 'default_value';
```

### Creating New Tables

```sql
-- Create new table
CREATE TABLE new_table (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  data JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add index
CREATE INDEX idx_new_table_request_id ON new_table(request_id);
```

### Data Migration

```sql
-- Migrate data between tables
INSERT INTO new_table (id, request_id, data, created_at)
SELECT id, request_id, jsonb_build_object('field', old_field), created_at
FROM old_table;
```

---

## Production Recommendations

1. **Use Managed Services**
   - AWS RDS for PostgreSQL
   - AWS ElastiCache for Redis
   - Google Cloud SQL / Cloud Memorystore
   - Azure Database / Azure Cache

2. **Enable Automated Backups**
   - Daily PostgreSQL backups with 7-day retention
   - Redis snapshots every 6 hours

3. **Set Up Monitoring**
   - CloudWatch / Stackdriver / Azure Monitor
   - Alert on high CPU, memory, connections
   - Monitor slow queries

4. **Use Read Replicas**
   - For analytics queries
   - Reduce load on primary database

5. **Enable SSL/TLS**
   - Encrypt connections to database
   - Use SSL certificates

6. **Regular Maintenance**
   - Weekly VACUUM ANALYZE
   - Monthly index rebuilds
   - Quarterly capacity planning

---

## Support

For database setup assistance:
- Documentation: https://docs.example.com/database
- Support: support@example.com
