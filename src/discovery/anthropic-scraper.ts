/**
 * Anthropic Pricing Scraper
 * Scrapes pricing information from Anthropic's pricing page
 */

import { BaseHTMLScraper } from './base-scraper';
import { PricingData, ScrapingConfig } from '../types/core';
import * as cheerio from 'cheerio';

export class AnthropicPricingScraper extends BaseHTMLScraper {
  constructor(db?: any) {
    super('anthropic', undefined, db);
  }

  /**
     * Get default scraping configuration for Anthropic
     */
  protected async getDefaultScrapingConfig(): Promise<ScrapingConfig> {
    return {
      url: 'https://www.anthropic.com/pricing',
      selectors: {
        table: 'table',
        modelNameColumn: 0,
        inputCostColumn: 1,
        outputCostColumn: 2
      },
      fallbackSelectors: [
        {
          table: '.pricing-table',
          modelNameColumn: 0,
          inputCostColumn: 1,
          outputCostColumn: 2
        },
        {
          table: '[class*="pricing"]',
          modelNameColumn: 0,
          inputCostColumn: 1,
          outputCostColumn: 2
        }
      ]
    };
  }

  /**
     * Override scraping to handle Anthropic's specific structure
     */
  async scrapePricing(): Promise<PricingData[]> {
    const config = await this.getScrapingConfig();
    const html = await this.fetchHTML(config.url);
    const $ = cheerio.load(html);

    const allPricing: PricingData[] = [];

    // Anthropic typically has pricing tables for different model tiers
    $('table').each((_, table) => {
      try {
        const rows = $(table).find('tr');

        rows.each((index, row) => {
          // Skip header row
          if (index === 0) { return; }

          const cells = $(row).find('td, th');

          if (cells.length < 3) { return; }

          try {
            // Extract model name (first column)
            const modelName = this.cleanText(cells.eq(0).text());

            if (!modelName || modelName.toLowerCase().includes('model') || modelName.toLowerCase().includes('pricing')) {
              return; // Skip header-like rows
            }

            // Extract input cost (second column)
            const inputCostText = this.cleanText(cells.eq(1).text());
            const inputCost = this.parseCost(inputCostText);

            // Extract output cost (third column)
            const outputCostText = this.cleanText(cells.eq(2).text());
            const outputCost = this.parseCost(outputCostText);

            // Determine tier from context
            const rowText = $(row).text().toLowerCase();
            let tier = 'standard';

            if (rowText.includes('batch')) {
              tier = 'batch';
            } else if (rowText.includes('cache') || rowText.includes('cached')) {
              tier = 'cached';
            }

            // Only add if we have valid costs
            if (inputCost !== null && outputCost !== null) {
              allPricing.push({
                modelName,
                inputCostPerMillion: inputCost,
                outputCostPerMillion: outputCost,
                tier
              });
            }
          } catch (error) {
            console.warn(`[AnthropicScraper] Failed to parse row ${index}:`, error);
          }
        });
      } catch (error) {
        console.warn('[AnthropicScraper] Failed to parse table:', error);
      }
    });

    // Look for prompt caching discounts
    const cachingPricing = this.extractCachingPricing($);
    allPricing.push(...cachingPricing);

    // Look for batch pricing
    const batchPricing = this.extractBatchPricing($);
    allPricing.push(...batchPricing);

    if (allPricing.length === 0) {
      throw new Error('No pricing data extracted from Anthropic pricing page');
    }

    return allPricing;
  }

  /**
     * Extract prompt caching discount pricing
     */
  private extractCachingPricing($: ReturnType<typeof cheerio.load>): PricingData[] {
    const cachingPricing: PricingData[] = [];

    // Look for sections mentioning caching
    $('h2, h3, h4').each((_, heading) => {
      const headingText = $(heading).text().toLowerCase();

      if (headingText.includes('cache') || headingText.includes('caching')) {
        // Find the next table after this heading
        const nextTable = $(heading).nextAll('table').first();

        if (nextTable.length > 0) {
          const rows = nextTable.find('tr');

          rows.each((index, row) => {
            if (index === 0) { return; } // Skip header

            const cells = $(row).find('td, th');

            if (cells.length < 3) { return; }

            try {
              const modelName = this.cleanText(cells.eq(0).text());
              const inputCostText = this.cleanText(cells.eq(1).text());
              const outputCostText = this.cleanText(cells.eq(2).text());

              const inputCost = this.parseCost(inputCostText);
              const outputCost = this.parseCost(outputCostText);

              if (modelName && inputCost !== null && outputCost !== null) {
                cachingPricing.push({
                  modelName,
                  inputCostPerMillion: inputCost,
                  outputCostPerMillion: outputCost,
                  tier: 'cached'
                });
              }
            } catch (error) {
              console.warn('[AnthropicScraper] Failed to parse caching row:', error);
            }
          });
        }
      }
    });

    return cachingPricing;
  }

  /**
     * Extract batch pricing tiers
     */
  private extractBatchPricing($: ReturnType<typeof cheerio.load>): PricingData[] {
    const batchPricing: PricingData[] = [];

    // Look for sections mentioning batch
    $('h2, h3, h4').each((_, heading) => {
      const headingText = $(heading).text().toLowerCase();

      if (headingText.includes('batch')) {
        // Find the next table after this heading
        const nextTable = $(heading).nextAll('table').first();

        if (nextTable.length > 0) {
          const rows = nextTable.find('tr');

          rows.each((index, row) => {
            if (index === 0) { return; } // Skip header

            const cells = $(row).find('td, th');

            if (cells.length < 3) { return; }

            try {
              const modelName = this.cleanText(cells.eq(0).text());
              const inputCostText = this.cleanText(cells.eq(1).text());
              const outputCostText = this.cleanText(cells.eq(2).text());

              const inputCost = this.parseCost(inputCostText);
              const outputCost = this.parseCost(outputCostText);

              if (modelName && inputCost !== null && outputCost !== null) {
                batchPricing.push({
                  modelName,
                  inputCostPerMillion: inputCost,
                  outputCostPerMillion: outputCost,
                  tier: 'batch'
                });
              }
            } catch (error) {
              console.warn('[AnthropicScraper] Failed to parse batch row:', error);
            }
          });
        }
      }
    });

    return batchPricing;
  }
}
