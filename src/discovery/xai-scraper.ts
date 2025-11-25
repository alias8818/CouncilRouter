/**
 * xAI Pricing Scraper
 * Scrapes pricing information from xAI's documentation
 */

import { BaseHTMLScraper } from './base-scraper';
import { PricingData, ScrapingConfig } from '../types/core';
import * as cheerio from 'cheerio';

export class XAIPricingScraper extends BaseHTMLScraper {
  constructor(db?: any) {
    super('xai', undefined, db);
  }

  /**
     * Get default scraping configuration for xAI
     */
  protected async getDefaultScrapingConfig(): Promise<ScrapingConfig> {
    return {
      url: 'https://docs.x.ai/docs/models',
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
          table: '[class*="table"]',
          modelNameColumn: 0,
          inputCostColumn: 1,
          outputCostColumn: 2
        }
      ]
    };
  }

  /**
     * Override scraping to handle xAI's specific structure
     */
  async scrapePricing(): Promise<PricingData[]> {
    const config = await this.getScrapingConfig();
    const html = await this.fetchHTML(config.url);
    const $ = cheerio.load(html);

    const allPricing: PricingData[] = [];

    // xAI documentation has pricing tables
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

            // Check for cached input pricing
            const rowText = $(row).text().toLowerCase();
            let tier = 'standard';

            if (rowText.includes('cached') || rowText.includes('cache')) {
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
            console.warn(`[XAIScraper] Failed to parse row ${index}:`, error);
          }
        });
      } catch (error) {
        console.warn('[XAIScraper] Failed to parse table:', error);
      }
    });

    // Look for cached input pricing
    const cachedPricing = this.extractCachedPricing($);
    allPricing.push(...cachedPricing);

    // Look for image generation costs
    const imagePricing = this.extractImagePricing($);
    allPricing.push(...imagePricing);

    if (allPricing.length === 0) {
      throw new Error('No pricing data extracted from xAI documentation');
    }

    return allPricing;
  }

  /**
     * Extract cached input pricing
     */
  private extractCachedPricing($: ReturnType<typeof cheerio.load>): PricingData[] {
    const cachedPricing: PricingData[] = [];

    // Look for sections mentioning cached inputs
    $('h2, h3, h4').each((_, heading) => {
      const headingText = $(heading).text().toLowerCase();

      if (headingText.includes('cache') || headingText.includes('cached')) {
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
                cachedPricing.push({
                  modelName,
                  inputCostPerMillion: inputCost,
                  outputCostPerMillion: outputCost,
                  tier: 'cached'
                });
              }
            } catch (error) {
              console.warn('[XAIScraper] Failed to parse cached pricing row:', error);
            }
          });
        }
      }
    });

    return cachedPricing;
  }

  /**
     * Extract image generation costs
     */
  private extractImagePricing($: ReturnType<typeof cheerio.load>): PricingData[] {
    const imagePricing: PricingData[] = [];

    // Look for sections mentioning image generation
    $('h2, h3, h4').each((_, heading) => {
      const headingText = $(heading).text().toLowerCase();

      if (headingText.includes('image') || headingText.includes('vision') || headingText.includes('generation')) {
        // Find the next table after this heading
        const nextTable = $(heading).nextAll('table').first();

        if (nextTable.length > 0) {
          const rows = nextTable.find('tr');

          rows.each((index, row) => {
            if (index === 0) { return; } // Skip header

            const cells = $(row).find('td, th');

            if (cells.length < 2) { return; }

            try {
              const modelName = this.cleanText(cells.eq(0).text());
              const costText = this.cleanText(cells.eq(1).text());
              const cost = this.parseCost(costText);

              if (modelName && cost !== null) {
                // For image generation, treat as output cost
                imagePricing.push({
                  modelName,
                  inputCostPerMillion: 0,
                  outputCostPerMillion: cost,
                  tier: 'image-generation'
                });
              }
            } catch (error) {
              console.warn('[XAIScraper] Failed to parse image pricing row:', error);
            }
          });
        }
      }
    });

    return imagePricing;
  }
}
