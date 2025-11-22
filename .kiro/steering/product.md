# Product Overview

AI Council Proxy is a distributed system that orchestrates multi-model AI deliberations to produce high-quality consensus responses.

## Core Concept

Routes user requests to multiple AI models from different providers (OpenAI, Anthropic, Google), orchestrates deliberation among them to reach consensus decisions, and presents a unified response. Includes monitoring dashboard for tracking council interactions, decision-making patterns, and cost metrics.

## Key Features

- Multi-provider AI orchestration with retry logic
- Deliberation rounds for consensus building
- Multiple synthesis strategies (Consensus Extraction, Weighted Fusion, Meta-Synthesis)
- Session management with conversation history
- Cost tracking and performance analytics
- Admin dashboard for monitoring
- Graceful degradation on provider failures

## Architecture Layers

1. **Presentation**: User Interface, Admin Dashboard, REST API Gateway
2. **Application**: Orchestration Engine, Synthesis Engine, Session Manager, Configuration Manager
3. **Integration**: Provider Pool, Provider Adapters, Retry/Timeout Logic
4. **Data**: Event Logger, PostgreSQL, Redis Cache
5. **Analytics**: Metrics Aggregation, Cost Calculator, Performance Analyzer

## Development Status

Initial setup phase. Core interfaces and data models defined. Component implementation in progress.


## Implementation Status

### Completed Components

- ✅ Provider Pool and Adapters (OpenAI, Anthropic, Google)
- ✅ Configuration Manager with caching and validation
- ✅ Session Manager with context window management
- ✅ Synthesis Engine with multiple strategies
- ✅ Orchestration Engine with timeout handling
- ✅ Base Provider Adapter with retry logic

### Testing Coverage

- Unit tests for provider adapters (retry, timeout, error handling)
- Property-based tests for:
  - Configuration persistence round-trip
  - Retry attempt count validation
  - Timeout enforcement
  - Per-provider configuration
- Integration tests for provider pool health tracking

### Key Design Decisions

- **Graceful Degradation**: System continues with partial responses
- **Automatic Disabling**: Providers disabled after 5 consecutive failures
- **Exponential Backoff**: Configurable retry policy per provider
- **Context Window Management**: Automatic summarization when limits exceeded
- **Synthesis Strategies**: Consensus extraction, weighted fusion, meta-synthesis
