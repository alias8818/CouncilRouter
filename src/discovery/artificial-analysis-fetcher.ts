/**
 * Artificial Analysis API Fetcher
 * Fetches model benchmarks, speed metrics, and intelligence scores
 * API Documentation: https://artificialanalysis.ai/documentation
 * Free tier: 1,000 requests/day
 */

import { logger } from '../utils/logger';

export interface ArtificialAnalysisEvaluations {
  artificial_analysis_intelligence_index?: number;  // Overall intelligence (0-100)
  artificial_analysis_coding_index?: number;        // Coding ability (0-100)
  artificial_analysis_math_index?: number;          // Math ability (0-100)
  mmlu_pro?: number;                                // MMLU-Pro benchmark
  gpqa?: number;                                    // GPQA benchmark
  hle?: number;                                     // HLE benchmark
  livecodebench?: number;                           // Live coding benchmark
  scicode?: number;                                 // Scientific coding
  math_500?: number;                                // Math 500 benchmark
  aime?: number;                                    // AIME math competition
}

export interface ArtificialAnalysisPricing {
  price_1m_blended_3_to_1?: number;   // Blended price (3 input : 1 output)
  price_1m_input_tokens?: number;      // Price per million input tokens
  price_1m_output_tokens?: number;     // Price per million output tokens
}

export interface ArtificialAnalysisModelCreator {
  id: string;
  name: string;
  slug: string;
}

export interface ArtificialAnalysisModel {
  id: string;                                       // Unique identifier
  name: string;                                     // Full model name
  slug: string;                                     // URL-friendly identifier
  model_creator: ArtificialAnalysisModelCreator;
  evaluations: ArtificialAnalysisEvaluations;
  pricing: ArtificialAnalysisPricing;
  median_output_tokens_per_second?: number;         // Output generation speed
  median_time_to_first_token_seconds?: number;      // Latency to first token
  median_time_to_first_answer_token?: number;       // Time to first answer
}

export interface ArtificialAnalysisResponse {
  status: number;
  prompt_options?: {
    parallel_queries: number;
    prompt_length: string;
  };
  data: ArtificialAnalysisModel[];
}

/**
 * Enriched model with normalized scores
 */
export interface EnrichedAAModel extends ArtificialAnalysisModel {
  provider: string;              // Normalized provider name
  normalizedSlug: string;        // Normalized slug for matching
  isFast: boolean;               // High tokens/sec
  isIntelligent: boolean;        // High intelligence index
  isGoodAtCoding: boolean;       // High coding index
  isGoodAtMath: boolean;         // High math index
}

