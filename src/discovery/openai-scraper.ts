/**
 * OpenAI Pricing Scraper
 * Scrapes pricing information from OpenAI's pricing page
 */

import { BaseHTMLScraper } from './base-scraper';
import { PricingData, ScrapingConfig } from '../types/core';
import * as cheerio from 'cheerio';

export class OpenAIPricingScraper extends BaseHTMLScraper {
  constructor(db?: any) {
    super('openai', undefined, db);
  }

  /**
     * Get default scraping configuration for OpenAI
     */
  protected async getDefaultScrapingConfig(): Promise<ScrapingConfig> {
    return {
      url: 'https://openai.com/api/pricing/',
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
          table: '[data-testid="pricing-table"]',
          modelNameColumn: 0,
          inputCostColumn: 1,
          outputCostColumn: 2
        }
      ]
    };
  }

  /**
     * Override scraping to handle OpenAI's specific structure
     */
  async scrapePricing(): Promise<PricingData[]> {
    const config = await this.getScrapingConfig();
    const html = await this.fetchHTML(config.url);
    const $ = cheerio.load(html);

    const allPricing: PricingData[] = [];

    // OpenAI has multiple tables for different model categories
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

            if (!modelName || modelName.toLowerCase().includes('model')) {
              return; // Skip header-like rows
            }

            // Extract input cost (second column)
            const inputCostText = this.cleanText(cells.eq(1).text());
            const inputCost = this.parseCost(inputCostText);

            // Extract output cost (third column)
            const outputCostText = this.cleanText(cells.eq(2).text());
            const outputCost = this.parseCost(outputCostText);

            // Check for tier information in the row
            const rowText = $(row).text().toLowerCase();
            let tier = 'standard';

            if (rowText.includes('batch')) {
              tier = 'batch';
            } else if (rowText.includes('cached')) {
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
            console.warn(`[OpenAIScraper] Failed to parse row ${index}:`, error);
          }
        });
      } catch (error) {
        console.warn('[OpenAIScraper] Failed to parse table:', error);
      }
    });

    // Also look for multimodal pricing sections
    const multimodalPricing = this.extractMultimodalPricing($);
    allPricing.push(...multimodalPricing);

    if (allPricing.length === 0) {
      throw new Error('No pricing data extracted from OpenAI pricing page');
    }

    return allPricing;
  }

  /**
     * Extract multimodal pricing (images, audio) from the page
     */
  private extractMultimodalPricing($: ReturnType<typeof cheerio.load>): PricingData[] {
    const multimodalPricing: PricingData[] = [];

    // Look for sections with "image" or "audio" in headings
    $('h2, h3, h4').each((_, heading) => {
      const headingText = $(heading).text().toLowerCase();

      if (headingText.includes('image') || headingText.includes('audio') || headingText.includes('vision')) {
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
                // For multimodal, input and output costs are often the same
                multimodalPricing.push({
                  modelName,
                  inputCostPerMillion: cost,
                  outputCostPerMillion: cost,
                  tier: 'standard'
                });
              }
            } catch (error) {
              console.warn('[OpenAIScraper] Failed to parse multimodal row:', error);
            }
          });
        }
      }
    });

    return multimodalPricing;
  }
}
