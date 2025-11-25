/**
 * Dynamic Model Resolver
 *
 * Resolves model requirements (provider + tier) to actual available models
 * at runtime using OpenRouter model data and Artificial Analysis benchmarks.
 */

import { Pool } from 'pg';
import { CouncilMember } from '../types/core';
import {
  OpenRouterModelFetcher,
  EnrichedOpenRouterModel,
  ModelTier as OpenRouterTier
} from '../discovery/openrouter-fetcher';
import {
  ArtificialAnalysisFetcher,
  EnrichedAAModel
} from '../discovery/artificial-analysis-fetcher';
import { logger } from '../utils/logger';

/**
 * Model tier classification
 * - flagship: Top-tier models (highest capability, highest cost)
 * - standard: Balanced models (good capability, moderate cost)
 * - fast: Fast/cheap models (lower capability, lower cost)
 * - free: Zero-cost models
 */
export type ModelTier = 'flagship' | 'standard' | 'fast' | 'free';

/**
 * Provider group - more generic than specific providers
 */
export type ProviderGroup = 'GPT' | 'Claude' | 'Gemini' | 'Grok' | 'Llama' | 'Mistral' | 'Other';

/**
 * Model requirement specification for presets
 * Instead of hardcoding model IDs, presets specify what they need
 */
export interface ModelRequirement {
  group: ProviderGroup;
  tier: ModelTier;
  /** Optional: Explicit fallback model IDs to try if tier resolution fails */
  fallbacks?: string[];
  /** Optional: Prefer models with specific capabilities */
  preferCapabilities?: ('coding' | 'math' | 'speed' | 'intelligence')[];
}

/**
 * Resolved model with metadata
 */
export interface ResolvedModel {
  id: string;                    // OpenRouter model ID (e.g., "openai/gpt-4o")
  provider: string;              // Provider name (e.g., "openai")
  displayName: string;           // Human-readable name
  tier: ModelTier;               // Resolved tier
  contextLength: number;         // Max context window
  promptCostPerMillion: number;  // Cost per million prompt tokens
  completionCostPerMillion: number;
  // Benchmark data (if available)
  intelligenceIndex?: number;
  codingIndex?: number;
  mathIndex?: number;
  tokensPerSecond?: number;
}

/**
 * Provider group mapping patterns
 */
