/**
 * Property-Based Test: Cache Fallback on Scraping Failure
 * Feature: dynamic-model-pricing, Property 28: Cache Fallback on Scraping Failure
 *
 * Validates: Requirements 6.4
 *
 * Property: For any provider where all scraping strategies fail, the system
 * should return cached pricing data if available.
 */

import * as fc from 'fast-check';
import { PricingScraperService } from '../pricing-service';
import { PricingData, ProviderType } from '../../types/core';
import { RedisClientType } from 'redis';
import { Pool } from 'pg';

// Mock Redis
jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
        get: jest.fn(),
        setEx: jest.fn(),
        del: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
    })),
}));

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

// Mock the scrapers to simulate failures
jest.mock('../openai-scraper', () => ({
    OpenAIPricingScraper: jest.fn().mockImplementation(() => ({
        scrapePricing: jest.fn().mockRejectedValue(new Error('Scraping failed')),
        validateConfig: jest.fn().mockResolvedValue(true),
    })),
}));

jest.mock('../anthropic-scraper', () => ({
    AnthropicPricingScraper: jest.fn().mockImplementation(() => ({
        scrapePricing: jest.fn().mockRejectedValue(new Error('Scraping failed')),
        validateConfig: jest.fn().mockResolvedValue(true),
    })),
}));

jest.mock('../google-scraper', () => ({
    GooglePricingScraper: jest.fn().mockImplementation(() => ({
        scrapePricing: jest.fn().mockRejectedValue(new Error('Scraping failed')),
        validateConfig: jest.fn().mockResolvedValue(true),
    })),
}));

jest.mock('../xai-scraper', () => ({
    XAIPricingScraper: jest.fn().mockImplementation(() => ({
        scrapePricing: jest.fn().mockRejectedValue(new Error('Scraping failed')),
        validateConfig: jest.fn().mockResolvedValue(true),
    })),
}));

describe('Property 28: Cache Fallback on Scraping Failure', () => {
    let mockRedis: any;
    let mockPool: Pool;
    let pricingService: PricingScraperService;

    beforeEach(() => {
        mockRedis = {
            get: jest.fn(),
            setEx: jest.fn(),
            del: jest.fn(),
            connect: jest.fn(),
            disconnect: jest.fn(),
        };
        mockPool = new Pool();
        pricingService = new PricingScraperService(mockRedis as RedisClientType, mockPool);
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
     * Arbitrary for generating pricing data
     * Note: Excludes NaN and undefined to match JSON serialization behavior
     */
    const pricingDataArb = fc.array(
        fc.record({
            modelName: fc.string({ minLength: 1, maxLength: 50 }),
            inputCostPerMillion: fc.float({ min: 0, max: 100, noNaN: true }),
            outputCostPerMillion: fc.float({ min: 0, max: 100, noNaN: true }),
            tier: fc.option(fc.constantFrom('standard', 'batch', 'cached'), { nil: null }),
        }),
        { minLength: 1, maxLength: 10 }
    ).map((data) =>
        // Remove null tier values to match JSON serialization
        data.map((item) => {
            const result: any = {
                modelName: item.modelName,
                inputCostPerMillion: item.inputCostPerMillion,
                outputCostPerMillion: item.outputCostPerMillion,
            };
            if (item.tier !== null) {
                result.tier = item.tier;
            }
            return result;
        })
    );

    test(
        'cached pricing is returned when scraping fails',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    pricingDataArb,
                    async (provider, cachedPricing) => {
                        // Setup mock to return cached pricing
                        mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedPricing));

                        // Attempt to scrape (will fail due to mocked scrapers)
                        const result = await pricingService.scrapePricing(provider);

                        // Verify cached pricing was returned
                        expect(result).toEqual(cachedPricing);

                        // Verify cache was accessed
                        expect(mockRedis.get).toHaveBeenCalledWith(`pricing:${provider}:fallback`);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'error is thrown when scraping fails and no cache exists',
        async () => {
            await fc.assert(
                fc.asyncProperty(providerArb, async (provider) => {
                    // Setup mock to return no cached pricing
                    mockRedis.get.mockResolvedValueOnce(null);

                    // Attempt to scrape (will fail due to mocked scrapers)
                    await expect(pricingService.scrapePricing(provider)).rejects.toThrow();

                    // Verify cache was checked
                    expect(mockRedis.get).toHaveBeenCalledWith(`pricing:${provider}:fallback`);
                }),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'successful scraping caches pricing for future fallback',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    pricingDataArb,
                    async (provider, pricingData) => {
                        // Create a mock scraper that succeeds
                        const mockScraper = {
                            scrapePricing: jest.fn().mockResolvedValue(pricingData),
                            validateConfig: jest.fn().mockResolvedValue(true),
                        };

                        // Replace the scraper in the service
                        (pricingService as any).scrapers.set(provider, mockScraper);

                        // Scrape pricing
                        const result = await pricingService.scrapePricing(provider);

                        // Verify pricing was returned
                        expect(result).toEqual(pricingData);

                        // Verify pricing was cached for fallback
                        expect(mockRedis.setEx).toHaveBeenCalledWith(
                            `pricing:${provider}:fallback`,
                            7 * 24 * 60 * 60, // 7 days TTL
                            JSON.stringify(pricingData)
                        );
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'getFallbackPricing returns cached data',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    pricingDataArb,
                    async (provider, cachedPricing) => {
                        // Setup mock to return cached pricing
                        mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedPricing));

                        // Get fallback pricing
                        const result = await pricingService.getFallbackPricing(provider);

                        // Verify cached pricing was returned
                        expect(result).toEqual(cachedPricing);

                        // Verify cache was accessed
                        expect(mockRedis.get).toHaveBeenCalledWith(`pricing:${provider}:fallback`);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'getFallbackPricing returns empty array when no cache exists',
        async () => {
            await fc.assert(
                fc.asyncProperty(providerArb, async (provider) => {
                    // Setup mock to return no cached pricing
                    mockRedis.get.mockResolvedValueOnce(null);

                    // Get fallback pricing
                    const result = await pricingService.getFallbackPricing(provider);

                    // Verify empty array was returned
                    expect(result).toEqual([]);

                    // Verify cache was checked
                    expect(mockRedis.get).toHaveBeenCalledWith(`pricing:${provider}:fallback`);
                }),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'cache fallback preserves all pricing fields',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    providerArb,
                    pricingDataArb,
                    async (provider, cachedPricing) => {
                        // Setup mock to return cached pricing
                        mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedPricing));

                        // Attempt to scrape (will fail and use cache)
                        const result = await pricingService.scrapePricing(provider);

                        // Verify all fields are preserved
                        expect(result).toHaveLength(cachedPricing.length);

                        result.forEach((pricing, index) => {
                            expect(pricing.modelName).toBe(cachedPricing[index].modelName);
                            expect(pricing.inputCostPerMillion).toBe(
                                cachedPricing[index].inputCostPerMillion
                            );
                            expect(pricing.outputCostPerMillion).toBe(
                                cachedPricing[index].outputCostPerMillion
                            );
                            if (cachedPricing[index].tier) {
                                expect(pricing.tier).toBe(cachedPricing[index].tier);
                            }
                        });
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );
});
