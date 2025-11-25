/**
 * Property-Based Test: Strategy Fallback Order
 * Feature: dynamic-model-pricing, Property 27: Strategy Fallback Order
 *
 * Validates: Requirements 6.3
 *
 * Property: For any provider with multiple scraping strategies, the system
 * should try them in the configured order until one succeeds.
 */

import * as fc from 'fast-check';
import { BaseHTMLScraper } from '../base-scraper';
import { PricingData, ScrapingConfig, ProviderType } from '../../types/core';

// Create a test scraper class
class TestScraper extends BaseHTMLScraper {
    private mockConfig: ScrapingConfig;
    private mockHTML: string;
    private strategiesAttempted: string[] = [];

    constructor(provider: ProviderType, config: ScrapingConfig, html: string) {
        super(provider);
        this.mockConfig = config;
        this.mockHTML = html;
    }

    protected async getDefaultScrapingConfig(): Promise<ScrapingConfig> {
        return this.mockConfig;
    }

    // Override fetchHTML to return mock HTML
    protected async fetchHTML(url: string): Promise<string> {
        return this.mockHTML;
    }

    // Track which strategies are attempted
    protected extractPricing(
        html: string,
        selectors: ScrapingConfig['selectors']
    ): PricingData[] {
        this.strategiesAttempted.push(selectors.table);

        // Simulate success only for specific selector
        if (selectors.table === 'success-table') {
            return [
                {
                    modelName: 'test-model',
                    inputCostPerMillion: 1.0,
                    outputCostPerMillion: 2.0,
                },
            ];
        }

        // All other selectors fail
        return [];
    }

    getStrategiesAttempted(): string[] {
        return this.strategiesAttempted;
    }
}

describe('Property 27: Strategy Fallback Order', () => {
    /**
     * Arbitrary for generating provider types
     */
    const providerArb = fc.constantFrom<ProviderType>(
        'openai',
        'anthropic',
        'google',
        'xai'
    );

    test(
        'strategies are tried in configured order',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    fc.integer({ min: 0, max: 4 }), // 0-4 for 5 total strategies
                    async (provider, successIndex) => {
                        // Create a list of strategies where one will succeed
                        const strategies: ScrapingConfig['selectors'][] = [];
                        for (let i = 0; i < 5; i++) {
                            strategies.push({
                                table: i === successIndex ? 'success-table' : `fail-table-${i}`,
                                modelNameColumn: 0,
                                inputCostColumn: 1,
                                outputCostColumn: 2,
                            });
                        }

                        const config: ScrapingConfig = {
                            url: 'https://example.com/pricing',
                            selectors: strategies[0],
                            fallbackSelectors: strategies.slice(1),
                        };

                        const scraper = new TestScraper(provider, config, '<html></html>');
                        const result = await scraper.scrapePricing();

                        // Verify pricing was extracted
                        expect(result.length).toBeGreaterThan(0);

                        // Verify strategies were tried in order up to and including the successful one
                        const attempted = scraper.getStrategiesAttempted();
                        expect(attempted).toHaveLength(successIndex + 1);

                        // Verify the order matches the configured order
                        for (let i = 0; i <= successIndex; i++) {
                            expect(attempted[i]).toBe(strategies[i].table);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'primary strategy is always tried first',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    fc.array(
                        fc.record({
                            table: fc.string({ minLength: 1, maxLength: 20 }),
                            modelNameColumn: fc.integer({ min: 0, max: 5 }),
                            inputCostColumn: fc.integer({ min: 0, max: 5 }),
                            outputCostColumn: fc.integer({ min: 0, max: 5 }),
                        }),
                        { minLength: 1, maxLength: 5 }
                    ),
                    async (provider, fallbackSelectors) => {
                        const primarySelector = {
                            table: 'primary-table',
                            modelNameColumn: 0,
                            inputCostColumn: 1,
                            outputCostColumn: 2,
                        };

                        const config: ScrapingConfig = {
                            url: 'https://example.com/pricing',
                            selectors: primarySelector,
                            fallbackSelectors,
                        };

                        const scraper = new TestScraper(provider, config, '<html></html>');

                        try {
                            await scraper.scrapePricing();
                        } catch (error) {
                            // Expected to fail since no strategy succeeds
                        }

                        const attempted = scraper.getStrategiesAttempted();

                        // Verify primary was tried first
                        expect(attempted.length).toBeGreaterThan(0);
                        expect(attempted[0]).toBe('primary-table');
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'fallback strategies are tried in order after primary fails',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    fc.array(
                        fc.string({ minLength: 1, maxLength: 20 }),
                        { minLength: 2, maxLength: 5 }
                    ),
                    async (provider, tableNames) => {
                        const primarySelector = {
                            table: 'primary-table',
                            modelNameColumn: 0,
                            inputCostColumn: 1,
                            outputCostColumn: 2,
                        };

                        const fallbackSelectors = tableNames.map((table) => ({
                            table,
                            modelNameColumn: 0,
                            inputCostColumn: 1,
                            outputCostColumn: 2,
                        }));

                        const config: ScrapingConfig = {
                            url: 'https://example.com/pricing',
                            selectors: primarySelector,
                            fallbackSelectors,
                        };

                        const scraper = new TestScraper(provider, config, '<html></html>');

                        try {
                            await scraper.scrapePricing();
                        } catch (error) {
                            // Expected to fail since no strategy succeeds
                        }

                        const attempted = scraper.getStrategiesAttempted();

                        // Verify all strategies were tried
                        expect(attempted).toHaveLength(1 + fallbackSelectors.length);

                        // Verify primary was first
                        expect(attempted[0]).toBe('primary-table');

                        // Verify fallbacks were tried in order
                        for (let i = 0; i < fallbackSelectors.length; i++) {
                            expect(attempted[i + 1]).toBe(tableNames[i]);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'scraping stops after first successful strategy',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    fc.integer({ min: 0, max: 3 }), // 0-3 so there's always at least one strategy after success
                    async (provider, successIndex) => {
                        // Create strategies where one succeeds (not the last one)
                        const strategies: ScrapingConfig['selectors'][] = [];
                        for (let i = 0; i < 5; i++) {
                            strategies.push({
                                table: i === successIndex ? 'success-table' : `fail-table-${i}`,
                                modelNameColumn: 0,
                                inputCostColumn: 1,
                                outputCostColumn: 2,
                            });
                        }

                        const config: ScrapingConfig = {
                            url: 'https://example.com/pricing',
                            selectors: strategies[0],
                            fallbackSelectors: strategies.slice(1),
                        };

                        const scraper = new TestScraper(provider, config, '<html></html>');
                        await scraper.scrapePricing();

                        const attempted = scraper.getStrategiesAttempted();

                        // Verify only strategies up to and including the successful one were tried
                        expect(attempted).toHaveLength(successIndex + 1);

                        // Verify no strategies after the successful one were tried
                        expect(attempted.length).toBeLessThan(strategies.length);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );
});
