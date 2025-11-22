# Technology Stack

## Core Technologies

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.0+ with strict mode enabled
- **Build**: TypeScript compiler (tsc)
- **Testing**: Jest 29+ with ts-jest, fast-check for property-based testing
- **Database**: PostgreSQL 14+
- **Cache**: Redis 7+

## Key Dependencies

- `pg`: PostgreSQL client for database operations
- `redis`: Redis client (v4.6.0+) for caching
- `ts-node`: Development execution
- `fast-check`: Property-based testing (minimum 100 iterations per property)
- `@types/pg`, `@types/redis`, `@types/node`: TypeScript type definitions

## Environment Variables

Required API keys for provider adapters:
```bash
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-key
```

## TypeScript Configuration

- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- Output: `./dist` directory
- Source maps and declarations generated

## Common Commands

```bash
# Install dependencies
npm install

# Build project (compile TypeScript)
npm run build

# Run tests (single execution)
npm test

# Run tests in watch mode
npm run test:watch

# Development mode
npm run dev

# Set up database
psql -U postgres -f database/schema.sql
```

## Testing Guidelines

- Use Jest for unit and integration tests
- Use fast-check for property-based testing
- Test files: `.test.ts` suffix, co-located with source or in `src/__tests__/`
- Property test files: `.property.test.ts` suffix for clarity
- Minimum 100 iterations for property-based tests (`numRuns: 100`)
- Property tests should include comment header referencing design property number
- Use `jest.mock()` for external dependencies (pg, redis)
- Increase test timeout for property tests: `120000ms` (2 minutes)
- Exclude test files from build (`tsconfig.json`)

### Property Test Format

```typescript
/**
 * Property-Based Test: [Property Name]
 * Feature: ai-council-proxy, Property X: [property description]
 * 
 * Validates: Requirements X.X
 */
test('property description', async () => {
  await fc.assert(
    fc.asyncProperty(/* arbitraries */, async (...args) => {
      // Test implementation
    }),
    { numRuns: 100 }
  );
}, 120000);
```

## Build Output

- Compiled JavaScript: `./dist` directory
- Source maps: Generated alongside compiled files
- Type declarations: Generated for library usage
