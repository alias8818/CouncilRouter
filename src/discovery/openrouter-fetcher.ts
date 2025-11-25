/**
 * OpenRouter Model Fetcher
 * Fetches all available models from OpenRouter's API
 * Includes pricing, context length, discount, and creation date information
 */

import { logger } from '../utils/logger';

export interface OpenRouterPricing {
  prompt: string;        // Cost per token for prompts (as string, e.g. "0.00001")
  completion: string;    // Cost per token for completions
  image?: string;        // Cost per image (if applicable)
  request?: string;      // Per-request cost (if applicable)
  discount?: number;     // Discount percentage (0-1)
}

export interface OpenRouterModel {
  id: string;                          // e.g., "openai/gpt-4o", "anthropic/claude-3-opus"
  name: string;                        // Display name
  description?: string;
  created?: number;                    // Unix timestamp
  context_length: number;              // Max context window
  pricing: OpenRouterPricing;
  architecture?: {
    tokenizer?: string;
    modality?: string;                 // e.g., "text", "text+image"
    instruct_type?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

/**
 * Classification tiers for models
 */
export type ModelTier = 'flagship' | 'standard' | 'fast' | 'free';

/**
 * Enriched model with computed tier and metadata
 */
export interface EnrichedOpenRouterModel extends OpenRouterModel {
  tier: ModelTier;
  provider: string;           // Extracted provider (e.g., "openai", "anthropic")
  modelName: string;          // Extracted model name (e.g., "gpt-4o", "claude-3-opus")
  promptCostPerMillion: number;
  completionCostPerMillion: number;
  isFree: boolean;
  hasDiscount: boolean;
  tokensPerSecond?: number;   // From Artificial Analysis (if available)
  intelligenceIndex?: number; // From Artificial Analysis (if available)
  codingIndex?: number;       // From Artificial Analysis (if available)
}

export class OpenRouterModelFetcher {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private cache: EnrichedOpenRouterModel[] | null = null;
  private cacheExpiry: Date | null = null;
  private cacheDurationMs = 3600000; // 1 hour

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
  }

  /**
   * Fetch all models from OpenRouter API
   */
  async fetchModels(forceRefresh = false): Promise<EnrichedOpenRouterModel[]> {
    // Return cached data if valid
    if (!forceRefresh && this.cache && this.cacheExpiry && new Date() < this.cacheExpiry) {
      logger.debug(`Returning ${this.cache.length} cached models`, { component: 'openrouter-fetcher' });
      return this.cache;
    }

    try {
      logger.info('Fetching models from OpenRouter API', { component: 'openrouter-fetcher' });

      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as OpenRouterModelsResponse;

      logger.info(`Fetched ${data.data.length} models from OpenRouter`, { component: 'openrouter-fetcher' });

      // Enrich models with computed properties
      const enrichedModels = data.data.map(model => this.enrichModel(model));

      // Update cache
      this.cache = enrichedModels;
      this.cacheExpiry = new Date(Date.now() + this.cacheDurationMs);

      return enrichedModels;
    } catch (error) {
      logger.error('Failed to fetch models', { component: 'openrouter-fetcher' }, error);
      throw error;
    }
  }

  /**
   * Enrich a raw OpenRouter model with computed properties
   */
  private enrichModel(model: OpenRouterModel): EnrichedOpenRouterModel {
    // Parse the model ID to extract provider and model name
    const [provider, ...modelParts] = model.id.split('/');
    const modelName = modelParts.join('/');

    // Parse pricing (OpenRouter returns costs as strings per token)
    const promptCost = parseFloat(model.pricing.prompt) || 0;
    const completionCost = parseFloat(model.pricing.completion) || 0;

    // Convert from per-token to per-million
    const promptCostPerMillion = promptCost * 1000000;
    const completionCostPerMillion = completionCost * 1000000;

    const isFree = promptCostPerMillion === 0 && completionCostPerMillion === 0;
    const hasDiscount = (model.pricing.discount || 0) > 0;

    // Classify tier based on model characteristics
    const tier = this.classifyTier(model, promptCostPerMillion, isFree);

    return {
      ...model,
      tier,
      provider,
      modelName,
      promptCostPerMillion,
      completionCostPerMillion,
      isFree,
      hasDiscount
    };
  }

  /**
   * Classify model into a tier based on pricing and naming
   */
  private classifyTier(
    model: OpenRouterModel,
    promptCostPerMillion: number,
    isFree: boolean
  ): ModelTier {
    if (isFree) {
      return 'free';
    }

    const nameLower = model.id.toLowerCase();

    // Check for mini/fast indicators
    const fastIndicators = ['mini', 'nano', 'flash', 'lite', 'instant', 'turbo', 'haiku', 'small'];
    const isFastModel = fastIndicators.some(indicator => nameLower.includes(indicator));

    if (isFastModel) {
      return 'fast';
    }

    // Check for flagship indicators
    const flagshipIndicators = ['opus', 'pro', 'ultra', 'max', '4o', '5.1', '5-', 'o1', 'o3', 'sonnet-4', '2.5'];
    const isFlagship = flagshipIndicators.some(indicator => nameLower.includes(indicator));

    // High pricing usually indicates flagship
    if (isFlagship || promptCostPerMillion > 5) {
      return 'flagship';
    }

    return 'standard';
  }

  /**
   * Get models filtered by tier
   */
  async getModelsByTier(tier: ModelTier): Promise<EnrichedOpenRouterModel[]> {
    const models = await this.fetchModels();
    return models.filter(m => m.tier === tier);
  }

  /**
   * Get models filtered by provider
   */
  async getModelsByProvider(provider: string): Promise<EnrichedOpenRouterModel[]> {
    const models = await this.fetchModels();
    return models.filter(m => m.provider.toLowerCase() === provider.toLowerCase());
  }

  /**
   * Get all free models
   */
  async getFreeModels(): Promise<EnrichedOpenRouterModel[]> {
    const models = await this.fetchModels();
    return models.filter(m => m.isFree);
  }

  /**
   * Get discounted models
   */
  async getDiscountedModels(): Promise<EnrichedOpenRouterModel[]> {
    const models = await this.fetchModels();
    return models.filter(m => m.hasDiscount);
  }

  /**
   * Get the newest flagship model for a provider
   */
  async getNewestFlagship(provider: string): Promise<EnrichedOpenRouterModel | null> {
    const models = await this.getModelsByProvider(provider);
    const flagships = models.filter(m => m.tier === 'flagship');

    if (flagships.length === 0) {
      return null;
    }

    // Sort by creation date (newest first), then by pricing (higher = newer typically)
    flagships.sort((a, b) => {
      // Prefer models with creation dates
      if (a.created && b.created) {
        return b.created - a.created;
      }
      if (a.created) {return -1;}
      if (b.created) {return 1;}

      // Fall back to pricing as a proxy for capability
      return b.promptCostPerMillion - a.promptCostPerMillion;
    });

    return flagships[0];
  }

  /**
   * Get the fastest model for a provider (mini/flash tier)
   */
  async getFastestModel(provider: string): Promise<EnrichedOpenRouterModel | null> {
    const models = await this.getModelsByProvider(provider);
    const fastModels = models.filter(m => m.tier === 'fast');

    if (fastModels.length === 0) {
      return null;
    }

    // Sort by cost (cheapest first) as a proxy for speed
    fastModels.sort((a, b) => a.promptCostPerMillion - b.promptCostPerMillion);

    return fastModels[0];
  }

  /**
   * Find a model by ID
   */
  async findModel(modelId: string): Promise<EnrichedOpenRouterModel | null> {
    const models = await this.fetchModels();
    return models.find(m => m.id === modelId) || null;
  }

  /**
   * Search models by name or description
   */
  async searchModels(query: string): Promise<EnrichedOpenRouterModel[]> {
    const models = await this.fetchModels();
    const queryLower = query.toLowerCase();

    return models.filter(m =>
      m.id.toLowerCase().includes(queryLower) ||
      m.name.toLowerCase().includes(queryLower) ||
      m.description?.toLowerCase().includes(queryLower)
    );
  }

  /**
   * Get model statistics
   */
  async getStats(): Promise<{
    total: number;
    byTier: Record<ModelTier, number>;
    byProvider: Record<string, number>;
    freeCount: number;
    discountedCount: number;
  }> {
    const models = await this.fetchModels();

    const byTier: Record<ModelTier, number> = {
      flagship: 0,
      standard: 0,
      fast: 0,
      free: 0
    };

    const byProvider: Record<string, number> = {};
    let freeCount = 0;
    let discountedCount = 0;

    for (const model of models) {
      byTier[model.tier]++;
      byProvider[model.provider] = (byProvider[model.provider] || 0) + 1;
      if (model.isFree) {freeCount++;}
      if (model.hasDiscount) {discountedCount++;}
    }

    return {
      total: models.length,
      byTier,
      byProvider,
      freeCount,
      discountedCount
    };
  }
}

/**
 * Factory function to create OpenRouter fetcher
 */
export function createOpenRouterModelFetcher(): OpenRouterModelFetcher {
  return new OpenRouterModelFetcher();
}

