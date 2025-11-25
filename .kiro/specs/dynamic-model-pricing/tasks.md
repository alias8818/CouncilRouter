# Implementation Plan

- [x] 1. Set up database schema and core types





  - Create database migration script for models, model_pricing, pricing_history, sync_status, and scraping_config tables
  - Add indexes for performance optimization
  - Define TypeScript types for DiscoveredModel, EnrichedModel, PricingData, ModelCapability, etc.
  - Create interfaces for all components (IModelDiscoveryService, IPricingScraper, IModelEnrichmentEngine, IModelRegistry, ISyncScheduler)
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1_

- [x] 2. Implement Model Discovery Service





  - [x] 2.1 Create base model fetcher with retry logic and timeout handling


    - Implement exponential backoff for retries (1s, 2s, 4s delays)
    - Add authentication header management per provider
    - Handle rate limiting with Retry-After header support
    - _Requirements: 1.1, 1.3, 7.1, 7.2_

  - [x] 2.2 Write property test for retry attempt limit


    - **Property 3: Retry Attempt Limit**
    - **Validates: Requirements 1.3**

  - [x] 2.3 Implement OpenAI model fetcher

    - Call GET /v1/models endpoint
    - Parse response for model IDs, created timestamps, owned_by
    - Extract context window from model metadata when available
    - _Requirements: 1.1, 3.5_

  - [x] 2.4 Implement Anthropic model fetcher

    - Call GET /v1/models endpoint with x-api-key header
    - Parse response for model IDs, display names, capability flags
    - Extract input/output token limits
    - _Requirements: 1.1, 3.2, 3.5_

  - [x] 2.5 Implement Google Gemini model fetcher

    - Call GET /v1beta/models endpoint with x-goog-api-key header
    - Parse response for model names, supported generation methods
    - Extract token limits and capabilities
    - _Requirements: 1.1, 3.2, 3.5_

  - [x] 2.6 Implement xAI model fetcher

    - Call GET /v1/models endpoint
    - Parse response for model IDs, capabilities, context windows
    - Handle pricing hints if present in response
    - _Requirements: 1.1, 3.5_

  - [x] 2.7 Write property test for complete model extraction


    - **Property 1: Complete Model Extraction**
    - **Validates: Requirements 1.1**

  - [x] 2.8 Write property test for graceful provider failure


    - **Property 2: Graceful Provider Failure**
    - **Validates: Requirements 1.2**

- [x] 3. Implement Pricing Scraper Service





  - [x] 3.1 Create base HTML scraper with configurable selectors


    - Use cheerio for HTML parsing
    - Support multiple selector strategies with fallback
    - Implement request throttling (1 second delay between requests)
    - Add User-Agent header management
    - _Requirements: 2.1, 6.1, 6.3, 7.3, 7.4_

  - [x] 3.2 Implement OpenAI pricing scraper


    - Scrape https://openai.com/api/pricing/
    - Extract model names, input/output costs per million tokens
    - Handle tiered pricing (standard, batch, cached)
    - Parse multimodal pricing (images, audio)
    - _Requirements: 2.1, 2.3_

  - [x] 3.3 Implement Anthropic pricing scraper


    - Scrape https://www.anthropic.com/pricing
    - Extract model names and costs from pricing table
    - Handle prompt caching discounts
    - Parse batch pricing tiers
    - _Requirements: 2.1, 2.3_

  - [x] 3.4 Implement Google Gemini pricing scraper


    - Scrape https://ai.google.dev/gemini-api/docs/pricing
    - Extract pricing by model and context tier (<200K vs >200K)
    - Handle multimodal extras (audio, grounding)
    - Parse free tier limits
    - _Requirements: 2.1, 2.3_

  - [x] 3.5 Implement xAI pricing scraper


    - Scrape https://docs.x.ai/docs/models
    - Extract model pricing from documentation tables
    - Handle cached input pricing
    - Parse image generation costs
    - _Requirements: 2.1, 2.3_

  - [x] 3.6 Write property test for pricing extraction completeness


    - **Property 6: Pricing Extraction Completeness**
    - **Validates: Requirements 2.1**

  - [x] 3.7 Write property test for multi-tier pricing storage


    - **Property 8: Multi-Tier Pricing Storage**
    - **Validates: Requirements 2.3**

  - [x] 3.8 Write property test for scraping failure detection


    - **Property 10: Scraping Failure Detection**
    - **Validates: Requirements 2.5**

