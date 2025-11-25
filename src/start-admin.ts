#!/usr/bin/env node
/**
 * Admin Dashboard Startup Script
 * Starts the admin web interface on a separate port from the API
 */

import { Pool } from 'pg';
import { createClient } from 'redis';
import { AdminServer } from './dashboard/admin-server';
import { Dashboard } from './dashboard/dashboard';
import { ConfigurationManager } from './config/manager';
import { AnalyticsEngine } from './analytics/engine';
import { ProviderPool } from './providers/pool';
import { ModelRegistry } from './discovery/registry';
import { SyncScheduler } from './discovery/sync-scheduler';
import { ModelDiscoveryService } from './discovery/service';
import { PricingScraperService } from './discovery/pricing-service';
import { ModelEnrichmentEngine } from './discovery/enrichment-engine';

async function startAdminDashboard() {
  console.log('Starting AI Council Proxy Admin Dashboard...');

  // Database connection
  const dbPool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/ai_council_proxy'
  });

  // Redis connection
  const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  await redis.connect();
  console.log('Connected to Redis');

  // Initialize core components
  const configManager = new ConfigurationManager(dbPool, redis as any);
  const analyticsEngine = new AnalyticsEngine(dbPool, redis as any);
  const providerPool = new ProviderPool(undefined, configManager, dbPool);

  // Initialize model discovery and sync components
  const modelRegistry = new ModelRegistry(dbPool, redis as any);

  const modelDiscoveryService = new ModelDiscoveryService(dbPool, {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    xai: process.env.XAI_API_KEY
  });

  const pricingScraper = new PricingScraperService(redis as any, dbPool);
  const enrichmentEngine = new ModelEnrichmentEngine();

  const syncScheduler = new SyncScheduler(
    dbPool,
    modelDiscoveryService,
    pricingScraper,
    enrichmentEngine,
    modelRegistry,
    undefined, // No escalation service for now
    process.env.SYNC_SCHEDULE_CRON
  );

  // Start the sync scheduler (runs on cron schedule)
  await syncScheduler.start();
  console.log('Sync Scheduler started');

  const dashboard = new Dashboard(
    dbPool,
    analyticsEngine,
    providerPool,
    undefined,
    configManager
  );

  // Create admin server with all dependencies
  const adminServer = new AdminServer(
    dashboard,
    configManager,
    dbPool,
    redis as any,
    modelRegistry,
    syncScheduler
  );

  // Start on port 3001 (API runs on 3000)
  const port = parseInt(process.env.ADMIN_PORT || '3001');
  await adminServer.start(port);

  console.log('\n✅ Admin Dashboard is running!');
  console.log(`   URL: http://localhost:${port}`);
  console.log('\nPress Ctrl+C to stop\n');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await syncScheduler.stop();
    await adminServer.stop();
    await redis.quit();
    await dbPool.end();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await syncScheduler.stop();
    await adminServer.stop();
    await redis.quit();
    await dbPool.end();
    process.exit(0);
  });
}

// Start the admin dashboard
startAdminDashboard().catch((error) => {
  console.error('Failed to start admin dashboard:', error);
  process.exit(1);
});
