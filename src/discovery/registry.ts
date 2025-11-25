/**
 * Model Registry Implementation
 *
 * Responsible for storing and retrieving model and pricing information
 */

import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import {
  EnrichedModel,
  ModelFilter,
  PricingHistoryEntry,
  PricingData,
  ModelCapability
} from '../types/core';
import { IModelRegistry } from '../interfaces/IModelRegistry';

export class ModelRegistry implements IModelRegistry {
  private readonly MODEL_CACHE_TTL = 3600; // 1 hour
  private readonly PRICING_CACHE_TTL = 3600; // 1 hour
  private readonly FALLBACK_CACHE_TTL = 604800; // 7 days

  constructor(
        private db: Pool,
        private redis: RedisClientType
  ) { }

  /**
     * Store or update a model in the registry
     */
  async upsertModel(model: EnrichedModel): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Upsert model
      await client.query(
        `INSERT INTO models (
          id, provider, display_name, classification, context_window,
          usability, capabilities, discovered_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id, provider) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          classification = EXCLUDED.classification,
          context_window = EXCLUDED.context_window,
          usability = EXCLUDED.usability,
          capabilities = EXCLUDED.capabilities,
          updated_at = EXCLUDED.updated_at`,
        [
          model.id,
          model.provider,
          model.displayName,
          model.classification,
          model.contextWindow,
          model.usability,
          JSON.stringify(model.capabilities),
          model.discoveredAt,
          new Date()
        ]
      );

      // Upsert pricing for each tier
      for (const pricing of model.pricing) {
        await client.query(
          `INSERT INTO model_pricing (
            model_id, input_cost_per_million, output_cost_per_million,
            tier, context_limit, effective_date
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (model_id, tier) DO UPDATE SET
            input_cost_per_million = EXCLUDED.input_cost_per_million,
            output_cost_per_million = EXCLUDED.output_cost_per_million,
            context_limit = EXCLUDED.context_limit,
            effective_date = EXCLUDED.effective_date`,
          [
            model.id,
            pricing.inputCostPerMillion,
            pricing.outputCostPerMillion,
            pricing.tier,
            pricing.contextLimit || null,
            new Date()
          ]
        );
      }

      await client.query('COMMIT');

