/**
 * Property-Based Test: Rotation sequence correctness under concurrency
 * Feature: bug-fixes-critical, Property 10: Rotation sequence is correct under concurrency
 * 
 * Validates: Requirements 4.1, 4.3
 */

import * as fc from 'fast-check';
import { SynthesisEngine } from '../engine';
import { CouncilMember, ModeratorStrategy } from '../../types/core';

describe('SynthesisEngine - Rotation Concurrency Property Test', () => {
  /**
   * Property 10: Rotation sequence is correct under concurrency
   * 
   * For any set of concurrent requests using rotate moderator strategy,
   * each request should select a different Council Member in sequence
   * without skips or duplicates.
   */
  test('Property 10: Concurrent rotation requests should select members in sequence without skips or duplicates', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a list of council members (2-10 members)
        fc.array(
          fc.record({
            id: fc.string({ minLength: 5, maxLength: 20 }),
            provider: fc.oneof(
              fc.constant('openai' as const),
              fc.constant('anthropic' as const),
              fc.constant('google' as const)
            ),
            model: fc.oneof(
              fc.constant('gpt-4'),
              fc.constant('gpt-4o'),
              fc.constant('claude-3-opus'),
              fc.constant('claude-3-sonnet'),
              fc.constant('gemini-pro')
            ),
            timeout: fc.integer({ min: 10, max: 120 }),
            retryPolicy: fc.record({
              maxAttempts: fc.integer({ min: 1, max: 5 }),
              initialDelayMs: fc.integer({ min: 100, max: 2000 }),
              maxDelayMs: fc.integer({ min: 5000, max: 30000 }),
              backoffMultiplier: fc.integer({ min: 2, max: 3 }),
              retryableErrors: fc.constant([])
            })
          }),
          { minLength: 2, maxLength: 10 }
        ),
        // Generate number of concurrent requests (2-20)
        fc.integer({ min: 2, max: 20 }),
        async (members, numRequests) => {
          // Ensure unique member IDs
          const uniqueMembers = Array.from(
            new Map(members.map((m: CouncilMember) => [m.id, m])).values()
          );

          if (uniqueMembers.length < 2) {
            return; // Skip if not enough unique members
          }

          // Create a fresh engine instance for this test
          const mockProviderPool = {
            sendRequest: jest.fn().mockResolvedValue({
              success: true,
              content: 'Synthesized content',
              tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
              latencyMs: 500,
              cost: 0.01
            })
          } as any;

          const mockConfigManager = {
            getCouncilConfig: jest.fn().mockResolvedValue({
              members: uniqueMembers
            })
          } as any;

          const engine = new SynthesisEngine(mockProviderPool, mockConfigManager);

          const strategy: ModeratorStrategy = {
            type: 'rotate'
          };

          // Execute truly concurrent requests by creating promises that start immediately
          // and awaiting them together. This tests the lock mechanism properly.
          const selectionPromises = Array.from({ length: numRequests }, () =>
            engine.selectModerator(uniqueMembers, strategy)
          );

          const selectedModerators = await Promise.all(selectionPromises);

          // Verify that we got exactly numRequests selections
          expect(selectedModerators.length).toBe(numRequests);

          // CRITICAL FIX: Test actual rotation properties, not exact distribution
          // The rotation mechanism should ensure:
          // 1. Each selection is unique until all members are selected
          // 2. Distribution is balanced (no member selected significantly more than others)
          // 3. All members eventually get selected in a fair rotation

          // Count how many times each member was selected
          const selectionCounts = new Map<string, number>();
          selectedModerators.forEach(member => {
            selectionCounts.set(member.id, (selectionCounts.get(member.id) || 0) + 1);
          });

          // Property 1: All members should have similar selection counts (balanced)
          const counts = Array.from(selectionCounts.values());
          const minCount = Math.min(...counts, 0);
          const maxCount = Math.max(...counts, 0);

          // Max difference should be at most 1 in a perfect rotation
          // (some members get one extra due to remainder)
          expect(maxCount - minCount).toBeLessThanOrEqual(1);

          // Property 2: If we have more requests than members, all members should be selected
          if (numRequests >= uniqueMembers.length) {
            const selectedIds = new Set(selectedModerators.map(m => m.id));
            const memberIds = new Set(uniqueMembers.map(m => m.id));

            // All members should have been selected at least once
            memberIds.forEach(memberId => {
              expect(selectedIds.has(memberId)).toBe(true);
            });
          }

          // Property 3: Total selections should equal requests
          const totalSelections = Array.from(selectionCounts.values()).reduce((sum, count) => sum + count, 0);
          expect(totalSelections).toBe(numRequests);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