- [x] 4. Implement Model Enrichment Engine





  - [x] 4.1 Create fuzzy matching algorithm for model name association


    - Implement Levenshtein distance calculation
    - Set matching threshold at 80% similarity
    - Handle common variations (hyphens, underscores, case differences)
    - _Requirements: 2.2_

  - [x] 4.2 Write property test for fuzzy matching accuracy


    - **Property 7: Fuzzy Matching Accuracy**
    - **Validates: Requirements 2.2**

  - [x] 4.3 Implement classification inference logic

    - Pattern matching for model IDs (gpt-, claude-, embedding-, etc.)
    - Capability-based classification from API metadata
    - Support multiple classifications per model
    - Default to "General" when no patterns match
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.4 Write property test for pattern-based classification


    - **Property 11: Pattern-Based Classification**
    - **Validates: Requirements 3.1**

  - [x] 4.5 Write property test for capability-based classification


    - **Property 12: Capability-Based Classification**
    - **Validates: Requirements 3.2**

  - [x] 4.6 Write property test for multiple classification assignment


    - **Property 13: Multiple Classification Assignment**
    - **Validates: Requirements 3.3**

  - [x] 4.7 Write property test for default classification fallback


    - **Property 14: Default Classification Fallback**
    - **Validates: Requirements 3.4**

  - [x] 4.8 Implement model enrichment orchestration

    - Combine discovered models with scraped pricing
    - Apply classification logic
    - Merge metadata from multiple sources
    - Handle missing pricing with "TBD" marker
    - _Requirements: 2.4, 3.5_

  - [x] 4.9 Write property test for missing pricing fallback


    - **Property 9: Missing Pricing Fallback**
    - **Validates: Requirements 2.4**

  - [x] 4.10 Write property test for context window preservation


    - **Property 15: Context Window Preservation**
    - **Validates: Requirements 3.5**

- [ ] 5. Checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Model Registry





  - [x] 6.1 Create database access layer for models table


    - Implement upsertModel with conflict resolution
    - Add getModels with filtering support (provider, classification, usability)
    - Implement getModel for single model retrieval
    - Add deprecateModel to mark models as deprecated
    - _Requirements: 1.4, 1.5, 5.1, 5.2, 5.3_

  - [x] 6.2 Write property test for model storage completeness


    - **Property 4: Model Storage Completeness**
    - **Validates: Requirements 1.4**

  - [x] 6.3 Write property test for deprecation detection


    - **Property 5: Deprecation Detection**
    - **Validates: Requirements 1.5**

  - [x] 6.4 Write property test for provider filtering accuracy


    - **Property 21: Provider Filtering Accuracy**
    - **Validates: Requirements 5.2**

  - [x] 6.5 Write property test for classification filtering accuracy


    - **Property 22: Classification Filtering Accuracy**
    - **Validates: Requirements 5.3**

  - [x] 6.2 Create database access layer for pricing tables

    - Implement pricing upsert for model_pricing table
    - Add recordPricingChange for pricing_history table
    - Implement getPricingHistory with date range filtering
    - Handle pricing tier storage and retrieval
    - _Requirements: 2.3, 8.1, 8.2, 8.3_

  - [x] 6.7 Write property test for historical pricing preservation

    - **Property 35: Historical Pricing Preservation**
    - **Validates: Requirements 8.1**

  - [x] 6.8 Write property test for date range query accuracy

    - **Property 36: Date Range Query Accuracy**
    - **Validates: Requirements 8.2**

  - [x] 6.9 Write property test for price change recording

    - **Property 37: Price Change Recording**
    - **Validates: Requirements 8.3**

  - [x] 6.10 Implement Redis caching layer

    - Cache model lists by provider (1 hour TTL)
    - Cache individual model details (1 hour TTL)
    - Cache pricing data (1 hour TTL)
    - Implement fallback pricing cache (7 days TTL)
    - Add cache invalidation on updates
    - _Requirements: 4.5, 6.4_

  - [x] 6.11 Write property test for cache invalidation on update


    - **Property 19: Cache Invalidation on Update**
    - **Validates: Requirements 4.5**

