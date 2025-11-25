/**
 * Example usage of the User Interface
 *
 * This demonstrates how to start the UI server alongside the API Gateway
 */

import { Pool } from 'pg';
import { createClient } from 'redis';
import { UserInterface } from './interface';
import { ConfigurationManager } from '../config/manager';
import { APIGateway } from '../api/gateway';
import { OrchestrationEngine } from '../orchestration/engine';
import { SessionManager } from '../session/manager';
import { EventLogger } from '../logging/logger';
import { ProviderPool } from '../providers/pool';
import { SynthesisEngine } from '../synthesis/engine';

async function startServers() {
  // Initialize database connection
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'ai_council',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });

  // Initialize Redis client
  const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  await redis.connect();

  // Initialize components
  const configManager = new ConfigurationManager(pool, redis as any);
  const sessionManager = new SessionManager(pool, redis as any);
  const eventLogger = new EventLogger(pool);

  // Initialize Provider Pool
  const providerPool = new ProviderPool(undefined, configManager, pool);

  // Initialize Synthesis Engine
  const synthesisEngine = new SynthesisEngine(providerPool, configManager);

  // Initialize Orchestration Engine
  const orchestrationEngine = new OrchestrationEngine(
    providerPool,
    configManager,
    synthesisEngine
  );

  // Start API Gateway on port 3000
  const apiGateway = new APIGateway(
    orchestrationEngine,
    sessionManager,
    eventLogger,
    redis as any,
    pool
  );
  await apiGateway.start(3000);
  console.log('API Gateway started on http://localhost:3000');

  // Start User Interface on port 8080
  const ui = new UserInterface(
    configManager,
    'http://localhost:3000' // API base URL
  );
  await ui.start(8080);
  console.log('User Interface started on http://localhost:8080');
  console.log('Open your browser to http://localhost:8080 to use the AI Council Proxy');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down servers...');
    await ui.stop();
    await apiGateway.stop();
    await redis.disconnect();
    await pool.end();
    process.exit(0);
  });
}

// Run if executed directly
if (require.main === module) {
  startServers().catch((error) => {
    console.error('Failed to start servers:', error);
    process.exit(1);
  });
}

export { startServers };
