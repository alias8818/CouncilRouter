/**
 * Property-Based Test: Cost calculation accuracy
 * Feature: ai-council-proxy, Property 13: Cost calculation accuracy
 * 
 * Validates: Requirements 5.1
 * 
 * Property: For any council member API call with token usage, the calculated cost 
 * should equal the token count multiplied by the provider's pricing rate for that 
 * pricing version.
 */

import * as fc from 'fast-check';
import { CostCalculator, PricingConfig } from '../calculator';
import { CouncilMember, TokenUsage } from '../../types/core';

describe('Property 13: Cost calculation accuracy', () => {
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
    fc.constant('claude-3-sonnet'),
    fc.constant('gemini-pro')
  );

  const pricingConfigArb = fc.record({
    provider: providerArb,
    model: modelArb,
    promptTokenPrice: fc.double({ min: 0.0001, max: 0.1, noNaN: true }),
    completionTokenPrice: fc.double({ min: 0.0001, max: 0.2, noNaN: true }),
    currency: fc.constant('USD'),
    version: fc.oneof(
      fc.constant('v1.0'),
      fc.constant('v2.0'),
      fc.constant('v2024-01')
    )
  });

  const tokenUsageArb = fc.record({
    promptTokens: fc.integer({ min: 0, max: 10000 }),
    completionTokens: fc.integer({ min: 0, max: 10000 }),
    totalTokens: fc.integer({ min: 0, max: 20000 })
  });

  const councilMemberArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    provider: providerArb,
    model: modelArb,
    version: fc.option(fc.string(), { nil: undefined }),
    weight: fc.option(fc.double({ min: 0, max: 1 }), { nil: undefined }),
    timeout: fc.integer({ min: 5, max: 120 }),
    retryPolicy: fc.record({
      maxAttempts: fc.integer({ min: 1, max: 5 }),
      initialDelayMs: fc.integer({ min: 100, max: 2000 }),
      maxDelayMs: fc.integer({ min: 5000, max: 30000 }),
      backoffMultiplier: fc.double({ min: 1.5, max: 3 }),
      retryableErrors: fc.constant(['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE'])
    })
  });

  test('should calculate cost accurately based on token usage and pricing', async () => {
    await fc.assert(
      fc.asyncProperty(
        pricingConfigArb,
        tokenUsageArb,
        councilMemberArb,
        async (pricing, tokenUsage, member) => {
          // Ensure member matches pricing config
          member.provider = pricing.provider;
          member.model = pricing.model;

          // Add pricing configuration
          calculator.addPricingConfig(pricing);

          // Calculate cost
          const result = await calculator.calculateCost(member, tokenUsage);

          // Property: Cost should equal (promptTokens/1000 * promptPrice) + (completionTokens/1000 * completionPrice)
          const expectedPromptCost = (tokenUsage.promptTokens / 1000) * pricing.promptTokenPrice;
          const expectedCompletionCost = (tokenUsage.completionTokens / 1000) * pricing.completionTokenPrice;
          const expectedTotalCost = expectedPromptCost + expectedCompletionCost;

          // Allow small floating point tolerance
          const tolerance = 0.000001;
          expect(Math.abs(result.cost - expectedTotalCost)).toBeLessThan(tolerance);

          // Verify other fields
          expect(result.memberId).toBe(member.id);
          expect(result.provider).toBe(pricing.provider);
          expect(result.model).toBe(pricing.model);
          expect(result.promptTokens).toBe(tokenUsage.promptTokens);
          expect(result.completionTokens).toBe(tokenUsage.completionTokens);
          expect(result.currency).toBe(pricing.currency);
          expect(result.pricingVersion).toBe(pricing.version);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should handle zero token usage correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        pricingConfigArb,
        councilMemberArb,
        async (pricing, member) => {
          // Ensure member matches pricing config
          member.provider = pricing.provider;
          member.model = pricing.model;

          // Add pricing configuration
          calculator.addPricingConfig(pricing);

          // Zero token usage
          const tokenUsage: TokenUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
          };

          // Calculate cost
          const result = await calculator.calculateCost(member, tokenUsage);

          // Property: Zero tokens should result in zero cost
          expect(result.cost).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should calculate cost proportionally to token count', async () => {
    await fc.assert(
      fc.asyncProperty(
        pricingConfigArb,
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 2, max: 10 }),
        councilMemberArb,
        async (pricing, baseTokens, multiplier, member) => {
          // Ensure member matches pricing config
          member.provider = pricing.provider;
          member.model = pricing.model;

          // Add pricing configuration
          calculator.addPricingConfig(pricing);

          // Calculate cost for base tokens
          const baseUsage: TokenUsage = {
            promptTokens: baseTokens,
            completionTokens: baseTokens,
            totalTokens: baseTokens * 2
          };
          const baseCost = await calculator.calculateCost(member, baseUsage);

          // Calculate cost for multiplied tokens
          const multipliedUsage: TokenUsage = {
            promptTokens: baseTokens * multiplier,
            completionTokens: baseTokens * multiplier,
            totalTokens: baseTokens * multiplier * 2
          };
          const multipliedCost = await calculator.calculateCost(member, multipliedUsage);

          // Property: Cost should scale linearly with token count
          const expectedMultipliedCost = baseCost.cost * multiplier;
          const tolerance = 0.000001;
          expect(Math.abs(multipliedCost.cost - expectedMultipliedCost)).toBeLessThan(tolerance);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should use correct pricing version in calculation result', async () => {
    await fc.assert(
      fc.asyncProperty(
        pricingConfigArb,
        tokenUsageArb,
        councilMemberArb,
        async (pricing, tokenUsage, member) => {
          // Ensure member matches pricing config
          member.provider = pricing.provider;
          member.model = pricing.model;

          // Add pricing configuration
          calculator.addPricingConfig(pricing);

          // Calculate cost
          const result = await calculator.calculateCost(member, tokenUsage);

          // Property: Result should include the pricing version used
          expect(result.pricingVersion).toBe(pricing.version);
          expect(result.pricingVersion).toBeDefined();
          expect(typeof result.pricingVersion).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should handle missing pricing configuration gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenUsageArb,
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          provider: fc.constant('unknown-provider'),
          model: fc.constant('unknown-model'),
          version: fc.option(fc.string(), { nil: undefined }),
          weight: fc.option(fc.double({ min: 0, max: 1 }), { nil: undefined }),
          timeout: fc.integer({ min: 5, max: 120 }),
          retryPolicy: fc.record({
            maxAttempts: fc.integer({ min: 1, max: 5 }),
            initialDelayMs: fc.integer({ min: 100, max: 2000 }),
            maxDelayMs: fc.integer({ min: 5000, max: 30000 }),
            backoffMultiplier: fc.double({ min: 1.5, max: 3 }),
            retryableErrors: fc.constant(['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE'])
          })
        }),
        async (tokenUsage, member) => {
          // Use a provider/model that definitely doesn't have pricing config

          // Calculate cost
          const result = await calculator.calculateCost(member, tokenUsage);

          // Property: Missing pricing should result in zero cost with warning
          expect(result.cost).toBe(0);
          expect(result.pricingVersion).toBe('unknown');
          expect(result.currency).toBe('USD');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
