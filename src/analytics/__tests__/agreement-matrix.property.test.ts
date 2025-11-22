/**
 * Property-Based Test: Agreement matrix reflects member differences
 * Feature: bug-fixes-critical, Property 12: Agreement matrix reflects member differences
 * 
 * Validates: Requirements 5.4
 * 
 * This test verifies that the agreement matrix accurately reflects member-to-member
 * disagreement rates based on direct comparison of their responses, not their
 * alignment with consensus.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { AnalyticsEngine } from '../engine';

// Mock pg and redis
jest.mock('pg');
jest.mock('redis');

describe('Property: Agreement matrix reflects member differences', () => {
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

  test('agreement matrix should be symmetric', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 20, maxLength: 100 }), { minLength: 2, maxLength: 5 }),
        async (responses) => {
          // Create unique member IDs
          const memberIds = responses.map((_, i) => `member-${i}`);

          // Mock database to return members
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({
              rows: memberIds.map(id => ({ council_member_id: id }))
            });

          // For each pair, mock the pair query
          for (let i = 0; i < memberIds.length; i++) {
            for (let j = 0; j < memberIds.length; j++) {
              if (i !== j) {
                (mockDb.query as jest.Mock).mockResolvedValueOnce({
                  rows: [
                    {
                      request_id: 'req-1',
                      consensus_decision: 'some consensus',
                      member1_content: responses[i],
                      member2_content: responses[j]
                    }
                  ]
                });
              }
            }
          }

          const matrix = await analyticsEngine.computeAgreementMatrix();

          // Verify symmetry: disagreement[i][j] should equal disagreement[j][i]
          for (let i = 0; i < matrix.members.length; i++) {
            for (let j = 0; j < matrix.members.length; j++) {
              if (i !== j) {
                expect(matrix.disagreementRates[i][j]).toBe(matrix.disagreementRates[j][i]);
              }
            }
          }
        }
      ),
      { numRuns: 50 } // Reduced runs due to complexity
    );
  }, 120000);

  test('diagonal of agreement matrix should be zero', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 20, maxLength: 100 }), { minLength: 2, maxLength: 5 }),
        async (responses) => {
          const memberIds = responses.map((_, i) => `member-${i}`);

          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({
              rows: memberIds.map(id => ({ council_member_id: id }))
            });

          // Mock pair queries
          for (let i = 0; i < memberIds.length; i++) {
            for (let j = 0; j < memberIds.length; j++) {
              if (i !== j) {
                (mockDb.query as jest.Mock).mockResolvedValueOnce({
                  rows: [
                    {
                      request_id: 'req-1',
                      consensus_decision: 'consensus',
                      member1_content: responses[i],
                      member2_content: responses[j]
                    }
                  ]
                });
              }
            }
          }

          const matrix = await analyticsEngine.computeAgreementMatrix();

          // Verify diagonal is zero (member compared to itself)
          for (let i = 0; i < matrix.members.length; i++) {
            expect(matrix.disagreementRates[i][i]).toBe(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 120000);

  test('agreement matrix should reflect actual response similarity', async () => {
    // Test with known responses to verify the matrix accurately reflects similarity
    const member1Id = 'member-1';
    const member2Id = 'member-2';
    const member3Id = 'member-3';

    // Member 1 and 2 have identical responses
    // Member 3 has a completely different response
    const identicalResponse = 'apple orange banana grape melon';
    const differentResponse = 'zebra xylophone yacht umbrella violin';

    (mockDb.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [
          { council_member_id: member1Id },
          { council_member_id: member2Id },
          { council_member_id: member3Id }
        ]
      });

    // Mock pair queries for all combinations
    // member1 vs member2 (identical)
    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        request_id: 'req-1',
        consensus_decision: 'some consensus',
        member1_content: identicalResponse,
        member2_content: identicalResponse
      }]
    });

    // member1 vs member3 (different)
    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        request_id: 'req-1',
        consensus_decision: 'some consensus',
        member1_content: identicalResponse,
        member2_content: differentResponse
      }]
    });

    // member2 vs member1 (identical)
    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        request_id: 'req-1',
        consensus_decision: 'some consensus',
        member1_content: identicalResponse,
        member2_content: identicalResponse
      }]
    });

    // member2 vs member3 (different)
    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        request_id: 'req-1',
        consensus_decision: 'some consensus',
        member1_content: identicalResponse,
        member2_content: differentResponse
      }]
    });

    // member3 vs member1 (different)
    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        request_id: 'req-1',
        consensus_decision: 'some consensus',
        member1_content: differentResponse,
        member2_content: identicalResponse
      }]
    });

    // member3 vs member2 (different)
    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        request_id: 'req-1',
        consensus_decision: 'some consensus',
        member1_content: differentResponse,
        member2_content: identicalResponse
      }]
    });

    const matrix = await analyticsEngine.computeAgreementMatrix();

    const idx1 = matrix.members.indexOf(member1Id);
    const idx2 = matrix.members.indexOf(member2Id);
    const idx3 = matrix.members.indexOf(member3Id);

    // Member 1 and 2 should have zero disagreement (identical responses)
    expect(matrix.disagreementRates[idx1][idx2]).toBe(0);
    expect(matrix.disagreementRates[idx2][idx1]).toBe(0);

    // Member 1 and 3 should have high disagreement (completely different)
    expect(matrix.disagreementRates[idx1][idx3]).toBeGreaterThan(0.5);
    expect(matrix.disagreementRates[idx3][idx1]).toBeGreaterThan(0.5);

    // Member 2 and 3 should have high disagreement (completely different)
    expect(matrix.disagreementRates[idx2][idx3]).toBeGreaterThan(0.5);
    expect(matrix.disagreementRates[idx3][idx2]).toBeGreaterThan(0.5);
  }, 120000);

  test('agreement matrix should handle multiple deliberations correctly', async () => {
    const member1Id = 'member-1';
    const member2Id = 'member-2';

    (mockDb.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [
          { council_member_id: member1Id },
          { council_member_id: member2Id }
        ]
      });

    // Mock pair query with multiple deliberations
    // In 2 out of 3 deliberations, members disagree
    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          request_id: 'req-1',
          consensus_decision: 'consensus1',
          member1_content: 'apple orange banana',
          member2_content: 'apple orange banana' // Agree
        },
        {
          request_id: 'req-2',
          consensus_decision: 'consensus2',
          member1_content: 'apple orange banana',
          member2_content: 'zebra xylophone yacht' // Disagree
        },
        {
          request_id: 'req-3',
          consensus_decision: 'consensus3',
          member1_content: 'apple orange banana',
          member2_content: 'umbrella violin walrus' // Disagree
        }
      ]
    });

    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          request_id: 'req-1',
          consensus_decision: 'consensus1',
          member1_content: 'apple orange banana',
          member2_content: 'apple orange banana'
        },
        {
          request_id: 'req-2',
          consensus_decision: 'consensus2',
          member1_content: 'zebra xylophone yacht',
          member2_content: 'apple orange banana'
        },
        {
          request_id: 'req-3',
          consensus_decision: 'consensus3',
          member1_content: 'umbrella violin walrus',
          member2_content: 'apple orange banana'
        }
      ]
    });

    const matrix = await analyticsEngine.computeAgreementMatrix();

    // Disagreement rate should be approximately 2/3 (0.67)
    const idx1 = matrix.members.indexOf(member1Id);
    const idx2 = matrix.members.indexOf(member2Id);

    expect(matrix.disagreementRates[idx1][idx2]).toBeGreaterThan(0.5);
    expect(matrix.disagreementRates[idx1][idx2]).toBeLessThanOrEqual(1.0);
  }, 120000);
});
