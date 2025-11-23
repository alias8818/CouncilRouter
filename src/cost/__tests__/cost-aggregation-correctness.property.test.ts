/**
 * Property-Based Test: Cost aggregation correctness
 * Feature: ai-council-proxy, Property 14: Cost aggregation correctness
 * 
 * Validates: Requirements 5.2
 * 
 * Property: For any request processed by multiple council members, the total cost 
 * should equal the sum of individual council member costs.
 */

import * as fc from 'fast-check';
import { CostCalculator, CostCalculation } from '../calculator';

describe('Property 14: Cost aggregation correctness', () => {
  let calculator: CostCalculator;

  beforeEach(() => {
    calculator = new CostCalculator();
  });

  /**
   * Arbitraries for generating test data
   */
  const providerArb = fc.oneof(
    fc.constant('openai'),
    fc.constant('anthropic'),
    fc.constant('google')
  );

  const modelArb = fc.oneof(
    fc.constant('gpt-4-turbo'),
    fc.constant('gpt-3.5-turbo'),
    fc.constant('claude-3-opus'),
    fc.constant('gemini-pro')
  );

  const costCalculationArb = fc.record({
    memberId: fc.string({ minLength: 1, maxLength: 50 }),
    provider: providerArb,
    model: modelArb,
    promptTokens: fc.integer({ min: 0, max: 10000 }),
    completionTokens: fc.integer({ min: 0, max: 10000 }),
    totalTokens: fc.integer({ min: 0, max: 20000 }),
    cost: fc.double({ min: 0, max: 10, noNaN: true }),
    currency: fc.constant('USD'),
    pricingVersion: fc.oneof(
      fc.constant('v1.0'),
      fc.constant('v2.0'),
      fc.constant('v2024-01')
    )
  });

  test('should aggregate total cost as sum of individual costs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costCalculationArb, { minLength: 1, maxLength: 10 }),
        async (calculations) => {
          // Aggregate costs
          const aggregated = calculator.aggregateCosts(calculations);

          // Property: Total cost should equal sum of individual costs
          const expectedTotal = calculations.reduce((sum, calc) => sum + calc.cost, 0);
          
          // Allow small floating point tolerance
          const tolerance = 0.000001;
          expect(Math.abs(aggregated.totalCost - expectedTotal)).toBeLessThan(tolerance);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should correctly aggregate costs by provider', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costCalculationArb, { minLength: 1, maxLength: 10 }),
        async (calculations) => {
          // Aggregate costs
          const aggregated = calculator.aggregateCosts(calculations);

          // Property: Cost by provider should equal sum of costs for that provider
          const expectedByProvider = new Map<string, number>();
          for (const calc of calculations) {
            const current = expectedByProvider.get(calc.provider) || 0;
            expectedByProvider.set(calc.provider, current + calc.cost);
          }

          // Verify each provider's cost
          for (const [provider, expectedCost] of expectedByProvider.entries()) {
            const actualCost = aggregated.byProvider.get(provider) || 0;
            const tolerance = 0.000001;
            expect(Math.abs(actualCost - expectedCost)).toBeLessThan(tolerance);
          }

          // Verify no extra providers
          expect(aggregated.byProvider.size).toBe(expectedByProvider.size);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should correctly aggregate costs by member', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costCalculationArb, { minLength: 1, maxLength: 10 }),
        async (calculations) => {
          // Aggregate costs
          const aggregated = calculator.aggregateCosts(calculations);

          // Property: Cost by member should equal sum of costs for that member
          const expectedByMember = new Map<string, number>();
          for (const calc of calculations) {
            const current = expectedByMember.get(calc.memberId) || 0;
            expectedByMember.set(calc.memberId, current + calc.cost);
          }

          // Verify each member's cost
          for (const [memberId, expectedCost] of expectedByMember.entries()) {
            const actualCost = aggregated.byMember.get(memberId) || 0;
            const tolerance = 0.000001;
            expect(Math.abs(actualCost - expectedCost)).toBeLessThan(tolerance);
          }

          // Verify no extra members
          expect(aggregated.byMember.size).toBe(expectedByMember.size);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should handle empty calculations array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant([]),
        async (calculations) => {
          // Aggregate empty array
          const aggregated = calculator.aggregateCosts(calculations);

          // Property: Empty array should result in zero cost
          expect(aggregated.totalCost).toBe(0);
          expect(aggregated.byProvider.size).toBe(0);
          expect(aggregated.byMember.size).toBe(0);
          expect(aggregated.calculations).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should preserve all individual calculations in aggregated result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costCalculationArb, { minLength: 1, maxLength: 10 }),
        async (calculations) => {
          // Aggregate costs
          const aggregated = calculator.aggregateCosts(calculations);

          // Property: All individual calculations should be preserved
          expect(aggregated.calculations).toHaveLength(calculations.length);
          
          // Verify each calculation is present
          for (let i = 0; i < calculations.length; i++) {
            expect(aggregated.calculations[i]).toEqual(calculations[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should maintain consistency between total and breakdown', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costCalculationArb, { minLength: 1, maxLength: 10 }),
        async (calculations) => {
          // Aggregate costs
          const aggregated = calculator.aggregateCosts(calculations);

          // Property: Sum of provider costs should equal total cost
          let providerSum = 0;
          for (const cost of aggregated.byProvider.values()) {
            providerSum += cost;
          }

          const tolerance = 0.000001;
          expect(Math.abs(aggregated.totalCost - providerSum)).toBeLessThan(tolerance);

          // Property: Sum of member costs should equal total cost
          let memberSum = 0;
          for (const cost of aggregated.byMember.values()) {
            memberSum += cost;
          }

          expect(Math.abs(aggregated.totalCost - memberSum)).toBeLessThan(tolerance);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should handle single calculation correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        costCalculationArb,
        async (calculation) => {
          // Aggregate single calculation
          const aggregated = calculator.aggregateCosts([calculation]);

          // Property: Single calculation should have total equal to its cost
          const tolerance = 0.000001;
          expect(Math.abs(aggregated.totalCost - calculation.cost)).toBeLessThan(tolerance);

          // Property: Should have exactly one provider and one member
          expect(aggregated.byProvider.size).toBe(1);
          expect(aggregated.byMember.size).toBe(1);

          // Property: Provider and member costs should equal total
          expect(Math.abs(aggregated.byProvider.get(calculation.provider)! - calculation.cost)).toBeLessThan(tolerance);
          expect(Math.abs(aggregated.byMember.get(calculation.memberId)! - calculation.cost)).toBeLessThan(tolerance);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should handle multiple calculations from same member', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(costCalculationArb, { minLength: 2, maxLength: 5 }),
        async (memberId, calculations) => {
          // Set all calculations to same member
          const sameMemberCalcs = calculations.map(calc => ({
            ...calc,
            memberId
          }));

          // Aggregate costs
          const aggregated = calculator.aggregateCosts(sameMemberCalcs);

          // Property: Should have exactly one member entry
          expect(aggregated.byMember.size).toBe(1);

          // Property: Member cost should equal sum of all calculations
          const expectedMemberCost = sameMemberCalcs.reduce((sum, calc) => sum + calc.cost, 0);
          const actualMemberCost = aggregated.byMember.get(memberId) || 0;
          
          const tolerance = 0.000001;
          expect(Math.abs(actualMemberCost - expectedMemberCost)).toBeLessThan(tolerance);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
