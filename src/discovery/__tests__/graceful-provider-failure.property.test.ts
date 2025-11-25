/**
 * Property-Based Test: Graceful Provider Failure
 * Feature: dynamic-model-pricing, Property 2: Graceful Provider Failure
 * 
 * Validates: Requirements 1.2
 * 
 * For any set of providers where some return authentication errors,
 * the system should successfully process all providers that don't error.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { ModelDiscoveryService } from '../service';
import { ProviderType, DiscoveredModel } from '../../types/core';
import { BaseModelFetcher, FetcherConfig } from '../base-fetcher';

// Mock database
const mockDb = {
    query: jest.fn()
} as unknown as Pool;

// Test fetcher that can be configured to succeed or fail
class ConfigurableTestFetcher extends BaseModelFetcher {
    private shouldFail: boolean;
    private errorType: string;
    private models: DiscoveredModel[];

    constructor(
        provider: ProviderType,
        shouldFail: boolean,
        errorType: string = 'AUTH_ERROR',
        models: DiscoveredModel[] = [],
        config?: Partial<FetcherConfig>
    ) {
        super(provider, config);
        this.shouldFail = shouldFail;
        this.errorType = errorType;
        this.models = models;
    }

    protected getAuthHeaders(): Record<string, string> {
        return { 'Authorization': 'Bearer test-key' };
    }

    protected async fetchModelsFromAPI(): Promise<DiscoveredModel[]> {
        if (this.shouldFail) {
            const error: any = new Error(`Test error: ${this.errorType}`);
            error.code = this.errorType;
            error.status = this.errorType === 'AUTH_ERROR' ? 401 : 500;
            throw error;
        }

        return this.models;
    }
}

describe('Property Test: Graceful Provider Failure', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Property 2: Graceful Provider Failure
     * For any set of providers where some return authentication errors,
     * the system should successfully process all providers that don't error.
     */
    test('should continue processing when some providers fail with auth errors', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate a subset of providers that should fail
                fc.subarray(['openai', 'anthropic', 'google', 'xai'] as ProviderType[], {
                    minLength: 1,
                    maxLength: 3
                }),
                // Generate number of models for successful providers
                fc.integer({ min: 1, max: 10 }),
                async (failingProviders, modelCount) => {
                    const allProviders: ProviderType[] = ['openai', 'anthropic', 'google', 'xai'];
                    const successfulProviders = allProviders.filter(
                        (p) => !failingProviders.includes(p)
                    );

                    // Skip if all providers fail (not testing that case)
                    if (successfulProviders.length === 0) {
                        return;
                    }

                    // Create service with mock fetchers
                    const service = new ModelDiscoveryService(mockDb, {
                        openai: 'test-key',
                        anthropic: 'test-key',
                        google: 'test-key',
                        xai: 'test-key'
                    });

                    // Replace fetchers with our test implementations
                    const fetchersMap = (service as any).fetchers as Map<
                        ProviderType,
                        BaseModelFetcher
                    >;
                    fetchersMap.clear();

                    for (const provider of allProviders) {
                        const shouldFail = failingProviders.includes(provider);
                        const models: DiscoveredModel[] = shouldFail
                            ? []
                            : Array.from({ length: modelCount }, (_, i) => ({
                                id: `${provider}-model-${i}`,
                                provider,
                                displayName: `${provider} Model ${i}`,
                                deprecated: false
                            }));

                        fetchersMap.set(
                            provider,
                            new ConfigurableTestFetcher(provider, shouldFail, 'AUTH_ERROR', models)
                        );
                    }

                    // Fetch from all providers
                    const results = await service.fetchAllModels();

                    // Verify results contain entries for all providers
                    expect(results.size).toBe(allProviders.length);

                    // Verify successful providers returned models
                    for (const provider of successfulProviders) {
                        const models = results.get(provider);
                        expect(models).toBeDefined();
                        expect(models!).toHaveLength(modelCount);

                        // Verify model data integrity
                        for (let i = 0; i < models!.length; i++) {
                            expect(models![i].id).toBe(`${provider}-model-${i}`);
                            expect(models![i].provider).toBe(provider);
                        }
                    }

                    // Verify failing providers returned empty arrays (graceful handling)
                    for (const provider of failingProviders) {
                        const models = results.get(provider);
                        expect(models).toBeDefined();
                        expect(models!).toHaveLength(0);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property 2 (variant): Service should not throw when all providers fail
     */
    test('should handle all providers failing gracefully', async () => {
        await fc.assert(
            fc.asyncProperty(fc.constant(true), async () => {
                const allProviders: ProviderType[] = ['openai', 'anthropic', 'google', 'xai'];

                const service = new ModelDiscoveryService(mockDb, {
                    openai: 'test-key',
                    anthropic: 'test-key',
                    google: 'test-key',
                    xai: 'test-key'
                });

                // Replace all fetchers with failing ones
                const fetchersMap = (service as any).fetchers as Map<
                    ProviderType,
                    BaseModelFetcher
                >;
                fetchersMap.clear();

                for (const provider of allProviders) {
                    fetchersMap.set(
                        provider,
                        new ConfigurableTestFetcher(provider, true, 'AUTH_ERROR', [])
                    );
                }

                // Should not throw
                const results = await service.fetchAllModels();

                // Verify all providers returned empty arrays
                expect(results.size).toBe(allProviders.length);
                for (const provider of allProviders) {
                    expect(results.get(provider)).toEqual([]);
                }
            }),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property 2 (variant): Different error types should be handled gracefully
     */
    test('should handle different error types gracefully', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('AUTH_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE', 'UNKNOWN_ERROR'),
                fc.integer({ min: 1, max: 5 }),
                async (errorType, modelCount) => {
                    const allProviders: ProviderType[] = ['openai', 'anthropic', 'google', 'xai'];

                    const service = new ModelDiscoveryService(mockDb, {
                        openai: 'test-key',
                        anthropic: 'test-key',
                        google: 'test-key',
                        xai: 'test-key'
                    });

                    // Replace fetchers: first provider fails, others succeed
                    const fetchersMap = (service as any).fetchers as Map<
                        ProviderType,
                        BaseModelFetcher
                    >;
                    fetchersMap.clear();

                    // Use faster retry config for tests to avoid timeouts
                    const testConfig: Partial<FetcherConfig> = {
                        maxRetries: 3,
                        initialDelayMs: 10, // Much faster for tests
                        maxDelayMs: 50,
                        backoffMultiplier: 2,
                        timeoutMs: 1000
                    };

                    for (let i = 0; i < allProviders.length; i++) {
                        const provider = allProviders[i];
                        const shouldFail = i === 0; // Only first provider fails
                        const models: DiscoveredModel[] = shouldFail
                            ? []
                            : Array.from({ length: modelCount }, (_, j) => ({
                                id: `${provider}-model-${j}`,
                                provider,
                                displayName: `${provider} Model ${j}`,
                                deprecated: false
                            }));

                        fetchersMap.set(
                            provider,
                            new ConfigurableTestFetcher(provider, shouldFail, errorType, models, testConfig)
                        );
                    }

                    const results = await service.fetchAllModels();

                    // Verify first provider returned empty array
                    expect(results.get(allProviders[0])).toEqual([]);

                    // Verify other providers succeeded
                    for (let i = 1; i < allProviders.length; i++) {
                        const models = results.get(allProviders[i]);
                        expect(models!).toHaveLength(modelCount);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);
});
