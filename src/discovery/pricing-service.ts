/**
 * Pricing Scraper Service
 * Coordinates pricing scraping across all providers
 */

import { IPricingScraper } from '../interfaces/IPricingScraper';
import { PricingData, ProviderType, ScrapingConfig } from '../types/core';
import { BaseHTMLScraper } from './base-scraper';
import { OpenAIPricingScraper } from './openai-scraper';
import { AnthropicPricingScraper } from './anthropic-scraper';
import { GooglePricingScraper } from './google-scraper';
import { XAIPricingScraper } from './xai-scraper';
import { RedisClientType } from 'redis';
import { Pool } from 'pg';

/**
 * Static fallback pricing data for when scraping fails
 * Prices are in USD per 1 million tokens
 * Last updated: November 2024
 */
const STATIC_FALLBACK_PRICING: Record<ProviderType, PricingData[]> = {
  openai: [
    // === GPT-5 series (November 2025) ===
    {
      modelName: 'gpt-5.1',
      inputCostPerMillion: 5.0,
      outputCostPerMillion: 20.0,
      tier: 'standard'
    },
    {
      modelName: 'gpt-5',
      inputCostPerMillion: 4.0,
      outputCostPerMillion: 16.0,
      tier: 'standard'
    },
    {
      modelName: 'gpt-5-pro',
      inputCostPerMillion: 10.0,
      outputCostPerMillion: 40.0,
      tier: 'standard'
    },
    {
      modelName: 'gpt-5-mini',
      inputCostPerMillion: 0.4,
      outputCostPerMillion: 1.6,
      tier: 'standard'
    },
    {
      modelName: 'gpt-5-nano',
      inputCostPerMillion: 0.1,
      outputCostPerMillion: 0.4,
      tier: 'standard'
    },
    // GPT-4.1 series
    {
      modelName: 'gpt-4.1',
      inputCostPerMillion: 2.0,
      outputCostPerMillion: 8.0,
      tier: 'standard'
    },
    // o3/o4 reasoning series (2025)
    {
      modelName: 'o3',
      inputCostPerMillion: 10.0,
      outputCostPerMillion: 40.0,
      tier: 'standard'
    },
    {
      modelName: 'o3-pro',
      inputCostPerMillion: 20.0,
      outputCostPerMillion: 80.0,
      tier: 'standard'
    },
    {
      modelName: 'o3-mini',
      inputCostPerMillion: 1.1,
      outputCostPerMillion: 4.4,
      tier: 'standard'
    },
    {
      modelName: 'o3-mini-2025-01-31',
      inputCostPerMillion: 1.1,
      outputCostPerMillion: 4.4,
      tier: 'standard'
    },
    {
      modelName: 'o4-mini',
      inputCostPerMillion: 1.5,
      outputCostPerMillion: 6.0,
      tier: 'standard'
    },
    // GPT-4o series
    {
      modelName: 'gpt-4o',
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    },
    {
      modelName: 'gpt-4o-2024-11-20',
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    },
    {
      modelName: 'gpt-4o-2024-08-06',
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    },
    {
      modelName: 'chatgpt-4o-latest',
      inputCostPerMillion: 5.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    // GPT-4o-mini series
    {
      modelName: 'gpt-4o-mini',
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.6,
      tier: 'standard'
    },
    {
      modelName: 'gpt-4o-mini-2024-07-18',
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.6,
      tier: 'standard'
    },
    // o1 series (reasoning)
    {
      modelName: 'o1',
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 60.0,
      tier: 'standard'
    },
    {
      modelName: 'o1-2024-12-17',
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 60.0,
      tier: 'standard'
    },
    {
      modelName: 'o1-preview',
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 60.0,
      tier: 'standard'
    },
    {
      modelName: 'o1-mini',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 12.0,
      tier: 'standard'
    },
    // GPT-4 Turbo series (legacy)
    {
      modelName: 'gpt-4-turbo',
      inputCostPerMillion: 10.0,
      outputCostPerMillion: 30.0,
      tier: 'standard'
    },
    {
      modelName: 'gpt-4-turbo-2024-04-09',
      inputCostPerMillion: 10.0,
      outputCostPerMillion: 30.0,
      tier: 'standard'
    },
    // GPT-4 series (legacy)
    {
      modelName: 'gpt-4',
      inputCostPerMillion: 30.0,
      outputCostPerMillion: 60.0,
      tier: 'standard'
    },
    {
      modelName: 'gpt-4-0613',
      inputCostPerMillion: 30.0,
      outputCostPerMillion: 60.0,
      tier: 'standard'
    },
    // GPT-3.5 Turbo series (legacy)
    {
      modelName: 'gpt-3.5-turbo',
      inputCostPerMillion: 0.5,
      outputCostPerMillion: 1.5,
      tier: 'standard'
    },
    {
      modelName: 'gpt-3.5-turbo-0125',
      inputCostPerMillion: 0.5,
      outputCostPerMillion: 1.5,
      tier: 'standard'
    },
    // Embedding models
    {
      modelName: 'text-embedding-3-small',
      inputCostPerMillion: 0.02,
      outputCostPerMillion: 0.02,
      tier: 'standard'
    },
    {
      modelName: 'text-embedding-3-large',
      inputCostPerMillion: 0.13,
      outputCostPerMillion: 0.13,
      tier: 'standard'
    }
  ],
  anthropic: [
    // === Claude 4 series (November 2025) ===
    {
      modelName: 'claude-sonnet-4-5-20251001',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-sonnet-4.5',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-opus-4-1-20250522',
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 75.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-opus-4.1',
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 75.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-sonnet-4',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-haiku-4-5-20251015',
      inputCostPerMillion: 1.0,
      outputCostPerMillion: 5.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-haiku-4.5',
      inputCostPerMillion: 1.0,
      outputCostPerMillion: 5.0,
      tier: 'standard'
    },
    // Claude 3.5 series
    {
      modelName: 'claude-3-5-sonnet-20241022',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-3-5-sonnet-latest',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-3-5-haiku-20241022',
      inputCostPerMillion: 0.8,
      outputCostPerMillion: 4.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-3-5-haiku-latest',
      inputCostPerMillion: 0.8,
      outputCostPerMillion: 4.0,
      tier: 'standard'
    },
    // Claude 3 series (legacy)
    {
      modelName: 'claude-3-opus-20240229',
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 75.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-3-opus-latest',
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 75.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-3-sonnet-20240229',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-3-haiku-20240307',
      inputCostPerMillion: 0.25,
      outputCostPerMillion: 1.25,
      tier: 'standard'
    },
    // Claude 2 series (legacy)
    {
      modelName: 'claude-2.1',
      inputCostPerMillion: 8.0,
      outputCostPerMillion: 24.0,
      tier: 'standard'
    },
    {
      modelName: 'claude-instant-1.2',
      inputCostPerMillion: 0.8,
      outputCostPerMillion: 2.4,
      tier: 'standard'
    }
  ],
  google: [
    // === Gemini 3 series (November 2025) ===
    {
      modelName: 'gemini-3-pro-preview',
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    },
    {
      modelName: 'gemini-3-pro',
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    },
    {
      modelName: 'gemini-3-pro-image-preview',
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    },
    // Gemini 2.5 series
    {
      modelName: 'gemini-2.5-pro',
      inputCostPerMillion: 1.25,
      outputCostPerMillion: 5.0,
      tier: 'standard'
    },
    {
      modelName: 'gemini-2.5-pro-preview',
      inputCostPerMillion: 1.25,
      outputCostPerMillion: 5.0,
      tier: 'standard'
    },
    {
      modelName: 'gemini-2.5-flash',
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.6,
      tier: 'standard'
    },
    {
      modelName: 'gemini-2.5-flash-preview-09-2025',
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.6,
      tier: 'standard'
    },
    {
      modelName: 'gemini-2.5-flash-lite',
      inputCostPerMillion: 0.075,
      outputCostPerMillion: 0.3,
      tier: 'standard'
    },
    {
      modelName: 'gemini-2.5-flash-lite-preview-09-2025',
      inputCostPerMillion: 0.075,
      outputCostPerMillion: 0.3,
      tier: 'standard'
    },
    // Gemini 2.0 series
    {
      modelName: 'gemini-2.0-flash',
      inputCostPerMillion: 0.1,
      outputCostPerMillion: 0.4,
      tier: 'standard'
    },
    {
      modelName: 'gemini-2.0-flash-001',
      inputCostPerMillion: 0.1,
      outputCostPerMillion: 0.4,
      tier: 'standard'
    },
    {
      modelName: 'gemini-2.0-flash-lite',
      inputCostPerMillion: 0.075,
      outputCostPerMillion: 0.3,
      tier: 'standard'
    },
    // Gemini 1.5 series (legacy)
    {
      modelName: 'gemini-1.5-pro',
      inputCostPerMillion: 1.25,
      outputCostPerMillion: 5.0,
      tier: 'standard'
    },
    {
      modelName: 'gemini-1.5-flash',
      inputCostPerMillion: 0.075,
      outputCostPerMillion: 0.3,
      tier: 'standard'
    },
    {
      modelName: 'gemini-pro',
      inputCostPerMillion: 0.5,
      outputCostPerMillion: 1.5,
      tier: 'standard'
    }
  ],
  xai: [
    // === Grok 4 series (November 2025) ===
    {
      modelName: 'grok-4-0709',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'grok-4',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'grok-4.1',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'grok-4-fast-reasoning',
      inputCostPerMillion: 0.2,
      outputCostPerMillion: 0.5,
      tier: 'standard'
    },
    {
      modelName: 'grok-4-fast-non-reasoning',
      inputCostPerMillion: 0.2,
      outputCostPerMillion: 0.5,
      tier: 'standard'
    },
    {
      modelName: 'grok-code-fast-1',
      inputCostPerMillion: 0.2,
      outputCostPerMillion: 1.5,
      tier: 'standard'
    },
    // Grok 3 series
    {
      modelName: 'grok-3',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      tier: 'standard'
    },
    {
      modelName: 'grok-3-mini',
      inputCostPerMillion: 0.3,
      outputCostPerMillion: 0.5,
      tier: 'standard'
    },
    // Grok 2 series (legacy)
    {
      modelName: 'grok-2',
      inputCostPerMillion: 2.0,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    },
    {
      modelName: 'grok-2-1212',
      inputCostPerMillion: 2.0,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    },
    {
      modelName: 'grok-2-latest',
      inputCostPerMillion: 2.0,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    },
    {
      modelName: 'grok-2-vision-1212',
      inputCostPerMillion: 2.0,
      outputCostPerMillion: 10.0,
      tier: 'standard'
    }
  ]
};

export class PricingScraperService implements IPricingScraper {
  private scrapers: Map<ProviderType, BaseHTMLScraper>;
  private redis: RedisClientType;
  private db: Pool;

  constructor(redis: RedisClientType, db: Pool) {
    this.redis = redis;
    this.db = db;
    this.scrapers = new Map<ProviderType, BaseHTMLScraper>([
      ['openai', new OpenAIPricingScraper(db)],
      ['anthropic', new AnthropicPricingScraper(db)],
      ['google', new GooglePricingScraper(db)],
      ['xai', new XAIPricingScraper(db)]
    ]);
  }

  /**
   * Scrape pricing information from a provider's website
   */
  async scrapePricing(provider: ProviderType): Promise<PricingData[]> {
    const scraper = this.scrapers.get(provider);

    if (!scraper) {
      throw new Error(`No scraper configured for provider: ${provider}`);
    }

    try {
      const pricing = await scraper.scrapePricing();

      // Cache the pricing data as fallback
      await this.cacheFallbackPricing(provider, pricing);

      return pricing;
    } catch (error) {
      console.error(
        `[PricingService] Failed to scrape pricing for ${provider}:`,
        error
      );

      // Try to get fallback pricing from cache
      const cachedFallback = await this.getFallbackPricing(provider);

      if (cachedFallback.length > 0) {
        console.log(
          `[PricingService] Using cached fallback pricing for ${provider} (${cachedFallback.length} entries)`
        );
        return cachedFallback;
      }

      // Use static fallback pricing
      const staticFallback = STATIC_FALLBACK_PRICING[provider] || [];
      if (staticFallback.length > 0) {
        console.log(
          `[PricingService] Using static fallback pricing for ${provider} (${staticFallback.length} entries)`
        );
        return staticFallback;
      }

      throw error;
    }
  }

  /**
   * Validate scraping configuration for a provider
   */
  async validateConfig(
    provider: ProviderType,
    config: ScrapingConfig
  ): Promise<boolean> {
    const scraper = this.scrapers.get(provider);

    if (!scraper) {
      throw new Error(`No scraper configured for provider: ${provider}`);
    }

    return scraper.validateConfig(config);
  }

  /**
   * Get cached pricing data when scraping fails
   */
  async getFallbackPricing(provider: ProviderType): Promise<PricingData[]> {
    try {
      const cacheKey = `pricing:${provider}:fallback`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      return [];
    } catch (error) {
      console.error(
        `[PricingService] Failed to get fallback pricing for ${provider}:`,
        error
      );
      return [];
    }
  }

  /**
   * Get static fallback pricing for a provider
   */
  getStaticFallbackPricing(provider: ProviderType): PricingData[] {
    return STATIC_FALLBACK_PRICING[provider] || [];
  }

  /**
   * Cache pricing data as fallback (7 days TTL)
   */
  private async cacheFallbackPricing(
    provider: ProviderType,
    pricing: PricingData[]
  ): Promise<void> {
    try {
      const cacheKey = `pricing:${provider}:fallback`;
      const ttl = 7 * 24 * 60 * 60; // 7 days in seconds

      await this.redis.setEx(cacheKey, ttl, JSON.stringify(pricing));
    } catch (error) {
      console.error(
        `[PricingService] Failed to cache fallback pricing for ${provider}:`,
        error
      );
    }
  }

  /**
   * Scrape pricing from all providers
   */
  async scrapeAllPricing(): Promise<Map<ProviderType, PricingData[]>> {
    const results = new Map<ProviderType, PricingData[]>();
    const providers: ProviderType[] = ['openai', 'anthropic', 'google', 'xai'];

    for (const provider of providers) {
      try {
        const pricing = await this.scrapePricing(provider);
        results.set(provider, pricing);
      } catch (error) {
        console.error(
          `[PricingService] Failed to scrape ${provider}, skipping:`,
          error
        );
        results.set(provider, []);
      }
    }

    return results;
  }
}
