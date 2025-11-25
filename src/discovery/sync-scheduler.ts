/**
 * Sync Scheduler Implementation
 *
 * Orchestrates model discovery, pricing scraping, enrichment, and storage
 */

import { Pool } from 'pg';
import * as cron from 'node-cron';
import { ISyncScheduler } from '../interfaces/ISyncScheduler';
import { IModelDiscoveryService } from '../interfaces/IModelDiscoveryService';
import { IPricingScraper } from '../interfaces/IPricingScraper';
import { IModelEnrichmentEngine } from '../interfaces/IModelEnrichmentEngine';
import { IModelRegistry } from '../interfaces/IModelRegistry';
import { IEscalationService } from '../interfaces/IEscalationService';
import {
  SyncResult,
  SyncStatus,
  SyncError,
  ProviderType,
  DiscoveredModel,
  PricingData
} from '../types/core';

export class SyncScheduler implements ISyncScheduler {
  private db: Pool;
  private discoveryService: IModelDiscoveryService;
  private pricingScraper: IPricingScraper;
  private enrichmentEngine: IModelEnrichmentEngine;
  private registry: IModelRegistry;
  private escalationService?: IEscalationService;
  private isRunning: boolean = false;
  private cronJob: cron.ScheduledTask | null = null;
  private cronSchedule: string;
  private consecutiveFailures: Map<ProviderType, number> = new Map();
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in ms

  constructor(
    db: Pool,
    discoveryService: IModelDiscoveryService,
    pricingScraper: IPricingScraper,
    enrichmentEngine: IModelEnrichmentEngine,
    registry: IModelRegistry,
    escalationService?: IEscalationService,
    cronSchedule?: string
  ) {
    this.db = db;
    this.discoveryService = discoveryService;
    this.pricingScraper = pricingScraper;
    this.enrichmentEngine = enrichmentEngine;
    this.registry = registry;
    this.escalationService = escalationService;
    // Default to daily at 2 AM if not specified
    this.cronSchedule =
      cronSchedule || process.env.SYNC_SCHEDULE_CRON || '0 2 * * *';
  }

