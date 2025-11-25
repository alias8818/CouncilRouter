# Database Migrations

This directory contains database migration scripts for the AI Council Proxy system.

## Applying Migrations

### Migration 001: Dynamic Model Pricing

This migration adds tables for the Dynamic Model and Pricing Retrieval system.

**To apply this migration:**

```bash
# Using psql
psql -U postgres -d ai_council_proxy -f database/migrations/001_dynamic_model_pricing.sql

# Or with environment variable
psql $DATABASE_URL -f database/migrations/001_dynamic_model_pricing.sql
```

**Tables created:**
- `models` - Stores discovered models from provider APIs
- `model_pricing` - Current pricing information for models
- `pricing_history` - Historical pricing records for trend analysis
- `sync_status` - Synchronization status tracking per provider
- `scraping_config` - Provider-specific scraping configurations

**Indexes created:**
- Performance indexes on provider, usability, classification
- Date range indexes for historical queries
- Foreign key indexes for joins

**Initial data:**
- Scraping configurations for OpenAI, Anthropic, Google, and xAI
- Sync status initialization for all providers

## Migration Order

Migrations should be applied in numerical order:
1. `001_dynamic_model_pricing.sql`

## Rollback

To rollback migration 001:

```sql
DROP TABLE IF EXISTS scraping_config CASCADE;
DROP TABLE IF EXISTS sync_status CASCADE;
DROP TABLE IF EXISTS pricing_history CASCADE;
DROP TABLE IF EXISTS model_pricing CASCADE;
DROP TABLE IF EXISTS models CASCADE;
```

## Verification

After applying the migration, verify the tables exist:

```sql
\dt models
\dt model_pricing
\dt pricing_history
\dt sync_status
\dt scraping_config
```

Check that initial data was seeded:

```sql
SELECT provider, active FROM scraping_config;
SELECT provider, status FROM sync_status;
```
