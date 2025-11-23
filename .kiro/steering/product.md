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
- ✅ REST API Gateway with authentication and streaming
- ✅ Event Logger with cost tracking
- ✅ Analytics Engine with performance metrics
- ✅ Admin Dashboard with real-time monitoring
- ✅ Budget Enforcer with spending caps
- ✅ Tool Execution Engine for external tool use
- ✅ Idempotency Cache for duplicate request handling
- ✅ Red Team Testing System for security validation

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
- **Synthesis Strategies**: Consensus extraction, weighted fusion, meta-synthesis
- **Idempotency**: Request deduplication using idempotency keys
- **Budget Enforcement**: Per-provider/model spending caps with automatic disabling
- **Tool Use**: Council members can execute external tools during deliberation
- **Shared Health Tracking**: Single source of truth for provider health across components