  /**
   * Start the sync scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[SyncScheduler] Scheduler is already running');
      return;
    }

    console.log(
      `[SyncScheduler] Starting sync scheduler with schedule: ${this.cronSchedule}`
    );
    this.isRunning = true;

    // Validate cron schedule
    if (!cron.validate(this.cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${this.cronSchedule}`);
    }

    // Create cron job
    this.cronJob = cron.schedule(this.cronSchedule, async () => {
      console.log('[SyncScheduler] Cron job triggered');
      try {
        await this.triggerSync();
      } catch (error) {
        console.error('[SyncScheduler] Cron job failed:', error);
      }
    });

    // Update next sync time in database
    await this.updateNextSyncTime();

    console.log('[SyncScheduler] Scheduler started successfully');
  }

  /**
   * Stop the sync scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[SyncScheduler] Scheduler is not running');
      return;
    }

    console.log('[SyncScheduler] Stopping sync scheduler');
    this.isRunning = false;

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    console.log('[SyncScheduler] Scheduler stopped successfully');
  }

  /**
   * Manually trigger a sync job
   */
  async triggerSync(): Promise<SyncResult> {
    console.log('[SyncScheduler] Starting manual sync job');

    const result: SyncResult = {
      success: true,
      timestamp: new Date(),
      modelsDiscovered: 0,
      modelsUpdated: 0,
      modelsDeprecated: 0,
      pricingUpdated: 0,
      errors: []
    };

    // Track per-provider statistics
    const providerStats = new Map<
      ProviderType,
      {
        modelsDiscovered: number;
        modelsUpdated: number;
        pricingUpdated: number;
      }
    >();

    try {
      // Update sync status to running
      await this.updateSyncStatus('running');

      // Step 1: Discover models from all providers
      console.log(
        '[SyncScheduler] Step 1: Discovering models from all providers'
      );
      const discoveredModels = await this.discoveryService.fetchAllModels();

      // Track all discovered model IDs per provider
      const allDiscoveredIds = new Map<ProviderType, Set<string>>();

      // Step 2: Scrape pricing from all providers
      console.log(
        '[SyncScheduler] Step 2: Scraping pricing from all providers'
      );
      const providers: ProviderType[] = [
        'openai',
        'anthropic',
        'google',
        'xai'
      ];

      for (const provider of providers) {
        try {
          const models = discoveredModels.get(provider) || [];
          const modelIds = new Set(models.map((m) => m.id));
          allDiscoveredIds.set(provider, modelIds);

          if (models.length === 0) {
            console.warn(
              `[SyncScheduler] No models discovered for ${provider}`
            );
            result.errors.push({
              provider,
              stage: 'discovery',
              error: 'No models discovered'
            });
            this.trackProviderFailure(provider);
            continue;
          }

          result.modelsDiscovered += models.length;

          // Initialize provider stats
          providerStats.set(provider, {
            modelsDiscovered: models.length,
            modelsUpdated: 0,
            pricingUpdated: 0
          });

          // Scrape pricing for this provider with retry logic
          let pricing: PricingData[] = [];
          try {
            pricing = await this.scrapePricingWithRetry(provider);
            console.log(
              `[SyncScheduler] Scraped ${pricing.length} pricing entries for ${provider}`
            );
            this.resetProviderFailures(provider);
          } catch (error) {
            console.error(
              `[SyncScheduler] Failed to scrape pricing for ${provider} after retries:`,
              error
            );
            result.errors.push({
              provider,
              stage: 'pricing',
              error: error instanceof Error ? error.message : String(error)
            });
            this.trackProviderFailure(provider);
            // Continue with empty pricing - enrichment will mark as TBD
          }

          // Step 3: Enrich models with pricing and classification
          console.log(
            `[SyncScheduler] Step 3: Enriching ${models.length} models for ${provider}`
          );
          let enrichedModels;
          try {
            enrichedModels = await this.enrichmentEngine.enrichModels(
              models,
              pricing
            );
          } catch (error) {
            console.error(
              `[SyncScheduler] Failed to enrich models for ${provider}:`,
              error
            );
            result.errors.push({
              provider,
              stage: 'enrichment',
              error: error instanceof Error ? error.message : String(error)
            });
            this.trackProviderFailure(provider);
            continue;
          }

          // Step 4: Store enriched models in registry
          console.log(
            `[SyncScheduler] Step 4: Storing ${enrichedModels.length} models for ${provider}`
          );
          for (const model of enrichedModels) {
            try {
              await this.registry.upsertModel(model);
              result.modelsUpdated++;

              // Update provider stats
              const stats = providerStats.get(provider);
              if (stats) {
                stats.modelsUpdated++;
              }

              // Check if pricing was updated (not TBD)
              if (model.pricing.length > 0 && model.pricing[0].tier !== 'TBD') {
                result.pricingUpdated++;
                if (stats) {
                  stats.pricingUpdated++;
                }
              }
            } catch (error) {
              console.error(
                `[SyncScheduler] Failed to store model ${model.id}:`,
                error
              );
              result.errors.push({
                provider,
                stage: 'storage',
                error: `Failed to store ${model.id}: ${error instanceof Error ? error.message : String(error)}`
              });
            }
          }
        } catch (error) {
          console.error(
            `[SyncScheduler] Error processing provider ${provider}:`,
            error
          );
          result.errors.push({
            provider,
            stage: 'discovery',
            error: error instanceof Error ? error.message : String(error)
          });
          this.trackProviderFailure(provider);
        }
      }

      // Step 5: Mark deprecated models
      console.log('[SyncScheduler] Step 5: Checking for deprecated models');
      result.modelsDeprecated =
        await this.markDeprecatedModels(allDiscoveredIds);

      // Update sync status
      result.success = result.errors.length === 0;
      await this.updateSyncStatus(result.success ? 'idle' : 'failed', result);

      // Update last sync timestamp for each provider with per-provider stats
      for (const provider of providers) {
        const stats = providerStats.get(provider);
        await this.updateProviderSyncTimestamp(provider, result, stats);
      }

      console.log('[SyncScheduler] Sync job completed:', {
        success: result.success,
        modelsDiscovered: result.modelsDiscovered,
        modelsUpdated: result.modelsUpdated,
        modelsDeprecated: result.modelsDeprecated,
        pricingUpdated: result.pricingUpdated,
        errors: result.errors.length
      });

      return result;
    } catch (error) {
      console.error(
        '[SyncScheduler] Sync job failed with unexpected error:',
        error
      );
      result.success = false;
      result.errors.push({
        provider: 'openai', // Default provider for general errors
        stage: 'discovery',
        error: error instanceof Error ? error.message : String(error)
      });

      await this.updateSyncStatus('failed', result);
      return result;
    }
  }

