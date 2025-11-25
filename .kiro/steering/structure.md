# Project Structure

## Directory Organization

```
src/
├── types/              # Core TypeScript type definitions
├── interfaces/         # Component interface contracts
├── api/                # REST API Gateway
├── orchestration/      # Orchestration Engine (request lifecycle)
├── providers/          # Provider Pool and OpenRouter Adapter
│   └── adapters/       # OpenRouter adapter (unified access to 300+ models)
├── synthesis/          # Synthesis Engine (consensus building)
│   ├── iterative-consensus/  # Negotiation-based synthesis
│   ├── convergence/    # Convergence detection
│   ├── negotiation/    # Negotiation prompt building
│   └── examples/       # Example repository
├── session/            # Session Manager (conversation history)
├── config/             # Configuration Manager
├── logging/            # Event Logger
├── dashboard/          # Admin Dashboard (web UI)
│   └── public/         # Admin UI static files
├── analytics/          # Analytics Engine
├── discovery/          # Model Discovery Service
├── embedding/          # Embedding Service (similarity)
├── escalation/         # Human Escalation Service
├── monitoring/         # Monitoring and Metrics
├── __tests__/          # Integration tests
├── start-admin.ts      # Admin dashboard startup
└── index.ts            # Main entry point (exports)

database/
├── schema.sql          # PostgreSQL schema
├── migrations/         # Database migrations
└── redis-schema.md     # Redis cache documentation

docs/                   # Project documentation
dist/                   # Compiled output (generated)
```

## Code Organization Principles

### Interface-First Design

- Define interfaces in `src/interfaces/` before implementations
- All major components implement a corresponding interface
- Interfaces define contracts for dependency injection

### Type Definitions

- All types defined in `src/types/core.ts`
- Includes: Request/Response, Council Members, Deliberation, Provider, Session, Configuration, Synthesis, Cost, Analytics, Error, API models
- Use strict TypeScript, avoid `any` types

### Component Structure

Each component follows this pattern:
- Interface in `src/interfaces/I{ComponentName}.ts`
- Implementation in `src/{component}/{name}.ts`
- Unit tests: `{name}.test.ts` in `__tests__` subdirectory
- Property tests: `{name}.property.test.ts` in `__tests__` subdirectory
- Integration tests: `src/__tests__/` at root level

### Provider Adapter Pattern

OpenRouter adapter provides unified access to 300+ models:
- Single adapter extends `BaseProviderAdapter`
- Abstract base class handles retry logic, timeout, and error handling
- OpenRouter adapter implements: `sendRequest()`, `getHealth()`, `formatRequest()`, `parseResponse()`
- Retry policy with exponential backoff built into base class
- Error code detection and classification in base class
- Supports free-tier models (Llama, Mistral, Gemma, Qwen, DeepSeek)

### Main Entry Point

`src/index.ts` exports:
- All core types from `types/core.ts`
- All interfaces from `interfaces/`
- All component implementations

## Database Organization

### PostgreSQL Tables
- `requests`, `council_responses`, `deliberation_exchanges`
- `sessions`, `session_history`
- `configurations`, `provider_health`, `cost_records`
- `red_team_prompts`, `red_team_tests`
- `tool_usage` (Council Enhancements)
- `budget_caps`, `budget_spending` (Council Enhancements)
- `api_keys` (for API key authentication)
- `devils_advocate_logs` (Synthesis Context Injection)
- `negotiation_rounds`, `negotiation_responses`, `negotiation_examples` (Iterative Consensus)
- `consensus_metadata`, `escalation_queue` (Iterative Consensus)
- `models`, `model_pricing`, `pricing_history` (Dynamic Model Pricing)
- `sync_status`, `scraping_config` (Dynamic Model Pricing)
- `council_presets` (Database-driven configuration presets)

### Redis Keys
- `session:{sessionId}` (TTL: 30 days)
- `config:*` (no expiry, invalidated on update)
- `provider:health:{providerId}` (TTL: 5 minutes)
- `request:status:{requestId}` (TTL: 1 hour)
- `request:{requestId}` (stored request data, TTL: 24 hours)
- `idempotency:{userId}:{key}` (idempotency cache, TTL: 24 hours)
- `deliberation:{requestId}` (deliberation thread cache, TTL: 1 hour)
- `preset:{presetName}` (preset configuration cache, TTL: 5 minutes)
- `model:cache:{modelId}` (model details cache, TTL: 1 hour)
- `pricing:fallback:{modelId}` (fallback pricing cache, TTL: 7 days)

## Naming Conventions

- Interfaces: `I{ComponentName}` (e.g., `IOrchestrationEngine`)
- Classes: PascalCase (e.g., `OrchestrationEngine`)
- Files: kebab-case or camelCase matching class name
- Types/Interfaces in types: PascalCase (e.g., `UserRequest`, `CouncilMember`)

## Import/Export Pattern

- Export all public APIs through `src/index.ts`
- Use named exports, not default exports
- Import from interfaces for type declarations
- Import from implementations for instantiation


## Implementation Patterns

### Dependency Injection

Components receive dependencies via constructor:
```typescript
constructor(
  private db: Pool,
  private redis: RedisClientType,
  private providerPool: IProviderPool
) {}
```

### Error Handling

- Custom error classes for validation: `ConfigurationValidationError`
- Provider errors handled gracefully with fallback
- Retry logic for transient failures (RATE_LIMIT, TIMEOUT, SERVICE_UNAVAILABLE)
- Non-retryable errors fail immediately

### Caching Strategy

- Redis cache with database fallback
- Cache keys follow pattern: `config:*`, `session:{id}`, `provider:health:{id}`
- Cache invalidation on updates
- TTL varies by data type (sessions: 30 days, provider health: 5 minutes)

### Health Tracking

- Automatic provider health monitoring
- Status: `healthy`, `degraded`, `disabled`
- Consecutive failure threshold: 5 failures → automatic disable
- Success rate and latency tracking (last 100 requests)
- Shared health tracker across Provider Pool and Orchestration Engine

### Configuration Management

- Versioned configurations in database
- Active/inactive flag for configuration history
- Presets: `fast-council`, `balanced-council`, `research-council`
- Validation before persistence
- Redis caching with automatic invalidation

### API Gateway Features

- JWT and API key authentication
- Rate limiting (100 requests per 15 minutes per IP)
- Request idempotency using `Idempotency-Key` header
- Server-Sent Events (SSE) for streaming responses
- Input sanitization to prevent injection attacks
- Automatic connection cleanup for stale streams

### Budget Management

- Per-provider and per-model spending caps
- Daily, weekly, and monthly budget periods
- Automatic member disabling when budget exceeded
- Budget warnings at 75% and 90% thresholds
- Automatic re-enabling on period reset
