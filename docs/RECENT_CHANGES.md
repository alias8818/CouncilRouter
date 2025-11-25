# Recent Changes and Updates

## Overview

This document summarizes major changes to the AI Council Proxy system based on recent code modifications.

## Major New Features

### 1. **Iterative Consensus Synthesis Strategy**

A new advanced synthesis strategy that uses negotiation-based consensus building:

- **Similarity-Based Convergence**: Uses embeddings to measure response similarity
- **Early Termination**: Stops when high similarity is reached (default: 0.95)
- **Deadlock Detection**: Identifies when consensus is unlikely and triggers fallback
- **Cost Optimization**: Tracks tokens saved through early termination
- **Human Escalation**: Optional escalation for unresolved deadlocks

**Configuration:**
```typescript
{
  type: 'iterative-consensus',
  config: {
    maxRounds: 5,
    agreementThreshold: 0.85,
    fallbackStrategy: 'meta-synthesis',
    embeddingModel: 'text-embedding-3-large',
    earlyTerminationEnabled: true,
    earlyTerminationThreshold: 0.95,
    negotiationMode: 'parallel',
    perRoundTimeout: 60,
    humanEscalationEnabled: false,
    exampleCount: 2
  }
}
```

**Database Tables Added:**
- `negotiation_rounds` - Tracks similarity progression per round
- `negotiation_responses` - Stores member responses during negotiation
- `negotiation_examples` - Repository of successful negotiation patterns
- `consensus_metadata` - Metadata about consensus achievement
- `escalation_queue` - Queue for human review of deadlocks

See [Iterative Consensus Documentation](ITERATIVE_CONSENSUS.md) for details.

### 2. **Dynamic Model Discovery and Pricing**

Automatic model and pricing retrieval from provider APIs and websites:

- **Model Discovery Service**: Fetches available models from provider APIs
- **Pricing Scraper**: Scrapes pricing from provider websites
- **Model Enrichment**: Combines discovery + pricing with classification
- **Model Registry**: Centralized storage with usability tracking
- **Sync Scheduler**: Automated daily synchronization (configurable)

**New API Endpoints:**
- `GET /api/v1/models` - List available models with filtering
- `GET /api/v1/models/:id` - Get model details
- `GET /api/v1/models/:id/pricing-history` - View pricing changes over time

**Database Tables Added:**
- `models` - Discovered models with capabilities
- `model_pricing` - Current pricing data
- `pricing_history` - Historical pricing records
- `sync_status` - Synchronization job tracking
- `scraping_config` - Scraping configuration per provider

See [Dynamic Model Pricing Documentation](DYNAMIC_MODEL_PRICING_SETUP.md) for setup.

### 3. **OpenRouter-Only Architecture**

System now uses 100% OpenRouter for unified access to 300+ models:

- **Single API Key**: Access all providers through one endpoint
- **Free Models**: Support for free-tier models (Llama, Mistral, Gemma, Qwen, DeepSeek)
- **Cost Optimization**: Mix free and paid models in council
- **Simplified Architecture**: No need for multiple provider API keys
- **New Presets**: Multiple presets including `free-council` using only free models

**Configuration:**
```bash
# Required: OpenRouter API key
OPENROUTER_API_KEY=your-openrouter-key

# Optional: Legacy provider keys (deprecated, not used)
# OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, XAI_API_KEY
```

**Free Council Preset:**
```typescript
{
  members: [
    { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
    { provider: 'openrouter', model: 'mistralai/mistral-7b-instruct:free' },
    { provider: 'openrouter', model: 'google/gemma-3-12b-it:free' },
    { provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct:free' },
    { provider: 'openrouter', model: 'deepseek/deepseek-chat-v3-0324:free' }
  ],
  minimumSize: 3,
  deliberation: { rounds: 1 }
}
```

### 4. **Request Deduplication (Idempotency)**

Prevents duplicate processing of identical requests:

- **Idempotency Keys**: Client-provided keys in `Idempotency-Key` header
- **User-Scoped**: Keys are scoped per user for security
- **Status Tracking**: In-progress, completed, and failed states
- **Wait Mechanism**: Clients can wait for in-progress requests
- **24-Hour TTL**: Cached results expire after 24 hours

**Usage:**
```bash
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Idempotency-Key: unique-request-id-123" \
  -H "Content-Type: application/json" \
  -d '{"query": "Your question here"}'
```

### 5. **Metrics Tracking Toggle**

Performance optimization through configurable metrics:

- **Environment Variable**: `ENABLE_METRICS_TRACKING=true|false`
- **Default**: Enabled
- **Impact**: Disabling improves performance by ~15-20ms per request
- **Scope**: Affects provider health tracking, latency recording, cost tracking

