# Product Overview

AI Council Proxy is a distributed system that orchestrates multi-model AI deliberations to produce high-quality consensus responses.

## Core Concept

Routes user requests to multiple AI models via OpenRouter (unified access to 300+ models), orchestrates deliberation among them to reach consensus decisions, and presents a unified response via REST API. Includes admin dashboard for monitoring council interactions, decision-making patterns, and cost metrics.

## Key Features

- Multi-provider AI orchestration with retry logic
- Deliberation rounds for consensus building
- Multiple synthesis strategies (Consensus Extraction, Weighted Fusion, Meta-Synthesis)
- Session management with conversation history
- Cost tracking and performance analytics
- Admin dashboard for monitoring
- Graceful degradation on provider failures

## Architecture Layers

1. **Presentation**: Admin Dashboard (web UI on port 3001), REST API Gateway
2. **Application**: Orchestration Engine, Synthesis Engine, Session Manager, Configuration Manager
3. **Integration**: Provider Pool, OpenRouter Adapter, Retry/Timeout Logic
4. **Data**: Event Logger, PostgreSQL, Redis Cache
5. **Analytics**: Metrics Aggregation, Cost Calculator, Performance Analyzer

## Development Status

Initial setup phase. Core interfaces and data models defined. Component implementation in progress.


## Implementation Status

### Completed Components

- ✅ Provider Pool with OpenRouter Adapter (unified access to 300+ models)
- ✅ Configuration Manager with database-driven presets
- ✅ Session Manager with context window management
- ✅ Synthesis Engine with multiple strategies (including Iterative Consensus)
- ✅ Orchestration Engine with timeout handling and request deduplication
- ✅ Base Provider Adapter with retry logic
- ✅ REST API Gateway with authentication, streaming, and idempotency
- ✅ Event Logger with cost tracking
- ✅ Analytics Engine with performance metrics
- ✅ Admin Dashboard with real-time monitoring (web interface on port 3001)
- ✅ Budget Enforcer with spending caps
- ✅ Tool Execution Engine for external tool use
- ✅ Idempotency Cache for duplicate request handling
- ✅ Red Team Testing System for security validation
- ✅ Dynamic Model Discovery Service (automatic model detection)
- ✅ Pricing Scraper Service (automatic pricing updates)
- ✅ Model Registry with usability tracking
- ✅ Sync Scheduler for automated model/pricing synchronization
- ✅ Embedding Service for similarity calculations
- ✅ Iterative Consensus Synthesizer with negotiation
- ✅ Convergence Detector for deadlock detection
- ✅ Escalation Service for human review
- ✅ Metrics Tracking with configurable enable/disable

### Testing Coverage

- Unit tests for all core components
- Property-based tests for:
  - Configuration persistence round-trip
  - Retry attempt count validation
  - Timeout enforcement and conversion
  - Per-provider configuration
  - Member ID attribution
  - Session atomicity
  - Rotation concurrency
  - Disagreement calculation
  - Cost tracking accuracy
- Integration tests for end-to-end request flow
- 100+ iterations per property test

### Key Design Decisions

- **Graceful Degradation**: System continues with partial responses
- **Automatic Disabling**: Providers disabled after 5 consecutive failures
- **Exponential Backoff**: Configurable retry policy per provider
- **Context Window Management**: Automatic summarization when limits exceeded
- **Synthesis Strategies**: Consensus extraction, weighted fusion, meta-synthesis, iterative consensus
- **Iterative Consensus**: Negotiation-based synthesis with similarity tracking and early termination
- **Idempotency**: Request deduplication using idempotency keys (24-hour TTL)
- **Budget Enforcement**: Per-provider/model spending caps with automatic disabling
- **Tool Use**: Council members can execute external tools during deliberation
- **Shared Health Tracking**: Single source of truth for provider health across components
- **Dynamic Model Discovery**: Automatic model detection from provider APIs
- **Pricing Scraping**: Automated pricing updates from provider websites
- **Database-Driven Presets**: Configuration presets stored in database (single source of truth)
- **Metrics Toggle**: Performance optimization through configurable metrics tracking
- **OpenRouter-Only Architecture**: 100% OpenRouter integration for unified access to 300+ models including free tiers
- **Admin-Only UI**: Web-based admin dashboard (no end-user GUI), API-first design
