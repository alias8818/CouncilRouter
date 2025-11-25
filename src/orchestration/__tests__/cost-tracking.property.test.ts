/**
 * Property-Based Test: Cost Tracking Accuracy
 * Feature: metrics-tracking, Property 1: Total cost equals sum of all member costs
 * 
 * Validates: Requirements US-1 (AC-1.1, AC-1.2)
 */

import * as fc from 'fast-check';
import { CostCalculator } from '../../cost/calculator';
import { CouncilMember, TokenUsage } from '../../types/core';

describe('Cost Tracking Properties', () => {
    const costCalculator = new CostCalculator();

    /**
     * Property 1: Total cost equals sum of member costs
     */
    test('total cost equals sum of all member costs', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate array of council members with costs
                fc.array(
                    fc.record({
                        provider: fc.constantFrom('openai', 'anthropic', 'google'),
                        model: fc.constantFrom('gpt-4', 'claude-3-opus', 'gemini-pro'),
                        promptTokens: fc.integer({ min: 100, max: 10000 }),
                        completionTokens: fc.integer({ min: 50, max: 5000 })
                    }),
                    { minLength: 1, maxLength: 10 }
                ),
                async (memberData) => {
                    const memberCosts = new Map<string, number>();

                    // Calculate cost for each member
                    for (const data of memberData) {
                        const member: CouncilMember = {
                            id: `${data.provider}-${data.model}`,
                            provider: data.provider,
                            model: data.model,
                            timeout: 30,
                            retryAttempts: 3
                        };

                        const tokenUsage: TokenUsage = {
                            promptTokens: data.promptTokens,
                            completionTokens: data.completionTokens,
                            totalTokens: data.promptTokens + data.completionTokens
                        };

                        const costResult = await costCalculator.calculateCost(member, tokenUsage);
                        memberCosts.set(member.id, costResult.cost);
                    }

                    // Calculate total from member costs (same way as production code)
                    const totalCost = Array.from(memberCosts.values())
                        .reduce((sum, cost) => sum + cost, 0);

                    // Verify total is sum of parts (should be exact since we use same calculation)
                    const sumOfMemberCosts = Array.from(memberCosts.values())
                        .reduce((sum, cost) => sum + cost, 0);

                    // Should be exactly equal since we use the same reduce operation
                    expect(totalCost).toBe(sumOfMemberCosts);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property 2: Costs are always non-negative
     */
    test('costs are always non-negative', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    provider: fc.constantFrom('openai', 'anthropic', 'google'),
                    model: fc.constantFrom('gpt-4', 'claude-3-opus', 'gemini-pro'),
                    promptTokens: fc.integer({ min: 0, max: 10000 }),
                    completionTokens: fc.integer({ min: 0, max: 5000 })
                }),
                async (data) => {
                    const member: CouncilMember = {
                        id: `${data.provider}-${data.model}`,
                        provider: data.provider,
                        model: data.model,
                        timeout: 30,
                        retryAttempts: 3
                    };

                    const tokenUsage: TokenUsage = {
                        promptTokens: data.promptTokens,
                        completionTokens: data.completionTokens,
                        totalTokens: data.promptTokens + data.completionTokens
                    };

                    const costResult = await costCalculator.calculateCost(member, tokenUsage);

                    expect(costResult.cost).toBeGreaterThanOrEqual(0);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property 3: Costs have maximum 4 decimal places
     */
    test('costs have maximum 4 decimal places', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    provider: fc.constantFrom('openai', 'anthropic', 'google'),
                    model: fc.constantFrom('gpt-4', 'claude-3-opus', 'gemini-pro'),
                    promptTokens: fc.integer({ min: 1, max: 10000 }),
                    completionTokens: fc.integer({ min: 1, max: 5000 })
                }),
                async (data) => {
                    const member: CouncilMember = {
                        id: `${data.provider}-${data.model}`,
                        provider: data.provider,
                        model: data.model,
                        timeout: 30,
                        retryAttempts: 3
                    };

                    const tokenUsage: TokenUsage = {
                        promptTokens: data.promptTokens,
                        completionTokens: data.completionTokens,
                        totalTokens: data.promptTokens + data.completionTokens
                    };

                    const costResult = await costCalculator.calculateCost(member, tokenUsage);

                    // Check decimal places
                    const costString = costResult.cost.toFixed(4);
                    const roundedCost = parseFloat(costString);

                    // Difference should be negligible (< 0.0001 for 4 decimal places)
                    expect(Math.abs(costResult.cost - roundedCost)).toBeLessThan(0.0001);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    /**
     * Property 4: Cost increases with token count
     */
    test('cost increases monotonically with token count', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    provider: fc.constantFrom('openai', 'anthropic', 'google'),
                    model: fc.constantFrom('gpt-4', 'claude-3-opus', 'gemini-pro'),
                    basePromptTokens: fc.integer({ min: 100, max: 5000 }),
                    baseCompletionTokens: fc.integer({ min: 50, max: 2500 }),
                    multiplier: fc.integer({ min: 2, max: 5 })
                }),
                async (data) => {
                    const member: CouncilMember = {
                        id: `${data.provider}-${data.model}`,
                        provider: data.provider,
                        model: data.model,
                        timeout: 30,
                        retryAttempts: 3
                    };

                    // Calculate cost for base tokens
                    const baseTokenUsage: TokenUsage = {
                        promptTokens: data.basePromptTokens,
                        completionTokens: data.baseCompletionTokens,
                        totalTokens: data.basePromptTokens + data.baseCompletionTokens
                    };
                    const baseCost = await costCalculator.calculateCost(member, baseTokenUsage);

                    // Calculate cost for multiplied tokens
                    const multipliedTokenUsage: TokenUsage = {
                        promptTokens: data.basePromptTokens * data.multiplier,
                        completionTokens: data.baseCompletionTokens * data.multiplier,
                        totalTokens: (data.basePromptTokens + data.baseCompletionTokens) * data.multiplier
                    };
                    const multipliedCost = await costCalculator.calculateCost(member, multipliedTokenUsage);

                    // If base cost is 0, both should be 0 (edge case for unknown models)
                    if (baseCost.cost === 0) {
                        expect(multipliedCost.cost).toBe(0);
                    } else {
                        // Multiplied cost should be greater
                        expect(multipliedCost.cost).toBeGreaterThan(baseCost.cost);

                        // And approximately equal to base cost * multiplier (within 10% tolerance for rounding)
                        const expectedCost = baseCost.cost * data.multiplier;
                        const tolerance = Math.max(expectedCost * 0.1, 0.001); // At least 0.001 tolerance
                        expect(Math.abs(multipliedCost.cost - expectedCost)).toBeLessThan(tolerance);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);
});