- [x] 7. Implement Sync Scheduler




  - [x] 7.1 Create sync orchestration logic


    - Coordinate model discovery across all providers
    - Trigger pricing scraping for each provider
    - Invoke enrichment engine to merge data
    - Store enriched models in registry
    - Track sync status and errors
    - _Requirements: 4.1, 4.2, 4.4_

  - [x] 7.2 Write property test for complete provider coverage


    - **Property 16: Complete Provider Coverage**
    - **Validates: Requirements 4.1**

  - [x] 7.3 Write property test for timestamp update on success

    - **Property 17: Timestamp Update on Success**
    - **Validates: Requirements 4.2**

  - [x] 7.4 Write property test for sync failure retry

    - **Property 18: Sync Failure Retry**
    - **Validates: Requirements 4.4**

  - [x] 7.5 Implement cron-based scheduling


    - Use node-cron for scheduling
    - Support configurable schedule via environment variable
    - Implement manual trigger endpoint
    - Add sync status tracking in database
    - _Requirements: 4.2, 4.3_

  - [x] 7.6 Add error handling and alerting


    - Log all sync errors with context
    - Generate administrator alerts on failures
    - Implement retry logic with exponential backoff
    - Track consecutive failure count
    - _Requirements: 4.4_

- [x] 8. Implement Model API Endpoints





  - [x] 8.1 Create GET /api/models endpoint


    - Support pagination (default 50 per page)
    - Implement filtering by provider, classification, usability
    - Include full model metadata in response
    - Add pricing data when available
    - Include capability information
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 8.2 Write property test for active model retrieval


    - **Property 20: Active Model Retrieval**
    - **Validates: Requirements 5.1**

  - [x] 8.3 Write property test for pricing data inclusion


    - **Property 23: Pricing Data Inclusion**
    - **Validates: Requirements 5.4**

  - [x] 8.4 Write property test for capability data inclusion


    - **Property 24: Capability Data Inclusion**
    - **Validates: Requirements 5.5**

  - [x] 8.5 Create GET /api/models/:id endpoint

    - Return full model details including all metadata
    - Include all pricing tiers
    - Return 404 if model not found
    - _Requirements: 5.4, 5.5_

  - [x] 8.6 Create GET /api/models/:id/pricing-history endpoint

    - Support date range filtering via query parameters
    - Return historical pricing records
    - Include tier information
    - _Requirements: 8.2_

  - [x] 8.7 Add authentication and rate limiting to endpoints

    - Require JWT or API key authentication
    - Implement rate limiting (100 requests per 15 minutes)
    - Add request logging
    - _Requirements: 7.1_

- [x] 9. Implement Scraping Configuration Management





  - [x] 9.1 Create scraping configuration storage


    - Store configurations in scraping_config table
    - Support multiple selector strategies per provider
    - Implement configuration versioning
    - _Requirements: 6.1, 6.2_

  - [x] 9.2 Write property test for configuration storage completeness


    - **Property 25: Configuration Storage Completeness**
    - **Validates: Requirements 6.1**

  - [x] 9.3 Write property test for configuration update application


    - **Property 26: Configuration Update Application**
    - **Validates: Requirements 6.2**

  - [x] 9.4 Implement configuration validation


    - Validate URL format
    - Validate selector syntax
    - Test selectors against sample HTML
    - Reject invalid configurations
    - _Requirements: 6.5_

  - [x] 9.5 Write property test for configuration validation


    - **Property 29: Configuration Validation**
    - **Validates: Requirements 6.5**

  - [x] 9.6 Add fallback strategy support


    - Try strategies in configured order
    - Fall back to cached data when all fail
    - Log strategy success/failure
    - _Requirements: 6.3, 6.4_

  - [x] 9.7 Write property test for strategy fallback order


    - **Property 27: Strategy Fallback Order**
    - **Validates: Requirements 6.3**

  - [x] 9.8 Write property test for cache fallback on scraping failure


    - **Property 28: Cache Fallback on Scraping Failure**
    - **Validates: Requirements 6.4**

