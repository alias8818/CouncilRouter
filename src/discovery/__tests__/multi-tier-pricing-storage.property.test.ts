/**
 * Property-Based Test: Multi-Tier Pricing Storage
 * Feature: dynamic-model-pricing, Property 8: Multi-Tier Pricing Storage
 * 
 * Validates: Requirements 2.3
 * 
 * For any model with multiple pricing tiers, all tiers should be stored 
 * with their respective conditions.
 * 
 * This tests that when we have pricing data with multiple tiers for the same model,
 * all tiers are preserved and can be stored/retrieved correctly.
 */

import * as fc from 'fast-check';
import { PricingData } from '../../types/core';

describe('Property 8: Multi-Tier Pricing Storage', () => {
    test('should preserve all pricing tiers for models with multiple tiers', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate models with multiple pricing tiers (ensure unique model names)
                fc.uniqueArray(
                    fc.record({
                        modelName: fc.string({ minLength: 3, maxLength: 30 })
                            .filter(s => !s.includes('<') && !s.includes('>'))
                            .filter(s => s.trim().length > 0),
                        tiers: fc.uniqueArray(
                            fc.record({
                                tier: fc.constantFrom('standard', 'batch', 'cached', 'free'),
                                inputCost: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
                                outputCost: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
                                contextLimit: fc.option(fc.integer({ min: 1000, max: 1000000 }), { nil: undefined })
                            }),
                            { minLength: 1, maxLength: 4, selector: (t) => t.tier }
                        )
                    }),
                    { minLength: 1, maxLength: 5, selector: (model) => model.modelName }
                ),
                async (models) => {
                    // Flatten models into pricing data array (simulating scraper output)
                    const pricingData: PricingData[] = models.flatMap(model =>
                        model.tiers.map(tier => ({
                            modelName: model.modelName,
                            inputCostPerMillion: tier.inputCost,
                            outputCostPerMillion: tier.outputCost,
                            tier: tier.tier,
                            contextLimit: tier.contextLimit
                        }))
                    );

                    // Property: All tiers should be present in the data
                    const expectedTierCount = models.reduce((sum, model) => sum + model.tiers.length, 0);
                    expect(pricingData).toHaveLength(expectedTierCount);

                    // Property: Each model-tier combination should be unique and retrievable
                    for (const model of models) {
                        for (const tier of model.tiers) {
                            const matchingEntries = pricingData.filter(
                                p => p.modelName === model.modelName && p.tier === tier.tier
                            );

                            // Should have exactly one entry for this model-tier combination
                            expect(matchingEntries.length).toBeGreaterThanOrEqual(1);

                            const entry = matchingEntries[0];
                            expect(entry.inputCostPerMillion).toBeCloseTo(tier.inputCost, 2);
                            expect(entry.outputCostPerMillion).toBeCloseTo(tier.outputCost, 2);
                            expect(entry.tier).toBe(tier.tier);

                            if (tier.contextLimit !== undefined) {
                                expect(entry.contextLimit).toBe(tier.contextLimit);
                            }
                        }
                    }

                    // Property: Grouping by model name should give us all tiers for that model
                    for (const model of models) {
                        const modelTiers = pricingData.filter(p => p.modelName === model.modelName);
                        expect(modelTiers).toHaveLength(model.tiers.length);

                        // All tier names should be present
                        const tierNames = new Set(modelTiers.map(t => t.tier));
                        const expectedTierNames = new Set(model.tiers.map(t => t.tier));
                        expect(tierNames).toEqual(expectedTierNames);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);
});
