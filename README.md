# AI Council Proxy

A distributed system that orchestrates multi-model AI deliberations to produce high-quality consensus responses.

## Overview

The AI Council Proxy routes user requests to multiple AI models from different providers, orchestrates deliberation among them to reach consensus decisions, and presents a unified response to the user. The system includes a monitoring dashboard to track council interactions, decision-making patterns, and cost metrics.

## Project Structure

```
ai-council-proxy/
├── src/
│   ├── api/                    # REST API Gateway
│   ├── orchestration/          # Orchestration Engine
│   ├── providers/              # Provider Pool and Adapters
│   │   └── adapters/           # Provider-specific adapters
│   ├── synthesis/              # Synthesis Engine
│   ├── session/                # Session Manager
│   ├── config/                 # Configuration Manager
│   ├── logging/                # Event Logger
│   ├── dashboard/              # Admin Dashboard
│   ├── analytics/              # Analytics Engine
│   ├── types/                  # TypeScript type definitions
│   ├── interfaces/             # Component interfaces
│   └── index.ts                # Main entry point
├── database/
│   ├── schema.sql              # PostgreSQL schema
│   └── redis-schema.md         # Redis cache schema
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Quick Start

Get started in 5 minutes with Docker:

```bash
# Clone and configure
git clone https://github.com/your-org/ai-council-proxy.git
cd ai-council-proxy
cp .env.example .env

# Add your API keys to .env
# Required: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY
# Required: JWT_SECRET (for API authentication)
# Optional: Database and Redis connection strings

# Then start all services
docker-compose up -d

# Verify it's working
curl http://localhost:3000/health
```

See the **[Quick Start Guide](docs/QUICK_START.md)** for detailed instructions.

## Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+

### Installation

```bash
# Install dependencies
npm install

# Set up database
psql -U postgres -f database/schema.sql

# Build the project
npm run build
```

## Testing

The project uses Jest for unit testing and fast-check for property-based testing.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Architecture

The system follows a layered architecture:

1. **Presentation Layer**: User Interface, Admin Dashboard, REST API Gateway
2. **Application Layer**: Orchestration Engine, Synthesis Engine, Session Manager, Configuration Manager
3. **Integration Layer**: Provider Pool, Provider Adapters, Retry/Timeout Logic
4. **Data Layer**: Event Logger, Database (PostgreSQL), Session Cache (Redis)
5. **Analytics Layer**: Metrics Aggregation, Cost Calculator, Performance Analyzer

## Key Components

- **Orchestration Engine**: Coordinates the entire request lifecycle with timeout handling and graceful degradation
- **Provider Pool**: Manages connections to AI provider APIs with health tracking and automatic disabling
- **Synthesis Engine**: Combines council member responses into consensus using multiple strategies
- **Session Manager**: Manages conversation sessions and context with automatic summarization
- **Configuration Manager**: Manages system configuration with validation and presets
- **Event Logger**: Logs all system events for monitoring and analytics
- **Dashboard**: Provides monitoring and analytics interface with real-time metrics
- **API Gateway**: REST API with authentication, rate limiting, streaming, and idempotency support
- **Budget Enforcer**: Tracks spending and enforces budget caps per provider/model
- **Tool Execution Engine**: Enables council members to use external tools during deliberation

## Documentation

Comprehensive documentation is available in the `docs/` directory:

### Getting Started
- **[Quick Start Guide](docs/QUICK_START.md)** - Get running in 5 minutes
- **[Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md)** - Pre-deployment verification

### Core Documentation
- **[API Documentation](docs/API_DOCUMENTATION.md)** - REST API endpoints, authentication, request/response formats
- **[Configuration Guide](docs/CONFIGURATION_GUIDE.md)** - Council composition, deliberation settings, synthesis strategies
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Docker, Kubernetes, AWS/GCP/Azure deployment instructions
- **[Database Setup](docs/DATABASE_SETUP.md)** - PostgreSQL and Redis setup, schema details, maintenance
- **[Monitoring Guide](docs/MONITORING_GUIDE.md)** - Metrics, logging, alerting, observability best practices

### Reference
- **[Documentation Index](docs/INDEX.md)** - Complete documentation index organized by topic and role
- **[Project Structure](docs/PROJECT_STRUCTURE.md)** - Code organization and architecture
- **[Provider Implementation](docs/PROVIDER_IMPLEMENTATION.md)** - Provider adapter details and usage
- **[API Gateway](docs/API_GATEWAY.md)** - REST API endpoints, authentication, and streaming
- **[Bug Fixes](docs/BUG_FIXES.md)** - Critical bug fixes and validation

## Quick Links

- **Getting Started**: See [Quick Start Guide](docs/QUICK_START.md)
- **API Reference**: See [API Documentation](docs/API_DOCUMENTATION.md)
- **Configuration**: See [Configuration Guide](docs/CONFIGURATION_GUIDE.md)
- **Deployment**: See [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md)
- **Troubleshooting**: See [Monitoring Guide](docs/MONITORING_GUIDE.md#troubleshooting-runbooks)

## Development Status

The AI Council Proxy is feature-complete with all core components implemented:

✅ Provider pool and adapters (OpenAI, Anthropic, Google)  
✅ Configuration manager with presets  
✅ Session manager with context handling  
✅ Orchestration engine with deliberation  
✅ Synthesis engine with multiple strategies  
✅ Event logging and cost tracking  
✅ Analytics engine  
✅ Admin dashboard  
✅ REST API Gateway with idempotency support  
✅ Budget enforcement and tool execution (Council Enhancements)  
✅ Comprehensive test coverage (unit + property-based)  
✅ Complete documentation  
✅ Critical bug fixes applied (timeout units, member attribution, race conditions)

Ready for deployment and production use.

## License

MIT
