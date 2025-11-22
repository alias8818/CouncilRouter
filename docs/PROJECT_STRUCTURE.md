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
│   ├── config/                # Configuration Manager
│   │   └── manager.ts
│   ├── dashboard/             # Admin Dashboard
│   │   └── dashboard.ts
│   ├── interfaces/            # TypeScript interfaces
│   │   ├── IConfigurationManager.ts
│   │   ├── IDashboard.ts
│   │   ├── IEventLogger.ts
│   │   ├── IOrchestrationEngine.ts
│   │   ├── IProviderPool.ts
│   │   ├── ISessionManager.ts
│   │   └── ISynthesisEngine.ts
│   ├── logging/               # Event Logger
│   │   └── logger.ts
│   ├── orchestration/         # Orchestration Engine
│   │   └── engine.ts
│   ├── providers/             # Provider Pool and Adapters
│   │   ├── adapters/
│   │   │   └── base.ts
│   │   └── pool.ts
│   ├── session/               # Session Manager
│   │   └── manager.ts
│   ├── synthesis/             # Synthesis Engine
│   │   └── engine.ts
│   ├── types/                 # TypeScript type definitions
│   │   └── core.ts
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
- **Configuration Models**: CouncilConfig, DeliberationConfig, SynthesisConfig, PerformanceConfig
- **Synthesis Models**: SynthesisStrategy, ModeratorStrategy
- **Cost Models**: CostBreakdown
- **Analytics Models**: RequestSummary, PerformanceMetrics, CostAnalytics, AgreementMatrix, InfluenceScores
- **Error Models**: ErrorResponse
- **API Models**: APIRequestBody, APIResponse

### Interfaces (`src/interfaces/`)

Defines contracts for all major components:

- **IOrchestrationEngine**: Coordinates request lifecycle
- **IProviderPool**: Manages AI provider connections
- **ISynthesisEngine**: Combines responses into consensus
- **ISessionManager**: Manages conversation sessions
- **IConfigurationManager**: Manages system configuration
- **IEventLogger**: Logs system events
- **IDashboard**: Provides monitoring interface

### Components

#### API Gateway (`src/api/`)
- Handles REST API endpoints
- Authentication and validation
- Request routing

#### Orchestration Engine (`src/orchestration/`)
- Distributes requests to council members
- Manages deliberation rounds
- Handles timeouts and failures
- Coordinates synthesis

#### Provider Pool (`src/providers/`)
- Manages connections to AI providers (OpenAI, Anthropic, Google, etc.)
- Implements retry logic with exponential backoff
- Tracks provider health
- Provider-specific adapters in `adapters/` subdirectory

#### Synthesis Engine (`src/synthesis/`)
- Implements synthesis strategies:
  - Consensus Extraction
  - Weighted Fusion
  - Meta-Synthesis
- Selects moderators for meta-synthesis

#### Session Manager (`src/session/`)
- Creates and retrieves sessions
- Manages conversation history
- Handles context window limits
- Expires inactive sessions

#### Configuration Manager (`src/config/`)
- Stores and retrieves configuration
- Validates configuration changes
- Provides configuration presets
- Caches configuration in Redis

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
- Computes performance metrics (p50, p95, p99 latency)
- Calculates agreement matrices
- Computes influence scores
- Aggregates cost data

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
- `red_team_tests`: Security testing results

#### Redis Cache (`database/redis-schema.md`)

Cache keys:
- `session:{sessionId}`: Active session data (TTL: 30 days)
- `config:*`: Configuration cache (no expiry)
- `provider:health:{providerId}`: Provider health (TTL: 5 minutes)
- `request:status:{requestId}`: Request status (TTL: 1 hour)

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

## Next Steps

This is the initial project structure. Subsequent tasks will implement:

1. Provider adapters for OpenAI, Anthropic, and Google
2. Configuration manager with validation
3. Session manager with context handling
4. Orchestration engine core logic
5. Deliberation logic
6. Synthesis engine with multiple strategies
7. Event logging and cost tracking
8. REST API endpoints
9. User interface
10. Admin dashboard
11. Analytics engine
12. Red-team testing system
13. Graceful degradation features
14. Streaming support
15. Transparency features

## Development Guidelines

1. **Type Safety**: Use TypeScript strictly, avoid `any` types
2. **Interface-First**: Define interfaces before implementations
3. **Testing**: Write property-based tests for universal properties, unit tests for specific cases
4. **Error Handling**: Implement graceful degradation and retry logic
5. **Logging**: Log all significant events for monitoring
6. **Configuration**: Make behavior configurable rather than hardcoded
7. **Documentation**: Keep documentation up-to-date with code changes
