# Testing Guide

This guide explains how to run tests for the AI Council Proxy, including unit tests, property tests, and integration tests.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Database Setup](#test-database-setup)
- [Running Tests](#running-tests)
- [Test Types](#test-types)
- [Test Coverage](#test-coverage)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Run All Tests (Without Integration Tests)

```bash
npm test
```

### Run Tests with Test Database (Full Suite)

```bash
# 1. Start the test database
docker compose --profile test up -d

# 2. Run all tests
npm test

# 3. Stop the test database (optional)
docker compose --profile test down
```

---

## Test Database Setup

Integration tests require a PostgreSQL test database. We use Docker Compose with a separate test database profile to avoid interfering with your development database.

### Using Docker Compose (Recommended)

The test database is configured with the `test` profile, which means it won't start with the regular services unless explicitly requested.

**Start test database:**
```bash
docker compose --profile test up -d postgres-test
```

**Check test database status:**
```bash
docker compose ps postgres-test
```

**Stop test database:**
```bash
docker compose --profile test down
```

**Configuration:**
- Host: `localhost`
- Port: `5433` (different from main database on 5432)
- Database: `ai_council_test`
- User: `postgres`
- Password: `postgres`

### Manual Setup (Alternative)

If you prefer not to use Docker:

```bash
# Create test database
createdb ai_council_test

# Initialize schema
psql ai_council_test < database/schema.sql
```

Then set environment variables:
```bash
export TEST_DATABASE_HOST=localhost
export TEST_DATABASE_PORT=5432
export TEST_DATABASE_NAME=ai_council_test
export TEST_DATABASE_USER=postgres
export TEST_DATABASE_PASSWORD=your_password
```

---

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test Suites

**Unit Tests:**
```bash
npm test -- src/synthesis/__tests__/engine.test.ts
```

**Property Tests:**
```bash
npm test -- src/synthesis/__tests__/engine.property.test.ts
```

**Integration Tests:**
```bash
# Requires test database to be running
docker compose --profile test up -d postgres-test
npm test -- src/__tests__/integration/iterative-consensus.integration.test.ts
```

### Watch Mode

```bash
npm test -- --watch
```

### With Coverage

```bash
npm test -- --coverage
```

### Specific Test

```bash
npm test -- -t "should achieve consensus when members converge"
```

---

## Test Types

### 1. Unit Tests

Test individual components in isolation with mocked dependencies.

**Location:** `src/**/__tests__/*.test.ts`

**Examples:**
- `src/synthesis/__tests__/engine.test.ts` - Synthesis engine unit tests
- `src/providers/__tests__/pool.test.ts` - Provider pool unit tests
- `src/session/__tests__/manager.test.ts` - Session manager unit tests

**Run:**
```bash
npm test -- --testPathPattern="test.ts$" --testPathIgnorePatterns="property|integration"
```

### 2. Property-Based Tests

Test system properties with automatically generated test cases using `fast-check`.

**Location:** `src/**/__tests__/*.property.test.ts`

**Examples:**
- `src/synthesis/__tests__/engine.property.test.ts` - Synthesis strategy properties
- `src/synthesis/iterative-consensus/__tests__/synthesizer.property.test.ts` - Iterative consensus properties
- `src/embedding/__tests__/service.property.test.ts` - Embedding service properties

**Properties Tested:**
- Consensus threshold enforcement
- Negotiation round progression
- Similarity calculation symmetry
- Early termination correctness
- Fallback invocation conditions
- Deadlock detection accuracy
- Agreement transitivity
- And more...

**Run:**
```bash
npm test -- --testPathPattern="property.test.ts$"
```

### 3. Integration Tests

Test complete workflows with real database and Redis connections.

**Location:** `src/__tests__/integration/*.integration.test.ts`

**Examples:**
- `src/__tests__/integration/iterative-consensus.integration.test.ts` - Iterative consensus end-to-end tests
- `src/__tests__/metrics-tracking.integration.test.ts` - Metrics tracking integration tests

**Requirements:**
- PostgreSQL test database (port 5433)
- Redis (port 6379)

**Run:**
```bash
# Start test infrastructure
docker compose --profile test up -d postgres-test redis

# Run integration tests
npm test -- --testPathPattern="integration.test.ts$"
```

---

## Test Coverage

### Current Coverage

**Iterative Consensus Feature:**
- ✅ 13/13 Property tests passing (100%)
- ✅ 9/9 Integration tests passing (100%)
- ✅ All core components unit tested

**Overall System:**
- Unit tests: ~85% coverage
- Property tests: 100+ properties validated
- Integration tests: Full end-to-end flows

### View Coverage Report

```bash
npm test -- --coverage
```

Coverage report will be generated in `coverage/lcov-report/index.html`

---

## Test Configuration

### Environment Variables

Tests automatically use test-specific environment variables when available:

```bash
# Test Database (automatically used by integration tests)
TEST_DATABASE_HOST=localhost
TEST_DATABASE_PORT=5433
TEST_DATABASE_NAME=ai_council_test
TEST_DATABASE_USER=postgres
TEST_DATABASE_PASSWORD=postgres

# Redis (shared with development)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

# Property Test Configuration
PROPERTY_TEST_RUNS=100  # Number of iterations per property test
```

### Jest Configuration

See `jest.config.js` for test configuration:
- Test match patterns
- Coverage thresholds
- Test environment setup
- Timeout settings

---

## Troubleshooting

### Integration Tests Fail with "relation does not exist"

**Problem:** Database tables don't exist in test database.

**Solution:**
```bash
# Recreate test database with schema
docker compose --profile test down -v
docker compose --profile test up -d postgres-test

# Wait for database to initialize (check logs)
docker compose logs postgres-test

# Run tests
npm test -- src/__tests__/integration/
```

### Tests Hang or Timeout

**Problem:** Database or Redis not accessible.

**Solution:**
```bash
# Check services are running
docker compose ps

# Check test database specifically
docker compose --profile test ps

# Start missing services
docker compose --profile test up -d

# Check connectivity
telnet localhost 5433  # Test database
telnet localhost 6379  # Redis
```

### Port Already in Use

**Problem:** Port 5433 (test database) is already in use.

**Solution:**
```bash
# Option 1: Stop conflicting service
lsof -i :5433  # Find process using port
kill <PID>     # Stop the process

# Option 2: Change test database port
export TEST_DATABASE_PORT=5434
# Update docker-compose.yml TEST_DATABASE_PORT accordingly
```

### Property Tests Failing Intermittently

**Problem:** Property tests are statistical and may occasionally fail.

**Solution:**
```bash
# Increase number of iterations for more confidence
export PROPERTY_TEST_RUNS=1000

# Run specific property test multiple times
for i in {1..10}; do npm test -- -t "Property 1: Consensus Threshold"; done
```

### Mock Providers Not Working

**Problem:** Tests using real API keys instead of mocks.

**Solution:**
```bash
# Enable mock providers for testing
export USE_MOCK_PROVIDERS=true

# Or unset API keys for test environment
unset OPENAI_API_KEY
unset ANTHROPIC_API_KEY
unset GOOGLE_API_KEY
```

---

## Continuous Integration

### GitHub Actions

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Manual workflow dispatch

**Workflow:** `.github/workflows/test.yml`

### Local CI Simulation

Run the full CI test suite locally:

```bash
# Start all test infrastructure
docker compose --profile test up -d

# Run linting
npm run lint

# Run type checking
npm run type-check

# Run all tests
npm test -- --coverage

# Cleanup
docker compose --profile test down
```

---

## Best Practices

### Writing Tests

1. **Use descriptive test names:**
   ```typescript
   test("should achieve consensus when members converge", async () => {
     // Test implementation
   });
   ```

2. **Use property-based tests for invariants:**
   ```typescript
   fc.assert(
     fc.asyncProperty(arbitraryInput, async (input) => {
       const result = await systemUnderTest(input);
       expect(result).toSatisfyProperty();
     }),
     { numRuns: 100 }
   );
   ```

3. **Clean up resources in tests:**
   ```typescript
   afterEach(async () => {
     await pool.query("DELETE FROM test_data WHERE id LIKE 'test-%'");
   });
   ```

4. **Use test isolation:**
   - Each test should be independent
   - Use unique IDs (prefixed with 'test-')
   - Clean up after each test

### Running Tests During Development

```bash
# Watch mode for rapid feedback
npm test -- --watch --testPathPattern="your-feature"

# Run only changed tests
npm test -- --onlyChanged

# Debug specific test
node --inspect-brk node_modules/.bin/jest --runInBand -t "your test name"
```

---

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [fast-check Documentation](https://github.com/dubzzz/fast-check)
- [Testing Library](https://testing-library.com/docs/)
- [PostgreSQL Testing Best Practices](https://www.postgresql.org/docs/current/regress.html)

---

## Support

If you encounter issues not covered in this guide:

1. Check existing GitHub issues
2. Review test logs: `npm test -- --verbose`
3. Check Docker logs: `docker compose logs postgres-test`
4. Open a new issue with:
   - Test output
   - Environment details
   - Steps to reproduce
