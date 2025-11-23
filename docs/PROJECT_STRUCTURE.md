# AI Council Proxy - Project Structure

## Overview

This document describes the complete project structure and organization of the AI Council Proxy system.

## Directory Structure

```
ai-council-proxy/
├── .git/                       # Git repository
├── .kiro/                      # Kiro specs and configuration
│   └── specs/
│       └── ai-council-proxy/
│           ├── requirements.md # System requirements
│           ├── design.md       # Design document
│           └── tasks.md        # Implementation tasks
├── database/                   # Database schemas
│   ├── schema.sql             # PostgreSQL schema
│   └── redis-schema.md        # Redis cache schema documentation
├── dist/                       # Compiled TypeScript output (generated)
├── docs/                       # Documentation
│   └── PROJECT_STRUCTURE.md   # This file
├── node_modules/              # NPM dependencies (generated)
├── src/                       # Source code
│   ├── __tests__/             # Test files
│   │   └── setup.test.ts      # Setup verification tests
│   ├── analytics/             # Analytics Engine
│   │   └── engine.ts
│   ├── api/                   # REST API Gateway
│   │   └── gateway.ts
│   ├── budget/                # Budget Enforcer
│   │   └── budget-enforcer.ts
│   ├── cache/                 # Caching components
│   │   └── idempotency-cache.ts
│   ├── config/                # Configuration Manager
│   │   └── manager.ts
│   ├── cost/                  # Cost Calculator
│   │   └── calculator.ts
│   ├── dashboard/             # Admin Dashboard
│   │   └── dashboard.ts
│   ├── interfaces/            # TypeScript interfaces
│   │   ├── IAnalyticsEngine.ts
│   │   ├── IAPIGateway.ts
│   │   ├── IBudgetEnforcer.ts
│   │   ├── IConfigurationManager.ts
│   │   ├── ICostCalculator.ts
│   │   ├── IDashboard.ts
│   │   ├── IDevilsAdvocateModule.ts
│   │   ├── IEventLogger.ts
│   │   ├── IIdempotencyCache.ts
│   │   ├── IOrchestrationEngine.ts
│   │   ├── IProviderPool.ts
│   │   ├── IRedTeamTester.ts
│   │   ├── ISessionManager.ts
│   │   ├── ISynthesisEngine.ts
│   │   └── IToolExecutionEngine.ts
│   ├── logging/               # Event Logger
│   │   └── logger.ts
│   ├── orchestration/         # Orchestration Engine
│   │   └── engine.ts
│   ├── providers/             # Provider Pool and Adapters
│   │   ├── adapters/
│   │   │   ├── base.ts
│   │   │   ├── openai.ts
│   │   │   ├── anthropic.ts
│   │   │   └── google.ts
│   │   ├── health-tracker.ts
│   │   └── pool.ts
│   ├── redteam/               # Red Team Testing
│   │   └── tester.ts
│   ├── session/               # Session Manager
│   │   └── manager.ts
│   ├── synthesis/             # Synthesis Engine
│   │   ├── devils-advocate.ts
│   │   └── engine.ts
│   ├── tools/                 # Tool Execution
│   │   ├── execution-engine.ts
│   │   └── tool-adapter.ts
│   ├── types/                 # TypeScript type definitions
│   │   └── core.ts
│   ├── ui/                    # User Interface
│   │   └── interface.ts
│   └── index.ts               # Main entry point
├── .env.example               # Environment variables template
├── .gitattributes             # Git attributes
├── .gitignore                 # Git ignore rules
├── jest.config.js             # Jest configuration
├── package.json               # NPM package configuration
├── README.md                  # Project README
└── tsconfig.json              # TypeScript configuration
```

## Component Descriptions

### Core Types (`src/types/core.ts`)

Defines all TypeScript interfaces and types used throughout the system:

- **Request/Response Models**: UserRequest, InitialResponse, ConsensusDecision
- **Council Member Models**: CouncilMember, RetryPolicy
- **Deliberation Models**: DeliberationThread, DeliberationRound, Exchange
- **Provider Models**: ProviderResponse, ProviderHealth, TokenUsage
- **Session Models**: Session, HistoryEntry, ConversationContext
- **Configuration Models**: CouncilConfig, DeliberationConfig, SynthesisConfig, PerformanceConfig, TransparencyConfig
- **Synthesis Models**: SynthesisStrategy, ModeratorStrategy
- **Cost Models**: CostBreakdown
- **Analytics Models**: RequestSummary, PerformanceMetrics, CostAnalytics, AgreementMatrix, InfluenceScores
- **Error Models**: ErrorResponse
- **API Models**: APIRequestBody, APIResponse
- **Tool Models**: ToolDefinition, ToolParameter, ToolCall, ToolResult, ToolUsage
- **Budget Models**: BudgetCap, BudgetStatus, BudgetCheckResult
- **Red Team Models**: RedTeamPrompt, RedTeamTestResult, RedTeamAnalytics

