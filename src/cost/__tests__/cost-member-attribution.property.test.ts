/**
 * Property-Based Test: Cost Attribution Uses Correct Member IDs
 * Feature: bug-fixes-critical, Property 8: Cost attribution uses correct member IDs
 * 
 * Validates: Requirements 2.4
 * 
 * For any cost calculation aggregated by member, the costs should be
 * attributed to the correct Council Members.
 */

import * as fc from 'fast-check';
import { CostCalculator, CostCalculation } from '../calculator';
import { CouncilMember, TokenUsage, RetryPolicy } from '../../types/core';

// ============================================================================
// Arbitraries for Property-Based Testing
// ============================================================================

const retryPolicyArbitrary = fc.record({
  maxAttempts: fc.integer({ min: 1, max: 5 }),
  initialDelayMs: fc.integer({ min: 100, max: 2000 }),
  maxDelayMs: fc.integer({ min: 1000, max: 10000 }),
  backoffMultiplier: fc.double({ min: 1.1, max: 3.0 }),
  retryableErrors: fc.array(
    fc.constantFrom('RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE'),
    { minLength: 1, maxLength: 3 }
  )
}).filter(policy => policy.maxDelayMs >= policy.initialDelayMs);

const councilMemberArbitrary = fc.record({
  id: fc.string({ minLength: 3, maxLength: 20 }).filter(s => !/^\d+$/.test(s)).map(s => `member-${s}`),
  provider: fc.constantFrom('openai', 'anthropic', 'google'),
  model: fc.oneof(
    fc.constant('gpt-4-turbo'),
    fc.constant('gpt-3.5-turbo'),
    fc.constant('claude-3-opus'),
    fc.constant('claude-3-sonnet'),
    fc.constant('gemini-pro')
  ),
  version: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
  weight: fc.option(fc.double({ min: 0, max: 1 }), { nil: undefined }),
  timeout: fc.integer({ min: 5, max: 120 }),
  retryPolicy: retryPolicyArbitrary
});

const tokenUsageArbitrary = fc.record({
  promptTokens: fc.integer({ min: 0, max: 10000 }),
  completionTokens: fc.integer({ min: 0, max: 10000 })
}).map(({ promptTokens, completionTokens }) => ({
  promptTokens,
  completionTokens,
  totalTokens: promptTokens + completionTokens
}));

// ============================================================================
// Property Test: Cost Attribution Uses Correct Member IDs
// ============================================================================

describe('Property Test: Cost Attribution Uses Correct Member IDs', () => {
  /**
   * Feature: bug-fixes-critical, Property 8: Cost attribution uses correct member IDs
   * 
   * For any cost calculation aggregated by member, the costs should be
   * attributed to the correct Council Members.
   * 
   * Validates: Requirements 2.4
   */
  test('should attribute costs to actual member IDs not placeholders', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilMemberArbitrary,
        tokenUsageArbitrary,
        async (member, tokenUsage) => {
          // Setup
          const calculator = new CostCalculator();

          // Execute: Calculate cost for this member
          const costCalc: CostCalculation = await calculator.calculateCost(member, tokenUsage);

          // Property assertions:
          // The member ID in the cost calculation should match the actual member ID
          expect(costCalc.memberId).toBe(member.id);

          // Should not be a placeholder pattern like "member-0", "member-1", etc.
          const isPlaceholder = /^member-\d+$/.test(costCalc.memberId);
          expect(isPlaceholder).toBe(false);

          // The cost calculation should include the correct provider and model
          expect(costCalc.provider).toBe(member.provider);
          expect(costCalc.model).toBe(member.model);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Test that aggregated costs maintain correct member IDs
   */
  test('should preserve member IDs when aggregating costs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(councilMemberArbitrary, tokenUsageArbitrary),
          { minLength: 2, maxLength: 5 }
        ),
        async (memberUsagePairs) => {
          // Ensure unique member IDs
          const uniquePairs = memberUsagePairs.filter((pair, i, arr) =>
            arr.findIndex(p => p[0].id === pair[0].id) === i
          );

          if (uniquePairs.length < 2) {
            return; // Skip if we don't have enough unique members
          }

          // Setup
          const calculator = new CostCalculator();

          // Execute: Calculate costs for all members
          const calculations: CostCalculation[] = await Promise.all(
            uniquePairs.map(([member, tokenUsage]) =>
              calculator.calculateCost(member, tokenUsage)
            )
          );

          // Aggregate the costs
          const aggregated = calculator.aggregateCosts(calculations);

          // Property assertions:
          const memberIds = Array.from(aggregated.byMember.keys());
          const expectedMemberIds = uniquePairs.map(([member]) => member.id);

          // All member IDs in aggregated costs should match the actual member IDs
          expect(memberIds.sort()).toEqual(expectedMemberIds.sort());

          // No member ID should be a placeholder
          for (const memberId of memberIds) {
            const isPlaceholder = /^member-\d+$/.test(memberId);
            expect(isPlaceholder).toBe(false);
          }

          // Each member should have a cost entry
          for (const [member] of uniquePairs) {
            expect(aggregated.byMember.has(member.id)).toBe(true);
            const memberCost = aggregated.byMember.get(member.id);
            expect(memberCost).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Test that cost calculations preserve member IDs through the full pipeline
   */
  test('should maintain member ID integrity through calculation pipeline', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(councilMemberArbitrary, { minLength: 2, maxLength: 5 }),
        fc.array(tokenUsageArbitrary, { minLength: 2, maxLength: 5 }),
        async (members, tokenUsages) => {
          // Ensure unique member IDs
          const uniqueMembers = members.filter((m, i, arr) =>
            arr.findIndex(x => x.id === m.id) === i
          );

          if (uniqueMembers.length < 2 || tokenUsages.length < uniqueMembers.length) {
            return; // Skip if we don't have enough data
          }

          // Setup
          const calculator = new CostCalculator();

          // Execute: Calculate costs for each member
          const calculations: CostCalculation[] = [];
          for (let i = 0; i < uniqueMembers.length; i++) {
            const member = uniqueMembers[i];
            const tokenUsage = tokenUsages[i];
            const calc = await calculator.calculateCost(member, tokenUsage);
            calculations.push(calc);
          }

          // Property assertions:
          // Each calculation should have the correct member ID
          for (let i = 0; i < calculations.length; i++) {
            const calc = calculations[i];
            const expectedMemberId = uniqueMembers[i].id;

            expect(calc.memberId).toBe(expectedMemberId);

            // Should not be a placeholder
            const isPlaceholder = /^member-\d+$/.test(calc.memberId);
            expect(isPlaceholder).toBe(false);
          }

          // Aggregate and verify member IDs are preserved
          const aggregated = calculator.aggregateCosts(calculations);
          const aggregatedMemberIds = Array.from(aggregated.byMember.keys());

          for (const memberId of aggregatedMemberIds) {
            // Should be one of the actual member IDs
            const isActualMember = uniqueMembers.some(m => m.id === memberId);
            expect(isActualMember).toBe(true);

            // Should not be a placeholder
            const isPlaceholder = /^member-\d+$/.test(memberId);
            expect(isPlaceholder).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
