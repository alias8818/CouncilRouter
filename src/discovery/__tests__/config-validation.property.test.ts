/**
 * Property-Based Test: Configuration Validation
 * Feature: dynamic-model-pricing, Property 29: Configuration Validation
 *
 * Validates: Requirements 6.5
 *
 * Property: For any scraping configuration update, invalid configurations
 * should be rejected before being applied.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { ScrapingConfigManager } from '../config-manager';
import { ScrapingConfig } from '../../types/core';

// Mock database
jest.mock('pg', () => {
    const mClient = {
        query: jest.fn(),
        release: jest.fn(),
    };
    const mPool = {
        connect: jest.fn(() => Promise.resolve(mClient)),
        query: jest.fn(),
        end: jest.fn(),
    };
    return { Pool: jest.fn(() => mPool) };
});

describe('Property 29: Configuration Validation', () => {
    let pool: Pool;
    let configManager: ScrapingConfigManager;

    beforeEach(() => {
        pool = new Pool();
        configManager = new ScrapingConfigManager(pool);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Arbitrary for generating valid selector configurations
     */
    const validSelectorArb = fc.record({
        table: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        modelNameColumn: fc.integer({ min: 0, max: 10 }),
        inputCostColumn: fc.integer({ min: 0, max: 10 }),
        outputCostColumn: fc.integer({ min: 0, max: 10 }),
    });

    /**
     * Arbitrary for generating valid scraping configurations
     */
    const validConfigArb = fc.record({
        url: fc.webUrl(),
        selectors: validSelectorArb,
        fallbackSelectors: fc.option(fc.array(validSelectorArb, { minLength: 1, maxLength: 3 }), {
            nil: undefined,
        }),
    });

    test(
        'valid configurations pass validation',
        async () => {
            await fc.assert(
                fc.asyncProperty(validConfigArb, async (config) => {
                    const result = await configManager.validateConfig(config);

                    expect(result.valid).toBe(true);
                    expect(result.errors).toHaveLength(0);
                }),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'configurations with invalid URLs are rejected',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
                        try {
                            new URL(s);
                            return false;
                        } catch {
                            return true;
                        }
                    }),
                    validSelectorArb,
                    async (invalidUrl, selectors) => {
                        const config: ScrapingConfig = {
                            url: invalidUrl,
                            selectors,
                        };

                        const result = await configManager.validateConfig(config);

                        expect(result.valid).toBe(false);
                        expect(result.errors.length).toBeGreaterThan(0);
                        expect(result.errors.some((e) => e.includes('Invalid URL'))).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'configurations with empty table selectors are rejected',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.webUrl(),
                    fc.integer({ min: 0, max: 10 }),
                    fc.integer({ min: 0, max: 10 }),
                    fc.integer({ min: 0, max: 10 }),
                    async (url, modelCol, inputCol, outputCol) => {
                        const config: ScrapingConfig = {
                            url,
                            selectors: {
                                table: '', // Empty table selector
                                modelNameColumn: modelCol,
                                inputCostColumn: inputCol,
                                outputCostColumn: outputCol,
                            },
                        };

                        const result = await configManager.validateConfig(config);

                        expect(result.valid).toBe(false);
                        expect(result.errors.length).toBeGreaterThan(0);
                        expect(
                            result.errors.some((e) => e.includes('Table selector is required'))
                        ).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'configurations with negative column indices are rejected',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.webUrl(),
                    fc.string({ minLength: 1, maxLength: 50 }),
                    fc.integer({ min: -10, max: -1 }),
                    async (url, table, negativeIndex) => {
                        const config: ScrapingConfig = {
                            url,
                            selectors: {
                                table,
                                modelNameColumn: negativeIndex,
                                inputCostColumn: 0,
                                outputCostColumn: 0,
                            },
                        };

                        const result = await configManager.validateConfig(config);

                        expect(result.valid).toBe(false);
                        expect(result.errors.length).toBeGreaterThan(0);
                        expect(
                            result.errors.some((e) => e.includes('must be non-negative'))
                        ).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'configurations with non-numeric column indices are rejected',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.webUrl(),
                    fc.string({ minLength: 1, maxLength: 50 }),
                    async (url, table) => {
                        const config: any = {
                            url,
                            selectors: {
                                table,
                                modelNameColumn: 'not a number',
                                inputCostColumn: 0,
                                outputCostColumn: 0,
                            },
                        };

                        const result = await configManager.validateConfig(config);

                        expect(result.valid).toBe(false);
                        expect(result.errors.length).toBeGreaterThan(0);
                        expect(
                            result.errors.some((e) => e.includes('must be a number'))
                        ).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'configurations with invalid fallback selectors are rejected',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.webUrl(),
                    validSelectorArb,
                    fc.integer({ min: -10, max: -1 }),
                    async (url, validSelector, negativeIndex) => {
                        const config: ScrapingConfig = {
                            url,
                            selectors: validSelector,
                            fallbackSelectors: [
                                {
                                    table: 'fallback-table',
                                    modelNameColumn: negativeIndex,
                                    inputCostColumn: 0,
                                    outputCostColumn: 0,
                                },
                            ],
                        };

                        const result = await configManager.validateConfig(config);

                        expect(result.valid).toBe(false);
                        expect(result.errors.length).toBeGreaterThan(0);
                        expect(
                            result.errors.some((e) => e.includes('Fallback selector'))
                        ).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'storing invalid configurations throws an error',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('openai', 'anthropic', 'google', 'xai'),
                    fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
                        try {
                            new URL(s);
                            return false;
                        } catch {
                            return true;
                        }
                    }),
                    validSelectorArb,
                    async (provider, invalidUrl, selectors) => {
                        const config: ScrapingConfig = {
                            url: invalidUrl,
                            selectors,
                        };

                        await expect(configManager.storeConfig(provider, config)).rejects.toThrow(
                            /Invalid configuration/
                        );
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );
});
