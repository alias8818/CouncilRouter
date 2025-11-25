/**
 * Property-Based Test: Configuration Storage Completeness
 * Feature: dynamic-model-pricing, Property 25: Configuration Storage Completeness
 *
 * Validates: Requirements 6.1
 *
 * Property: For any scraping configuration, all required fields (URL, selectors)
 * should be stored for each provider.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { ScrapingConfigManager } from '../config-manager';
import { ProviderType, ScrapingConfig } from '../../types/core';

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

describe('Property 25: Configuration Storage Completeness', () => {
    let pool: Pool;
    let configManager: ScrapingConfigManager;
    let mockClient: any;

    beforeEach(() => {
        pool = new Pool();
        configManager = new ScrapingConfigManager(pool);
        mockClient = {
            query: jest.fn(),
            release: jest.fn(),
        };
        (pool.connect as jest.Mock).mockResolvedValue(mockClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Arbitrary for generating provider types
     */
    const providerArb = fc.constantFrom<ProviderType>(
        'openai',
        'anthropic',
        'google',
        'xai'
    );

    /**
     * Arbitrary for generating selector configurations
     */
    const selectorArb = fc.record({
        table: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        modelNameColumn: fc.integer({ min: 0, max: 10 }),
        inputCostColumn: fc.integer({ min: 0, max: 10 }),
        outputCostColumn: fc.integer({ min: 0, max: 10 }),
    });

    /**
     * Arbitrary for generating scraping configurations
     */
    const scrapingConfigArb = fc.record({
        url: fc.webUrl(),
        selectors: selectorArb,
        fallbackSelectors: fc.option(fc.array(selectorArb, { minLength: 1, maxLength: 3 }), {
            nil: undefined,
        }),
    });

    test(
        'stored configuration contains all required fields',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    scrapingConfigArb,
                    async (provider, config) => {
                        // Setup mock responses - need to mock BEGIN, queries, and COMMIT
                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [{ max_version: 0 }] }) // Get version
                            .mockResolvedValueOnce({ rows: [] }) // Deactivate previous
                            .mockResolvedValueOnce({
                                // Insert new version
                                rows: [
                                    {
                                        id: 1,
                                        provider,
                                        config: JSON.stringify(config),
                                        version: 1,
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    },
                                ],
                            })
                            .mockResolvedValueOnce({ rows: [] }) // Update main table
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        // Store configuration
                        const stored = await configManager.storeConfig(provider, config);

                        // Verify all required fields are present
                        expect(stored.provider).toBe(provider);
                        expect(stored.config).toBeDefined();
                        expect(stored.config.url).toBe(config.url);
                        expect(stored.config.selectors).toBeDefined();
                        expect(stored.config.selectors.table).toBe(config.selectors.table);
                        expect(stored.config.selectors.modelNameColumn).toBe(
                            config.selectors.modelNameColumn
                        );
                        expect(stored.config.selectors.inputCostColumn).toBe(
                            config.selectors.inputCostColumn
                        );
                        expect(stored.config.selectors.outputCostColumn).toBe(
                            config.selectors.outputCostColumn
                        );

                        // Verify fallback selectors if present
                        if (config.fallbackSelectors) {
                            expect(stored.config.fallbackSelectors).toBeDefined();
                            expect(stored.config.fallbackSelectors?.length).toBe(
                                config.fallbackSelectors.length
                            );
                        }

                        // Verify version and active status
                        expect(stored.version).toBeGreaterThan(0);
                        expect(stored.active).toBe(true);
                        expect(stored.createdAt).toBeDefined();
                        expect(stored.updatedAt).toBeDefined();
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'configuration round-trip preserves all fields',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    scrapingConfigArb,
                    async (provider, config) => {
                        // Setup mock for storing
                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [{ max_version: 0 }] })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({
                                rows: [
                                    {
                                        id: 1,
                                        provider,
                                        config: JSON.stringify(config),
                                        version: 1,
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    },
                                ],
                            })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        await configManager.storeConfig(provider, config);

                        // Setup mock for retrieving
                        (pool.query as jest.Mock).mockResolvedValueOnce({
                            rows: [
                                {
                                    id: 1,
                                    provider,
                                    config: JSON.stringify(config),
                                    version: 1,
                                    active: true,
                                    created_at: new Date(),
                                    updated_at: new Date(),
                                },
                            ],
                        });

                        // Retrieve configuration
                        const retrieved = await configManager.getActiveConfig(provider);

                        // Verify round-trip preserves all fields
                        expect(retrieved).not.toBeNull();
                        expect(retrieved!.config.url).toBe(config.url);
                        expect(retrieved!.config.selectors.table).toBe(config.selectors.table);
                        expect(retrieved!.config.selectors.modelNameColumn).toBe(
                            config.selectors.modelNameColumn
                        );
                        expect(retrieved!.config.selectors.inputCostColumn).toBe(
                            config.selectors.inputCostColumn
                        );
                        expect(retrieved!.config.selectors.outputCostColumn).toBe(
                            config.selectors.outputCostColumn
                        );

                        if (config.fallbackSelectors) {
                            expect(retrieved!.config.fallbackSelectors).toBeDefined();
                            expect(retrieved!.config.fallbackSelectors?.length).toBe(
                                config.fallbackSelectors.length
                            );

                            // Verify each fallback selector
                            config.fallbackSelectors.forEach((fallback, index) => {
                                const retrievedFallback = retrieved!.config.fallbackSelectors![index];
                                expect(retrievedFallback.table).toBe(fallback.table);
                                expect(retrievedFallback.modelNameColumn).toBe(
                                    fallback.modelNameColumn
                                );
                                expect(retrievedFallback.inputCostColumn).toBe(
                                    fallback.inputCostColumn
                                );
                                expect(retrievedFallback.outputCostColumn).toBe(
                                    fallback.outputCostColumn
                                );
                            });
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'multiple selector strategies are preserved',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    fc.array(selectorArb, { minLength: 1, maxLength: 5 }),
                    async (provider, fallbackSelectors) => {
                        const config: ScrapingConfig = {
                            url: 'https://example.com/pricing',
                            selectors: fallbackSelectors[0],
                            fallbackSelectors: fallbackSelectors.slice(1),
                        };

                        // Setup mocks
                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [{ max_version: 0 }] })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({
                                rows: [
                                    {
                                        id: 1,
                                        provider,
                                        config: JSON.stringify(config),
                                        version: 1,
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    },
                                ],
                            })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        const stored = await configManager.storeConfig(provider, config);

                        // Verify all strategies are stored
                        expect(stored.config.selectors).toBeDefined();
                        if (config.fallbackSelectors && config.fallbackSelectors.length > 0) {
                            expect(stored.config.fallbackSelectors).toBeDefined();
                            expect(stored.config.fallbackSelectors?.length).toBe(
                                config.fallbackSelectors.length
                            );
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );
});
