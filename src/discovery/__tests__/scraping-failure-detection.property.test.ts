/**
 * Property-Based Test: Scraping Failure Detection
 * Feature: dynamic-model-pricing, Property 10: Scraping Failure Detection
 * 
 * Validates: Requirements 2.5
 * 
 * For any HTML content that doesn't match the expected structure, the parsing 
 * should fail detectably and generate an alert.
 */

import * as fc from 'fast-check';
import { BaseHTMLScraper } from '../base-scraper';
import { ScrapingConfig } from '../../types/core';

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
    public testExtractPricing(html: string, selectors: ScrapingConfig['selectors']): any {
        try {
            return this.extractPricing(html, selectors);
        } catch (error) {
            return { error: true, message: (error as Error).message };
        }
    }
}

describe('Property 10: Scraping Failure Detection', () => {
    test('should throw error when table selector not found', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate HTML without the expected table
                fc.string({ minLength: 10, maxLength: 200 })
                    .filter(s => !s.includes('<table')), // Ensure no table tag
                async (htmlContent) => {
                    const html = `<html><body>${htmlContent}</body></html>`;

                    const scraper = new TestScraper();
                    const selectors = {
                        table: 'table',
                        modelNameColumn: 0,
                        inputCostColumn: 1,
                        outputCostColumn: 2
                    };

                    const result = scraper.testExtractPricing(html, selectors);

                    // Property: Should fail detectably when table not found
                    expect(result.error).toBe(true);
                    expect(result.message).toContain('not found');
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('should return empty array when table has no data rows', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate table with only header row
                fc.constant(null),
                async () => {
                    const html = `
            <html>
              <body>
                <table>
                  <tr>
                    <th>Model</th>
                    <th>Input Cost</th>
                    <th>Output Cost</th>
                  </tr>
                </table>
              </body>
            </html>
          `;

                    const scraper = new TestScraper();
                    const selectors = {
                        table: 'table',
                        modelNameColumn: 0,
                        inputCostColumn: 1,
                        outputCostColumn: 2
                    };

                    const result = scraper.testExtractPricing(html, selectors);

                    // Property: Should return empty array (not error) when table exists but has no data
                    expect(Array.isArray(result)).toBe(true);
                    expect(result).toHaveLength(0);
                }
            ),
            { numRuns: 10 }
        );
    }, 120000);

    test('should handle malformed HTML gracefully', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate various malformed HTML structures
                fc.oneof(
                    fc.constant('<table><tr><td>incomplete'),
                    fc.constant('<table></table>'),
                    fc.constant('<html><body><table><tr></tr></table></body></html>'),
                    fc.constant('<table><tr><td>only</td><td>two</td></tr></table>') // Missing third column
                ),
                async (malformedHtml) => {
                    const scraper = new TestScraper();
                    const selectors = {
                        table: 'table',
                        modelNameColumn: 0,
                        inputCostColumn: 1,
                        outputCostColumn: 2
                    };

                    const result = scraper.testExtractPricing(malformedHtml, selectors);

                    // Property: Should either return empty array or error, never crash
                    expect(result.error === true || Array.isArray(result)).toBe(true);

                    if (Array.isArray(result)) {
                        // If it returns an array, it should be empty (no valid data extracted)
                        expect(result).toHaveLength(0);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('should detect when column indices are out of bounds', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate table with limited columns
                fc.integer({ min: 1, max: 2 }),
                async (numColumns) => {
                    const cells = Array(numColumns).fill(0).map((_, i) => `<td>Cell ${i}</td>`).join('');
                    const html = `
            <html>
              <body>
                <table>
                  <tr><th>Header</th></tr>
                  <tr>${cells}</tr>
                </table>
              </body>
            </html>
          `;

                    const scraper = new TestScraper();
                    const selectors = {
                        table: 'table',
                        modelNameColumn: 0,
                        inputCostColumn: 1,
                        outputCostColumn: 2 // This will be out of bounds for numColumns < 3
                    };

                    const result = scraper.testExtractPricing(html, selectors);

                    // Property: Should handle out-of-bounds column access gracefully
                    if (numColumns < 3) {
                        // Should return empty array (no valid pricing extracted)
                        expect(Array.isArray(result)).toBe(true);
                        expect(result).toHaveLength(0);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);
});
