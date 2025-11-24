/**
 * Database setup for tests
 * Creates the test database if it doesn't exist
 */

import { Pool } from 'pg';

/**
 * Create test database if it doesn't exist
 * This prevents PostgreSQL FATAL errors during test runs
 */
export async function setupTestDatabase(): Promise<void> {
  // Parse DATABASE_URL if provided, otherwise use defaults
  let connectionConfig: any;
  
  if (process.env.DATABASE_URL) {
    // Parse connection string
    const url = new URL(process.env.DATABASE_URL);
    connectionConfig = {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      user: url.username || 'postgres',
      password: url.password || 'postgres',
      database: 'postgres' // Connect to default database to create test DB
    };
  } else {
    connectionConfig = {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      database: 'postgres' // Connect to default database
    };
  }

  const adminPool = new Pool(connectionConfig);

  try {
    // Check if test database exists
    const result = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'test'"
    );

    if (result.rows.length === 0) {
      // Create test database
      await adminPool.query('CREATE DATABASE test');
    }

    // Connect to test database to create tool_usage table if it doesn't exist
    // This prevents PostgreSQL errors during tests
    const testPool = new Pool({
      ...connectionConfig,
      database: 'test'
    });

    try {
      // Check if tool_usage table exists
      const tableCheck = await testPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'tool_usage'
        )
      `);

      if (!tableCheck.rows[0]?.exists) {
        // Create tool_usage table to prevent errors during test cleanup
        await testPool.query(`
          CREATE TABLE IF NOT EXISTS tool_usage (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            request_id UUID,
            council_member_id VARCHAR(255) NOT NULL,
            round_number INTEGER NOT NULL,
            tool_name VARCHAR(255) NOT NULL,
            parameters JSONB NOT NULL,
            result JSONB NOT NULL,
            success BOOLEAN NOT NULL,
            latency_ms INTEGER NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
      }
    } catch (tableError: any) {
      // Silently fail - table creation is optional
      // Tests will handle missing tables gracefully
    } finally {
      await testPool.end();
    }
  } catch (error: any) {
    // Silently fail - PostgreSQL might not be running or accessible
    // Tests that need DB will handle their own connection errors
    // Error codes:
    // 42P04 = database already exists (okay)
    // 28P01 = authentication failed (tests will handle)
    // ECONNREFUSED = PostgreSQL not running (tests will handle)
    if (error.code === '42P04') {
      // Database already exists - this is fine
      return;
    }
    // For other errors, silently fail - tests will handle connection errors
  } finally {
    await adminPool.end();
  }
}