### Interfaces (`src/interfaces/`)

Defines contracts for all major components:

- **IOrchestrationEngine**: Coordinates request lifecycle
- **IProviderPool**: Manages AI provider connections
- **ISynthesisEngine**: Combines responses into consensus
- **ISessionManager**: Manages conversation sessions
- **IConfigurationManager**: Manages system configuration
- **IEventLogger**: Logs system events
- **IDashboard**: Provides monitoring interface
- **IAPIGateway**: REST API endpoints and authentication
- **IAnalyticsEngine**: Performance metrics and analytics
- **ICostCalculator**: Cost tracking and alerts
- **IBudgetEnforcer**: Budget cap enforcement
- **IToolExecutionEngine**: External tool execution
- **IIdempotencyCache**: Request deduplication
- **IRedTeamTester**: Security testing
- **IDevilsAdvocateModule**: Critical analysis synthesis

### Components

#### API Gateway (`src/api/`)
- Handles REST API endpoints (POST /api/v1/requests, GET /api/v1/requests/:id, GET /api/v1/requests/:id/stream)
- JWT and API key authentication
- Request validation and input sanitization
- Rate limiting (100 requests per 15 minutes per IP)
- Idempotency support via Idempotency-Key header
- Server-Sent Events (SSE) for streaming responses
- Automatic cleanup of stale connections

#### Orchestration Engine (`src/orchestration/`)
- Distributes requests to council members in parallel
- Manages deliberation rounds (0-5 configurable)
- Handles per-member and global timeouts (with proper unit conversion)
- Coordinates synthesis with multiple strategies
- Preserves member attribution in all responses
- Graceful degradation with partial responses
- Integration with shared health tracker

#### Provider Pool (`src/providers/`)
- Manages connections to AI providers (OpenAI, Anthropic, Google)
- Implements retry logic with exponential backoff
- Tracks provider health with shared health tracker
- Automatic disabling after 5 consecutive failures
- Provider-specific adapters in `adapters/` subdirectory
- Health tracker (`health-tracker.ts`) provides single source of truth for provider status

#### Synthesis Engine (`src/synthesis/`)
- Implements synthesis strategies:
  - Consensus Extraction (TF-IDF based similarity)
  - Weighted Fusion (configurable member weights)
  - Meta-Synthesis (moderator-based synthesis)
- Selects moderators for meta-synthesis (permanent, rotate, strongest)
- Thread-safe rotation with promise-based locking
- Devil's Advocate module for critical analysis (`devils-advocate.ts`)
- Updated model rankings (November 2025 frontier models)

#### Session Manager (`src/session/`)
- Creates and retrieves sessions with UUID identifiers
- Manages conversation history with role-based entries
- Handles context window limits with automatic summarization
- Expires inactive sessions (configurable threshold)
- Atomic session updates using SELECT FOR UPDATE
- Token estimation using tiktoken library
- Redis caching with database fallback

#### Configuration Manager (`src/config/`)
- Stores and retrieves configuration with versioning
- Validates configuration changes (strict validation)
- Provides configuration presets (fast-council, balanced-council, research-council)
- Caches configuration in Redis with automatic invalidation
- Supports transparency configuration
- Validates retry policies (maxAttempts must be positive)
- Validates synthesis strategies and moderator configurations

#### Event Logger (`src/logging/`)
- Logs all requests and responses
- Records deliberation exchanges
- Tracks costs and performance
- Stores logs in PostgreSQL

#### Dashboard (`src/dashboard/`)
- Displays recent requests
- Shows deliberation threads
- Visualizes performance metrics
- Presents cost analytics
- Shows agreement matrix and influence scores

#### Analytics Engine (`src/analytics/`)
- Computes performance metrics (p50, p95, p99 latency using linear interpolation)
- Calculates agreement matrices (member-to-member disagreement rates)
- Computes influence scores based on consensus alignment
- Aggregates cost data by provider and member
- Null-safe query result processing
- Caching for expensive analytics queries

#### Additional Components

**Budget Enforcer** (`src/budget/budget-enforcer.ts`)
- Tracks spending per provider and model
- Enforces daily, weekly, and monthly budget caps
- Automatically disables members when budget exceeded
- Re-enables members on period reset
- Generates budget warnings at 75% and 90% thresholds

**Cost Calculator** (`src/cost/calculator.ts`)
- Calculates costs based on token usage and provider pricing
- Tracks pricing versions for historical accuracy
- Aggregates costs by provider, member, and time period
- Generates cost alerts when thresholds exceeded
- Exact period matching for alert triggering

**Tool Execution Engine** (`src/tools/execution-engine.ts`)
- Manages tool registry and definitions
- Executes tools with timeout handling
- Supports parallel tool execution
- Tracks tool usage per request
- Provides tool results to council members

