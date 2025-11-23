/**
 * Property-Based Test: Disagreement measures member-to-member difference
 * Feature: bug-fixes-critical, Property 11: Disagreement measures member-to-member difference
 * 
 * Validates: Requirements 5.1
 * 
 * This test verifies that the disagreement calculation compares member responses
 * directly to each other, not to consensus. When two members provide identical
 * responses, disagreement should be zero. When they provide completely different
 * responses, disagreement should be high regardless of consensus alignment.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { AnalyticsEngine } from '../engine';

// Mock pg and redis
jest.mock('pg');
jest.mock('redis');

describe('Property: Disagreement measures member-to-member difference', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let analyticsEngine: AnalyticsEngine;

  beforeEach(() => {
    mockDb = {
      query: jest.fn() as any
    } as any;

    mockRedis = {
      get: jest.fn().mockResolvedValue(null) as any,
      setEx: jest.fn().mockResolvedValue('OK') as any
    } as any;

    analyticsEngine = new AnalyticsEngine(mockDb, mockRedis);
  });

  test('identical member responses should result in zero disagreement', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 200 }), // member1 content
        fc.string({ minLength: 10, maxLength: 200 }), // consensus (can be different)
        async (memberContent, consensus) => {
          // Setup: Two members with identical responses
          const member1Id = 'member-1';
          const member2Id = 'member-2';

          // Mock database responses
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({
              rows: [
                { council_member_id: member1Id },
                { council_member_id: member2Id }
              ]
            })
            .mockResolvedValue({
              rows: [
                {
                  request_id: 'req-1',
                  consensus_decision: consensus,
                  member1_content: memberContent,
                  member2_content: memberContent // Identical to member1
                }
              ]
            });

          // Execute
          const matrix = await analyticsEngine.computeAgreementMatrix();

          // Verify: When members have identical responses, disagreement should be 0
          const member1Index = matrix.members.indexOf(member1Id);
          const member2Index = matrix.members.indexOf(member2Id);

          expect(matrix.disagreementRates[member1Index][member2Index]).toBe(0);
          expect(matrix.disagreementRates[member2Index][member1Index]).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('completely different member responses should result in high disagreement', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 50, maxLength: 200 }), // member1 content
        fc.string({ minLength: 50, maxLength: 200 }), // member2 content (different)
        fc.string({ minLength: 50, maxLength: 200 }), // consensus
        async (content1, content2, consensus) => {
          // Ensure contents are sufficiently different
          const words1 = content1.split(/\s+/).filter(w => w.length > 3);
          const words2 = content2.split(/\s+/).filter(w => w.length > 3);
          
          // Skip if not enough words or too similar
          if (words1.length < 5 || words2.length < 5) return;
          
          const commonWords = words1.filter(w => words2.includes(w));
          const similarity = commonWords.length / Math.max(words1.length, words2.length);
          
          // Only test when responses are truly different (< 30% similarity)
          if (similarity >= 0.3) return;

          const member1Id = 'member-1';
          const member2Id = 'member-2';

          // Mock database responses
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({
              rows: [
                { council_member_id: member1Id },
                { council_member_id: member2Id }
              ]
            })
            .mockResolvedValue({
              rows: [
                {
                  request_id: 'req-1',
                  consensus_decision: consensus,
                  member1_content: content1,
                  member2_content: content2
                }
              ]
            });

          // Execute
          const matrix = await analyticsEngine.computeAgreementMatrix();

          // Verify: When members have very different responses, disagreement should be high (> 0.5)
          const member1Index = matrix.members.indexOf(member1Id);
          const member2Index = matrix.members.indexOf(member2Id);

          expect(matrix.disagreementRates[member1Index][member2Index]).toBeGreaterThan(0.5);
          expect(matrix.disagreementRates[member2Index][member1Index]).toBeGreaterThan(0.5);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('disagreement should be independent of consensus alignment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 50, maxLength: 200 }), // shared member content
        fc.string({ minLength: 50, maxLength: 200 }), // consensus1
        fc.string({ minLength: 50, maxLength: 200 }), // consensus2 (different)
        async (memberContent, consensus1, consensus2) => {
          const member1Id = 'member-1';
          const member2Id = 'member-2';

          // Scenario 1: Both members agree, consensus is similar to their response
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({
              rows: [
                { council_member_id: member1Id },
                { council_member_id: member2Id }
              ]
            })
            .mockResolvedValue({
              rows: [
                {
                  request_id: 'req-1',
                  consensus_decision: consensus1,
                  member1_content: memberContent,
                  member2_content: memberContent
                }
              ]
            });

          const matrix1 = await analyticsEngine.computeAgreementMatrix();
          const disagreement1 = matrix1.disagreementRates[0][1];

          // Scenario 2: Both members agree, but consensus is completely different
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({
              rows: [
                { council_member_id: member1Id },
                { council_member_id: member2Id }
              ]
            })
            .mockResolvedValue({
              rows: [
                {
                  request_id: 'req-1',
                  consensus_decision: consensus2,
                  member1_content: memberContent,
                  member2_content: memberContent
                }
              ]
            });

          const matrix2 = await analyticsEngine.computeAgreementMatrix();
          const disagreement2 = matrix2.disagreementRates[0][1];

          // Verify: Disagreement should be the same (both zero) regardless of consensus
          expect(disagreement1).toBe(disagreement2);
          expect(disagreement1).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('disagreement calculation should not depend on consensus', async () => {
    // This test specifically targets the bug where disagreement is calculated
    // by comparing each member to consensus rather than to each other
    const member1Id = 'member-1';
    const member2Id = 'member-2';

    // Create a scenario where:
    // - Member 1 says "apple orange banana"
    // - Member 2 says "apple orange banana" (identical)
    // - Consensus says "grape melon watermelon" (completely different)
    // 
    // REGRESSION TEST: Previously buggy behavior (overlap1 = low, overlap2 = low, abs(overlap1-overlap2) = ~0, disagreement = 0)
    // Fixed behavior: direct comparison shows identical, disagreement = 0 ✓
    // Both would pass this case.
    //
    // Now try:
    // - Member 1 says "apple orange banana grape"
    // - Member 2 says "grape melon watermelon pear"
    // - Consensus says "apple orange banana grape" (matches member 1)
    //
    // REGRESSION TEST: Previously buggy behavior (overlap1 = high (~1.0), overlap2 = low (~0.25), abs(overlap1-overlap2) = ~0.75 > 0.3, disagreement = 1)
    // Fixed behavior: direct comparison shows ~25% overlap, disagreement = 1 ✓
    // Both would pass this case too.
    //
    // The key case:
    // - Member 1 says "apple orange banana"
    // - Member 2 says "apple orange banana" (identical)
    // - Consensus says "apple orange" (partial match - high overlap with member 1, high overlap with member 2)
    //
    // REGRESSION TEST: Previously buggy behavior (overlap1 = ~0.67, overlap2 = ~0.67, abs(overlap1-overlap2) = 0, disagreement = 0)
    // Fixed behavior: direct comparison shows identical, disagreement = 0 ✓
    //
    // Actually, let me try a different approach:
    // - Member 1 says "apple orange banana grape melon"
    // - Member 2 says "apple orange banana grape melon" (identical)
    // - Consensus says "apple orange banana" (subset - member 1 has 60% overlap, member 2 has 60% overlap)
    //
    // REGRESSION TEST: Previously buggy behavior (overlap1 = 0.6, overlap2 = 0.6, abs(0.6-0.6) = 0 < 0.3, disagreement = 0)
    // Fixed behavior: direct comparison = 1.0, disagreement = 0 ✓
    //
    // Let me try the opposite:
    // - Member 1 says "apple orange banana"
    // - Member 2 says "grape melon watermelon"
    // - Consensus says "apple orange banana grape melon watermelon" (superset of both)
    //
    // REGRESSION TEST: Previously buggy behavior (overlap1 = 0.5, overlap2 = 0.5, abs(0.5-0.5) = 0 < 0.3, disagreement = 0) ✗ (WRONG!)
    // Fixed behavior: direct comparison = 0, disagreement = 1 ✓ (CORRECT!)

    (mockDb.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [
          { council_member_id: member1Id },
          { council_member_id: member2Id }
        ]
      })
      .mockResolvedValue({
        rows: [
          {
            request_id: 'req-1',
            consensus_decision: 'apple orange banana grape melon watermelon',
            member1_content: 'apple orange banana',
            member2_content: 'grape melon watermelon'
          }
        ]
      });

    const matrix = await analyticsEngine.computeAgreementMatrix();

    // REGRESSION TEST: Previously buggy behavior - both members had similar overlap with consensus (~0.5 each)
    // so abs(overlap1 - overlap2) < 0.3, resulting in disagreement = 0 (incorrect)
    // Fixed behavior: members have 0% overlap with each other, so disagreement = 1 (correct)
    const member1Index = matrix.members.indexOf(member1Id);
    const member2Index = matrix.members.indexOf(member2Id);

    // This should be 1 (high disagreement) because the members have completely different responses
    expect(matrix.disagreementRates[member1Index][member2Index]).toBe(1);
  }, 120000);
});
