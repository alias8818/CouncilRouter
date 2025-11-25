/**
 * Base HTML Scraper
 * Abstract base class for scraping pricing information from provider websites
 */

import * as cheerio from 'cheerio';
import { PricingData, ProviderType, ScrapingConfig } from '../types/core';
import { ScrapingConfigManager } from './config-manager';
import { Pool } from 'pg';

export interface ScraperConfig {
    throttleDelayMs: number;
    timeoutMs: number;
    userAgent: string;
    maxRetries: number;
}

export abstract class BaseHTMLScraper {
  protected provider: ProviderType;
  protected config: ScraperConfig;
  protected lastRequestTime: number = 0;
  protected configManager?: ScrapingConfigManager;

  constructor(provider: ProviderType, config?: Partial<ScraperConfig>, db?: Pool) {
    this.provider = provider;
    this.config = {
      throttleDelayMs: 1000, // 1 second delay between requests
      timeoutMs: 30000, // 30 seconds
      userAgent: process.env.SCRAPING_USER_AGENT || 'AI-Council-Proxy/1.0',
      maxRetries: 3,
      ...config
    };

    if (db) {
      this.configManager = new ScrapingConfigManager(db);
    }
  }

  /**
     * Scrape pricing information from the provider's website
     * Tries strategies in order: primary selectors, then fallback selectors
     */
  async scrapePricing(): Promise<PricingData[]> {
    const scrapingConfig = await this.getScrapingConfig();
    const strategyResults: { strategy: string; success: boolean; error?: string }[] = [];

    // Try primary selectors
    try {
      console.log(`[Scraper] Trying primary selectors for ${this.provider}`);
      const html = await this.fetchHTML(scrapingConfig.url);
      const pricing = this.extractPricing(html, scrapingConfig.selectors);

      if (pricing.length > 0) {
        console.log(`[Scraper] Primary selectors succeeded for ${this.provider}, extracted ${pricing.length} pricing entries`);
        strategyResults.push({ strategy: 'primary', success: true });
        return pricing;
      }

      strategyResults.push({ strategy: 'primary', success: false, error: 'No pricing data extracted' });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Scraper] Primary selectors failed for ${this.provider}:`, errorMsg);
      strategyResults.push({ strategy: 'primary', success: false, error: errorMsg });
    }

    // Try fallback selectors if available
    if (scrapingConfig.fallbackSelectors) {
      for (let i = 0; i < scrapingConfig.fallbackSelectors.length; i++) {
        const fallbackSelector = scrapingConfig.fallbackSelectors[i];
        const strategyName = `fallback-${i + 1}`;

        try {
          console.log(`[Scraper] Trying ${strategyName} for ${this.provider}`);
          const html = await this.fetchHTML(scrapingConfig.url);
          const pricing = this.extractPricing(html, fallbackSelector);

          if (pricing.length > 0) {
            console.log(`[Scraper] ${strategyName} succeeded for ${this.provider}, extracted ${pricing.length} pricing entries`);
            strategyResults.push({ strategy: strategyName, success: true });
            return pricing;
          }

          strategyResults.push({ strategy: strategyName, success: false, error: 'No pricing data extracted' });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[Scraper] ${strategyName} failed for ${this.provider}:`, errorMsg);
          strategyResults.push({ strategy: strategyName, success: false, error: errorMsg });
        }
      }
    }

    // Log all strategy results
    console.error(`[Scraper] All strategies failed for ${this.provider}:`, strategyResults);

    // All strategies failed
    throw new Error(`Failed to scrape pricing for ${this.provider}: No selectors matched. Tried ${strategyResults.length} strategies.`);
  }

  /**
     * Get scraping configuration for the provider
     * First tries to load from database, falls back to hardcoded config
     */
  protected async getScrapingConfig(): Promise<ScrapingConfig> {
    // Try to load from database if config manager is available
    if (this.configManager) {
      const storedConfig = await this.configManager.getActiveConfig(this.provider);
      if (storedConfig) {
        return storedConfig.config;
      }
    }

    // Fall back to hardcoded configuration
    return this.getDefaultScrapingConfig();
  }

    /**
     * Get default scraping configuration (to be overridden by subclasses)
     */
    protected abstract getDefaultScrapingConfig(): Promise<ScrapingConfig>;

    /**
     * Fetch HTML content from URL with throttling and timeout
     */
    protected async fetchHTML(url: string): Promise<string> {
      // Implement request throttling
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.config.throttleDelayMs) {
        const delay = this.config.throttleDelayMs - timeSinceLastRequest;
        console.log(`[Scraper] Throttling request to ${this.provider}, waiting ${delay}ms`);
        await this.sleep(delay);
      }

      this.lastRequestTime = Date.now();

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': this.config.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache'
          },
          signal: controller.signal
        });

        if (!response.ok) {
          // Detect blocking responses
          if (this.isBlockingResponse(response.status)) {
            const blockingError = new Error(
              `Scraping blocked by ${this.provider}: HTTP ${response.status} ${response.statusText}`
            );
            this.handleBlockingDetected(response.status, url);
            throw blockingError;
          }

          const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.status = response.status;
          error.statusCode = response.status;
          throw error;
        }

        return await response.text();
      } finally {
        clearTimeout(timeoutId);
      }
    }

    /**
     * Check if HTTP status indicates blocking
     */
    protected isBlockingResponse(status: number): boolean {
      // Common blocking status codes
      const blockingStatuses = [
        403, // Forbidden
        429, // Too Many Requests
        451  // Unavailable For Legal Reasons
      ];
      return blockingStatuses.includes(status);
    }

    /**
     * Handle detected blocking
     */
    protected handleBlockingDetected(status: number, url: string): void {
      const blockingEvent = {
        provider: this.provider,
        status,
        url,
        timestamp: new Date(),
        userAgent: this.config.userAgent
      };

      // Log blocking event with details
      console.error(
        `[Scraper] BLOCKING DETECTED for ${this.provider}:`,
        JSON.stringify(blockingEvent, null, 2)
      );

      // Generate administrator alert
      console.error(
        `[Scraper] ALERT: Administrator action required - ${this.provider} is blocking scraping attempts`
      );
    }

    /**
     * Extract pricing data from HTML using selectors
     */
    protected extractPricing(
      html: string,
      selectors: ScrapingConfig['selectors']
    ): PricingData[] {
      const $ = cheerio.load(html);
      const pricing: PricingData[] = [];

      // Find the pricing table
      const table = $(selectors.table);

      if (table.length === 0) {
        throw new Error(`Table selector "${selectors.table}" not found`);
      }

      // Extract rows from table
      const rows = table.find('tr');

      rows.each((index, row) => {
        // Skip header row
        if (index === 0) { return; }

        const cells = $(row).find('td, th');

        if (cells.length === 0) { return; }

        try {
          // Extract model name
          const modelNameCell = cells.eq(selectors.modelNameColumn);
          const modelName = this.cleanText(modelNameCell.text());

          if (!modelName) { return; }

          // Extract input cost
          const inputCostCell = cells.eq(selectors.inputCostColumn);
          const inputCostText = this.cleanText(inputCostCell.text());
          const inputCost = this.parseCost(inputCostText);

          // Extract output cost
          const outputCostCell = cells.eq(selectors.outputCostColumn);
          const outputCostText = this.cleanText(outputCostCell.text());
          const outputCost = this.parseCost(outputCostText);

          // Only add if we have valid costs
          if (inputCost !== null && outputCost !== null) {
            pricing.push({
              modelName,
              inputCostPerMillion: inputCost,
              outputCostPerMillion: outputCost
            });
          }
        } catch (error) {
          console.warn(`[Scraper] Failed to parse row ${index} for ${this.provider}:`, error);
        }
      });

      return pricing;
    }

    /**
     * Clean text by removing extra whitespace and special characters
     */
    protected cleanText(text: string): string {
      return text
        .replace(/\s+/g, ' ')
        .replace(/[\n\r\t]/g, '')
        .trim();
    }

    /**
     * Parse cost from text (handles various formats like "$1.50", "1.50", "$1.50/M")
     */
    protected parseCost(text: string): number | null {
      // Remove currency symbols, commas, and common suffixes
      const cleaned = text
        .replace(/[$€£¥,]/g, '')
        .replace(/\s*(per|\/)\s*(million|M|1M|mtok).*/i, '')
        .trim();

      const number = parseFloat(cleaned);

      if (isNaN(number)) {
        return null;
      }

      return number;
    }

    /**
     * Sleep for specified milliseconds
     */
    protected sleep(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Validate scraping configuration
     */
    async validateConfig(config: ScrapingConfig): Promise<boolean> {
      try {
        // Validate URL format
        new URL(config.url);

        // Validate selectors exist
        if (!config.selectors.table) {
          throw new Error('Table selector is required');
        }

        if (typeof config.selectors.modelNameColumn !== 'number') {
          throw new Error('Model name column index is required');
        }

        if (typeof config.selectors.inputCostColumn !== 'number') {
          throw new Error('Input cost column index is required');
        }

        if (typeof config.selectors.outputCostColumn !== 'number') {
          throw new Error('Output cost column index is required');
        }

        // Try to fetch and parse with the configuration
        const html = await this.fetchHTML(config.url);
        const pricing = this.extractPricing(html, config.selectors);

        // Configuration is valid if we extracted at least one pricing entry
        return pricing.length > 0;
      } catch (error) {
        console.error(`[Scraper] Configuration validation failed for ${this.provider}:`, error);
        return false;
      }
    }
}
