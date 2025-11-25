# Design Document

## Overview

The Dynamic Model and Pricing Retrieval system extends the AI Council Proxy with automated discovery and tracking of AI models and their costs across multiple providers. The design combines RESTful API calls for real-time model discovery with HTML scraping for pricing information, storing enriched data in PostgreSQL with Redis caching for fast access. A scheduled sync job keeps data current, while a new API endpoint exposes model information to clients and internal components.

The system integrates with existing components: the Provider Pool uses model metadata for selection, the Cost Calculator uses pricing data for accurate tracking, and the Analytics Engine leverages historical data for trend analysis. The design prioritizes reliability through retry logic, graceful degradation when providers are unavailable, and fallback to cached data when scraping fails.

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Sync Scheduler                          │
│                  (Cron Job - Daily)                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Model Discovery Service                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ OpenAI       │  │ Anthropic    │  │ Google       │     │
│  │ Fetcher      │  │ Fetcher      │  │ Fetcher      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐                                          │
│  │ xAI          │                                          │
│  │ Fetcher      │                                          │
│  └──────────────┘                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Pricing Scraper Service                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ OpenAI       │  │ Anthropic    │  │ Google       │     │
│  │ Scraper      │  │ Scraper      │  │ Scraper      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐                                          │
│  │ xAI          │                                          │
│  │ Scraper      │                                          │
│  └──────────────┘                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Model Enrichment Engine                        │
│  • Classification Inference                                 │
│  • Fuzzy Name Matching                                      │
│  • Metadata Merging                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Model Registry (PostgreSQL)                    │
│  • models table                                             │
│  • pricing_history table                                    │
│  • sync_status table                                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Cache Layer (Redis)                            │
│  • model:{provider}:list                                    │
│  • pricing:{modelId}                                        │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Model API Endpoint                             │
│  GET /api/models                                            │
│  GET /api/models/:id                                        │
│  GET /api/models/:id/pricing-history                        │
└─────────────────────────────────────────────────────────────┘
```

### Integration Points

- **Provider Pool**: Queries Model Registry for available models and capabilities
- **Cost Calculator**: Uses pricing data for accurate cost tracking
- **Analytics Engine**: Accesses historical pricing for trend analysis
- **Configuration Manager**: Stores scraping rules and sync schedules
- **Event Logger**: Records sync events, errors, and pricing changes

## Components and Interfaces

### IModelDiscoveryService

```typescript
interface IModelDiscoveryService {
  /**
   * Fetch models from a specific provider's API
   */
  fetchModels(provider: ProviderType): Promise<DiscoveredModel[]>;
  
  /**
   * Fetch models from all configured providers
   */
  fetchAllModels(): Promise<Map<ProviderType, DiscoveredModel[]>>;
  
  /**
   * Get the last successful sync timestamp for a provider
   */
  getLastSync(provider: ProviderType): Promise<Date | null>;
}

interface DiscoveredModel {
  id: string;
  provider: ProviderType;
  displayName?: string;
  ownedBy?: string;
  created?: number;
  contextWindow?: number;
  capabilities?: ModelCapability[];
  deprecated: boolean;
}

interface ModelCapability {
  type: 'chat' | 'completion' | 'embedding' | 'vision' | 'function_calling' | 'tools';
  supported: boolean;
}
```

### IPricingScraper

```typescript
interface IPricingScraper {
  /**
   * Scrape pricing information from a provider's website
   */
  scrapePricing(provider: ProviderType): Promise<PricingData[]>;
  
  /**
   * Validate scraping configuration for a provider
   */
  validateConfig(provider: ProviderType, config: ScrapingConfig): Promise<boolean>;
  
  /**
   * Get cached pricing data when scraping fails
   */
  getFallbackPricing(provider: ProviderType): Promise<PricingData[]>;
}

interface PricingData {
  modelName: string; // As it appears on the pricing page
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  tier?: string; // e.g., 'standard', 'batch', 'cached'
  contextLimit?: number; // For tiered pricing
}

interface ScrapingConfig {
  url: string;
  selectors: {
    table: string;
    modelNameColumn: number;
    inputCostColumn: number;
    outputCostColumn: number;
  };
  fallbackSelectors?: typeof ScrapingConfig.selectors[];
}
```

### IModelEnrichmentEngine

```typescript
interface IModelEnrichmentEngine {
  /**
   * Enrich discovered models with pricing and classification
   */
  enrichModels(
    models: DiscoveredModel[],
    pricing: PricingData[]
  ): Promise<EnrichedModel[]>;
  