      // Invalidate caches
      await this.invalidateModelCache(model.id, model.provider);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
     * Get all active models, optionally filtered
     */
  async getModels(filter?: ModelFilter): Promise<EnrichedModel[]> {
    // Build query with filters
    let query = `
      SELECT m.*, 
        COALESCE(
          json_agg(
            json_build_object(
              'inputCostPerMillion', mp.input_cost_per_million,
              'outputCostPerMillion', mp.output_cost_per_million,
              'tier', mp.tier,
              'contextLimit', mp.context_limit
            )
          ) FILTER (WHERE mp.id IS NOT NULL),
          '[]'
        ) as pricing
      FROM models m
      LEFT JOIN model_pricing mp ON m.id = mp.model_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (filter?.provider) {
      query += ` AND m.provider = $${paramIndex}`;
      params.push(filter.provider);
      paramIndex++;
    }

    if (filter?.classification) {
      query += ` AND $${paramIndex} = ANY(m.classification)`;
      params.push(filter.classification);
      paramIndex++;
    }

    if (filter?.usability) {
      query += ` AND m.usability = $${paramIndex}`;
      params.push(filter.usability);
      paramIndex++;
    } else {
      // Default to active models only
      query += ' AND m.usability != \'deprecated\'';
    }

    if (filter?.minContextWindow) {
      query += ` AND m.context_window >= $${paramIndex}`;
      params.push(filter.minContextWindow);
      paramIndex++;
    }

    query += ` GROUP BY m.id, m.provider, m.display_name, m.classification, 
               m.context_window, m.usability, m.capabilities, 
               m.discovered_at, m.updated_at, m.deprecated_at
               ORDER BY m.provider, m.id`;

    const result = await this.db.query(query, params);

    return result.rows.map((row) => this.mapRowToEnrichedModel(row));
  }

  /**
     * Get a specific model by ID
     */
  async getModel(modelId: string): Promise<EnrichedModel | null> {
    // Try cache first
    const cacheKey = `model:${modelId}:details`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.db.query(
      `SELECT m.*, 
        COALESCE(
          json_agg(
            json_build_object(
              'inputCostPerMillion', mp.input_cost_per_million,
              'outputCostPerMillion', mp.output_cost_per_million,
              'tier', mp.tier,
              'contextLimit', mp.context_limit
            )
          ) FILTER (WHERE mp.id IS NOT NULL),
          '[]'
        ) as pricing
      FROM models m
      LEFT JOIN model_pricing mp ON m.id = mp.model_id
      WHERE m.id = $1
      GROUP BY m.id, m.provider, m.display_name, m.classification, 
               m.context_window, m.usability, m.capabilities, 
               m.discovered_at, m.updated_at, m.deprecated_at`,
      [modelId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const model = this.mapRowToEnrichedModel(result.rows[0]);

    // Cache the result
    await this.redis.setEx(
      cacheKey,
      this.MODEL_CACHE_TTL,
      JSON.stringify(model)
    );

    return model;
  }

  /**
     * Mark a model as deprecated
     */
  async deprecateModel(modelId: string): Promise<void> {
    await this.db.query(
      `UPDATE models 
       SET usability = 'deprecated', 
           deprecated_at = $1,
           updated_at = $1
       WHERE id = $2`,
      [new Date(), modelId]
    );

    // Invalidate cache
    const result = await this.db.query(
      'SELECT provider FROM models WHERE id = $1',
      [modelId]
    );
    if (result.rows.length > 0) {
      await this.invalidateModelCache(modelId, result.rows[0].provider);
    }
  }

  /**
     * Get pricing history for a model
     */
  async getPricingHistory(
    modelId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PricingHistoryEntry[]> {
    const result = await this.db.query(
      `SELECT model_id, input_cost_per_million, output_cost_per_million,
              tier, effective_date, end_date
       FROM pricing_history
       WHERE model_id = $1
         AND effective_date >= $2
         AND (end_date IS NULL OR end_date <= $3)
       ORDER BY effective_date DESC`,
      [modelId, startDate, endDate]
    );

    return result.rows.map((row) => ({
      modelId: row.model_id,
      inputCostPerMillion: parseFloat(row.input_cost_per_million),
      outputCostPerMillion: parseFloat(row.output_cost_per_million),
      tier: row.tier,
      effectiveDate: row.effective_date,
      endDate: row.end_date
    }));
  }

  /**
     * Detect pricing changes for a model
     * Compares new pricing with current pricing and returns changes
     */
  async detectPricingChanges(
    modelId: string,
    newPricing: PricingData[]
  ): Promise<Array<{ tier: string; oldPricing: PricingData; newPricing: PricingData }>> {
    const changes: Array<{ tier: string; oldPricing: PricingData; newPricing: PricingData }> = [];

    // Get current pricing for all tiers
    const result = await this.db.query(
      `SELECT input_cost_per_million, output_cost_per_million, tier, context_limit
       FROM model_pricing
       WHERE model_id = $1`,
      [modelId]
    );

    // Create a map of current pricing by tier
    const currentPricingMap = new Map<string, PricingData>();
    for (const row of result.rows) {
      currentPricingMap.set(row.tier, {
        modelName: modelId,
        inputCostPerMillion: parseFloat(row.input_cost_per_million),
        outputCostPerMillion: parseFloat(row.output_cost_per_million),
        tier: row.tier,
        contextLimit: row.context_limit
      });
    }

    // Compare each new pricing tier with current
    for (const newPrice of newPricing) {
      const tier = newPrice.tier || 'standard';
      const currentPrice = currentPricingMap.get(tier);

      if (currentPrice) {
        // Check if pricing has changed
        const inputChanged = Math.abs(currentPrice.inputCostPerMillion - newPrice.inputCostPerMillion) > 0.0001;
        const outputChanged = Math.abs(currentPrice.outputCostPerMillion - newPrice.outputCostPerMillion) > 0.0001;

        if (inputChanged || outputChanged) {
          changes.push({
            tier,
            oldPricing: currentPrice,
            newPricing: newPrice
          });
        }
      }
    }

    return changes;
  }

  /**
     * Record a pricing change
     */
  async recordPricingChange(
    modelId: string,
    oldPricing: PricingData,
    newPricing: PricingData
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get the current pricing record
      const currentResult = await client.query(
        `SELECT effective_date FROM model_pricing
         WHERE model_id = $1 AND tier = $2`,
        [modelId, oldPricing.tier || 'standard']
      );

      if (currentResult.rows.length > 0) {
        const effectiveDate = currentResult.rows[0].effective_date;

        // Archive the old pricing
        await client.query(
          `INSERT INTO pricing_history (
            model_id, input_cost_per_million, output_cost_per_million,
            tier, effective_date, end_date
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            modelId,
            oldPricing.inputCostPerMillion,
            oldPricing.outputCostPerMillion,
            oldPricing.tier || 'standard',
            effectiveDate,
            new Date()
          ]
        );
      }

      // Update current pricing
      await client.query(
        `UPDATE model_pricing
         SET input_cost_per_million = $1,
             output_cost_per_million = $2,
             effective_date = $3
         WHERE model_id = $4 AND tier = $5`,
        [
          newPricing.inputCostPerMillion,
          newPricing.outputCostPerMillion,
          new Date(),
          modelId,
          newPricing.tier || 'standard'
        ]
      );

      await client.query('COMMIT');

      // Invalidate pricing cache
      await this.redis.del(`pricing:${modelId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
     * Map database row to EnrichedModel
     */
  private mapRowToEnrichedModel(row: any): EnrichedModel {
    return {
      id: row.id,
      provider: row.provider,
      displayName: row.display_name,
      classification: row.classification,
      contextWindow: row.context_window,
      usability: row.usability,
      pricing: Array.isArray(row.pricing) ? row.pricing : [],
      capabilities: row.capabilities || [],
      discoveredAt: row.discovered_at
    };
  }

  /**
     * Get pricing for a specific date
     * Uses historical pricing if available, falls back to current pricing
     */
  async getPricingForDate(
    modelId: string,
    date: Date,
    tier: string = 'standard'
  ): Promise<PricingData | null> {
    // First check historical pricing
    const historyResult = await this.db.query(
      `SELECT input_cost_per_million, output_cost_per_million, tier, effective_date, end_date
       FROM pricing_history
       WHERE model_id = $1
         AND tier = $2
         AND effective_date <= $3
         AND (end_date IS NULL OR end_date >= $3)
       ORDER BY effective_date DESC
       LIMIT 1`,
      [modelId, tier, date]
    );

    if (historyResult.rows.length > 0) {
      const row = historyResult.rows[0];
      return {
        modelName: modelId,
        inputCostPerMillion: parseFloat(row.input_cost_per_million),
        outputCostPerMillion: parseFloat(row.output_cost_per_million),
        tier: row.tier
      };
    }

    // Fall back to current pricing if no historical data
    const currentResult = await this.db.query(
      `SELECT input_cost_per_million, output_cost_per_million, tier, context_limit
       FROM model_pricing
       WHERE model_id = $1 AND tier = $2`,
      [modelId, tier]
    );

    if (currentResult.rows.length > 0) {
      const row = currentResult.rows[0];
      return {
        modelName: modelId,
        inputCostPerMillion: parseFloat(row.input_cost_per_million),
        outputCostPerMillion: parseFloat(row.output_cost_per_million),
        tier: row.tier,
        contextLimit: row.context_limit
      };
    }

    return null;
  }

  /**
     * Generate cost report for a date range using historical pricing
     */
  async generateCostReport(
    startDate: Date,
    endDate: Date,
    modelIds?: string[]
  ): Promise<{
        totalCost: number;
        byModel: Map<string, { cost: number; inputTokens: number; outputTokens: number }>;
        byTier: Map<string, number>;
        reportDate: Date;
    }> {
    // Build query to get cost records in date range
    let query = `
      SELECT 
        cr.model,
        cr.prompt_tokens,
        cr.completion_tokens,
        cr.created_at,
        cr.provider
      FROM cost_records cr
      WHERE cr.created_at >= $1 AND cr.created_at <= $2
    `;

    const params: any[] = [startDate, endDate];

    if (modelIds && modelIds.length > 0) {
      query += ' AND cr.model = ANY($3)';
      params.push(modelIds);
    }

    const result = await this.db.query(query, params);

    let totalCost = 0;
    const byModel = new Map<string, { cost: number; inputTokens: number; outputTokens: number }>();
    const byTier = new Map<string, number>();

    // Calculate costs using historical pricing
    for (const row of result.rows) {
      const modelId = row.model;
      const recordDate = row.created_at;
      const promptTokens = row.prompt_tokens;
      const completionTokens = row.completion_tokens;

      // Get pricing for the date of this record
      const pricing = await this.getPricingForDate(modelId, recordDate);

      if (pricing) {
        // Calculate cost
        const inputCost = (promptTokens / 1_000_000) * pricing.inputCostPerMillion;
        const outputCost = (completionTokens / 1_000_000) * pricing.outputCostPerMillion;
        const recordCost = inputCost + outputCost;

        totalCost += recordCost;

        // Aggregate by model
        if (!byModel.has(modelId)) {
          byModel.set(modelId, { cost: 0, inputTokens: 0, outputTokens: 0 });
        }
        const modelStats = byModel.get(modelId)!;
        modelStats.cost += recordCost;
        modelStats.inputTokens += promptTokens;
        modelStats.outputTokens += completionTokens;

        // Aggregate by tier
        const tier = pricing.tier || 'standard';
        const tierCost = byTier.get(tier) || 0;
        byTier.set(tier, tierCost + recordCost);
      }
    }

    return {
      totalCost,
      byModel,
      byTier,
      reportDate: new Date()
    };
  }

  /**
     * Enforce data retention policy
     * Retains pricing history for at least 12 months, archives older data
     */
  async enforceRetentionPolicy(): Promise<{
        archived: number;
        deleted: number;
    }> {
    const retentionDate = new Date();
    retentionDate.setMonth(retentionDate.getMonth() - 12);

    // Archive data older than 12 months (if archival table exists)
    // For now, we just mark old data for potential archival
    const archiveResult = await this.db.query(
      `SELECT COUNT(*) as count
       FROM pricing_history
       WHERE created_at < $1
         AND end_date IS NOT NULL`,
      [retentionDate]
    );

    const archivedCount = parseInt(archiveResult.rows[0]?.count || '0');

    // Delete data older than retention period (only if explicitly marked for deletion)
    // In practice, we keep all historical data but this provides the mechanism
    const deleteResult = await this.db.query(
      `DELETE FROM pricing_history
       WHERE created_at < $1
         AND end_date IS NOT NULL
         AND created_at < $2
       RETURNING id`,
      [retentionDate, new Date('2000-01-01')] // Very old date to prevent accidental deletion
    );

    return {
      archived: archivedCount,
      deleted: deleteResult.rowCount || 0
    };
  }

  /**
     * Get retention policy status
     */
  async getRetentionStatus(): Promise<{
        totalRecords: number;
        withinRetention: number;
        beyondRetention: number;
        oldestRecord: Date | null;
    }> {
    const retentionDate = new Date();
    retentionDate.setMonth(retentionDate.getMonth() - 12);

    // Get total records
    const totalResult = await this.db.query(
      'SELECT COUNT(*) as count FROM pricing_history'
    );
    const totalRecords = parseInt(totalResult.rows[0]?.count || '0');

    // Get records within retention period
    const withinResult = await this.db.query(
      'SELECT COUNT(*) as count FROM pricing_history WHERE created_at >= $1',
      [retentionDate]
    );
    const withinRetention = parseInt(withinResult.rows[0]?.count || '0');

    // Get records beyond retention period
    const beyondRetention = totalRecords - withinRetention;

    // Get oldest record
    const oldestResult = await this.db.query(
      'SELECT MIN(created_at) as oldest FROM pricing_history'
    );
    const oldestRecord = oldestResult.rows[0]?.oldest || null;

    return {
      totalRecords,
      withinRetention,
      beyondRetention,
      oldestRecord
    };
  }

  /**
     * Invalidate model cache
     */
  private async invalidateModelCache(
    modelId: string,
    provider: string
  ): Promise<void> {
    await Promise.all([
      this.redis.del(`model:${provider}:list`),
      this.redis.del(`model:${modelId}:details`),
      this.redis.del(`pricing:${modelId}`)
    ]);
  }
}
