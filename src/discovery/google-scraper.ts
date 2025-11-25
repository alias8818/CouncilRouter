/**
 * Google Gemini Pricing Scraper
 * Scrapes pricing information from Google's Gemini API pricing documentation
 */

import { BaseHTMLScraper } from './base-scraper';
import { PricingData, ScrapingConfig } from '../types/core';
import * as cheerio from 'cheerio';

export class GooglePricingScraper extends BaseHTMLScraper {
  constructor(db?: any) {
    super('google', undefined, db);
  }

  /**
     * Get default scraping configuration for Google Gemini
     */
  protected async getDefaultScrapingConfig(): Promise<ScrapingConfig> {
    return {
      url: 'https://ai.google.dev/gemini-api/docs/pricing',
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
     * Override scraping to handle Google's specific structure
     */
  async scrapePricing(): Promise<PricingData[]> {
    const config = await this.getScrapingConfig();
    const html = await this.fetchHTML(config.url);
    const $ = cheerio.load(html);

    const allPricing: PricingData[] = [];

    // Google has pricing tables for different context tiers
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

            // Determine context tier from row or table context
            const rowText = $(row).text().toLowerCase();
            const tableText = $(table).prev('h2, h3, h4').text().toLowerCase();

            let tier = 'standard';
            let contextLimit: number | undefined;

            if (rowText.includes('128k') || tableText.includes('128k')) {
              tier = 'standard';
              contextLimit = 128000;
            } else if (rowText.includes('200k') || tableText.includes('200k') || tableText.includes('<200k')) {
              tier = 'standard';
              contextLimit = 200000;
            } else if (rowText.includes('>200k') || tableText.includes('>200k') || tableText.includes('above 200k')) {
              tier = 'extended';
              contextLimit = 200001; // Marker for >200K
            }

            // Only add if we have valid costs
            if (inputCost !== null && outputCost !== null) {
              allPricing.push({
                modelName,
                inputCostPerMillion: inputCost,
                outputCostPerMillion: outputCost,
                tier,
                contextLimit
              });
            }
          } catch (error) {
            console.warn(`[GoogleScraper] Failed to parse row ${index}:`, error);
          }
        });
      } catch (error) {
        console.warn('[GoogleScraper] Failed to parse table:', error);
      }
    });

    // Look for multimodal extras (audio, grounding)
    const multimodalPricing = this.extractMultimodalPricing($);
    allPricing.push(...multimodalPricing);

    // Look for free tier information
    const freeTierPricing = this.extractFreeTierPricing($);
    allPricing.push(...freeTierPricing);

    if (allPricing.length === 0) {
      throw new Error('No pricing data extracted from Google Gemini pricing page');
    }

    return allPricing;
  }

  /**
     * Extract multimodal extras pricing (audio, grounding)
     */
  private extractMultimodalPricing($: ReturnType<typeof cheerio.load>): PricingData[] {
    const multimodalPricing: PricingData[] = [];

    // Look for sections mentioning audio or grounding
    $('h2, h3, h4').each((_, heading) => {
      const headingText = $(heading).text().toLowerCase();

      if (headingText.includes('audio') || headingText.includes('grounding') || headingText.includes('multimodal')) {
        // Find the next table after this heading
        const nextTable = $(heading).nextAll('table').first();

        if (nextTable.length > 0) {
          const rows = nextTable.find('tr');

          rows.each((index, row) => {
            if (index === 0) { return; } // Skip header

            const cells = $(row).find('td, th');

            if (cells.length < 2) { return; }

            try {
              const featureName = this.cleanText(cells.eq(0).text());
              const costText = this.cleanText(cells.eq(1).text());
              const cost = this.parseCost(costText);

              if (featureName && cost !== null) {
                multimodalPricing.push({
                  modelName: featureName,
                  inputCostPerMillion: cost,
                  outputCostPerMillion: cost,
                  tier: 'multimodal'
                });
              }
            } catch (error) {
              console.warn('[GoogleScraper] Failed to parse multimodal row:', error);
            }
          });
        }
      }
    });

    return multimodalPricing;
  }

  /**
     * Extract free tier limits
     */
  private extractFreeTierPricing($: ReturnType<typeof cheerio.load>): PricingData[] {
    const freeTierPricing: PricingData[] = [];

    // Look for sections mentioning free tier
    $('h2, h3, h4').each((_, heading) => {
      const headingText = $(heading).text().toLowerCase();

      if (headingText.includes('free') || headingText.includes('no cost')) {
        // Find the next table or list after this heading
        const nextTable = $(heading).nextAll('table').first();

        if (nextTable.length > 0) {
          const rows = nextTable.find('tr');

          rows.each((index, row) => {
            if (index === 0) { return; } // Skip header

            const cells = $(row).find('td, th');

            if (cells.length < 1) { return; }

            try {
              const modelName = this.cleanText(cells.eq(0).text());

              if (modelName && !modelName.toLowerCase().includes('model')) {
                // Free tier has 0 cost
                freeTierPricing.push({
                  modelName,
                  inputCostPerMillion: 0,
                  outputCostPerMillion: 0,
                  tier: 'free'
                });
              }
            } catch (error) {
              console.warn('[GoogleScraper] Failed to parse free tier row:', error);
            }
          });
        }
      }
    });

    return freeTierPricing;
  }
}
