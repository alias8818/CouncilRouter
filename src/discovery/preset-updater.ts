/**
 * Preset Auto-Updater
 * Dynamically updates council presets based on available models from OpenRouter
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  created?: number;
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

export class PresetUpdater {
  private db: Pool;
  private openRouterApiKey?: string;

  constructor(db: Pool) {
    this.db = db;
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY;
  }

  /**
   * Update all dynamic presets on startup
   */
  async updatePresetsOnStartup(): Promise<void> {
    if (!this.openRouterApiKey) {
      logger.info('OPENROUTER_API_KEY not set, skipping dynamic preset updates', {
        component: 'PresetUpdater'
      });
      return;
    }

    try {
      logger.info('Fetching models from OpenRouter for preset updates...', {
        component: 'PresetUpdater'
      });

      const models = await this.fetchOpenRouterModels();
      
      // Update free-council with current free models
      await this.updateFreeCouncil(models);

      logger.info('Preset updates completed successfully', {
        component: 'PresetUpdater'
      });
    } catch (error) {
      logger.warn(`Failed to update presets from OpenRouter: ${error}`, {
        component: 'PresetUpdater'
      });
      // Don't fail startup - presets will use existing DB values
    }
  }

  /**
   * Fetch all models from OpenRouter API
   */
  private async fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${this.openRouterApiKey}`,
        'HTTP-Referer': 'https://council-proxy.local',
        'X-Title': 'AI Council Proxy'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json() as OpenRouterResponse;
    return data.data || [];
  }

  /**
   * Get diverse free models for the free-council preset
   * OpenRouter has rate limits on free models, so we pick the best from each provider
   */
  private selectFreeModels(models: OpenRouterModel[]): OpenRouterModel[] {
    // Filter for free models
    const freeModels = models.filter(m => 
      m.id.endsWith(':free') && 
      m.pricing.prompt === '0'
    );

    logger.info(`Found ${freeModels.length} free models on OpenRouter`, {
      component: 'PresetUpdater'
    });

    // Prioritize the most capable models (larger = better for free tier)
    const priorityPatterns = [
      /deepseek.*r1(?!.*distill)/i,  // DeepSeek R1 (not distill)
      /llama.*3\.3.*70b/i,            // Llama 3.3 70B
      /qwen.*2\.5.*72b/i,             // Qwen 2.5 72B
      /gemini.*2.*flash/i,            // Gemini 2.0 Flash
      /grok.*4/i,                     // Grok 4.x
      /hermes.*405b/i,                // Hermes 405B
      /qwen.*coder.*32b/i,            // Qwen Coder 32B
      /mistral.*small.*24b/i,         // Mistral Small 24B
      /gemma.*3.*27b/i,               // Gemma 3 27B
      /deepseek.*chat.*v3/i,          // DeepSeek Chat V3
    ];

    const selected: OpenRouterModel[] = [];
    const usedIds = new Set<string>();

    // Pick top 5 priority models (OpenRouter rate limits free models)
    for (const pattern of priorityPatterns) {
      if (selected.length >= 5) break;
      
      const match = freeModels.find(m => 
        pattern.test(m.id) && !usedIds.has(m.id)
      );

      if (match) {
        selected.push(match);
        usedIds.add(match.id);
      }
    }

    // Fill remaining slots (up to 5) with other models
    for (const model of freeModels) {
      if (selected.length >= 5) break;
      if (!usedIds.has(model.id)) {
        selected.push(model);
        usedIds.add(model.id);
      }
    }

    logger.info(`Selected ${selected.length} best free models (rate limit safe)`, {
      component: 'PresetUpdater'
    });

    return selected;
  }

  /**
   * Update the free-council preset with ALL current free models
   */
  private async updateFreeCouncil(models: OpenRouterModel[]): Promise<void> {
    const freeModels = this.selectFreeModels(models);

    if (freeModels.length < 3) {
      logger.warn('Not enough free models found, keeping existing free-council', {
        component: 'PresetUpdater'
      });
      return;
    }

    // Build council members from ALL free models
    const members = freeModels.map((model, index) => {
      // Create a unique ID from the model name
      const modelSlug = model.id
        .replace(':free', '')
        .replace(/\//g, '-')
        .replace(/[^a-z0-9-]/gi, '')
        .toLowerCase();
      
      return {
        id: `free-${modelSlug}`,
        provider: 'openrouter',
        model: model.id,
        timeout: 45,  // Longer timeout for free models (can be slower)
        retryPolicy: {
          maxAttempts: 1,  // Single attempt - don't retry free models
          initialDelayMs: 500,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
        }
      };
    });

    const configData = {
      council: {
        members,
        minimumSize: Math.min(3, members.length),  // Need at least 3 responses
        requireMinimumForConsensus: false  // Don't require all to respond
      },
      deliberation: {
        rounds: 0,  // No deliberation - just get all responses
        preset: 'fast'
      },
      synthesis: {
        strategy: { type: 'consensus-extraction' }
      },
      performance: {
        globalTimeout: 120,  // 2 minutes for all models to respond
        enableFastFallback: true,
        streamingEnabled: true
      },
      transparency: {
        enabled: true,
        forcedTransparency: true
      }
    };

    // Update the preset in the database
    await this.db.query(
      `INSERT INTO council_presets (preset_name, config_data) 
       VALUES ($1, $2::jsonb)
       ON CONFLICT (preset_name) 
       DO UPDATE SET config_data = $2::jsonb, updated_at = NOW()`,
      ['free-council', JSON.stringify(configData)]
    );

    logger.info(`Updated free-council with ${freeModels.length} free models`, {
      component: 'PresetUpdater'
    });
    
    // Log all model IDs
    freeModels.forEach(m => {
      logger.debug(`  • ${m.id}`, { component: 'PresetUpdater' });
    });
  }
}