  /**
   * Classify a model based on its ID and capabilities
   */
  classifyModel(model: DiscoveredModel): ModelClassification[];
  
  /**
   * Match scraped pricing to API models using fuzzy matching
   */
  matchPricing(
    modelId: string,
    pricingData: PricingData[]
  ): PricingData | null;
}

interface EnrichedModel {
  id: string;
  provider: ProviderType;
  displayName: string;
  classification: ModelClassification[];
  contextWindow: number;
  usability: 'available' | 'preview' | 'deprecated';
  pricing: {
    inputCostPerMillion: number;
    outputCostPerMillion: number;
    tier: string;
  }[];
  capabilities: ModelCapability[];
  discoveredAt: Date;
}

type ModelClassification = 
  | 'chat'
  | 'reasoning'
  | 'coding'
  | 'multimodal'
  | 'embedding'
  | 'tools'
  | 'general';
```

### IModelRegistry

```typescript
interface IModelRegistry {
  /**
   * Store or update a model in the registry
   */
  upsertModel(model: EnrichedModel): Promise<void>;
  
  /**
   * Get all active models, optionally filtered
   */
  getModels(filter?: ModelFilter): Promise<EnrichedModel[]>;
  
  /**
   * Get a specific model by ID
   */
  getModel(modelId: string): Promise<EnrichedModel | null>;
  
  /**
   * Mark a model as deprecated
   */
  deprecateModel(modelId: string): Promise<void>;
  
  /**
   * Get pricing history for a model
   */
  getPricingHistory(
    modelId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PricingHistoryEntry[]>;
  
  /**
   * Record a pricing change
   */
  recordPricingChange(
    modelId: string,
    oldPricing: PricingData,
    newPricing: PricingData
  ): Promise<void>;
}

interface ModelFilter {
  provider?: ProviderType;
  classification?: ModelClassification;
  usability?: 'available' | 'preview' | 'deprecated';
  minContextWindow?: number;
}

interface PricingHistoryEntry {
  modelId: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  tier: string;
  effectiveDate: Date;
  endDate: Date | null;
}
```

### ISyncScheduler

```typescript
interface ISyncScheduler {
  /**
   * Start the sync scheduler
   */
  start(): Promise<void>;
  
  /**
   * Stop the sync scheduler
   */
  stop(): Promise<void>;
  
  /**
   * Manually trigger a sync job
   */
  triggerSync(): Promise<SyncResult>;
  
