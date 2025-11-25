/**
 * Model Enrichment Engine
 *
 * Combines discovered models with pricing data and infers classifications
 */

import {
  DiscoveredModel,
  EnrichedModel,
  PricingData,
  ModelClassification,
  ModelCapability,
  ModelUsability
} from '../types/core';
import { IModelEnrichmentEngine } from '../interfaces/IModelEnrichmentEngine';

export class ModelEnrichmentEngine implements IModelEnrichmentEngine {
  /**
     * Calculate Levenshtein distance between two strings
     *
     * @param str1 - First string
     * @param str2 - Second string
     * @returns The edit distance between the strings
     */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create a 2D array for dynamic programming
    const dp: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize base cases
    for (let i = 0; i <= len1; i++) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      dp[0][j] = j;
    }

    // Fill the dp table
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,     // deletion
            dp[i][j - 1] + 1,     // insertion
            dp[i - 1][j - 1] + 1  // substitution
          );
        }
      }
    }

    return dp[len1][len2];
  }

  /**
     * Normalize a model name for comparison
     * Handles common variations (hyphens, underscores, case differences)
     *
     * @param name - The model name to normalize
     * @returns Normalized model name
     */
  private normalizeModelName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[-_\s]/g, '') // Remove hyphens, underscores, and spaces
      .trim();
  }

  /**
     * Calculate similarity percentage between two strings
     *
     * @param str1 - First string
     * @param str2 - Second string
     * @returns Similarity percentage (0-1)
     */
  private calculateSimilarity(str1: string, str2: string): number {
    const normalized1 = this.normalizeModelName(str1);
    const normalized2 = this.normalizeModelName(str2);

    const distance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);

    if (maxLength === 0) {
      return 1.0; // Both strings are empty
    }

    return 1 - distance / maxLength;
  }

  /**
     * Match scraped pricing to API models using fuzzy matching
     * Uses 80% similarity threshold
     *
     * @param modelId - The model ID from the API
     * @param pricingData - Array of pricing data from scraping
     * @returns Matched pricing data or null if no match found
     */
  matchPricing(modelId: string, pricingData: PricingData[]): PricingData | null {
    const SIMILARITY_THRESHOLD = 0.8;

    let bestMatch: PricingData | null = null;
    let bestSimilarity = 0;

    for (const pricing of pricingData) {
      const similarity = this.calculateSimilarity(modelId, pricing.modelName);

      if (similarity >= SIMILARITY_THRESHOLD && similarity > bestSimilarity) {
        bestMatch = pricing;
        bestSimilarity = similarity;
      }
    }

    return bestMatch;
  }

  /**
     * Classify a model based on its ID and capabilities
     *
     * @param model - The discovered model to classify
     * @returns Array of classification tags
     */
  classifyModel(model: DiscoveredModel): ModelClassification[] {
    const classifications: ModelClassification[] = [];
    const modelIdLower = model.id.toLowerCase();

    // Pattern-based classification
    if (modelIdLower.includes('gpt') || modelIdLower.includes('chat')) {
      classifications.push('chat');
    }

    if (modelIdLower.includes('o1') || modelIdLower.includes('o3') || modelIdLower.includes('reasoning')) {
      classifications.push('reasoning');
    }

    if (modelIdLower.includes('code') || modelIdLower.includes('codex')) {
      classifications.push('coding');
    }

    if (modelIdLower.includes('vision') || modelIdLower.includes('multimodal') || modelIdLower.includes('gemini')) {
      classifications.push('multimodal');
    }

    if (modelIdLower.includes('embedding') || modelIdLower.includes('embed')) {
      classifications.push('embedding');
    }

    // Capability-based classification
    if (model.capabilities) {
      for (const capability of model.capabilities) {
        if (!capability.supported) {continue;}

        switch (capability.type) {
          case 'chat':
            if (!classifications.includes('chat')) {
              classifications.push('chat');
            }
            break;
          case 'embedding':
            if (!classifications.includes('embedding')) {
              classifications.push('embedding');
            }
            break;
          case 'vision':
            if (!classifications.includes('multimodal')) {
              classifications.push('multimodal');
            }
            break;
          case 'function_calling':
          case 'tools':
            if (!classifications.includes('tools')) {
              classifications.push('tools');
            }
            break;
        }
      }
    }

    // Default to "general" if no classifications found
    if (classifications.length === 0) {
      classifications.push('general');
    }

    return classifications;
  }

  /**
     * Enrich discovered models with pricing and classification
     *
     * @param models - Array of discovered models from API
     * @param pricing - Array of pricing data from scraping
     * @returns Promise resolving to array of enriched models
     */
  async enrichModels(
    models: DiscoveredModel[],
    pricing: PricingData[]
  ): Promise<EnrichedModel[]> {
    const enrichedModels: EnrichedModel[] = [];

    for (const model of models) {
      // Match pricing data
      const matchedPricing = this.matchPricing(model.id, pricing);

      // Classify the model
      const classification = this.classifyModel(model);

      // Determine usability
      const usability: ModelUsability = model.deprecated
        ? 'deprecated'
        : 'available';

      // Build pricing array
      const pricingArray = matchedPricing
        ? [
          {
            inputCostPerMillion: matchedPricing.inputCostPerMillion,
            outputCostPerMillion: matchedPricing.outputCostPerMillion,
            tier: matchedPricing.tier || 'standard'
          }
        ]
        : [
          {
            inputCostPerMillion: 0,
            outputCostPerMillion: 0,
            tier: 'TBD'
          }
        ];

      // Log warning if pricing not found
      if (!matchedPricing) {
        console.warn(
          `[ModelEnrichmentEngine] No pricing found for model: ${model.id} (provider: ${model.provider})`
        );
      }

      // Create enriched model
      const enrichedModel: EnrichedModel = {
        id: model.id,
        provider: model.provider,
        displayName: model.displayName || model.id,
        classification,
        contextWindow: model.contextWindow || 0,
        usability,
        pricing: pricingArray,
        capabilities: model.capabilities || [],
        discoveredAt: new Date()
      };

      enrichedModels.push(enrichedModel);
    }

    return enrichedModels;
  }
}

