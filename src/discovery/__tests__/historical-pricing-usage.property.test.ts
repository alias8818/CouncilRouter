/**
 * Property-Based Test: Historical Pricing Usage
 * Feature: dynamic-model-pricing, Property 38: Historical Pricing Usage
 *
 * Validates: Requirements 8.4
 *
 * Property: For any cost report for a past date, the pricing data from that date
 * should be used, not current pricing.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { ModelRegistry } from '../registry';
import { PricingData } from '../../types/core';

// Mock pg and redis
jest.mock('pg');
jest.mock('redis');

describe('Property 38: Historical Pricing Usage', () => {
    let db: jest.Mocked<Pool>;
    let redis: jest.Mocked<RedisClientType>;
    let registry: ModelRegistry;

    beforeEach(() => {
        // Create mock database
        db = {
            query: jest.fn(),
            connect: jest.fn(),
            end: jest.fn(),
        } as any;

        // Create mock Redis
        redis = {
            get: jest.fn(),
            setEx: jest.fn(),
            del: jest.fn(),
            connect: jest.fn(),
            quit: jest.fn(),
        } as any;

        registry = new ModelRegistry(db, redis);
    });

    test(
        'getPricingForDate returns historical pricing for past dates',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate model ID
                    fc.string({ minLength: 5, maxLength: 20 }).map(s => `test-model-${s}`),
                    // Generate historical pricing (use integers for simplicity)
                    fc.record({
                        inputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                        outputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                    }),
                    // Generate current pricing (different)
                    fc.record({
                        inputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                        outputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                    }),
                    async (modelId, oldPricing, newPricing) => {
                        // Ensure pricing is different
                        if (
                            Math.abs(oldPricing.inputCostPerMillion - newPricing.inputCostPerMillion) < 0.01 &&
                            Math.abs(oldPricing.outputCostPerMillion - newPricing.outputCostPerMillion) < 0.01
                        ) {
                            return; // Skip if pricing is too similar
                        }

                        // Set up historical date (30 days ago)
                        const historicalDate = new Date();
                        historicalDate.setDate(historicalDate.getDate() - 30);

                        // Query date (5 days after historical pricing)
                        const queryDate = new Date(historicalDate);
                        queryDate.setDate(queryDate.getDate() + 5);

                        // Mock database to return historical pricing
                        (db.query as jest.Mock).mockResolvedValueOnce({
                            rows: [
                                {
                                    input_cost_per_million: oldPricing.inputCostPerMillion,
                                    output_cost_per_million: oldPricing.outputCostPerMillion,
                                    tier: 'standard',
                                    effective_date: historicalDate,
                                    end_date: new Date(),
                                },
                            ],
                        });

                        // Query pricing for historical date
                        const pricing = await registry.getPricingForDate(modelId, queryDate);

                        // Should return historical pricing, not current
                        expect(pricing).not.toBeNull();
                        expect(pricing!.inputCostPerMillion).toBeCloseTo(oldPricing.inputCostPerMillion, 4);
                        expect(pricing!.outputCostPerMillion).toBeCloseTo(oldPricing.outputCostPerMillion, 4);

                        // Should NOT match current pricing (at least one should be different)
                        const inputDiff = Math.abs(pricing!.inputCostPerMillion - newPricing.inputCostPerMillion);
                        const outputDiff = Math.abs(pricing!.outputCostPerMillion - newPricing.outputCostPerMillion);
                        expect(inputDiff + outputDiff).toBeGreaterThan(0.0001);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'cost report uses historical pricing for past dates',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate model ID
                    fc.string({ minLength: 5, maxLength: 20 }).map(s => `test-model-${s}`),
                    // Generate historical pricing (old)
                    fc.record({
                        inputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                        outputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                    }),
                    // Generate current pricing (new, different)
                    fc.record({
                        inputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                        outputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                    }),
                    // Generate token usage
                    fc.record({
                        promptTokens: fc.integer({ min: 100, max: 10000 }),
                        completionTokens: fc.integer({ min: 100, max: 10000 }),
                    }),
                    async (modelId, oldPricing, newPricing, tokenUsage) => {
                        // Ensure pricing is different
                        if (
                            Math.abs(oldPricing.inputCostPerMillion - newPricing.inputCostPerMillion) < 0.01 &&
                            Math.abs(oldPricing.outputCostPerMillion - newPricing.outputCostPerMillion) < 0.01
                        ) {
                            return; // Skip if pricing is too similar
                        }

                        // Set up historical date (30 days ago)
                        const historicalDate = new Date();
                        historicalDate.setDate(historicalDate.getDate() - 30);

                        // Cost record date (1 day after historical pricing)
                        const costRecordDate = new Date(historicalDate);
                        costRecordDate.setDate(costRecordDate.getDate() + 1);

                        // Report date range
                        const reportStartDate = new Date(historicalDate);
                        reportStartDate.setDate(reportStartDate.getDate() - 1);
                        const reportEndDate = new Date(historicalDate);
                        reportEndDate.setDate(reportEndDate.getDate() + 7);

                        // Mock database query for cost records
                        (db.query as jest.Mock).mockResolvedValueOnce({
                            rows: [
                                {
                                    model: modelId,
                                    prompt_tokens: tokenUsage.promptTokens,
                                    completion_tokens: tokenUsage.completionTokens,
                                    created_at: costRecordDate,
                                    provider: 'openai',
                                },
                            ],
                        });

                        // Mock database query for historical pricing (called by getPricingForDate)
                        (db.query as jest.Mock).mockResolvedValueOnce({
                            rows: [
                                {
                                    input_cost_per_million: oldPricing.inputCostPerMillion,
                                    output_cost_per_million: oldPricing.outputCostPerMillion,
                                    tier: 'standard',
                                    effective_date: historicalDate,
                                    end_date: new Date(),
                                },
                            ],
                        });

                        // Generate cost report
                        const report = await registry.generateCostReport(
                            reportStartDate,
                            reportEndDate,
                            [modelId]
                        );

                        // Calculate expected cost using OLD pricing
                        const expectedInputCost = (tokenUsage.promptTokens / 1_000_000) * oldPricing.inputCostPerMillion;
                        const expectedOutputCost = (tokenUsage.completionTokens / 1_000_000) * oldPricing.outputCostPerMillion;
                        const expectedTotalCost = expectedInputCost + expectedOutputCost;

                        // Calculate what cost would be with NEW pricing (should NOT match)
                        const wrongInputCost = (tokenUsage.promptTokens / 1_000_000) * newPricing.inputCostPerMillion;
                        const wrongOutputCost = (tokenUsage.completionTokens / 1_000_000) * newPricing.outputCostPerMillion;
                        const wrongTotalCost = wrongInputCost + wrongOutputCost;

                        // Verify historical pricing was used (not current pricing)
                        expect(report.totalCost).toBeCloseTo(expectedTotalCost, 4);

                        // Only check if costs are different when they should be
                        if (Math.abs(expectedTotalCost - wrongTotalCost) > 0.0001) {
                            expect(Math.abs(report.totalCost - wrongTotalCost)).toBeGreaterThan(0.0001);
                        }

                        // Verify model breakdown
                        const modelStats = report.byModel.get(modelId);
                        expect(modelStats).toBeDefined();
                        expect(modelStats!.cost).toBeCloseTo(expectedTotalCost, 4);
                        expect(modelStats!.inputTokens).toBe(tokenUsage.promptTokens);
                        expect(modelStats!.outputTokens).toBe(tokenUsage.completionTokens);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    test(
        'falls back to current pricing when no historical data exists',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate model ID
                    fc.string({ minLength: 5, maxLength: 20 }).map(s => `test-model-${s}`),
                    // Generate current pricing
                    fc.record({
                        inputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                        outputCostPerMillion: fc.integer({ min: 1, max: 1000 }).map(n => n / 10),
                    }),
                    async (modelId, currentPricing) => {
                        // Query date
                        const queryDate = new Date();
                        queryDate.setDate(queryDate.getDate() - 30);

                        // Mock database to return no historical pricing
                        (db.query as jest.Mock).mockResolvedValueOnce({
                            rows: [],
                        });

                        // Mock database to return current pricing as fallback
                        (db.query as jest.Mock).mockResolvedValueOnce({
                            rows: [
                                {
                                    input_cost_per_million: currentPricing.inputCostPerMillion,
                                    output_cost_per_million: currentPricing.outputCostPerMillion,
                                    tier: 'standard',
                                    context_limit: null,
                                },
                            ],
                        });

                        // Query pricing for historical date
                        const pricing = await registry.getPricingForDate(modelId, queryDate);

                        // Should return current pricing as fallback
                        expect(pricing).not.toBeNull();
                        expect(pricing!.inputCostPerMillion).toBeCloseTo(currentPricing.inputCostPerMillion, 4);
                        expect(pricing!.outputCostPerMillion).toBeCloseTo(currentPricing.outputCostPerMillion, 4);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );
});