export class ArtificialAnalysisFetcher {
  private apiKey: string;
  private baseUrl = 'https://artificialanalysis.ai/api/v2';
  private cache: EnrichedAAModel[] | null = null;
  private cacheExpiry: Date | null = null;
  private cacheDurationMs = 3600000; // 1 hour (to stay within 1k/day limit)

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ARTIFICIAL_ANALYSIS_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('No API key provided. Some features may be limited.', { component: 'artificial-analysis-fetcher' });
    }
  }

  /**
   * Fetch all LLM models from Artificial Analysis API
   */
  async fetchModels(forceRefresh = false): Promise<EnrichedAAModel[]> {
    // Return cached data if valid
    if (!forceRefresh && this.cache && this.cacheExpiry && new Date() < this.cacheExpiry) {
      logger.debug(`Returning ${this.cache.length} cached models`, { component: 'artificial-analysis-fetcher' });
      return this.cache;
    }

    if (!this.apiKey) {
      logger.warn('No API key - returning empty array', { component: 'artificial-analysis-fetcher' });
      return [];
    }

    try {
      logger.info('Fetching models from Artificial Analysis API', { component: 'artificial-analysis-fetcher' });

      const response = await fetch(`${this.baseUrl}/data/llms/models`, {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 429) {
          logger.warn('Rate limited - returning cached or empty data', { component: 'artificial-analysis-fetcher' });
          return this.cache || [];
        }
        throw new Error(`Artificial Analysis API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as ArtificialAnalysisResponse;

      logger.info(`Fetched ${data.data.length} models from Artificial Analysis`, { component: 'artificial-analysis-fetcher' });

      // Enrich models with computed properties
      const enrichedModels = data.data.map(model => this.enrichModel(model));

      // Update cache
      this.cache = enrichedModels;
      this.cacheExpiry = new Date(Date.now() + this.cacheDurationMs);

      return enrichedModels;
    } catch (error) {
      logger.error('Failed to fetch models', { component: 'artificial-analysis-fetcher' }, error);
      // Return cached data if available on error
      if (this.cache) {
        logger.info('Returning cached data after error', { component: 'artificial-analysis-fetcher' });
        return this.cache;
      }
      throw error;
    }
  }

  /**
   * Enrich a model with computed properties
   */
  private enrichModel(model: ArtificialAnalysisModel): EnrichedAAModel {
    const provider = model.model_creator.slug.toLowerCase();
    const normalizedSlug = this.normalizeSlug(model.slug);

    // Determine capabilities based on scores
    const isFast = (model.median_output_tokens_per_second || 0) > 100;
    const isIntelligent = (model.evaluations.artificial_analysis_intelligence_index || 0) > 60;
    const isGoodAtCoding = (model.evaluations.artificial_analysis_coding_index || 0) > 50;
    const isGoodAtMath = (model.evaluations.artificial_analysis_math_index || 0) > 50;

    return {
      ...model,
      provider,
      normalizedSlug,
      isFast,
      isIntelligent,
      isGoodAtCoding,
      isGoodAtMath
    };
  }

  /**
   * Normalize slug for matching with OpenRouter model IDs
   */
  private normalizeSlug(slug: string): string {
    return slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Try to match an OpenRouter model ID to an Artificial Analysis model
   */
  async matchModel(openRouterModelId: string): Promise<EnrichedAAModel | null> {
    const models = await this.fetchModels();

    // Extract model name from OpenRouter ID (e.g., "openai/gpt-4o" -> "gpt-4o")
    const [, modelName] = openRouterModelId.split('/');
    if (!modelName) {return null;}

    const normalizedName = this.normalizeSlug(modelName);

    // Try exact match first
    let match = models.find(m => m.normalizedSlug === normalizedName);
    if (match) {return match;}

    // Try partial match
    match = models.find(m =>
      m.normalizedSlug.includes(normalizedName) ||
      normalizedName.includes(m.normalizedSlug)
    );
    if (match) {return match;}

    // Try matching by name
    const nameLower = modelName.toLowerCase();
    match = models.find(m =>
      m.name.toLowerCase().includes(nameLower) ||
      nameLower.includes(m.slug.toLowerCase())
    );

    return match || null;
  }

  /**
   * Get models sorted by intelligence index
   */
  async getMostIntelligent(limit = 10): Promise<EnrichedAAModel[]> {
    const models = await this.fetchModels();
    return models
      .filter(m => m.evaluations.artificial_analysis_intelligence_index !== undefined)
      .sort((a, b) =>
        (b.evaluations.artificial_analysis_intelligence_index || 0) -
        (a.evaluations.artificial_analysis_intelligence_index || 0)
      )
      .slice(0, limit);
  }

  /**
   * Get models sorted by coding ability
   */
  async getBestForCoding(limit = 10): Promise<EnrichedAAModel[]> {
    const models = await this.fetchModels();
    return models
      .filter(m => m.evaluations.artificial_analysis_coding_index !== undefined)
      .sort((a, b) =>
        (b.evaluations.artificial_analysis_coding_index || 0) -
        (a.evaluations.artificial_analysis_coding_index || 0)
      )
      .slice(0, limit);
  }

  /**
   * Get models sorted by math ability
   */
  async getBestForMath(limit = 10): Promise<EnrichedAAModel[]> {
    const models = await this.fetchModels();
    return models
      .filter(m => m.evaluations.artificial_analysis_math_index !== undefined)
      .sort((a, b) =>
        (b.evaluations.artificial_analysis_math_index || 0) -
        (a.evaluations.artificial_analysis_math_index || 0)
      )
      .slice(0, limit);
  }

  /**
   * Get fastest models (highest tokens per second)
   */
  async getFastest(limit = 10): Promise<EnrichedAAModel[]> {
    const models = await this.fetchModels();
    return models
      .filter(m => m.median_output_tokens_per_second !== undefined)
      .sort((a, b) =>
        (b.median_output_tokens_per_second || 0) -
        (a.median_output_tokens_per_second || 0)
      )
      .slice(0, limit);
  }

  /**
   * Get models with lowest latency (time to first token)
   */
  async getLowestLatency(limit = 10): Promise<EnrichedAAModel[]> {
    const models = await this.fetchModels();
    return models
      .filter(m => m.median_time_to_first_token_seconds !== undefined)
      .sort((a, b) =>
        (a.median_time_to_first_token_seconds || 999) -
        (b.median_time_to_first_token_seconds || 999)
      )
      .slice(0, limit);
  }

  /**
   * Get models by provider
   */
  async getByProvider(provider: string): Promise<EnrichedAAModel[]> {
    const models = await this.fetchModels();
    const providerLower = provider.toLowerCase();
    return models.filter(m => m.provider === providerLower);
  }

  /**
   * Get statistics about available models
   */
  async getStats(): Promise<{
    total: number;
    byProvider: Record<string, number>;
    withIntelligenceScore: number;
    withCodingScore: number;
    withSpeedMetrics: number;
    averageIntelligence: number;
    averageSpeed: number;
  }> {
    const models = await this.fetchModels();

    const byProvider: Record<string, number> = {};
    let withIntelligenceScore = 0;
    let withCodingScore = 0;
    let withSpeedMetrics = 0;
    let totalIntelligence = 0;
    let totalSpeed = 0;
    let intelligenceCount = 0;
    let speedCount = 0;

    for (const model of models) {
      byProvider[model.provider] = (byProvider[model.provider] || 0) + 1;

      if (model.evaluations.artificial_analysis_intelligence_index !== undefined) {
        withIntelligenceScore++;
        totalIntelligence += model.evaluations.artificial_analysis_intelligence_index;
        intelligenceCount++;
      }

      if (model.evaluations.artificial_analysis_coding_index !== undefined) {
        withCodingScore++;
      }

      if (model.median_output_tokens_per_second !== undefined) {
        withSpeedMetrics++;
        totalSpeed += model.median_output_tokens_per_second;
        speedCount++;
      }
    }

    return {
      total: models.length,
      byProvider,
      withIntelligenceScore,
      withCodingScore,
      withSpeedMetrics,
      averageIntelligence: intelligenceCount > 0 ? totalIntelligence / intelligenceCount : 0,
      averageSpeed: speedCount > 0 ? totalSpeed / speedCount : 0
    };
  }
}

/**
 * Factory function to create Artificial Analysis fetcher
 */
export function createArtificialAnalysisFetcher(): ArtificialAnalysisFetcher {
  return new ArtificialAnalysisFetcher();
}