  /**
   * Get the status of the last sync
   */
  async getLastSyncStatus(): Promise<SyncStatus> {
    try {
      // Get the most recent sync status from any provider
      const result = await this.db.query(
        `SELECT last_sync, next_sync, status,
                        models_discovered, models_updated, models_deprecated,
                        pricing_updated, errors
                 FROM sync_status
                 ORDER BY updated_at DESC
                 LIMIT 1`
      );

      if (result.rows.length === 0) {
        return {
          lastSync: null,
          nextSync: null,
          status: 'idle',
          lastResult: null
        };
      }

      const row = result.rows[0];
      const lastResult: SyncResult | null = row.last_sync
        ? {
          success: row.status !== 'failed',
          timestamp: row.last_sync,
          modelsDiscovered: row.models_discovered || 0,
          modelsUpdated: row.models_updated || 0,
          modelsDeprecated: row.models_deprecated || 0,
          pricingUpdated: row.pricing_updated || 0,
          errors: row.errors || []
        }
        : null;

      return {
        lastSync: row.last_sync,
        nextSync: row.next_sync,
        status: row.status,
        lastResult
      };
    } catch (error) {
      console.error('[SyncScheduler] Failed to get last sync status:', error);
      return {
        lastSync: null,
        nextSync: null,
        status: 'idle',
        lastResult: null
      };
    }
  }

  /**
   * Update sync status in database
   */
  private async updateSyncStatus(
    status: 'idle' | 'running' | 'failed',
    result?: SyncResult
  ): Promise<void> {
    try {
      // Update a general sync status record
      await this.db.query(
        `INSERT INTO sync_status (
                    provider, status, last_sync, models_discovered,
                    models_updated, models_deprecated, pricing_updated, errors
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (provider) DO UPDATE SET
                    status = EXCLUDED.status,
                    last_sync = EXCLUDED.last_sync,
                    models_discovered = EXCLUDED.models_discovered,
                    models_updated = EXCLUDED.models_updated,
                    models_deprecated = EXCLUDED.models_deprecated,
                    pricing_updated = EXCLUDED.pricing_updated,
                    errors = EXCLUDED.errors,
                    updated_at = NOW()`,
        [
          'all', // Use 'all' as a special provider for overall status
          status,
          result ? result.timestamp : null,
          result?.modelsDiscovered || 0,
          result?.modelsUpdated || 0,
          result?.modelsDeprecated || 0,
          result?.pricingUpdated || 0,
          result ? JSON.stringify(result.errors) : null
        ]
      );
    } catch (error) {
      console.error('[SyncScheduler] Failed to update sync status:', error);
    }
  }

  /**
   * Update provider-specific sync timestamp
   */
  private async updateProviderSyncTimestamp(
    provider: ProviderType,
    result: SyncResult,
    stats?: {
      modelsDiscovered: number;
      modelsUpdated: number;
      pricingUpdated: number;
    }
  ): Promise<void> {
    try {
      const providerErrors = result.errors.filter(
        (e) => e.provider === provider
      );
      const providerStatus = providerErrors.length > 0 ? 'failed' : 'idle';

      await this.db.query(
        `INSERT INTO sync_status (
                    provider, status, last_sync, models_discovered,
                    models_updated, pricing_updated, errors, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (provider) DO UPDATE SET
                    status = EXCLUDED.status,
                    last_sync = EXCLUDED.last_sync,
                    models_discovered = EXCLUDED.models_discovered,
                    models_updated = EXCLUDED.models_updated,
                    pricing_updated = EXCLUDED.pricing_updated,
                    errors = EXCLUDED.errors,
                    updated_at = NOW()`,
        [
          provider,
          providerStatus,
          result.timestamp,
          stats?.modelsDiscovered || 0,
          stats?.modelsUpdated || 0,
          stats?.pricingUpdated || 0,
          JSON.stringify(providerErrors)
        ]
      );
    } catch (error) {
      console.error(
        `[SyncScheduler] Failed to update sync timestamp for ${provider}:`,
        error
      );
    }
  }

