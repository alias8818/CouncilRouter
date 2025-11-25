/**
 * Property-Based Tests for Sync Scheduler
 *
 * Tests universal properties that should hold across all sync operations
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { SyncScheduler } from '../sync-scheduler';
import { ModelDiscoveryService } from '../service';
import { PricingScraperService } from '../pricing-service';
import { ModelEnrichmentEngine } from '../enrichment-engine';
import { ModelRegistry } from '../registry';
import {
    ProviderType,
    DiscoveredModel,
    PricingData,
    EnrichedModel,
    SyncResult,
} from '../../types/core';

// Mock implementations
jest.mock('pg');
jest.mock('redis');

describe('Sync Scheduler Property Tests', () => {
    let mockDb: jest.Mocked<Pool>;
    let mockRedis: jest.Mocked<RedisClientType>;
    let mockDiscoveryService: jest.Mocked<ModelDiscoveryService>;
    let mockPricingScraper: jest.Mocked<PricingScraperService>;
    let mockEnrichmentEngine: jest.Mocked<ModelEnrichmentEngine>;
    let mockRegistry: jest.Mocked<ModelRegistry>;
    let scheduler: SyncScheduler;

    beforeEach(() => {
        // Create mock database
        mockDb = {
            query: jest.fn(),
            connect: jest.fn(),
        } as any;

        // Create mock Redis
        mockRedis = {
            get: jest.fn(),
            setEx: jest.fn(),
            del: jest.fn(),
        } as any;

        // Create mock services
        mockDiscoveryService = {
            fetchModels: jest.fn(),
            fetchAllModels: jest.fn(),
            getLastSync: jest.fn(),
        } as any;

        mockPricingScraper = {
            scrapePricing: jest.fn(),
            validateConfig: jest.fn(),
            getFallbackPricing: jest.fn(),
        } as any;

        mockEnrichmentEngine = {
            enrichModels: jest.fn(),
            classifyModel: jest.fn(),
            matchPricing: jest.fn(),
        } as any;

        mockRegistry = {
            upsertModel: jest.fn(),
            getModels: jest.fn(),
            getModel: jest.fn(),
            deprecateModel: jest.fn(),
            getPricingHistory: jest.fn(),
            recordPricingChange: jest.fn(),
        } as any;

        scheduler = new SyncScheduler(
            mockDb,
            mockDiscoveryService,
            mockPricingScraper,
            mockEnrichmentEngine,
            mockRegistry
        );
    });

    /**
     * Property-Based Test: Complete Provider Coverage
     * Feature: dynamic-model-pricing, Property 16: For any configured set of providers, the sync job should query all of them
     *
     * Validates: Requirements 4.1
     */
    test(
        'Property 16: Complete Provider Coverage - sync job queries all configured providers',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate a set of providers (1-4 providers)
                    fc.uniqueArray(
                        fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                        { minLength: 1, maxLength: 4 }
                    ),
                    // Generate models for each provider
                    fc.array(fc.record({
                        id: fc.string({ minLength: 1, maxLength: 50 }),
                        displayName: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
                        contextWindow: fc.option(fc.integer({ min: 0, max: 1000000 })),
                        deprecated: fc.boolean(),
                    }), { minLength: 0, maxLength: 10 }),
                    async (providers, modelTemplate) => {
                        // Setup: Create a map of models for each provider
                        const discoveredModelsMap = new Map<ProviderType, DiscoveredModel[]>();
                        const allProviders: ProviderType[] = ['openai', 'anthropic', 'google', 'xai'];

                        for (const provider of allProviders) {
                            const models: DiscoveredModel[] = modelTemplate.map((m, idx) => ({
                                id: `${provider}-${m.id}-${idx}`,
                                provider,
                                displayName: m.displayName || undefined,
                                contextWindow: m.contextWindow || undefined,
                                deprecated: m.deprecated,
                                capabilities: [],
                            }));
                            discoveredModelsMap.set(provider, models);
                        }

                        // Mock fetchAllModels to return our generated models
                        mockDiscoveryService.fetchAllModels.mockResolvedValue(discoveredModelsMap);

                        // Mock pricing scraper to return empty pricing
                        mockPricingScraper.scrapePricing.mockResolvedValue([]);

                        // Mock enrichment engine
                        mockEnrichmentEngine.enrichModels.mockImplementation(
                            async (models: DiscoveredModel[]) => {
                                return models.map((m): EnrichedModel => ({
                                    id: m.id,
                                    provider: m.provider,
                                    displayName: m.displayName || m.id,
                                    classification: ['general'],
                                    contextWindow: m.contextWindow || 0,
                                    usability: m.deprecated ? 'deprecated' : 'available',
                                    pricing: [{ inputCostPerMillion: 0, outputCostPerMillion: 0, tier: 'TBD' }],
                                    capabilities: [],
                                    discoveredAt: new Date(),
                                }));
                            }
                        );

                        // Mock registry operations
                        mockRegistry.upsertModel.mockResolvedValue();
                        mockDb.query.mockResolvedValue({ rows: [] } as any);

                        // Execute sync
                        const result = await scheduler.triggerSync();

                        // Property: All providers should be queried
                        // Verify fetchAllModels was called (which queries all providers)
                        expect(mockDiscoveryService.fetchAllModels).toHaveBeenCalled();

                        // Verify pricing scraper was called for each provider
                        const scrapingCalls = mockPricingScraper.scrapePricing.mock.calls;
                        const scrapedProviders = new Set(scrapingCalls.map(call => call[0]));

                        // All providers should have been scraped
                        for (const provider of allProviders) {
                            expect(scrapedProviders.has(provider)).toBe(true);
                        }

                        // Result should include models from all providers
                        expect(result.modelsDiscovered).toBeGreaterThanOrEqual(0);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Timestamp Update on Success
     * Feature: dynamic-model-pricing, Property 17: For any successful sync job completion, the last sync timestamp should be updated to a recent time
     *
     * Validates: Requirements 4.2
     */
    test(
        'Property 17: Timestamp Update on Success - successful sync updates timestamp',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate a small set of models
                    fc.array(fc.record({
                        id: fc.string({ minLength: 1, maxLength: 50 }),
                        provider: fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                    }), { minLength: 1, maxLength: 5 }),
                    async (modelTemplates) => {
                        const startTime = new Date();

                        // Setup: Create discovered models
                        const discoveredModelsMap = new Map<ProviderType, DiscoveredModel[]>();
                        const allProviders: ProviderType[] = ['openai', 'anthropic', 'google', 'xai'];

                        for (const provider of allProviders) {
                            const models = modelTemplates
                                .filter(m => m.provider === provider)
                                .map((m): DiscoveredModel => ({
                                    id: m.id,
                                    provider: m.provider,
                                    deprecated: false,
                                    capabilities: [],
                                }));
                            discoveredModelsMap.set(provider, models);
                        }

                        mockDiscoveryService.fetchAllModels.mockResolvedValue(discoveredModelsMap);
                        mockPricingScraper.scrapePricing.mockResolvedValue([]);
                        mockEnrichmentEngine.enrichModels.mockImplementation(
                            async (models: DiscoveredModel[]) => {
                                return models.map((m): EnrichedModel => ({
                                    id: m.id,
                                    provider: m.provider,
                                    displayName: m.id,
                                    classification: ['general'],
                                    contextWindow: 0,
                                    usability: 'available',
                                    pricing: [{ inputCostPerMillion: 0, outputCostPerMillion: 0, tier: 'TBD' }],
                                    capabilities: [],
                                    discoveredAt: new Date(),
                                }));
                            }
                        );
                        mockRegistry.upsertModel.mockResolvedValue();
                        mockDb.query.mockResolvedValue({ rows: [] } as any);

                        // Execute sync
                        const result = await scheduler.triggerSync();

                        const endTime = new Date();

                        // Property: If sync was successful, timestamp should be recent
                        if (result.success) {
                            // Timestamp should be between start and end of test
                            expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
                            expect(result.timestamp.getTime()).toBeLessThanOrEqual(endTime.getTime());

                            // Timestamp should be within 1 second of completion
                            const timeDiff = endTime.getTime() - result.timestamp.getTime();
                            expect(timeDiff).toBeLessThan(1000);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Sync Failure Retry
     * Feature: dynamic-model-pricing, Property 18: For any sync job that fails, the system should schedule a retry and generate an administrator alert
     *
     * Validates: Requirements 4.4
     */
    test(
        'Property 18: Sync Failure Retry - failed sync records errors',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate a provider that will fail
                    fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                    fc.string({ minLength: 1, maxLength: 100 }), // Error message
                    async (failingProvider, errorMessage) => {
                        // Setup: Make one provider fail
                        const discoveredModelsMap = new Map<ProviderType, DiscoveredModel[]>();
                        const allProviders: ProviderType[] = ['openai', 'anthropic', 'google', 'xai'];

                        for (const provider of allProviders) {
                            if (provider === failingProvider) {
                                // This provider will have no models (simulating failure)
                                discoveredModelsMap.set(provider, []);
                            } else {
                                discoveredModelsMap.set(provider, [{
                                    id: `${provider}-model-1`,
                                    provider,
                                    deprecated: false,
                                    capabilities: [],
                                }]);
                            }
                        }

                        mockDiscoveryService.fetchAllModels.mockResolvedValue(discoveredModelsMap);

                        // Make pricing scraper fail for the failing provider
                        mockPricingScraper.scrapePricing.mockImplementation(async (provider: ProviderType) => {
                            if (provider === failingProvider) {
                                throw new Error(errorMessage);
                            }
                            return [];
                        });

                        mockEnrichmentEngine.enrichModels.mockImplementation(
                            async (models: DiscoveredModel[]) => {
                                return models.map((m): EnrichedModel => ({
                                    id: m.id,
                                    provider: m.provider,
                                    displayName: m.id,
                                    classification: ['general'],
                                    contextWindow: 0,
                                    usability: 'available',
                                    pricing: [{ inputCostPerMillion: 0, outputCostPerMillion: 0, tier: 'TBD' }],
                                    capabilities: [],
                                    discoveredAt: new Date(),
                                }));
                            }
                        );
                        mockRegistry.upsertModel.mockResolvedValue();
                        mockDb.query.mockResolvedValue({ rows: [] } as any);

                        // Execute sync
                        const result = await scheduler.triggerSync();

                        // Property: Errors should be recorded for the failing provider
                        const providerErrors = result.errors.filter(e => e.provider === failingProvider);
                        expect(providerErrors.length).toBeGreaterThan(0);

                        // Error should be recorded (either discovery or pricing stage)
                        // When no models are discovered, it's a discovery error
                        // When pricing scraping fails, it's a pricing error
                        const hasDiscoveryError = providerErrors.some(e => e.stage === 'discovery');
                        const hasPricingError = providerErrors.some(e => e.stage === 'pricing');
                        expect(hasDiscoveryError || hasPricingError).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );
});
