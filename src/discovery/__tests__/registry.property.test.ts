/**
 * Property-Based Tests for Model Registry
 *
 * Feature: dynamic-model-pricing
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { ModelRegistry } from '../registry';
import {
    EnrichedModel,
    ProviderType,
    ModelClassification,
    ModelUsability,
    ModelCapability,
    PricingData,
} from '../../types/core';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('Model Registry Property Tests', () => {
    /**
     * Property-Based Test: Model Storage Completeness
     * Feature: dynamic-model-pricing, Property 4: Model Storage Completeness
     *
     * Validates: Requirements 1.4
     *
     * For any newly discovered model, the stored record should contain
     * all extracted metadata and a valid timestamp.
     */
    test(
        'Property 4: Model Storage Completeness - stored models contain all metadata',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate arbitrary enriched models
                    fc.record({
                        id: fc.string({ minLength: 1, maxLength: 100 }),
                        provider: fc.constantFrom<ProviderType>(
                            'openai',
                            'anthropic',
                            'google',
                            'xai'
                        ),
                        displayName: fc.string({ minLength: 1, maxLength: 255 }),
                        classification: fc.array(
                            fc.constantFrom<ModelClassification>(
                                'chat',
                                'reasoning',
                                'coding',
                                'multimodal',
                                'embedding',
                                'tools',
                                'general'
                            ),
                            { minLength: 1, maxLength: 3 }
                        ),
                        contextWindow: fc.integer({ min: 1000, max: 1000000 }),
                        usability: fc.constantFrom<ModelUsability>(
                            'available',
                            'preview',
                            'deprecated'
                        ),
                        pricing: fc.array(
                            fc.record({
                                inputCostPerMillion: fc.float({ min: 0, max: 100 }),
                                outputCostPerMillion: fc.float({ min: 0, max: 100 }),
                                tier: fc.constantFrom('standard', 'batch', 'cached'),
                            }),
                            { minLength: 1, maxLength: 3 }
                        ),
                        capabilities: fc.array(
                            fc.record({
                                type: fc.constantFrom<ModelCapability['type']>(
                                    'chat',
                                    'completion',
                                    'embedding',
                                    'vision',
                                    'function_calling',
                                    'tools'
                                ),
                                supported: fc.boolean(),
                            }),
                            { minLength: 0, maxLength: 6 }
                        ),
                        discoveredAt: fc.date(),
                    }),
                    async (model: EnrichedModel) => {
                        // Create fresh mocks for this iteration
                        const mockDb = {
                            query: jest.fn(),
                            connect: jest.fn(),
                        } as any;

                        const mockRedis = {
                            get: jest.fn(),
                            setEx: jest.fn(),
                            del: jest.fn(),
                        } as any;

                        const registry = new ModelRegistry(mockDb, mockRedis);

                        // Setup mock to capture the query parameters
                        let capturedModelParams: any[] = [];
                        const capturedPricingParams: any[][] = [];

                        const mockClient = {
                            query: jest.fn((query: string, params?: any[]) => {
                                if (query.includes('INSERT INTO models')) {
                                    capturedModelParams = params || [];
                                    return Promise.resolve({ rows: [], rowCount: 1 });
                                } else if (query.includes('INSERT INTO model_pricing')) {
                                    capturedPricingParams.push(params || []);
                                    return Promise.resolve({ rows: [], rowCount: 1 });
                                } else if (query.includes('BEGIN') || query.includes('COMMIT')) {
                                    return Promise.resolve({ rows: [], rowCount: 0 });
                                }
                                return Promise.resolve({ rows: [], rowCount: 0 });
                            }),
                            release: jest.fn(),
                        };

                        mockDb.connect.mockResolvedValue(mockClient as any);

                        // Execute upsert
                        await registry.upsertModel(model);

                        // Verify model data was stored
                        expect(capturedModelParams.length).toBeGreaterThan(0);
                        expect(capturedModelParams[0]).toBe(model.id);
                        expect(capturedModelParams[1]).toBe(model.provider);
                        expect(capturedModelParams[2]).toBe(model.displayName);
                        expect(capturedModelParams[3]).toEqual(model.classification);
                        expect(capturedModelParams[4]).toBe(model.contextWindow);
                        expect(capturedModelParams[5]).toBe(model.usability);
                        expect(capturedModelParams[6]).toBe(
                            JSON.stringify(model.capabilities)
                        );
                        expect(capturedModelParams[7]).toBe(model.discoveredAt);
                        expect(capturedModelParams[8]).toBeInstanceOf(Date);

                        // Verify pricing data was stored for each tier
                        expect(capturedPricingParams).toHaveLength(model.pricing.length);
                        for (let i = 0; i < model.pricing.length; i++) {
                            const pricingParams = capturedPricingParams[i];
                            const pricing = model.pricing[i];

                            expect(pricingParams[0]).toBe(model.id);
                            expect(pricingParams[1]).toBe(pricing.inputCostPerMillion);
                            expect(pricingParams[2]).toBe(pricing.outputCostPerMillion);
                            expect(pricingParams[3]).toBe(pricing.tier);
                        }

                        // Verify transaction was committed
                        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
                        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
                        expect(mockClient.release).toHaveBeenCalled();
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Deprecation Detection
     * Feature: dynamic-model-pricing, Property 5: Deprecation Detection
     *
     * Validates: Requirements 1.5
     *
     * For any model that was previously discovered but is absent in a new API fetch,
     * the model should be marked as deprecated.
     */
    test(
        'Property 5: Deprecation Detection - models are marked as deprecated',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                    async (modelId: string, provider: ProviderType) => {
                        // Create fresh mocks for this iteration
                        const mockDb = {
                            query: jest.fn(),
                            connect: jest.fn(),
                        } as any;

                        const mockRedis = {
                            get: jest.fn(),
                            setEx: jest.fn(),
                            del: jest.fn(),
                        } as any;

                        const registry = new ModelRegistry(mockDb, mockRedis);

                        // Setup mock to capture the deprecation query
                        let capturedUpdateParams: any[] = [];
                        let deprecatedAtValue: Date | null = null;

                        mockDb.query.mockImplementation((query: string, params?: any[]) => {
                            if (query.includes('UPDATE models') && query.includes('deprecated')) {
                                capturedUpdateParams = params || [];
                                deprecatedAtValue = params?.[0] as Date;
                                return Promise.resolve({ rows: [], rowCount: 1 });
                            } else if (query.includes('SELECT provider FROM models')) {
                                return Promise.resolve({
                                    rows: [{ provider }],
                                    rowCount: 1,
                                });
                            }
                            return Promise.resolve({ rows: [], rowCount: 0 });
                        });

                        // Execute deprecation
                        await registry.deprecateModel(modelId);

                        // Verify the model was marked as deprecated
                        expect(capturedUpdateParams).toHaveLength(2);
                        expect(deprecatedAtValue).toBeInstanceOf(Date);
                        expect(capturedUpdateParams[1]).toBe(modelId);

                        // Verify the usability was set to 'deprecated'
                        expect(mockDb.query).toHaveBeenCalledWith(
                            expect.stringContaining("usability = 'deprecated'"),
                            expect.any(Array)
                        );

                        // Verify cache was invalidated
                        expect(mockRedis.del).toHaveBeenCalled();
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Provider Filtering Accuracy
     * Feature: dynamic-model-pricing, Property 21: Provider Filtering Accuracy
     *
     * Validates: Requirements 5.2
     *
     * For any model list filtered by provider, all returned models should be from
     * that provider and no models from that provider should be missing.
     */
    test(
        'Property 21: Provider Filtering Accuracy - filtering returns only matching provider models',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 1, maxLength: 100 }),
                            provider: fc.constantFrom<ProviderType>(
                                'openai',
                                'anthropic',
                                'google',
                                'xai'
                            ),
                            display_name: fc.string({ minLength: 1, maxLength: 255 }),
                            classification: fc.array(fc.string(), { minLength: 1 }),
                            context_window: fc.integer({ min: 1000, max: 1000000 }),
                            usability: fc.constantFrom('available', 'preview'),
                            capabilities: fc.array(fc.record({})),
                            discovered_at: fc.date(),
                            updated_at: fc.date(),
                            pricing: fc.array(
                                fc.record({
                                    inputCostPerMillion: fc.float({ min: 0, max: 100 }),
                                    outputCostPerMillion: fc.float({ min: 0, max: 100 }),
                                    tier: fc.string(),
                                })
                            ),
                        }),
                        { minLength: 5, maxLength: 20 }
                    ),
                    async (filterProvider: ProviderType, allModels: any[]) => {
                        // Create fresh mocks for this iteration
                        const mockDb = {
                            query: jest.fn(),
                            connect: jest.fn(),
                        } as any;

                        const mockRedis = {
                            get: jest.fn(),
                            setEx: jest.fn(),
                            del: jest.fn(),
                        } as any;

                        const registry = new ModelRegistry(mockDb, mockRedis);

                        // Filter models to match the provider
                        const expectedModels = allModels.filter(
                            (m) => m.provider === filterProvider
                        );

                        // Setup mock to return the filtered models
                        mockDb.query.mockResolvedValue({
                            rows: expectedModels,
                            rowCount: expectedModels.length,
                        });

                        // Execute getModels with provider filter
                        const result = await registry.getModels({ provider: filterProvider });

                        // Verify all returned models are from the specified provider
                        for (const model of result) {
                            expect(model.provider).toBe(filterProvider);
                        }

                        // Verify the query included the provider filter
                        expect(mockDb.query).toHaveBeenCalledWith(
                            expect.stringContaining('m.provider = $'),
                            expect.arrayContaining([filterProvider])
                        );

                        // Verify count matches expected
                        expect(result).toHaveLength(expectedModels.length);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Classification Filtering Accuracy
     * Feature: dynamic-model-pricing, Property 22: Classification Filtering Accuracy
     *
     * Validates: Requirements 5.3
     *
     * For any model list filtered by classification, all returned models should have
     * that classification and no models with that classification should be missing.
     */
    test(
        'Property 22: Classification Filtering Accuracy - filtering returns only matching classification models',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom<ModelClassification>(
                        'chat',
                        'reasoning',
                        'coding',
                        'multimodal',
                        'embedding',
                        'tools',
                        'general'
                    ),
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 1, maxLength: 100 }),
                            provider: fc.constantFrom<ProviderType>(
                                'openai',
                                'anthropic',
                                'google',
                                'xai'
                            ),
                            display_name: fc.string({ minLength: 1, maxLength: 255 }),
                            classification: fc.array(
                                fc.constantFrom<ModelClassification>(
                                    'chat',
                                    'reasoning',
                                    'coding',
                                    'multimodal',
                                    'embedding',
                                    'tools',
                                    'general'
                                ),
                                { minLength: 1, maxLength: 3 }
                            ),
                            context_window: fc.integer({ min: 1000, max: 1000000 }),
                            usability: fc.constantFrom('available', 'preview'),
                            capabilities: fc.array(fc.record({})),
                            discovered_at: fc.date(),
                            updated_at: fc.date(),
                            pricing: fc.array(fc.record({})),
                        }),
                        { minLength: 5, maxLength: 20 }
                    ),
                    async (filterClassification: ModelClassification, allModels: any[]) => {
                        // Create fresh mocks for this iteration
                        const mockDb = {
                            query: jest.fn(),
                            connect: jest.fn(),
                        } as any;

                        const mockRedis = {
                            get: jest.fn(),
                            setEx: jest.fn(),
                            del: jest.fn(),
                        } as any;

                        const registry = new ModelRegistry(mockDb, mockRedis);

                        // Filter models to match the classification
                        const expectedModels = allModels.filter((m) =>
                            m.classification.includes(filterClassification)
                        );

                        // Setup mock to return the filtered models
                        mockDb.query.mockResolvedValue({
                            rows: expectedModels,
                            rowCount: expectedModels.length,
                        });

                        // Execute getModels with classification filter
                        const result = await registry.getModels({
                            classification: filterClassification,
                        });

                        // Verify all returned models have the specified classification
                        for (const model of result) {
                            expect(model.classification).toContain(filterClassification);
                        }

                        // Verify the query included the classification filter
                        expect(mockDb.query).toHaveBeenCalledWith(
                            expect.stringContaining('= ANY(m.classification)'),
                            expect.arrayContaining([filterClassification])
                        );

                        // Verify count matches expected
                        expect(result).toHaveLength(expectedModels.length);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Historical Pricing Preservation
     * Feature: dynamic-model-pricing, Property 35: Historical Pricing Preservation
     *
     * Validates: Requirements 8.1
     *
     * For any pricing update, the previous pricing record should remain in the
     * database with its original timestamp.
     */
    test(
        'Property 35: Historical Pricing Preservation - old pricing is preserved',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    fc.record({
                        modelName: fc.string({ minLength: 1 }),
                        inputCostPerMillion: fc.float({ min: 0, max: 100 }),
                        outputCostPerMillion: fc.float({ min: 0, max: 100 }),
                        tier: fc.constantFrom('standard', 'batch', 'cached'),
                    }),
                    fc.record({
                        modelName: fc.string({ minLength: 1 }),
                        inputCostPerMillion: fc.float({ min: 0, max: 100 }),
                        outputCostPerMillion: fc.float({ min: 0, max: 100 }),
                        tier: fc.constantFrom('standard', 'batch', 'cached'),
                    }),
                    async (modelId: string, oldPricing: PricingData, newPricing: PricingData) => {
                        // Create fresh mocks for this iteration
                        const mockDb = {
                            query: jest.fn(),
                            connect: jest.fn(),
                        } as any;

                        const mockRedis = {
                            get: jest.fn(),
                            setEx: jest.fn(),
                            del: jest.fn(),
                        } as any;

                        const registry = new ModelRegistry(mockDb, mockRedis);

                        // Ensure tiers match for this test
                        newPricing.tier = oldPricing.tier;

                        let capturedHistoryInsert: any[] = [];
                        const mockClient = {
                            query: jest.fn((query: string, params?: any[]) => {
                                if (query.includes('SELECT effective_date FROM model_pricing')) {
                                    return Promise.resolve({
                                        rows: [{ effective_date: new Date('2024-01-01') }],
                                        rowCount: 1,
                                    });
                                } else if (query.includes('INSERT INTO pricing_history')) {
                                    capturedHistoryInsert = params || [];
                                    return Promise.resolve({ rows: [], rowCount: 1 });
                                } else if (query.includes('UPDATE model_pricing')) {
                                    return Promise.resolve({ rows: [], rowCount: 1 });
                                } else if (query.includes('BEGIN') || query.includes('COMMIT')) {
                                    return Promise.resolve({ rows: [], rowCount: 0 });
                                }
                                return Promise.resolve({ rows: [], rowCount: 0 });
                            }),
                            release: jest.fn(),
                        };

                        mockDb.connect.mockResolvedValue(mockClient as any);

                        // Execute pricing change
                        await registry.recordPricingChange(modelId, oldPricing, newPricing);

                        // Verify old pricing was inserted into history
                        expect(capturedHistoryInsert.length).toBeGreaterThan(0);
                        expect(capturedHistoryInsert[0]).toBe(modelId);
                        expect(capturedHistoryInsert[1]).toBe(oldPricing.inputCostPerMillion);
                        expect(capturedHistoryInsert[2]).toBe(oldPricing.outputCostPerMillion);
                        expect(capturedHistoryInsert[3]).toBe(oldPricing.tier || 'standard');
                        expect(capturedHistoryInsert[4]).toBeInstanceOf(Date);
                        expect(capturedHistoryInsert[5]).toBeInstanceOf(Date);

                        // Verify transaction was committed
                        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
                        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Date Range Query Accuracy
     * Feature: dynamic-model-pricing, Property 36: Date Range Query Accuracy
     *
     * Validates: Requirements 8.2
     *
     * For any historical pricing query with a date range, only records with
     * effective dates within that range should be returned.
     */
    test(
        'Property 36: Date Range Query Accuracy - queries respect date boundaries',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    fc.date({ min: new Date('2020-01-01'), max: new Date('2024-01-01') }),
                    fc.date({ min: new Date('2024-01-02'), max: new Date('2025-12-31') }),
                    async (modelId: string, startDate: Date, endDate: Date) => {
                        // Create fresh mocks for this iteration
                        const mockDb = {
                            query: jest.fn(),
                            connect: jest.fn(),
                        } as any;

                        const mockRedis = {
                            get: jest.fn(),
                            setEx: jest.fn(),
                            del: jest.fn(),
                        } as any;

                        const registry = new ModelRegistry(mockDb, mockRedis);

                        // Generate historical records within the date range
                        const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
                        const historicalRecords = [
                            {
                                model_id: modelId,
                                input_cost_per_million: 1.0,
                                output_cost_per_million: 2.0,
                                tier: 'standard',
                                effective_date: midDate,
                                end_date: null,
                            },
                        ];

                        mockDb.query.mockResolvedValue({
                            rows: historicalRecords,
                            rowCount: historicalRecords.length,
                        });

                        // Execute query
                        const result = await registry.getPricingHistory(
                            modelId,
                            startDate,
                            endDate
                        );

                        // Verify the query included date range parameters
                        expect(mockDb.query).toHaveBeenCalledWith(
                            expect.stringContaining('effective_date >= $2'),
                            expect.arrayContaining([modelId, startDate, endDate])
                        );

                        // Verify all returned records are within the date range
                        for (const record of result) {
                            expect(record.effectiveDate >= startDate).toBeTruthy();
                            if (record.endDate) {
                                expect(record.endDate <= endDate).toBeTruthy();
                            }
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Price Change Recording
     * Feature: dynamic-model-pricing, Property 37: Price Change Recording
     *
     * Validates: Requirements 8.3
     *
     * For any model whose price changes, both the old and new values should be
     * recorded along with the change date.
     */
    test(
        'Property 37: Price Change Recording - both old and new prices are recorded',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    fc.record({
                        modelName: fc.string({ minLength: 1 }),
                        inputCostPerMillion: fc.float({ min: 0, max: 100 }),
                        outputCostPerMillion: fc.float({ min: 0, max: 100 }),
                        tier: fc.constantFrom('standard', 'batch', 'cached'),
                    }),
                    fc.record({
                        modelName: fc.string({ minLength: 1 }),
                        inputCostPerMillion: fc.float({ min: 0, max: 100 }),
                        outputCostPerMillion: fc.float({ min: 0, max: 100 }),
                        tier: fc.constantFrom('standard', 'batch', 'cached'),
                    }),
                    async (modelId: string, oldPricing: PricingData, newPricing: PricingData) => {
                        // Create fresh mocks for this iteration
                        const mockDb = {
                            query: jest.fn(),
                            connect: jest.fn(),
                        } as any;

                        const mockRedis = {
                            get: jest.fn(),
                            setEx: jest.fn(),
                            del: jest.fn(),
                        } as any;

                        const registry = new ModelRegistry(mockDb, mockRedis);

                        // Ensure tiers match
                        newPricing.tier = oldPricing.tier;

                        let capturedHistoryInsert: any[] = [];
                        let capturedPricingUpdate: any[] = [];

                        const mockClient = {
                            query: jest.fn((query: string, params?: any[]) => {
                                if (query.includes('SELECT effective_date FROM model_pricing')) {
                                    return Promise.resolve({
                                        rows: [{ effective_date: new Date('2024-01-01') }],
                                        rowCount: 1,
                                    });
                                } else if (query.includes('INSERT INTO pricing_history')) {
                                    capturedHistoryInsert = params || [];
                                    return Promise.resolve({ rows: [], rowCount: 1 });
                                } else if (query.includes('UPDATE model_pricing')) {
                                    capturedPricingUpdate = params || [];
                                    return Promise.resolve({ rows: [], rowCount: 1 });
                                } else if (query.includes('BEGIN') || query.includes('COMMIT')) {
                                    return Promise.resolve({ rows: [], rowCount: 0 });
                                }
                                return Promise.resolve({ rows: [], rowCount: 0 });
                            }),
                            release: jest.fn(),
                        };

                        mockDb.connect.mockResolvedValue(mockClient as any);

                        // Execute pricing change
                        await registry.recordPricingChange(modelId, oldPricing, newPricing);

                        // Verify old pricing was recorded in history
                        expect(capturedHistoryInsert[1]).toBe(oldPricing.inputCostPerMillion);
                        expect(capturedHistoryInsert[2]).toBe(oldPricing.outputCostPerMillion);

                        // Verify new pricing was updated in current pricing
                        expect(capturedPricingUpdate[0]).toBe(newPricing.inputCostPerMillion);
                        expect(capturedPricingUpdate[1]).toBe(newPricing.outputCostPerMillion);

                        // Verify both operations happened
                        expect(capturedHistoryInsert.length).toBeGreaterThan(0);
                        expect(capturedPricingUpdate.length).toBeGreaterThan(0);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );
});

/**
 * Property-Based Test: Cache Invalidation on Update
 * Feature: dynamic-model-pricing, Property 19: Cache Invalidation on Update
 *
 * Validates: Requirements 4.5
 *
 * For any sync job that updates model or pricing data, all relevant cache
 * entries should be invalidated.
 */
test(
    'Property 19: Cache Invalidation on Update - caches are invalidated on model update',
    async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    id: fc.string({ minLength: 1, maxLength: 100 }),
                    provider: fc.constantFrom<ProviderType>(
                        'openai',
                        'anthropic',
                        'google',
                        'xai'
                    ),
                    displayName: fc.string({ minLength: 1, maxLength: 255 }),
                    classification: fc.array(
                        fc.constantFrom<ModelClassification>(
                            'chat',
                            'reasoning',
                            'coding',
                            'multimodal',
                            'embedding',
                            'tools',
                            'general'
                        ),
                        { minLength: 1, maxLength: 3 }
                    ),
                    contextWindow: fc.integer({ min: 1000, max: 1000000 }),
                    usability: fc.constantFrom<ModelUsability>(
                        'available',
                        'preview',
                        'deprecated'
                    ),
                    pricing: fc.array(
                        fc.record({
                            inputCostPerMillion: fc.float({ min: 0, max: 100 }),
                            outputCostPerMillion: fc.float({ min: 0, max: 100 }),
                            tier: fc.constantFrom('standard', 'batch', 'cached'),
                        }),
                        { minLength: 1, maxLength: 3 }
                    ),
                    capabilities: fc.array(
                        fc.record({
                            type: fc.constantFrom<ModelCapability['type']>(
                                'chat',
                                'completion',
                                'embedding',
                                'vision',
                                'function_calling',
                                'tools'
                            ),
                            supported: fc.boolean(),
                        }),
                        { minLength: 0, maxLength: 6 }
                    ),
                    discoveredAt: fc.date(),
                }),
                async (model: EnrichedModel) => {
                    // Create fresh mocks for this iteration
                    const mockDb = {
                        query: jest.fn(),
                        connect: jest.fn(),
                    } as any;

                    const mockRedis = {
                        get: jest.fn(),
                        setEx: jest.fn(),
                        del: jest.fn(),
                    } as any;

                    const registry = new ModelRegistry(mockDb, mockRedis);

                    const mockClient = {
                        query: jest.fn((query: string, params?: any[]) => {
                            if (
                                query.includes('INSERT INTO models') ||
                                query.includes('INSERT INTO model_pricing') ||
                                query.includes('BEGIN') ||
                                query.includes('COMMIT')
                            ) {
                                return Promise.resolve({ rows: [], rowCount: 1 });
                            }
                            return Promise.resolve({ rows: [], rowCount: 0 });
                        }),
                        release: jest.fn(),
                    };

                    mockDb.connect.mockResolvedValue(mockClient as any);

                    // Execute upsert
                    await registry.upsertModel(model);

                    // Verify cache invalidation was called
                    expect(mockRedis.del).toHaveBeenCalled();

                    // Verify the correct cache keys were invalidated
                    const delCalls = mockRedis.del.mock.calls;
                    const deletedKeys = delCalls.flat();

                    // Should invalidate provider list, model details, and pricing
                    expect(deletedKeys).toContain(`model:${model.provider}:list`);
                    expect(deletedKeys).toContain(`model:${model.id}:details`);
                    expect(deletedKeys).toContain(`pricing:${model.id}`);
                }
            ),
            { numRuns: 100 }
        );
    },
    120000
);