**Configuration:**
```bash
# Disable for high-throughput scenarios
ENABLE_METRICS_TRACKING=false
```

### 6. **Admin Dashboard (Only UI)**

Web-based administration interface - the only GUI in the system:

- **Real-Time Metrics**: Live system performance monitoring
- **Provider Health**: Visual health status for OpenRouter
- **Cost Analytics**: Spending breakdown by model
- **Configuration UI**: Visual council configuration editor
- **Model Management**: View discovered models and pricing
- **Sync Control**: Manual trigger for model/pricing sync
- **API-First Design**: No end-user GUI, all interactions via REST API

**Starting the Dashboard:**
```bash
npm run admin
# Access at http://localhost:3001
```

**Note**: This is the only web interface. End users interact via REST API only.

See [Admin Dashboard Documentation](ADMIN_DASHBOARD.md) for features.

## API Changes

### New Endpoints

1. **Model Management**
   - `GET /api/v1/models` - List models with filtering
   - `GET /api/v1/models/:id` - Get model details
   - `GET /api/v1/models/:id/pricing-history` - Pricing history

2. **Negotiation Details**
   - `GET /api/v1/requests/:requestId/negotiation` - View iterative consensus details

### Modified Endpoints

1. **POST /api/v1/requests**
   - Added `Idempotency-Key` header support
   - Added `preset` field for per-request preset override
   - Returns `fromCache: true` for deduplicated requests

2. **GET /api/v1/requests/:requestId**
   - Added `iterativeConsensusMetadata` in response for iterative consensus requests

## Configuration Changes

### New Presets

1. **coding-council**: Optimized for code generation
   - Models: Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro, Grok-3
   - Rounds: 3
   - Timeout: 180s

2. **cost-effective-council**: Budget-friendly option
   - Models: GPT-4o-mini, Claude Haiku, Gemini Flash
   - Rounds: 0
   - Timeout: 45s

3. **free-council**: Zero-cost option via OpenRouter
   - Models: 5 free-tier models
   - Rounds: 1
   - Timeout: 60s

### New Configuration Options

1. **Iterative Consensus Config**
   ```typescript
   interface IterativeConsensusConfig {
     maxRounds: number;
     agreementThreshold: number;
     fallbackStrategy: 'meta-synthesis' | 'consensus-extraction' | 'weighted-fusion';
     embeddingModel: string;
     earlyTerminationEnabled: boolean;
     earlyTerminationThreshold: number;
     negotiationMode: 'parallel' | 'sequential';
     perRoundTimeout: number;
     humanEscalationEnabled: boolean;
     exampleCount: number;
   }
   ```

2. **Model Registry Integration**
   - Provider Pool now queries Model Registry for available models
   - Automatic filtering by usability status
   - Dynamic model capability checking

## Database Schema Changes

### New Tables

1. **Iterative Consensus**
   - `negotiation_rounds`
   - `negotiation_responses`
   - `negotiation_examples`
   - `consensus_metadata`
   - `escalation_queue`

2. **Dynamic Model Pricing**
   - `models`
   - `model_pricing`
   - `pricing_history`
   - `sync_status`
   - `scraping_config`

3. **Configuration**
   - `council_presets` - Database-driven presets (single source of truth)

### Modified Tables

1. **requests**
   - No schema changes, but `consensus_decision` now includes `iterativeConsensusMetadata`

2. **provider_health**
   - Enhanced with better health tracking logic

## Performance Improvements

### 1. **Metrics Tracking Toggle**
- Overhead reduction: ~15-20ms per request when disabled
- Configurable via `ENABLE_METRICS_TRACKING` environment variable

### 2. **Shared Health Tracker**
- Single source of truth for provider health
- Eliminates inconsistencies between components
- Reduces database queries

### 3. **Early Termination in Iterative Consensus**
- Stops negotiation when high similarity reached
- Saves tokens and reduces latency
- Tracks cost savings in metadata

### 4. **Request Deduplication**
- Prevents duplicate processing
- Reduces unnecessary API calls
- Improves response time for duplicate requests

## Breaking Changes

### 1. **OpenRouter-Only Architecture**
- **BREAKING**: System now requires `OPENROUTER_API_KEY`
- Legacy provider keys (OpenAI, Anthropic, Google, xAI) are deprecated
- All models accessed through OpenRouter unified API
- Migration: Obtain OpenRouter API key and update `.env`

### 2. **Configuration Manager**
- Presets now loaded from database (`council_presets` table)
- Hardcoded presets removed from code
- Migration: Run database schema to seed presets

