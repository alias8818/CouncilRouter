/**
 * Production Server Entry Point
 * Starts the AI Council Proxy API Gateway
 */

import { Pool } from 'pg';
import { createClient } from 'redis';
import { APIGateway } from './api/gateway';
import { OrchestrationEngine } from './orchestration/engine';
import { SessionManager } from './session/manager';
import { EventLogger } from './logging/logger';
import { ProviderPool } from './providers/pool';
import { SynthesisEngine } from './synthesis/engine';
import { ConfigurationManager } from './config/manager';

async function startServer() {
  console.log('Starting AI Council Proxy...');

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

  // Initialize components
  console.log('Initializing components...');
  const configManager = new ConfigurationManager(pool, redis as any);
  const sessionManager = new SessionManager(pool, redis as any);
  const eventLogger = new EventLogger(pool);
  const providerPool = new ProviderPool();
  const synthesisEngine = new SynthesisEngine(providerPool, configManager);
  const orchestrationEngine = new OrchestrationEngine(
    providerPool,
    configManager,
    synthesisEngine
  );

  // Start API Gateway
  const port = parseInt(process.env.API_PORT || '3000');
  const apiGateway = new APIGateway(
    orchestrationEngine,
    sessionManager,
    eventLogger,
    redis as any,
    pool,
    process.env.JWT_SECRET
  );

  console.log(`Starting API Gateway on port ${port}...`);
  await apiGateway.start(port);
  console.log(`✓ API Gateway running on http://0.0.0.0:${port}`);
  console.log('✓ AI Council Proxy is ready!');
  console.log(`\nHealth check: http://localhost:${port}/health`);

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    try {
      await apiGateway.stop();
      console.log('✓ API Gateway stopped');
      await redis.disconnect();
      console.log('✓ Redis disconnected');
      await pool.end();
      console.log('✓ PostgreSQL disconnected');
      console.log('Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    void shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    void shutdown('UNHANDLED_REJECTION');
  });
}

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
