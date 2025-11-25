/**
 * Model Discovery Service
 * Orchestrates model fetching from multiple providers
 */

import { Pool } from 'pg';
import { IModelDiscoveryService } from '../interfaces/IModelDiscoveryService';
import { DiscoveredModel, ProviderType } from '../types/core';
import { OpenAIModelFetcher } from './openai-fetcher';
import { AnthropicModelFetcher } from './anthropic-fetcher';
import { GoogleModelFetcher } from './google-fetcher';
import { XAIModelFetcher } from './xai-fetcher';
import { BaseModelFetcher } from './base-fetcher';

export class ModelDiscoveryService implements IModelDiscoveryService {
  private db: Pool;
  private fetchers: Map<ProviderType, BaseModelFetcher>;

  constructor(
    db: Pool,
    apiKeys: {
            openai?: string;
            anthropic?: string;
            google?: string;
            xai?: string;
        }
  ) {
    this.db = db;
    this.fetchers = new Map();

    // Initialize fetchers for providers with API keys
    if (apiKeys.openai) {
      this.fetchers.set('openai', new OpenAIModelFetcher(apiKeys.openai));
    }
    if (apiKeys.anthropic) {
      this.fetchers.set('anthropic', new AnthropicModelFetcher(apiKeys.anthropic));
    }
    if (apiKeys.google) {
      this.fetchers.set('google', new GoogleModelFetcher(apiKeys.google));
    }
    if (apiKeys.xai) {
      this.fetchers.set('xai', new XAIModelFetcher(apiKeys.xai));
    }
  }

  async fetchModels(provider: ProviderType): Promise<DiscoveredModel[]> {
    const fetcher = this.fetchers.get(provider);
    if (!fetcher) {
      throw new Error(`No fetcher configured for provider: ${provider}`);
    }

    try {
      const models = await fetcher.fetchModels();
      console.log(`[ModelDiscovery] Fetched ${models.length} models from ${provider}`);
      return models;
    } catch (error) {
      console.error(`[ModelDiscovery] Failed to fetch models from ${provider}:`, error);
      throw error;
    }
  }

  async fetchAllModels(): Promise<Map<ProviderType, DiscoveredModel[]>> {
    const results = new Map<ProviderType, DiscoveredModel[]>();
    const providers = Array.from(this.fetchers.keys());

    // Fetch from all providers in parallel
    const promises = providers.map(async (provider) => {
      try {
        const models = await this.fetchModels(provider);
        results.set(provider, models);
      } catch (error) {
        console.error(`[ModelDiscovery] Error fetching from ${provider}, continuing with others:`, error);
        // Don't throw - continue with other providers
        results.set(provider, []);
      }
    });

    await Promise.all(promises);
    return results;
  }

  async getLastSync(provider: ProviderType): Promise<Date | null> {
    try {
      const result = await this.db.query(
        'SELECT last_sync FROM sync_status WHERE provider = $1',
        [provider]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].last_sync;
    } catch (error) {
      console.error(`[ModelDiscovery] Error getting last sync for ${provider}:`, error);
      return null;
    }
  }
}
