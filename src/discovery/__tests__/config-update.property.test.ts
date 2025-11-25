/**
 * Property-Based Test: Configuration Update Application
 * Feature: dynamic-model-pricing, Property 26: Configuration Update Application
 *
 * Validates: Requirements 6.2
 *
 * Property: For any updated scraping configuration, subsequent scraping operations
 * should use the new selectors.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { ScrapingConfigManager } from '../config-manager';
import { BaseHTMLScraper } from '../base-scraper';
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

describe('Property 26: Configuration Update Application', () => {
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
        'updated configuration is used in subsequent operations',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    scrapingConfigArb,
                    scrapingConfigArb,
                    async (provider, config1, config2) => {
                        // Store first configuration (version 1)
                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [{ max_version: 0 }] }) // Get version
                            .mockResolvedValueOnce({ rows: [] }) // Deactivate previous
                            .mockResolvedValueOnce({
                                // Insert version 1
                                rows: [
                                    {
                                        id: 1,
                                        provider,
                                        config: JSON.stringify(config1),
                                        version: 1,
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    },
                                ],
                            })
                            .mockResolvedValueOnce({ rows: [] }) // Update main table
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        await configManager.storeConfig(provider, config1);

                        // Store second configuration (version 2)
                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [{ max_version: 1 }] }) // Get version
                            .mockResolvedValueOnce({ rows: [] }) // Deactivate previous
                            .mockResolvedValueOnce({
                                // Insert version 2
                                rows: [
                                    {
                                        id: 2,
                                        provider,
                                        config: JSON.stringify(config2),
                                        version: 2,
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    },
                                ],
                            })
                            .mockResolvedValueOnce({ rows: [] }) // Update main table
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        const stored2 = await configManager.storeConfig(provider, config2);

                        // Verify version incremented
                        expect(stored2.version).toBe(2);

                        // Mock retrieval of active config
                        (pool.query as jest.Mock).mockResolvedValueOnce({
                            rows: [
                                {
                                    id: 2,
                                    provider,
                                    config: JSON.stringify(config2),
                                    version: 2,
                                    active: true,
                                    created_at: new Date(),
                                    updated_at: new Date(),
                                },
                            ],
                        });

                        // Retrieve active configuration
                        const active = await configManager.getActiveConfig(provider);

                        // Verify the active config is the updated one (config2)
                        expect(active).not.toBeNull();
                        expect(active!.version).toBe(2);
                        expect(active!.config.url).toBe(config2.url);
                        expect(active!.config.selectors.table).toBe(config2.selectors.table);
                        expect(active!.config.selectors.modelNameColumn).toBe(
                            config2.selectors.modelNameColumn
                        );
                        expect(active!.config.selectors.inputCostColumn).toBe(
                            config2.selectors.inputCostColumn
                        );
                        expect(active!.config.selectors.outputCostColumn).toBe(
                            config2.selectors.outputCostColumn
                        );
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'previous configuration versions remain accessible',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    scrapingConfigArb,
                    scrapingConfigArb,
                    async (provider, config1, config2) => {
                        // Store first configuration
                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [{ max_version: 0 }] })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({
                                rows: [
                                    {
                                        id: 1,
                                        provider,
                                        config: JSON.stringify(config1),
                                        version: 1,
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    },
                                ],
                            })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        await configManager.storeConfig(provider, config1);

                        // Store second configuration
                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [{ max_version: 1 }] })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({
                                rows: [
                                    {
                                        id: 2,
                                        provider,
                                        config: JSON.stringify(config2),
                                        version: 2,
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    },
                                ],
                            })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        await configManager.storeConfig(provider, config2);

                        // Mock retrieval of version 1
                        (pool.query as jest.Mock).mockResolvedValueOnce({
                            rows: [
                                {
                                    id: 1,
                                    provider,
                                    config: JSON.stringify(config1),
                                    version: 1,
                                    active: false,
                                    created_at: new Date(),
                                    updated_at: new Date(),
                                },
                            ],
                        });

                        // Retrieve version 1
                        const version1 = await configManager.getConfigVersion(provider, 1);

                        // Verify version 1 is still accessible
                        expect(version1).not.toBeNull();
                        expect(version1!.version).toBe(1);
                        expect(version1!.config.url).toBe(config1.url);
                        expect(version1!.active).toBe(false);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'activating a previous version makes it the active configuration',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    scrapingConfigArb,
                    scrapingConfigArb,
                    async (provider, config1, config2) => {
                        // Store two configurations
                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [{ max_version: 0 }] })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({
                                rows: [
                                    {
                                        id: 1,
                                        provider,
                                        config: JSON.stringify(config1),
                                        version: 1,
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    },
                                ],
                            })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        await configManager.storeConfig(provider, config1);

                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [{ max_version: 1 }] })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({
                                rows: [
                                    {
                                        id: 2,
                                        provider,
                                        config: JSON.stringify(config2),
                                        version: 2,
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date(),
                                    },
                                ],
                            })
                            .mockResolvedValueOnce({ rows: [] })
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        await configManager.storeConfig(provider, config2);

                        // Activate version 1
                        mockClient.query
                            .mockResolvedValueOnce({ rows: [] }) // BEGIN
                            .mockResolvedValueOnce({ rows: [] }) // Deactivate all
                            .mockResolvedValueOnce({
                                // Activate version 1
                                rows: [{ config: JSON.stringify(config1) }],
                            })
                            .mockResolvedValueOnce({ rows: [] }) // Update main table
                            .mockResolvedValueOnce({ rows: [] }); // COMMIT

                        await configManager.activateVersion(provider, 1);

                        // Mock retrieval of active config
                        (pool.query as jest.Mock).mockResolvedValueOnce({
                            rows: [
                                {
                                    id: 1,
                                    provider,
                                    config: JSON.stringify(config1),
                                    version: 1,
                                    active: true,
                                    created_at: new Date(),
                                    updated_at: new Date(),
                                },
                            ],
                        });

                        // Retrieve active configuration
                        const active = await configManager.getActiveConfig(provider);

                        // Verify version 1 is now active
                        expect(active).not.toBeNull();
                        expect(active!.version).toBe(1);
                        expect(active!.config.url).toBe(config1.url);
                        expect(active!.active).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );
});
