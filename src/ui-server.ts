/**
 * UI Server Entry Point
 * Starts the User Interface web server
 */

import { Pool } from 'pg';
import { createClient } from 'redis';
import { UserInterface } from './ui/interface';
import { ConfigurationManager } from './config/manager';

async function startUIServer() {
  console.log('Starting AI Council Proxy UI...');

  // Initialize database connection
  const pool = new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME || 'ai_council_proxy',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres'
  });

  console.log('Connecting to PostgreSQL...');
  try {
    await pool.query('SELECT 1');
    console.log('✓ PostgreSQL connected');
  } catch (error) {
    console.error('Failed to connect to PostgreSQL:', error);
    process.exit(1);
  }

  // Initialize Redis client
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log('Connecting to Redis...');
  const redis = createClient({ url: redisUrl });

  redis.on('error', (err) => {
    console.error('Redis error:', err);
  });

  try {
    await redis.connect();
    console.log('✓ Redis connected');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    process.exit(1);
  }

  // Initialize ConfigurationManager
  const configManager = new ConfigurationManager(pool, redis as any);

  // Get API base URL from environment or default to localhost (for browser access)
  // Note: In Docker, this should be set via API_BASE_URL env var to http://localhost:3000
  // so the browser (running on host) can access the API
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  const uiPort = parseInt(process.env.UI_PORT || '8080');

  // Start User Interface
  const ui = new UserInterface(configManager, apiBaseUrl);

  console.log(`Starting UI server on port ${uiPort}...`);
  await ui.start(uiPort);
  console.log(`✓ UI server running on http://0.0.0.0:${uiPort}`);
  console.log(`✓ API Gateway URL: ${apiBaseUrl}`);

  // Handle graceful shutdown
  const shutdown = async (signal: string, isError: boolean = false) => {
    if (isError) {
      console.error(`\n${signal} received. Shutting down due to error...`);
    } else {
      console.log(`\n${signal} received. Shutting down gracefully...`);
    }
    try {
      await ui.stop();
      console.log('✓ UI server stopped');
      await redis.disconnect();
      console.log('✓ Redis disconnected');
      await pool.end();
      console.log('✓ PostgreSQL disconnected');
      console.log('Shutdown complete');
      process.exit(isError ? 1 : 0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM', false));
  process.on('SIGINT', () => void shutdown('SIGINT', false));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    void shutdown('UNCAUGHT_EXCEPTION', true);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    void shutdown('UNHANDLED_REJECTION', true);
  });
}

// Start the UI server
startUIServer().catch((error) => {
  console.error('Failed to start UI server:', error);
  process.exit(1);
});

