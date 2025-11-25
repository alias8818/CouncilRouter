/**
 * Model Registry Interface
 *
 * Responsible for storing and retrieving model and pricing information
 */

import { EnrichedModel, ModelFilter, PricingHistoryEntry, PricingData } from '../types/core';

export interface IModelRegistry {
    /**
     * Store or update a model in the registry
     *
     * @param model - The enriched model to store
     * @returns Promise resolving when storage is complete
     */
    upsertModel(model: EnrichedModel): Promise<void>;

    /**
     * Get all active models, optionally filtered
     *
     * @param filter - Optional filter criteria
     * @returns Promise resolving to array of enriched models
     */
    getModels(filter?: ModelFilter): Promise<EnrichedModel[]>;

    /**
     * Get a specific model by ID
     *
     * @param modelId - The model ID to retrieve
     * @returns Promise resolving to enriched model or null if not found
     */
    getModel(modelId: string): Promise<EnrichedModel | null>;

    /**
     * Mark a model as deprecated
     *
     * @param modelId - The model ID to deprecate
     * @returns Promise resolving when deprecation is complete
     */
    deprecateModel(modelId: string): Promise<void>;

    /**
     * Get pricing history for a model
     *
     * @param modelId - The model ID to get history for
     * @param startDate - Start of date range
     * @param endDate - End of date range
     * @returns Promise resolving to array of pricing history entries
     */
    getPricingHistory(
        modelId: string,
        startDate: Date,
        endDate: Date
    ): Promise<PricingHistoryEntry[]>;

    /**
     * Detect pricing changes for a model
     * Compares new pricing with current pricing and returns changes
     *
     * @param modelId - The model ID to check for changes
     * @param newPricing - Array of new pricing data to compare
     * @returns Promise resolving to array of detected changes
     */
    detectPricingChanges(
        modelId: string,
        newPricing: PricingData[]
    ): Promise<Array<{ tier: string; oldPricing: PricingData; newPricing: PricingData }>>;

    /**
     * Record a pricing change
     *
     * @param modelId - The model ID with changed pricing
     * @param oldPricing - The previous pricing data
     * @param newPricing - The new pricing data
     * @returns Promise resolving when change is recorded
     */
    recordPricingChange(
        modelId: string,
        oldPricing: PricingData,
        newPricing: PricingData
    ): Promise<void>;

    /**
     * Get pricing for a specific date
     * Uses historical pricing if available, falls back to current pricing
     *
     * @param modelId - The model ID to get pricing for
     * @param date - The date to get pricing for
     * @param tier - The pricing tier (default: 'standard')
     * @returns Promise resolving to pricing data or null if not found
     */
    getPricingForDate(
        modelId: string,
        date: Date,
        tier?: string
    ): Promise<PricingData | null>;

    /**
     * Generate cost report for a date range using historical pricing
     *
     * @param startDate - Start of date range
     * @param endDate - End of date range
     * @param modelIds - Optional array of model IDs to filter by
     * @returns Promise resolving to cost report
     */
    generateCostReport(
        startDate: Date,
        endDate: Date,
        modelIds?: string[]
    ): Promise<{
        totalCost: number;
        byModel: Map<string, { cost: number; inputTokens: number; outputTokens: number }>;
        byTier: Map<string, number>;
        reportDate: Date;
    }>;

    /**
     * Enforce data retention policy
     * Retains pricing history for at least 12 months, archives older data
     *
     * @returns Promise resolving to retention enforcement results
     */
    enforceRetentionPolicy(): Promise<{
        archived: number;
        deleted: number;
    }>;

    /**
     * Get retention policy status
     *
     * @returns Promise resolving to retention status information
     */
    getRetentionStatus(): Promise<{
        totalRecords: number;
        withinRetention: number;
        beyondRetention: number;
        oldestRecord: Date | null;
    }>;
}