const PROVIDER_GROUP_PATTERNS: Record<ProviderGroup, RegExp[]> = {
  GPT: [/^openai\//i],
  Claude: [/^anthropic\//i],
  Gemini: [/^google\//i],
  Grok: [/^x-ai\//i, /^xai\//i],
  Llama: [/^meta-llama\//i, /llama/i],
  Mistral: [/^mistralai\//i, /mistral/i],
  Other: [/.*/]  // Catch-all
};

/**
 * Default tier fallback order
 */
const TIER_FALLBACK: Record<ModelTier, ModelTier[]> = {
  flagship: ['standard', 'fast', 'free'],
  standard: ['flagship', 'fast', 'free'],
  fast: ['standard', 'flagship', 'free'],
  free: ['fast', 'standard', 'flagship']
};

export class ModelResolver {
  private db: Pool;
  private openRouterFetcher: OpenRouterModelFetcher;
  private artificialAnalysisFetcher: ArtificialAnalysisFetcher;
  private modelCache: Map<string, ResolvedModel[]> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 300000; // 5 minute cache

  constructor(db: Pool) {
    this.db = db;
    this.openRouterFetcher = new OpenRouterModelFetcher();
    this.artificialAnalysisFetcher = new ArtificialAnalysisFetcher();
  }

  /**
   * Classify a model into a provider group
   */
  private classifyProviderGroup(modelId: string): ProviderGroup {
    for (const [group, patterns] of Object.entries(PROVIDER_GROUP_PATTERNS)) {
      if (group === 'Other') {continue;} // Skip catch-all
      for (const pattern of patterns) {
        if (pattern.test(modelId)) {
          return group as ProviderGroup;
        }
      }
    }
    return 'Other';
  }

  /**
   * Map OpenRouter tier to our tier
   */
  private mapTier(openRouterTier: OpenRouterTier): ModelTier {
    switch (openRouterTier) {
      case 'flagship': return 'flagship';
      case 'standard': return 'standard';
      case 'fast': return 'fast';
      case 'free': return 'free';
      default: return 'standard';
    }
  }

  /**
   * Refresh the model cache from OpenRouter and Artificial Analysis
   */
  private async refreshCache(): Promise<void> {
    const now = Date.now();
    if (now < this.cacheExpiry && this.modelCache.size > 0) {
      return; // Cache still valid
    }

    try {
      logger.info('Refreshing model cache from OpenRouter', { component: 'model-resolver' });

      // Fetch models from OpenRouter
      const openRouterModels = await this.openRouterFetcher.fetchModels();

      // Fetch benchmark data from Artificial Analysis (optional enhancement)
      let aaModels: EnrichedAAModel[] = [];
      try {
        aaModels = await this.artificialAnalysisFetcher.fetchModels();
        logger.info(`Loaded ${aaModels.length} benchmark models from Artificial Analysis`, { component: 'model-resolver' });
      } catch (error) {
        logger.warn('Could not fetch Artificial Analysis data, proceeding without benchmarks', { component: 'model-resolver' });
      }

      // Build cache by group + tier
      this.modelCache.clear();

      for (const model of openRouterModels) {
        const group = this.classifyProviderGroup(model.id);
        const tier = this.mapTier(model.tier);

        // Try to find benchmark data for this model
        const aaMatch = await this.artificialAnalysisFetcher.matchModel(model.id);

        const resolved: ResolvedModel = {
          id: model.id,
          provider: model.provider,
          displayName: model.name,
          tier,
          contextLength: model.context_length,
          promptCostPerMillion: model.promptCostPerMillion,
          completionCostPerMillion: model.completionCostPerMillion,
          intelligenceIndex: aaMatch?.evaluations.artificial_analysis_intelligence_index,
          codingIndex: aaMatch?.evaluations.artificial_analysis_coding_index,
          mathIndex: aaMatch?.evaluations.artificial_analysis_math_index,
          tokensPerSecond: aaMatch?.median_output_tokens_per_second
        };

        const key = `${group}:${tier}`;
        const existing = this.modelCache.get(key) || [];
        existing.push(resolved);
        this.modelCache.set(key, existing);
      }

      // Sort each group's models by intelligence/pricing (best first)
      for (const [key, models] of this.modelCache) {
        models.sort((a, b) => {
          // Prefer models with higher intelligence scores
          const aScore = a.intelligenceIndex || 0;
          const bScore = b.intelligenceIndex || 0;
          if (aScore !== bScore) {
            return bScore - aScore;
          }
          // Fall back to newer creation date (higher pricing as proxy)
          return b.promptCostPerMillion - a.promptCostPerMillion;
        });
        this.modelCache.set(key, models);
      }

      this.cacheExpiry = now + this.CACHE_TTL_MS;
      logger.info(`Cache refreshed: ${openRouterModels.length} models in ${this.modelCache.size} groups`, { component: 'model-resolver' });
    } catch (error) {
      logger.error('Failed to refresh cache', { component: 'model-resolver' }, error);
      throw error;
    }
  }

  /**
   * Resolve a model requirement to the best available model
   */
  async resolveModel(requirement: ModelRequirement): Promise<ResolvedModel | null> {
    await this.refreshCache();

    const { group, tier, fallbacks, preferCapabilities } = requirement;

    // Try primary tier
    const primaryKey = `${group}:${tier}`;
    let candidates = this.modelCache.get(primaryKey) || [];

    // Apply capability preferences if specified
    if (candidates.length > 0 && preferCapabilities?.length) {
      candidates = this.sortByCapabilities(candidates, preferCapabilities);
    }

    if (candidates.length > 0) {
      logger.debug(`Resolved ${group}/${tier} -> ${candidates[0].id}`, { component: 'model-resolver' });
      return candidates[0];
    }

    // Try explicit fallbacks
    if (fallbacks?.length) {
      for (const fallbackId of fallbacks) {
        const fallbackModel = await this.findModelById(fallbackId);
        if (fallbackModel) {
          logger.debug(`Fallback ${group}/${tier} -> ${fallbackId}`, { component: 'model-resolver' });
          return fallbackModel;
        }
      }
    }

    // Try default tier fallbacks
    const tierFallbacks = TIER_FALLBACK[tier];
    for (const fallbackTier of tierFallbacks) {
      const key = `${group}:${fallbackTier}`;
      const fallbackModels = this.modelCache.get(key);
      if (fallbackModels && fallbackModels.length > 0) {
        logger.debug(`Auto-fallback ${group}/${tier} -> ${fallbackModels[0].id} (tier: ${fallbackTier})`, { component: 'model-resolver' });
        return fallbackModels[0];
      }
    }

    logger.warn(`No models available for ${group}/${tier}`, { component: 'model-resolver' });
    return null;
  }

  /**
   * Sort models by capability preferences
   */
  private sortByCapabilities(
    models: ResolvedModel[],
    preferences: ('coding' | 'math' | 'speed' | 'intelligence')[]
  ): ResolvedModel[] {
    return [...models].sort((a, b) => {
      for (const pref of preferences) {
        let aScore = 0, bScore = 0;
        switch (pref) {
          case 'coding':
            aScore = a.codingIndex || 0;
            bScore = b.codingIndex || 0;
            break;
          case 'math':
            aScore = a.mathIndex || 0;
            bScore = b.mathIndex || 0;
            break;
          case 'speed':
            aScore = a.tokensPerSecond || 0;
            bScore = b.tokensPerSecond || 0;
            break;
          case 'intelligence':
            aScore = a.intelligenceIndex || 0;
            bScore = b.intelligenceIndex || 0;
            break;
        }
        if (aScore !== bScore) {
          return bScore - aScore;
        }
      }
      return 0;
    });
  }

  /**
   * Find a specific model by ID
   */
  private async findModelById(modelId: string): Promise<ResolvedModel | null> {
    await this.refreshCache();

    for (const models of this.modelCache.values()) {
      const found = models.find(m => m.id === modelId);
      if (found) {return found;}
    }

    return null;
  }

  /**
   * Resolve multiple model requirements
   */
  async resolveModels(requirements: ModelRequirement[]): Promise<(ResolvedModel | null)[]> {
    await this.refreshCache();
    return Promise.all(requirements.map(req => this.resolveModel(req)));
  }

  /**
   * Get all free models
   */
  async getFreeModels(): Promise<ResolvedModel[]> {
    await this.refreshCache();
    const freeModels: ResolvedModel[] = [];

    for (const [key, models] of this.modelCache) {
      if (key.endsWith(':free')) {
        freeModels.push(...models);
      }
    }

    return freeModels;
  }

  /**
   * Get all models for a provider group
   */
  async getModelsForGroup(group: ProviderGroup): Promise<Record<ModelTier, ResolvedModel[]>> {
    await this.refreshCache();

    const result: Record<ModelTier, ResolvedModel[]> = {
      flagship: [],
      standard: [],
      fast: [],
      free: []
    };

    for (const tier of ['flagship', 'standard', 'fast', 'free'] as ModelTier[]) {
      const key = `${group}:${tier}`;
      result[tier] = this.modelCache.get(key) || [];
    }

    return result;
  }

  /**
   * Convert model requirements to CouncilMember configurations
   */
  async resolveToCouncilMembers(
    requirements: Array<ModelRequirement & { memberId: string; timeout?: number }>
  ): Promise<CouncilMember[]> {
    const members: CouncilMember[] = [];

    for (const req of requirements) {
      const resolved = await this.resolveModel(req);
      if (resolved) {
        members.push({
          id: req.memberId,
          provider: 'openrouter', // All requests go through OpenRouter
          model: resolved.id,     // Full OpenRouter model ID
          timeout: req.timeout || 30,
          retryPolicy: {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
          }
        });
      } else {
        logger.warn(`Skipping member ${req.memberId}: no model available for ${req.group}/${req.tier}`, { component: 'model-resolver' });
      }
    }

    return members;
  }

  /**
   * Get the current model resolution for a preset (for display/debugging)
   */
  async getPresetResolution(presetName: string): Promise<Record<string, ResolvedModel | null>> {
    const presetRequirements = PRESET_REQUIREMENTS[presetName];
    if (!presetRequirements) {
      return {};
    }

    const result: Record<string, ResolvedModel | null> = {};
    for (const req of presetRequirements) {
      const resolved = await this.resolveModel(req);
      result[req.memberId] = resolved;
    }

    return result;
  }

  /**
   * Get statistics about available models
   */
  async getStats(): Promise<{
    totalModels: number;
    byGroup: Record<ProviderGroup, number>;
    byTier: Record<ModelTier, number>;
    withBenchmarks: number;
  }> {
    await this.refreshCache();

    const byGroup: Record<ProviderGroup, number> = {
      GPT: 0, Claude: 0, Gemini: 0, Grok: 0, Llama: 0, Mistral: 0, Other: 0
    };
    const byTier: Record<ModelTier, number> = {
      flagship: 0, standard: 0, fast: 0, free: 0
    };
    let totalModels = 0;
    let withBenchmarks = 0;

    for (const [key, models] of this.modelCache) {
      const [group, tier] = key.split(':') as [ProviderGroup, ModelTier];
      for (const model of models) {
        totalModels++;
        byGroup[group] = (byGroup[group] || 0) + 1;
        byTier[tier] = (byTier[tier] || 0) + 1;
        if (model.intelligenceIndex !== undefined) {
          withBenchmarks++;
        }
      }
    }

    return { totalModels, byGroup, byTier, withBenchmarks };
  }
}

/**
 * Preset requirements - defines what each preset needs
 * These are the "stable" references; actual model IDs are resolved at runtime
 */
export const PRESET_REQUIREMENTS: Record<string, Array<ModelRequirement & { memberId: string; timeout?: number }>> = {
  'research-council': [
    {
      memberId: 'gpt-flagship',
      group: 'GPT',
      tier: 'flagship',
      timeout: 120,
      fallbacks: ['openai/gpt-4o', 'openai/gpt-4-turbo']
    },
    {
      memberId: 'claude-flagship',
      group: 'Claude',
      tier: 'flagship',
      timeout: 120,
      fallbacks: ['anthropic/claude-3.5-sonnet', 'anthropic/claude-3-opus']
    },
    {
      memberId: 'gemini-flagship',
      group: 'Gemini',
      tier: 'flagship',
      timeout: 120,
      fallbacks: ['google/gemini-2.5-pro', 'google/gemini-2.0-pro']
    },
    {
      memberId: 'grok-flagship',
      group: 'Grok',
      tier: 'flagship',
      timeout: 120,
      fallbacks: ['x-ai/grok-3', 'x-ai/grok-2']
    }
  ],
  'balanced-council': [
    { memberId: 'gpt-standard', group: 'GPT', tier: 'standard', timeout: 30 },
    { memberId: 'claude-standard', group: 'Claude', tier: 'standard', timeout: 30 },
    { memberId: 'gemini-standard', group: 'Gemini', tier: 'standard', timeout: 30 },
    { memberId: 'grok-standard', group: 'Grok', tier: 'standard', timeout: 30 }
  ],
  'coding-council': [
    {
      memberId: 'claude-flagship',
      group: 'Claude',
      tier: 'flagship',
      timeout: 120,
      preferCapabilities: ['coding']
    },
    {
      memberId: 'gpt-flagship',
      group: 'GPT',
      tier: 'flagship',
      timeout: 120,
      preferCapabilities: ['coding']
    },
    { memberId: 'gemini-standard', group: 'Gemini', tier: 'standard', timeout: 120 },
    { memberId: 'grok-standard', group: 'Grok', tier: 'standard', timeout: 120 }
  ],
  'fast-council': [
    {
      memberId: 'gpt-fast',
      group: 'GPT',
      tier: 'fast',
      timeout: 15,
      preferCapabilities: ['speed']
    },
    {
      memberId: 'claude-fast',
      group: 'Claude',
      tier: 'fast',
      timeout: 15,
      preferCapabilities: ['speed']
    },
    {
      memberId: 'gemini-fast',
      group: 'Gemini',
      tier: 'fast',
      timeout: 15,
      preferCapabilities: ['speed']
    }
  ],
  'cost-effective-council': [
    { memberId: 'gpt-fast', group: 'GPT', tier: 'fast', timeout: 20 },
    { memberId: 'claude-fast', group: 'Claude', tier: 'fast', timeout: 20 },
    { memberId: 'gemini-fast', group: 'Gemini', tier: 'fast', timeout: 20 }
  ],
  'free-council': [
    { memberId: 'free-1', group: 'GPT', tier: 'free', timeout: 30 },
    { memberId: 'free-2', group: 'Claude', tier: 'free', timeout: 30 },
    { memberId: 'free-3', group: 'Gemini', tier: 'free', timeout: 30 },
    { memberId: 'free-4', group: 'Llama', tier: 'free', timeout: 30 },
    { memberId: 'free-5', group: 'Mistral', tier: 'free', timeout: 30 }
  ]
};
