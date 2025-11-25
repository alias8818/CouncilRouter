/**
 * Property-Based Tests for Model API Endpoints
 * Feature: dynamic-model-pricing
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { APIGateway } from '../gateway';
import { ModelRegistry } from '../../discovery/registry';
import {
    EnrichedModel,
    ProviderType,
    ModelClassification,
    ModelUsability,
    ModelCapability
} from '../../types/core';

// Mock dependencies
const mockOrchestrationEngine = {} as any;
const mockSessionManager = {} as any;
const mockEventLogger = {} as any;

describe('Model API Endpoints - Property Tests', () => {
    let dbPool: Pool;
    let redis: RedisClientType;
    let modelRegistry: ModelRegistry;
    let gateway: APIGateway;

    beforeAll(async () => {
        // Create mock database pool
        dbPool = {
            query: jest.fn(),
            connect: jest.fn()
        } as any;

        // Create mock Redis client
        redis = {
            get: jest.fn(),
            set: jest.fn(),
            setEx: jest.fn(),
            del: jest.fn(),
            expire: jest.fn()
        } as any;

        modelRegistry = new ModelRegistry(dbPool, redis);
        gateway = new APIGateway(
            mockOrchestrationEngine,
            mockSessionManager,
            mockEventLogger,
            redis,
            dbPool,
            'test-secret',
            undefined,
            modelRegistry
        );
    });

    /**
     * Property-Based Test: Active Model Retrieval
     * Feature: dynamic-model-pricing, Property 20: Active Model Retrieval
     * 
     * Validates: Requirements 5.1
     */
    test('Property 20: Active Model Retrieval - all returned models should be active (non-deprecated)', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate array of models with mixed usability statuses
                fc.array(
                    fc.record({
                        id: fc.string({ minLength: 1, maxLength: 50 }),
                        provider: fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                        displayName: fc.string({ minLength: 1, maxLength: 100 }),
                        classification: fc.array(
                            fc.constantFrom<ModelClassification>('chat', 'reasoning', 'coding', 'multimodal', 'embedding', 'tools', 'general'),
                            { minLength: 1, maxLength: 3 }
                        ),
                        contextWindow: fc.integer({ min: 1000, max: 200000 }),
                        usability: fc.constantFrom<ModelUsability>('available', 'preview', 'deprecated'),
                        pricing: fc.array(
                            fc.record({
                                inputCostPerMillion: fc.float({ min: 0, max: 100 }),
                                outputCostPerMillion: fc.float({ min: 0, max: 100 }),
                                tier: fc.constantFrom('standard', 'batch', 'cached'),
                                contextLimit: fc.option(fc.integer({ min: 1000, max: 200000 }), { nil: undefined })
                            }),
                            { minLength: 1, maxLength: 3 }
                        ),
                        capabilities: fc.array(
                            fc.record({
                                type: fc.constantFrom<ModelCapability['type']>('chat', 'completion', 'embedding', 'vision', 'function_calling', 'tools'),
                                supported: fc.boolean()
                            }),
                            { minLength: 0, maxLength: 6 }
                        ),
                        discoveredAt: fc.date()
                    }),
                    { minLength: 5, maxLength: 20 }
                ),
                async (models) => {
                    // Mock database query to return only non-deprecated models (as the query filters them)
                    const activeModels = models.filter(m => m.usability !== 'deprecated');
                    const mockRows = activeModels.map(model => ({
                        id: model.id,
                        provider: model.provider,
                        display_name: model.displayName,
                        classification: model.classification,
                        context_window: model.contextWindow,
                        usability: model.usability,
                        capabilities: model.capabilities,
                        discovered_at: model.discoveredAt,
                        updated_at: new Date(),
                        deprecated_at: null,
                        pricing: model.pricing
                    }));

                    (dbPool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

                    // Get models without specifying usability filter (should default to active only)
                    const result = await modelRegistry.getModels();

                    // Verify all returned models are not deprecated
                    const hasDeprecated = result.some(m => m.usability === 'deprecated');
                    expect(hasDeprecated).toBe(false);

                    // Verify we got some models back (if there were any non-deprecated in input)
                    const expectedActiveCount = models.filter(m => m.usability !== 'deprecated').length;
                    if (expectedActiveCount > 0) {
                        expect(result.length).toBeGreaterThan(0);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property-Based Test: Pricing Data Inclusion
     * Feature: dynamic-model-pricing, Property 23: Pricing Data Inclusion
     * 
     * Validates: Requirements 5.4
     */
    test('Property 23: Pricing Data Inclusion - models with pricing should include it in response', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.record({
                        id: fc.string({ minLength: 1, maxLength: 50 }),
                        provider: fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                        displayName: fc.string({ minLength: 1, maxLength: 100 }),
                        classification: fc.array(
                            fc.constantFrom<ModelClassification>('chat', 'reasoning', 'coding', 'multimodal', 'embedding', 'tools', 'general'),
                            { minLength: 1, maxLength: 3 }
                        ),
                        contextWindow: fc.integer({ min: 1000, max: 200000 }),
                        usability: fc.constantFrom<ModelUsability>('available', 'preview'),
                        hasPricing: fc.boolean(),
                        pricing: fc.array(
                            fc.record({
                                inputCostPerMillion: fc.float({ min: Math.fround(0.01), max: Math.fround(100) }),
                                outputCostPerMillion: fc.float({ min: Math.fround(0.01), max: Math.fround(100) }),
                                tier: fc.constantFrom('standard', 'batch', 'cached'),
                                contextLimit: fc.option(fc.integer({ min: 1000, max: 200000 }), { nil: undefined })
                            }),
                            { minLength: 1, maxLength: 3 }
                        ),
                        capabilities: fc.array(
                            fc.record({
                                type: fc.constantFrom<ModelCapability['type']>('chat', 'completion', 'embedding', 'vision', 'function_calling', 'tools'),
                                supported: fc.boolean()
                            }),
                            { minLength: 0, maxLength: 6 }
                        ),
                        discoveredAt: fc.date()
                    }),
                    { minLength: 3, maxLength: 15 }
                ),
                async (models) => {
                    // Mock database query
                    const mockRows = models.map(model => ({
                        id: model.id,
                        provider: model.provider,
                        display_name: model.displayName,
                        classification: model.classification,
                        context_window: model.contextWindow,
                        usability: model.usability,
                        capabilities: model.capabilities,
                        discovered_at: model.discoveredAt,
                        updated_at: new Date(),
                        deprecated_at: null,
                        pricing: model.hasPricing ? model.pricing : []
                    }));

                    (dbPool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

                    // Get models
                    const result = await modelRegistry.getModels();

                    // For each model that has pricing in the input, verify it's included in output
                    for (let i = 0; i < models.length; i++) {
                        const inputModel = models[i];
                        const outputModel = result.find(m => m.id === inputModel.id);

                        if (outputModel && inputModel.hasPricing) {
                            expect(outputModel.pricing).toBeDefined();
                            expect(Array.isArray(outputModel.pricing)).toBe(true);
                            expect(outputModel.pricing.length).toBeGreaterThan(0);

                            // Verify pricing data structure
                            outputModel.pricing.forEach(p => {
                                expect(p.inputCostPerMillion).toBeDefined();
                                expect(p.outputCostPerMillion).toBeDefined();
                                expect(p.tier).toBeDefined();
                            });
                        }
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property-Based Test: Capability Data Inclusion
     * Feature: dynamic-model-pricing, Property 24: Capability Data Inclusion
     * 
     * Validates: Requirements 5.5
     */
    test('Property 24: Capability Data Inclusion - models should include context window and capabilities', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.record({
                        id: fc.string({ minLength: 1, maxLength: 50 }),
                        provider: fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                        displayName: fc.string({ minLength: 1, maxLength: 100 }),
                        classification: fc.array(
                            fc.constantFrom<ModelClassification>('chat', 'reasoning', 'coding', 'multimodal', 'embedding', 'tools', 'general'),
                            { minLength: 1, maxLength: 3 }
                        ),
                        contextWindow: fc.integer({ min: 1000, max: 200000 }),
                        usability: fc.constantFrom<ModelUsability>('available', 'preview'),
                        pricing: fc.array(
                            fc.record({
                                inputCostPerMillion: fc.float({ min: Math.fround(0.01), max: Math.fround(100) }),
                                outputCostPerMillion: fc.float({ min: Math.fround(0.01), max: Math.fround(100) }),
                                tier: fc.constantFrom('standard', 'batch', 'cached')
                            }),
                            { minLength: 1, maxLength: 2 }
                        ),
                        capabilities: fc.array(
                            fc.record({
                                type: fc.constantFrom<ModelCapability['type']>('chat', 'completion', 'embedding', 'vision', 'function_calling', 'tools'),
                                supported: fc.boolean()
                            }),
                            { minLength: 1, maxLength: 6 }
                        ),
                        discoveredAt: fc.date()
                    }),
                    { minLength: 3, maxLength: 15 }
                ),
                async (models) => {
                    // Mock database query
                    const mockRows = models.map(model => ({
                        id: model.id,
                        provider: model.provider,
                        display_name: model.displayName,
                        classification: model.classification,
                        context_window: model.contextWindow,
                        usability: model.usability,
                        capabilities: model.capabilities,
                        discovered_at: model.discoveredAt,
                        updated_at: new Date(),
                        deprecated_at: null,
                        pricing: model.pricing
                    }));

                    (dbPool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

                    // Get models
                    const result = await modelRegistry.getModels();

                    // Verify each model includes context window and capabilities
                    result.forEach(model => {
                        // Context window should be defined and positive
                        expect(model.contextWindow).toBeDefined();
                        expect(model.contextWindow).toBeGreaterThan(0);

                        // Capabilities should be defined (can be empty array)
                        expect(model.capabilities).toBeDefined();
                        expect(Array.isArray(model.capabilities)).toBe(true);

                        // If capabilities exist, verify structure
                        if (model.capabilities.length > 0) {
                            model.capabilities.forEach(cap => {
                                expect(cap.type).toBeDefined();
                                expect(typeof cap.supported).toBe('boolean');
                            });
                        }
                    });
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);
});