  /**
   * Mark models as deprecated if they're no longer returned by the API
   */
  private async markDeprecatedModels(
    discoveredIds: Map<ProviderType, Set<string>>
  ): Promise<number> {
    let deprecatedCount = 0;

    for (const [provider, ids] of discoveredIds.entries()) {
      try {
        // Get all active models for this provider from the database
        const result = await this.db.query(
          `SELECT id FROM models
                     WHERE provider = $1 AND usability != 'deprecated'`,
          [provider]
        );

        // Find models that are in the database but not in the discovered set
        for (const row of result.rows) {
          if (!ids.has(row.id)) {
            console.log(
              `[SyncScheduler] Marking model as deprecated: ${row.id}`
            );
            await this.registry.deprecateModel(row.id);
            deprecatedCount++;
          }
        }
      } catch (error) {
        console.error(
          `[SyncScheduler] Failed to check deprecated models for ${provider}:`,
          error
        );
      }
    }

    return deprecatedCount;
  }

  /**
   * Calculate and update the next sync time based on cron schedule
   */
  private async updateNextSyncTime(): Promise<void> {
    try {
      // Parse cron expression to calculate next run time
      // This is a simplified calculation - for production, use a proper cron parser
      const nextSync = this.calculateNextCronTime(this.cronSchedule);

      await this.db.query(
        `INSERT INTO sync_status (provider, status, next_sync, updated_at)
                 VALUES ('all', 'idle', $1, NOW())
                 ON CONFLICT (provider) DO UPDATE SET
                     next_sync = EXCLUDED.next_sync,
                     updated_at = NOW()`,
        [nextSync]
      );
    } catch (error) {
      console.error('[SyncScheduler] Failed to update next sync time:', error);
    }
  }

  /**
   * Calculate the next execution time for a cron schedule
   * This is a simplified implementation - for production use a proper cron parser
   */
  private calculateNextCronTime(schedule: string): Date {
    // For now, return a time 24 hours from now
    // In production, use a library like cron-parser to properly calculate this
    const next = new Date();
    next.setHours(next.getHours() + 24);
    return next;
  }

  /**
   * Scrape pricing with exponential backoff retry logic
   */
  private async scrapePricingWithRetry(
    provider: ProviderType
  ): Promise<PricingData[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.RETRY_DELAYS.length; attempt++) {
      try {
        return await this.pricingScraper.scrapePricing(provider);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(
          `[SyncScheduler] Pricing scraping attempt ${attempt + 1} failed for ${provider}:`,
          lastError.message
        );

        // Wait before retrying (except on last attempt)
        if (attempt < this.RETRY_DELAYS.length - 1) {
          await this.delay(this.RETRY_DELAYS[attempt]);
        }
      }
    }

    // All retries failed
    throw lastError || new Error('Pricing scraping failed after all retries');
  }

  /**
   * Track provider failure and send alerts if threshold exceeded
   */
  private trackProviderFailure(provider: ProviderType): void {
    const currentFailures = this.consecutiveFailures.get(provider) || 0;
    const newFailures = currentFailures + 1;
    this.consecutiveFailures.set(provider, newFailures);

    console.log(
      `[SyncScheduler] Provider ${provider} consecutive failures: ${newFailures}`
    );

    // Send alert if threshold exceeded
    if (newFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      this.sendAdministratorAlert(
        provider,
        `Provider ${provider} has failed ${newFailures} consecutive times`
      );
    }
  }

  /**
   * Reset provider failure count on success
   */
  private resetProviderFailures(provider: ProviderType): void {
    const previousFailures = this.consecutiveFailures.get(provider) || 0;
    if (previousFailures > 0) {
      console.log(
        `[SyncScheduler] Provider ${provider} recovered after ${previousFailures} failures`
      );
      this.consecutiveFailures.set(provider, 0);
    }
  }

  /**
   * Send administrator alert for sync failures
   */
  private async sendAdministratorAlert(
    provider: ProviderType,
    message: string
  ): Promise<void> {
    console.error(`[SyncScheduler] ALERT: ${message}`);

    // Log to database
    try {
      await this.db.query(
        `INSERT INTO sync_alerts (provider, message, created_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT DO NOTHING`,
        [provider, message]
      );
    } catch (error) {
      console.error('[SyncScheduler] Failed to log alert to database:', error);
    }

    // Send escalation if service is available
    if (this.escalationService) {
      try {
        await this.escalationService.queueEscalation(
          `sync-${provider}-${Date.now()}`,
          `Model sync failure: ${message}`
        );
      } catch (error) {
        console.error('[SyncScheduler] Failed to queue escalation:', error);
      }
    }
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
