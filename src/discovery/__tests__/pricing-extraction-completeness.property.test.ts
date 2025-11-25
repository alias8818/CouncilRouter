/**
 * Property-Based Test: Pricing Extraction Completeness
 * Feature: dynamic-model-pricing, Property 6: Pricing Extraction Completeness
 * 
 * Validates: Requirements 2.1
 * 
 * For any HTML table containing pricing data, both input and output costs 
 * per million tokens should be extracted for each model.
 */

import * as fc from 'fast-check';
import { BaseHTMLScraper } from '../base-scraper';
import { PricingData, ScrapingConfig } from '../../types/core';

// Test scraper that exposes protected methods
class TestScraper extends BaseHTMLScraper {
    constructor() {
        super('openai');
    }

    protected async getScrapingConfig(): Promise<ScrapingConfig> {
        return {
            url: 'https://example.com',
            selectors: {
                table: 'table',
                modelNameColumn: 0,
                inputCostColumn: 1,
                outputCostColumn: 2
            }
        };
    }

    // Expose protected method for testing
    public testExtractPricing(html: string, selectors: ScrapingConfig['selectors']): PricingData[] {
        return this.extractPricing(html, selectors);
    }
}

describe('Property 6: Pricing Extraction Completeness', () => {
    test('should extract both input and output costs for all models in HTML table', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate array of model pricing entries
                fc.array(
                    fc.record({
                        modelName: fc.string({ minLength: 3, maxLength: 30 })
                            .filter(s => !s.includes('<') && !s.includes('>'))
                            .filter(s => !s.includes('&') && !s.includes('#')) // Avoid HTML entities
                            .filter(s => s.trim().length > 0), // Ensure non-empty after trimming
                        inputCost: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }),
                        outputCost: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true })
                    }),
                    { minLength: 1, maxLength: 10 }
                ),
                async (pricingEntries) => {
                    // Generate HTML table from pricing entries
                    const html = generatePricingTable(pricingEntries);

                    // Extract pricing using the scraper
                    const scraper = new TestScraper();
                    const selectors = {
                        table: 'table',
                        modelNameColumn: 0,
                        inputCostColumn: 1,
                        outputCostColumn: 2
                    };

                    const extracted = scraper.testExtractPricing(html, selectors);

                    // Property: All models should be extracted with both costs
                    expect(extracted).toHaveLength(pricingEntries.length);

                    for (let i = 0; i < pricingEntries.length; i++) {
                        const entry = pricingEntries[i];
                        // Model names are cleaned (trimmed and whitespace normalized)
                        const cleanedModelName = entry.modelName.replace(/\s+/g, ' ').trim();
                        const extractedEntry = extracted.find(e => e.modelName === cleanedModelName);

                        expect(extractedEntry).toBeDefined();
                        expect(extractedEntry!.inputCostPerMillion).toBeCloseTo(entry.inputCost, 2);
                        expect(extractedEntry!.outputCostPerMillion).toBeCloseTo(entry.outputCost, 2);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);
});

/**
 * Generate HTML table from pricing entries
 */
function generatePricingTable(entries: Array<{ modelName: string; inputCost: number; outputCost: number }>): string {
    const rows = entries.map(entry => `
    <tr>
      <td>${entry.modelName}</td>
      <td>$${entry.inputCost.toFixed(2)}</td>
      <td>$${entry.outputCost.toFixed(2)}</td>
    </tr>
  `).join('');

    return `
    <html>
      <body>
        <table>
          <tr>
            <th>Model</th>
            <th>Input Cost</th>
            <th>Output Cost</th>
          </tr>
          ${rows}
        </table>
      </body>
    </html>
  `;
}