**Idempotency Cache** (`src/cache/idempotency-cache.ts`)
- Prevents duplicate request processing
- User-scoped idempotency keys
- Distributed locking for concurrent requests
- Waiter pattern for duplicate key handling
- 24-hour TTL on cached results

**Red Team Tester** (`src/redteam/tester.ts`)
- Secure storage of red team prompts
- Scheduled execution of security tests
- Records resistance vs. compromise results
- Calculates resistance rates per member and category
- Generates security warnings for failing members

**Provider Health Tracker** (`src/providers/health-tracker.ts`)
- Shared health tracking across components
- Single source of truth for provider status
- Consecutive failure counting
- Automatic disabling after threshold
- Rolling window success rate calculation

**Devil's Advocate Module** (`src/synthesis/devils-advocate.ts`)
- Selects devil's advocate from council members
- Generates critique prompts
- Synthesizes with critique consideration
- Adjusts confidence based on critique strength
- Tracks devil's advocate effectiveness

### Database

#### PostgreSQL Schema (`database/schema.sql`)

Tables:
- `requests`: User requests and consensus decisions
- `council_responses`: Individual council member responses
- `deliberation_exchanges`: Deliberation round exchanges
- `sessions`: User conversation sessions
- `session_history`: Session message history
- `configurations`: System configuration versions
- `provider_health`: Provider health status
- `cost_records`: Cost tracking per request
- `red_team_prompts`: Secure storage for red team prompts
- `red_team_tests`: Security testing results
- `tool_usage`: Tool execution tracking (Council Enhancements)
- `budget_caps`: Budget limits per provider/model (Council Enhancements)
- `budget_spending`: Current spending tracking (Council Enhancements)
- `api_keys`: API key authentication (hashed with SHA-256)

#### Redis Cache (`database/redis-schema.md`)

Cache keys:
- `session:{sessionId}`: Active session data (TTL: 30 days)
- `config:*`: Configuration cache (no expiry, invalidated on update)
- `provider:health:{providerId}`: Provider health (TTL: 5 minutes)
- `request:status:{requestId}`: Request status (TTL: 1 hour)
- `request:{requestId}`: Stored request data (TTL: 24 hours)
- `idempotency:{userId}:{key}`: Idempotency cache (TTL: 24 hours)
- `idempotency:lock:{userId}:{key}`: Distributed lock for idempotency (TTL: 60 seconds)
- `idempotency:waiters:{userId}:{key}`: Waiter list for concurrent requests (TTL: 60 seconds)

## Testing

### Test Framework
- **Jest**: Unit and integration testing
- **fast-check**: Property-based testing
- **ts-jest**: TypeScript support for Jest

### Test Organization
- Unit tests: Co-located with source files (`.test.ts` suffix)
- Integration tests: In `src/__tests__/` directory
- Property-based tests: Minimum 100 iterations per property

## Build and Development

### Scripts
- `npm run build`: Compile TypeScript to JavaScript
- `npm test`: Run all tests
- `npm run test:watch`: Run tests in watch mode
- `npm run dev`: Run development server

### Configuration Files
- `tsconfig.json`: TypeScript compiler options
- `jest.config.js`: Jest test configuration
- `package.json`: NPM dependencies and scripts
- `.env.example`: Environment variable template

## Implementation Status

All core components have been implemented:

1. ✅ Provider adapters for OpenAI, Anthropic, and Google
2. ✅ Configuration manager with validation and presets
3. ✅ Session manager with context handling and summarization
4. ✅ Orchestration engine with timeout handling
5. ✅ Deliberation logic with configurable rounds
6. ✅ Synthesis engine with multiple strategies
7. ✅ Event logging and cost tracking
8. ✅ REST API endpoints with authentication
9. ✅ User interface components
10. ✅ Admin dashboard with analytics
11. ✅ Analytics engine with performance metrics
12. ✅ Red-team testing system
13. ✅ Graceful degradation features
14. ✅ Streaming support via Server-Sent Events
15. ✅ Transparency features with per-request override
16. ✅ Idempotency support for duplicate request handling
17. ✅ Budget enforcement with spending caps
18. ✅ Tool execution engine for external tool use
19. ✅ Critical bug fixes (timeout units, member attribution, race conditions)

## Development Guidelines

1. **Type Safety**: Use TypeScript strictly, avoid `any` types
2. **Interface-First**: Define interfaces before implementations
3. **Testing**: Write property-based tests for universal properties, unit tests for specific cases
4. **Error Handling**: Implement graceful degradation and retry logic
5. **Logging**: Log all significant events for monitoring
6. **Configuration**: Make behavior configurable rather than hardcoded
7. **Documentation**: Keep documentation up-to-date with code changes