  /**
   * Get the status of the last sync
   */
  getLastSyncStatus(): Promise<SyncStatus>;
}

interface SyncResult {
  success: boolean;
  timestamp: Date;
  modelsDiscovered: number;
  modelsUpdated: number;
  modelsDeprecated: number;
  pricingUpdated: number;
  errors: SyncError[];
}

interface SyncStatus {
  lastSync: Date | null;
  nextSync: Date | null;
  status: 'idle' | 'running' | 'failed';
  lastResult: SyncResult | null;
}

interface SyncError {
  provider: ProviderType;
  stage: 'discovery' | 'pricing' | 'enrichment' | 'storage';
  error: string;
}
```

## Data Models

### Database Schema

```sql
-- Models table
CREATE TABLE models (
  id VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  display_name VARCHAR(255),
  classification TEXT[], -- Array of classifications
  context_window INTEGER,
  usability VARCHAR(20) NOT NULL, -- 'available', 'preview', 'deprecated'
  capabilities JSONB, -- Array of capability objects
  discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMP,
  UNIQUE(id, provider)
);

CREATE INDEX idx_models_provider ON models(provider);
CREATE INDEX idx_models_usability ON models(usability);
CREATE INDEX idx_models_classification ON models USING GIN(classification);

-- Pricing table (current pricing)
CREATE TABLE model_pricing (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(255) NOT NULL REFERENCES models(id),
  input_cost_per_million DECIMAL(10, 4) NOT NULL,
  output_cost_per_million DECIMAL(10, 4) NOT NULL,
  tier VARCHAR(50) NOT NULL DEFAULT 'standard',
  context_limit INTEGER,
  effective_date TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(model_id, tier)
);

CREATE INDEX idx_pricing_model ON model_pricing(model_id);

-- Pricing history table
CREATE TABLE pricing_history (
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
CREATE TABLE sync_status (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  last_sync TIMESTAMP,
  next_sync TIMESTAMP,
  status VARCHAR(20) NOT NULL, -- 'idle', 'running', 'failed'
  models_discovered INTEGER DEFAULT 0,
  models_updated INTEGER DEFAULT 0,
  models_deprecated INTEGER DEFAULT 0,
  pricing_updated INTEGER DEFAULT 0,
  errors JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(provider)
);

-- Scraping configuration table
CREATE TABLE scraping_config (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL UNIQUE,
  config JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Redis Cache Keys

```
model:{provider}:list          # List of model IDs for a provider (TTL: 1 hour)
model:{modelId}:details        # Full model details (TTL: 1 hour)
pricing:{modelId}              # Current pricing for a model (TTL: 1 hour)
pricing:{provider}:fallback    # Fallback pricing data (TTL: 7 days)
sync:status                    # Current sync status (TTL: 5 minutes)
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Complete Model Extraction

*For any* provider API response containing models, all models in the response should be extracted with their IDs and metadata intact.

**Validates: Requirements 1.1**

### Property 2: Graceful Provider Failure

*For any* set of providers where some return authentication errors, the system should successfully process all providers that don't error.

**Validates: Requirements 1.2**

### Property 3: Retry Attempt Limit

*For any* unavailable provider API, the system should make exactly 3 retry attempts with exponentially increasing delays.

**Validates: Requirements 1.3**

### Property 4: Model Storage Completeness

*For any* newly discovered model, the stored record should contain all extracted metadata and a valid timestamp.

**Validates: Requirements 1.4**

### Property 5: Deprecation Detection

*For any* model that was previously discovered but is absent in a new API fetch, the model should be marked as deprecated.

**Validates: Requirements 1.5**

### Property 6: Pricing Extraction Completeness

*For any* HTML table containing pricing data, both input and output costs per million tokens should be extracted for each model.

**Validates: Requirements 2.1**

### Property 7: Fuzzy Matching Accuracy

*For any* pair of model names where one is from the API and one is from scraping, if they are similar (edit distance < 20% of length), they should be matched together.

**Validates: Requirements 2.2**

### Property 8: Multi-Tier Pricing Storage

*For any* model with multiple pricing tiers, all tiers should be stored with their respective conditions.

**Validates: Requirements 2.3**

### Property 9: Missing Pricing Fallback

*For any* model without matching pricing data, the cost fields should be marked as "TBD" and a warning should be logged.

**Validates: Requirements 2.4**

### Property 10: Scraping Failure Detection

*For any* HTML content that doesn't match the expected structure, the parsing should fail detectably and generate an alert.

**Validates: Requirements 2.5**

### Property 11: Pattern-Based Classification

*For any* model ID containing recognizable patterns (e.g., "gpt-", "claude-", "embedding-"), the system should assign the corresponding classification.

**Validates: Requirements 3.1**

### Property 12: Capability-Based Classification

*For any* model with capability flags in API metadata, the system should derive classifications from those capabilities.

**Validates: Requirements 3.2**

### Property 13: Multiple Classification Assignment

*For any* model supporting multiple capabilities, all relevant classification tags should be assigned.

**Validates: Requirements 3.3**

### Property 14: Default Classification Fallback

*For any* model with no recognizable patterns or capabilities, the system should assign the "General" classification.

**Validates: Requirements 3.4**

### Property 15: Context Window Preservation

*For any* model with context window information in the API response, that value should be stored in the model metadata.

**Validates: Requirements 3.5**

### Property 16: Complete Provider Coverage

*For any* configured set of providers, the sync job should query all of them.

**Validates: Requirements 4.1**

### Property 17: Timestamp Update on Success

*For any* successful sync job completion, the last sync timestamp should be updated to a recent time (within 1 second of completion).

**Validates: Requirements 4.2**

### Property 18: Sync Failure Retry

*For any* sync job that fails, the system should schedule a retry and generate an administrator alert.

**Validates: Requirements 4.4**

### Property 19: Cache Invalidation on Update

*For any* sync job that updates model or pricing data, all relevant cache entries should be invalidated.

**Validates: Requirements 4.5**

### Property 20: Active Model Retrieval

*For any* request for the model list, the response should contain all active (non-deprecated) models with complete metadata.

**Validates: Requirements 5.1**

### Property 21: Provider Filtering Accuracy

*For any* model list filtered by provider, all returned models should be from that provider and no models from that provider should be missing.

**Validates: Requirements 5.2**

### Property 22: Classification Filtering Accuracy

*For any* model list filtered by classification, all returned models should have that classification and no models with that classification should be missing.

**Validates: Requirements 5.3**

### Property 23: Pricing Data Inclusion

*For any* model in an API response, if pricing data exists for that model, it should be included in the response.

**Validates: Requirements 5.4**

### Property 24: Capability Data Inclusion

*For any* model in an API response, the context window and feature flags should be included if available.

**Validates: Requirements 5.5**

### Property 25: Configuration Storage Completeness

*For any* scraping configuration, all required fields (URL, selectors) should be stored for each provider.

**Validates: Requirements 6.1**

### Property 26: Configuration Update Application

*For any* updated scraping configuration, subsequent scraping operations should use the new selectors.

**Validates: Requirements 6.2**

### Property 27: Strategy Fallback Order

*For any* provider with multiple scraping strategies, the system should try them in the configured order until one succeeds.

**Validates: Requirements 6.3**

### Property 28: Cache Fallback on Scraping Failure

*For any* provider where all scraping strategies fail, the system should return cached pricing data if available.

**Validates: Requirements 6.4**

### Property 29: Configuration Validation

*For any* scraping configuration update, invalid configurations should be rejected before being applied.

**Validates: Requirements 6.5**

### Property 30: Authentication Header Presence

*For any* API request to a provider, the appropriate authentication header should be included.

**Validates: Requirements 7.1**

### Property 31: Rate Limit Backoff

*For any* rate limit error from a provider, the system should wait for the specified delay before retrying.

**Validates: Requirements 7.2**

### Property 32: User-Agent Header Presence

*For any* web scraping request, an appropriate User-Agent header should be included.

**Validates: Requirements 7.3**

### Property 33: Request Throttling

*For any* sequence of scraping requests to the same provider, there should be a minimum delay between consecutive requests.

**Validates: Requirements 7.4**

### Property 34: Blocking Detection and Alerting

*For any* scraping attempt that is blocked by a provider, the event should be logged and an administrator alert should be generated.

**Validates: Requirements 7.5**

### Property 35: Historical Pricing Preservation

*For any* pricing update, the previous pricing record should remain in the database with its original timestamp.

**Validates: Requirements 8.1**

### Property 36: Date Range Query Accuracy

*For any* historical pricing query with a date range, only records with effective dates within that range should be returned.

**Validates: Requirements 8.2**

### Property 37: Price Change Recording

*For any* model whose price changes, both the old and new values should be recorded along with the change date.

**Validates: Requirements 8.3**

### Property 38: Historical Pricing Usage

*For any* cost report for a past date, the pricing data from that date should be used, not current pricing.

**Validates: Requirements 8.4**

### Property 39: Data Retention Policy

*For any* pricing record, if it is less than 12 months old, it should be retained in the database.

**Validates: Requirements 8.5**

## Error Handling

### Provider API Errors

- **Authentication Failures**: Log error, skip provider, continue with others
- **Rate Limiting**: Exponential backoff with delays specified by provider (Retry-After header)
- **Timeouts**: Retry up to 3 times with exponential backoff (1s, 2s, 4s)
- **Invalid Responses**: Log error, skip provider, alert administrators
- **Network Errors**: Retry with exponential backoff, fall back to cached data

### Scraping Errors

- **HTML Structure Changes**: Try fallback selectors, then use cached pricing
- **Missing Data**: Mark as "TBD", log warning, continue processing
- **Blocked Requests**: Log event, alert administrators, use cached data
- **Parse Failures**: Try alternative parsing strategies, fall back to cache

### Data Errors

- **Duplicate Models**: Update existing record with new data
- **Missing Required Fields**: Use sensible defaults (e.g., "General" classification)
- **Invalid Pricing Values**: Log error, skip pricing update, retain previous values
- **Database Failures**: Retry transaction, log error, alert administrators

### Sync Job Errors

- **Partial Failures**: Complete successful providers, log failures, mark sync as partial success
- **Complete Failures**: Retry after delay, alert administrators, maintain previous data
- **Timeout**: Cancel long-running operations, log timeout, schedule retry

## Testing Strategy

### Unit Tests

Unit tests will verify individual component behavior:

- **Model Discovery Service**: Test API request formatting, response parsing, error handling
- **Pricing Scraper**: Test HTML parsing with various table structures, fuzzy matching algorithm
- **Enrichment Engine**: Test classification logic, metadata merging, pricing association
- **Model Registry**: Test CRUD operations, filtering, historical queries
- **Sync Scheduler**: Test scheduling logic, retry behavior, status tracking

### Property-Based Tests

Property-based tests will use fast-check with a minimum of 100 iterations per property. Each test will be tagged with its property number from the design document.

**Testing Framework**: fast-check for TypeScript

**Key Properties to Test**:

1. **Complete Model Extraction** (Property 1): Generate random API responses, verify all models extracted
2. **Retry Attempt Limit** (Property 3): Generate random failure scenarios, verify exactly 3 retries
3. **Fuzzy Matching Accuracy** (Property 7): Generate random string pairs, verify matching threshold
4. **Multi-Tier Pricing Storage** (Property 8): Generate models with varying tier counts, verify all stored
5. **Pattern-Based Classification** (Property 11): Generate model IDs with known patterns, verify classification
6. **Provider Filtering Accuracy** (Property 21): Generate random model sets, verify filtering correctness
7. **Historical Pricing Preservation** (Property 35): Update pricing multiple times, verify history intact
8. **Date Range Query Accuracy** (Property 36): Generate historical records, verify query boundaries

**Test Configuration**:
- Minimum iterations: 100 per property test
- Timeout: 120000ms (2 minutes) for property tests
- Mock external dependencies (HTTP requests, database)

### Integration Tests

Integration tests will verify end-to-end workflows:

- **Full Sync Cycle**: Trigger sync, verify models discovered, pricing scraped, data stored
- **API Endpoint**: Query models via REST API, verify filtering and pagination
- **Cache Behavior**: Verify cache population, invalidation, and fallback
- **Error Recovery**: Simulate provider failures, verify graceful degradation
- **Historical Queries**: Store pricing changes, query history, verify accuracy

### Manual Testing

- Verify scraping works with actual provider websites
- Test admin dashboard displays model and pricing data correctly
- Validate alerts are sent when scraping fails
- Confirm sync scheduler runs at configured times

## Performance Considerations

### Caching Strategy

- Cache model lists per provider (1 hour TTL)
- Cache individual model details (1 hour TTL)
- Cache pricing data (1 hour TTL)
- Long-term cache for fallback pricing (7 days TTL)
- Invalidate caches on sync completion

### Database Optimization

- Index on provider, usability, classification for fast filtering
- Partition pricing_history table by date for efficient historical queries
- Use connection pooling for concurrent requests
- Batch insert operations during sync

### Scraping Optimization

- Parallel scraping of different providers
- Reuse HTTP connections with keep-alive
- Implement request throttling to respect rate limits
- Cache parsed HTML for retry attempts

### API Performance

- Implement pagination for model list endpoint (default 50 per page)
- Use database indexes for filtering operations
- Return cached data when possible
- Implement ETag support for conditional requests

## Security Considerations

### API Key Management

- Store provider API keys in environment variables
- Never log or expose API keys in responses
- Rotate keys periodically
- Use separate keys for production and development

### Web Scraping

- Include User-Agent header identifying the application
- Respect robots.txt directives
- Implement rate limiting to avoid aggressive scraping
- Handle blocking gracefully without retrying excessively

### Data Validation

- Validate all scraped data before storage
- Sanitize HTML content to prevent XSS
- Validate pricing values are positive numbers
- Prevent SQL injection with parameterized queries

### Access Control

- Require authentication for model API endpoints
- Implement rate limiting on API endpoints
- Log all sync operations for audit trail
- Restrict admin operations to authorized users

## Deployment Considerations

### Environment Variables

```bash
# Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
XAI_API_KEY=xai-...

# Sync Configuration
SYNC_SCHEDULE_CRON="0 2 * * *"  # Daily at 2 AM
SYNC_TIMEOUT_MS=300000           # 5 minutes

# Scraping Configuration
SCRAPING_USER_AGENT="AI-Council-Proxy/1.0"
SCRAPING_DELAY_MS=1000           # 1 second between requests
SCRAPING_TIMEOUT_MS=30000        # 30 seconds

# Cache Configuration
MODEL_CACHE_TTL=3600             # 1 hour
PRICING_CACHE_TTL=3600           # 1 hour
FALLBACK_CACHE_TTL=604800        # 7 days
```

### Database Migrations

- Create migration scripts for new tables
- Add indexes after initial data load for performance
- Backup existing data before migration
- Test migrations on staging environment first

### Monitoring

- Track sync job success/failure rates
- Monitor scraping success rates per provider
- Alert on consecutive sync failures (3+)
- Track API response times
- Monitor cache hit rates

### Rollback Plan

- Keep previous model data for 30 days
- Ability to disable sync job without code changes
- Manual sync trigger for emergency updates
- Fallback to cached data if sync fails