### 3. **Provider Pool Constructor**
- Added optional `modelRegistry` parameter
- Existing code continues to work (backward compatible)

### 4. **Synthesis Engine**
- New synthesis strategy type: `iterative-consensus`
- Requires embedding service for similarity calculation
- Existing strategies unchanged

### 5. **User Interface Removed**
- **BREAKING**: End-user GUI removed
- Only Admin Dashboard remains (port 3001)
- All user interactions via REST API
- Migration: Update client applications to use REST API

## Migration Guide

### From Previous Version (v1.x to v2.0)

1. **Update Database Schema**
   ```bash
   psql -U postgres -d ai_council_proxy -f database/schema.sql
   ```

2. **Update Environment Variables**
   ```bash
   # REQUIRED: OpenRouter API key (replaces individual provider keys)
   OPENROUTER_API_KEY=your-openrouter-key
   
   # REQUIRED: JWT secret for API authentication
   JWT_SECRET=your-secret-key
   
   # Optional: Disable metrics for performance
   ENABLE_METRICS_TRACKING=false
   
   # Optional: Admin dashboard port
   ADMIN_PORT=3001
   
   # Optional: Sync schedule (cron format)
   SYNC_SCHEDULE_CRON="0 2 * * *"
   
   # DEPRECATED: Legacy provider keys (no longer used)
   # OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, XAI_API_KEY
   ```

3. **Update Dependencies**
   ```bash
   npm install
   ```

4. **Rebuild**
   ```bash
   npm run build
   ```

5. **Restart Services**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

6. **Start Admin Dashboard**
   ```bash
   npm run admin
   # Access at http://localhost:3001
   ```

7. **Update Client Applications**
   - Remove any references to end-user GUI
   - Update to use REST API exclusively
   - Add `Idempotency-Key` headers for duplicate prevention
   - Handle new response format with `iterativeConsensusMetadata`

## Testing Changes

### New Test Files

1. **Iterative Consensus**
   - `src/__tests__/integration/iterative-consensus.integration.test.ts`
   - `src/synthesis/iterative-consensus/__tests__/*.test.ts`

2. **Model Discovery**
   - `src/discovery/__tests__/*.test.ts`
   - `src/api/__tests__/models-api.property.test.ts`

3. **Request Deduplication**
   - `src/orchestration/__tests__/request-deduplicator.test.ts`

### Modified Tests

- Updated property tests to handle new synthesis strategies
- Enhanced integration tests for full deliberation flow
- Added metrics tracking toggle tests

## Documentation Updates

### New Documentation

1. **[Iterative Consensus](ITERATIVE_CONSENSUS.md)** - Negotiation-based synthesis
2. **[Dynamic Model Pricing Setup](DYNAMIC_MODEL_PRICING_SETUP.md)** - Model discovery setup
3. **[Dynamic Pricing Deployment](DYNAMIC_PRICING_DEPLOYMENT.md)** - Deployment guide
4. **[Dynamic Pricing Monitoring](DYNAMIC_PRICING_MONITORING.md)** - Monitoring guide
5. **[Model API Documentation](MODEL_API_DOCUMENTATION.md)** - Model endpoints reference
6. **[Scraping Configuration Guide](SCRAPING_CONFIGURATION_GUIDE.md)** - Scraper setup
7. **[Admin Dashboard](ADMIN_DASHBOARD.md)** - Dashboard features and usage
8. **[Rate Limit Protection](RATE_LIMIT_PROTECTION.md)** - Rate limiting details
9. **[Metrics Tracking](METRICS_TRACKING_COMPLETE.md)** - Metrics system overview

### Updated Documentation

1. **[API Documentation](API_DOCUMENTATION.md)** - New endpoints and idempotency
2. **[Configuration Guide](CONFIGURATION_GUIDE.md)** - New presets and options
3. **[README.md](../README.md)** - Updated features and examples

## Known Issues

1. **GPT-5.1 Response Parsing**: Complex response format requires special handling
2. **Embedding Service**: Requires OpenAI API key for iterative consensus
3. **Scraping Reliability**: Website changes may break scrapers (fallback to cache)

## Future Enhancements

1. **Streaming Synthesis**: Real-time consensus updates via SSE
2. **Custom Embeddings**: Support for local embedding models
3. **Advanced Negotiation**: Multi-stage negotiation with refinement
4. **Model Performance Tracking**: Automatic ranking based on usage
5. **Web UI**: Visual configuration and monitoring interface

## Support

For questions or issues:
- GitHub Issues: https://github.com/alias8818/CouncilRouter/issues
- Documentation: `/docs` folder
- Admin Dashboard: http://localhost:3001

---

**Last Updated**: 2024-01-XX
**Version**: 2.0.0
