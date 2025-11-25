/**
 * Model Enrichment Engine Interface
 *
 * Responsible for combining discovered models with pricing data and inferring classifications
 */

import { DiscoveredModel, EnrichedModel, PricingData, ModelClassification } from '../types/core';

export interface IModelEnrichmentEngine {
    /**
     * Enrich discovered models with pricing and classification
     *
     * @param models - Array of discovered models from API
     * @param pricing - Array of pricing data from scraping
     * @returns Promise resolving to array of enriched models
     */
    enrichModels(
        models: DiscoveredModel[],
        pricing: PricingData[]
    ): Promise<EnrichedModel[]>;

    /**
     * Classify a model based on its ID and capabilities
     *
     * @param model - The discovered model to classify
     * @returns Array of classification tags
     */
    classifyModel(model: DiscoveredModel): ModelClassification[];

    /**
     * Match scraped pricing to API models using fuzzy matching
     *
     * @param modelId - The model ID from the API
     * @param pricingData - Array of pricing data from scraping
     * @returns Matched pricing data or null if no match found
     */
    matchPricing(
        modelId: string,
        pricingData: PricingData[]
    ): PricingData | null;
}
