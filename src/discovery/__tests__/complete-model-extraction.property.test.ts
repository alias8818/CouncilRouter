/**
 * Property-Based Test: Complete Model Extraction
 * Feature: dynamic-model-pricing, Property 1: Complete Model Extraction
 * 
 * Validates: Requirements 1.1
 * 
 * For any provider API response containing models, all models in the response
 * should be extracted with their IDs and metadata intact.
 */

import * as fc from 'fast-check';
import { BaseModelFetcher, FetcherConfig } from '../base-fetcher';
import { DiscoveredModel, ProviderType, ModelCapability } from '../../types/core';

// Mock API response generator
const modelResponseArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    created: fc.option(fc.integer({ min: 1000000000, max: 2000000000 })),
    owned_by: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
    context_window: fc.option(fc.integer({ min: 1000, max: 200000 }))
});

// Test implementation that returns controlled data
class TestModelFetcher extends BaseModelFetcher {
    private mockModels: any[];

    constructor(provider: ProviderType, mockModels: any[]) {
        super(provider);
        this.mockModels = mockModels;
    }

    protected getAuthHeaders(): Record<string, string> {
        return { 'Authorization': 'Bearer test-key' };
    }

    protected async fetchModelsFromAPI(): Promise<DiscoveredModel[]> {
        // Simulate parsing the mock models
        return this.mockModels.map((model) => ({
            id: model.id,
            provider: this.provider,
            displayName: model.id,
            ownedBy: model.owned_by,
            created: model.created,
            contextWindow: model.context_window,
            capabilities: [],
            deprecated: false
        }));
    }
}

describe('Property Test: Complete Model Extraction', () => {
    /**
     * Property 1: Complete Model Extraction
     * For any provider API response containing models, all models in the response
     * should be extracted with their IDs and metadata intact.
     */
    test('should extract all models from API response with complete metadata', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                fc.array(modelResponseArbitrary, { minLength: 1, maxLength: 20 }),
                async (provider, mockModels) => {
                    const fetcher = new TestModelFetcher(provider, mockModels);
                    const extractedModels = await fetcher.fetchModels();

                    // Verify all models were extracted
                    expect(extractedModels).toHaveLength(mockModels.length);

                    // Verify each model has complete metadata
                    for (let i = 0; i < mockModels.length; i++) {
                        const mock = mockModels[i];
                        const extracted = extractedModels[i];

                        // Verify ID is preserved
                        expect(extracted.id).toBe(mock.id);

                        // Verify provider is set correctly
                        expect(extracted.provider).toBe(provider);

                        // Verify optional metadata is preserved when present
                        if (mock.owned_by !== null && mock.owned_by !== undefined) {
                            expect(extracted.ownedBy).toBe(mock.owned_by);
                        }

                        if (mock.created !== null && mock.created !== undefined) {
                            expect(extracted.created).toBe(mock.created);
                        }

                        if (mock.context_window !== null && mock.context_window !== undefined) {
                            expect(extracted.contextWindow).toBe(mock.context_window);
                        }

                        // Verify required fields are present
                        expect(extracted.deprecated).toBeDefined();
                        expect(typeof extracted.deprecated).toBe('boolean');
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property 1 (variant): Model IDs should be unique within a provider
     */
    test('should preserve unique model IDs', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                fc.array(modelResponseArbitrary, { minLength: 1, maxLength: 20 }),
                async (provider, mockModels) => {
                    // Ensure unique IDs in mock data
                    const uniqueModels = mockModels.filter(
                        (model, index, self) => self.findIndex((m) => m.id === model.id) === index
                    );

                    const fetcher = new TestModelFetcher(provider, uniqueModels);
                    const extractedModels = await fetcher.fetchModels();

                    // Verify all IDs are unique
                    const ids = extractedModels.map((m) => m.id);
                    const uniqueIds = new Set(ids);
                    expect(uniqueIds.size).toBe(ids.length);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property 1 (variant): Empty response should return empty array
     */
    test('should handle empty API response', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                async (provider) => {
                    const fetcher = new TestModelFetcher(provider, []);
                    const extractedModels = await fetcher.fetchModels();

                    expect(extractedModels).toEqual([]);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property 1 (variant): Model order should be preserved
     */
    test('should preserve model order from API response', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom<ProviderType>('openai', 'anthropic', 'google', 'xai'),
                fc.array(modelResponseArbitrary, { minLength: 2, maxLength: 10 }),
                async (provider, mockModels) => {
                    const fetcher = new TestModelFetcher(provider, mockModels);
                    const extractedModels = await fetcher.fetchModels();

                    // Verify order is preserved
                    for (let i = 0; i < mockModels.length; i++) {
                        expect(extractedModels[i].id).toBe(mockModels[i].id);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);
});
