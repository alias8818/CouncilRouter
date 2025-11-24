/**
 * Global setup for Jest tests
 * Runs once before all tests
 */

import { setupTestDatabase } from './setup-database';

export default async function globalSetup(): Promise<void> {
  // Create test database if it doesn't exist
  // This prevents PostgreSQL FATAL errors during test runs
  // Skip if explicitly disabled
  if (process.env.SKIP_DB_SETUP !== 'true') {
    try {
      await setupTestDatabase();
    } catch (error) {
      // Silently fail - PostgreSQL might not be running
      // Tests that need DB will handle their own connection errors
    }
  }
}