- [x] 10. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Compliance and Rate Limiting



  - [x] 11.1 Add authentication header management


    - Include Bearer token for OpenAI and xAI
    - Include x-api-key for Anthropic
    - Include x-goog-api-key for Google
    - _Requirements: 7.1_

  - [x] 11.2 Write property test for authentication header presence


    - **Property 30: Authentication Header Presence**
    - **Validates: Requirements 7.1**

  - [x] 11.3 Implement rate limit handling


    - Parse Retry-After header from responses
    - Implement exponential backoff on rate limit errors
    - Track rate limit status per provider
    - _Requirements: 7.2_

  - [x] 11.4 Write property test for rate limit backoff


    - **Property 31: Rate Limit Backoff**
    - **Validates: Requirements 7.2**

  - [x] 11.5 Add User-Agent header to scraping requests


    - Include application name and version
    - Make User-Agent configurable via environment variable
    - _Requirements: 7.3_

  - [x] 11.6 Write property test for User-Agent header presence


    - **Property 32: User-Agent Header Presence**
    - **Validates: Requirements 7.3**

  - [x] 11.7 Implement request throttling for scraping


    - Add configurable delay between requests (default 1 second)
    - Track last request time per provider
    - Queue requests to enforce throttling
    - _Requirements: 7.4_

  - [x] 11.8 Write property test for request throttling


    - **Property 33: Request Throttling**
    - **Validates: Requirements 7.4**

  - [x] 11.9 Add blocking detection and alerting


    - Detect HTTP 403, 429, and other blocking responses
    - Log blocking events with details
    - Generate administrator alerts
    - Fall back to cached data
    - _Requirements: 7.5_

  - [x] 11.10 Write property test for blocking detection and alerting


    - **Property 34: Blocking Detection and Alerting**
    - **Validates: Requirements 7.5**

- [x] 12. Implement Historical Data Management




  - [x] 12.1 Add pricing change detection


    - Compare new pricing with current pricing
    - Detect changes in input/output costs
    - Record change date and both values
    - _Requirements: 8.3_

  - [x] 12.2 Implement cost report generation with historical pricing


    - Query pricing data for specific date ranges
    - Use historical pricing for past cost calculations
    - Support multiple pricing tiers in calculations
    - _Requirements: 8.4_

  - [x] 12.3 Write property test for historical pricing usage


    - **Property 38: Historical Pricing Usage**
    - **Validates: Requirements 8.4**

  - [x] 12.4 Add data retention policy enforcement


    - Retain pricing history for at least 12 months
    - Implement archival for older data
    - Add cleanup job for expired data
    - _Requirements: 8.5_

  - [x] 12.5 Write property test for data retention policy


    - **Property 39: Data Retention Policy**
    - **Validates: Requirements 8.5**

- [x] 13. Integration and Admin Dashboard Updates




  - [x] 13.1 Update Provider Pool to use Model Registry


    - Query available models from registry instead of hardcoded lists
    - Use model capabilities for selection logic
    - Filter by usability status
    - _Requirements: 5.1_

  - [x] 13.2 Update Cost Calculator to use dynamic pricing


    - Query pricing from Model Registry
    - Use historical pricing for past calculations
    - Handle multiple pricing tiers
    - _Requirements: 5.4, 8.4_

  - [x] 13.3 Add model management section to Admin Dashboard


    - Display list of discovered models
    - Show pricing information and history
    - Display sync status and last sync time
    - Add manual sync trigger button
    - Show scraping configuration status
    - _Requirements: 4.2, 5.1, 5.4_

  - [x] 13.4 Add sync monitoring to Admin Dashboard


    - Display sync job history
    - Show success/failure rates per provider
    - Display error logs
    - Add alerts for consecutive failures
    - _Requirements: 4.4_

- [x] 14. Final Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Documentation and Deployment




  - [x] 15.1 Create API documentation for model endpoints


    - Document request/response formats
    - Add example queries with filters
    - Document authentication requirements
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 15.2 Create configuration guide for scraping


    - Document scraping configuration format
    - Provide examples for each provider
    - Explain fallback strategy configuration
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 15.3 Create deployment guide


    - Document required environment variables
    - Explain database migration process
    - Provide sync schedule configuration examples
    - Document monitoring and alerting setup
    - _Requirements: 4.3, 7.1, 7.2, 7.3, 7.4_

  - [x] 15.4 Add monitoring and alerting documentation


    - Document metrics to track
    - Explain alert conditions
    - Provide troubleshooting guide
    - _Requirements: 4.4, 7.5_
