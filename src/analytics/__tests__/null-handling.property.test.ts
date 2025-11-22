/**
 * Property-Based Test: Analytics handles null values safely
 * Feature: bug-fixes-critical, Property 13: Analytics handles null values safely
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 * 
 * This test verifies that the Analytics Engine handles null values gracefully
 * in query results without throwing errors. It tests that null values in
 * consensus_decision, member1_content, member2_content, and other fields
 * are properly validated before access.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { AnalyticsEngine } from '../engine';

// Mock pg and redis
jest.mock('pg');
jest.mock('redis');

describe('Property: Analytics handles null values safely', () => {
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

  test('computeAgreementMatrix should handle null consensus_decision', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            consensus_decision: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.string({ minLength: 10, maxLength: 50 })
            ),
            member1_content: fc.string({ minLength: 10, maxLength: 50 }),
            member2_content: fc.string({ minLength: 10, maxLength: 50 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (rows) => {
          const member1Id = 'member-1';
          const member2Id = 'member-2';

          // Mock database to return members
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({
              rows: [
                { council_member_id: member1Id },
                { council_member_id: member2Id }
              ]
            });

          // Mock pair queries with potentially null values
          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: rows.map(row => ({
              request_id: 'req-1',
              ...row
            }))
          });

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: rows.map(row => ({
              request_id: 'req-1',
              ...row
            }))
          });

          // Should not throw error
          const matrix = await analyticsEngine.computeAgreementMatrix();

          // Verify matrix is returned with valid structure
          expect(matrix).toBeDefined();
          expect(matrix.members).toEqual([member1Id, member2Id]);
          expect(Array.isArray(matrix.disagreementRates)).toBe(true);
          expect(matrix.disagreementRates.length).toBe(2);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('computeAgreementMatrix should handle null member content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            consensus_decision: fc.string({ minLength: 10, maxLength: 50 }),
            member1_content: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.string({ minLength: 10, maxLength: 50 })
            ),
            member2_content: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.string({ minLength: 10, maxLength: 50 })
            )
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (rows) => {
          const member1Id = 'member-1';
          const member2Id = 'member-2';

          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({
              rows: [
                { council_member_id: member1Id },
                { council_member_id: member2Id }
              ]
            });

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: rows.map(row => ({
              request_id: 'req-1',
              ...row
            }))
          });

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: rows.map(row => ({
              request_id: 'req-1',
              ...row
            }))
          });

          // Should not throw error
          const matrix = await analyticsEngine.computeAgreementMatrix();

          expect(matrix).toBeDefined();
          expect(matrix.members).toEqual([member1Id, member2Id]);
          expect(typeof matrix.disagreementRates[0][1]).toBe('number');
          expect(isNaN(matrix.disagreementRates[0][1])).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('computeAgreementMatrix should handle completely null rows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (nullRowCount) => {
          const member1Id = 'member-1';
          const member2Id = 'member-2';

          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({
              rows: [
                { council_member_id: member1Id },
                { council_member_id: member2Id }
              ]
            });

          // Create array of null rows
          const nullRows = Array(nullRowCount).fill({
            request_id: 'req-1',
            consensus_decision: null,
            member1_content: null,
            member2_content: null
          });

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: nullRows
          });

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: nullRows
          });

          // Should not throw error and should return zero disagreement
          const matrix = await analyticsEngine.computeAgreementMatrix();

          expect(matrix).toBeDefined();
          expect(matrix.disagreementRates[0][1]).toBe(0);
          expect(matrix.disagreementRates[1][0]).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('calculateInfluenceScores should handle null values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            council_member_id: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.string({ minLength: 5, maxLength: 20 })
            ),
            consensus_decision: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.string({ minLength: 10, maxLength: 50 })
            ),
            content: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.string({ minLength: 10, maxLength: 50 })
            )
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (rows) => {
          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: rows
          });

          // Should not throw error
          const scores = await analyticsEngine.calculateInfluenceScores();

          expect(scores).toBeDefined();
          expect(scores.scores).toBeInstanceOf(Map);
          
          // All scores should be valid numbers (not NaN)
          for (const [memberId, score] of scores.scores.entries()) {
            expect(typeof score).toBe('number');
            expect(isNaN(score)).toBe(false);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('calculatePerformanceMetrics should handle null latency values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date(),
        fc.date(),
        fc.array(
          fc.record({
            total_latency_ms: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.integer({ min: 100, max: 10000 })
            ),
            members: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.array(fc.string(), { minLength: 1, maxLength: 5 })
            ),
            deliberation_rounds: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.integer({ min: 1, max: 5 })
            )
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (start, end, rows) => {
          // Ensure start is before end
          const timeRange = start < end 
            ? { start, end } 
            : { start: end, end: start };

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: rows
          });

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: [{ timeout_count: '0' }]
          });

          // Should not throw error
          const metrics = await analyticsEngine.calculatePerformanceMetrics(timeRange);

          expect(metrics).toBeDefined();
          expect(typeof metrics.p50Latency).toBe('number');
          expect(typeof metrics.p95Latency).toBe('number');
          expect(typeof metrics.p99Latency).toBe('number');
          expect(isNaN(metrics.p50Latency)).toBe(false);
          expect(isNaN(metrics.p95Latency)).toBe(false);
          expect(isNaN(metrics.p99Latency)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('aggregateCostAnalytics should handle null cost values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date(),
        fc.date(),
        fc.array(
          fc.record({
            total_cost: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.constant('NaN'),
              fc.float({ min: 0, max: 100 }).map(n => n.toString())
            ),
            provider: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.constantFrom('openai', 'anthropic', 'google')
            ),
            model: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.constantFrom('gpt-4', 'claude-3', 'gemini-pro')
            )
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (start, end, rows) => {
          const timeRange = start < end 
            ? { start, end } 
            : { start: end, end: start };

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: rows
          });

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: [{ count: '5' }]
          });

          // Should not throw error
          const analytics = await analyticsEngine.aggregateCostAnalytics(timeRange);

          expect(analytics).toBeDefined();
          expect(typeof analytics.totalCost).toBe('number');
          expect(isNaN(analytics.totalCost)).toBe(false);
          expect(analytics.byProvider).toBeInstanceOf(Map);
          expect(analytics.byMember).toBeInstanceOf(Map);
          
          // All costs should be valid numbers
          for (const cost of analytics.byProvider.values()) {
            expect(typeof cost).toBe('number');
            expect(isNaN(cost)).toBe(false);
          }
          
          for (const cost of analytics.byMember.values()) {
            expect(typeof cost).toBe('number');
            expect(isNaN(cost)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('calculateCostPerQuality should handle null values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date(),
        fc.date(),
        fc.array(
          fc.record({
            cost: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.float({ min: 0, max: 10 })
            ),
            quality: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.float({ min: 0, max: 1 })
            )
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (start, end, rows) => {
          const timeRange = start < end 
            ? { start, end } 
            : { start: end, end: start };

          (mockDb.query as jest.Mock).mockResolvedValueOnce({
            rows: rows
          });

          // Should not throw error
          const result = await analyticsEngine.calculateCostPerQuality(timeRange);

          expect(Array.isArray(result)).toBe(true);
          
          // All returned items should have valid numbers
          for (const item of result) {
            expect(typeof item.cost).toBe('number');
            expect(typeof item.quality).toBe('number');
            expect(isNaN(item.cost)).toBe(false);
            expect(isNaN(item.quality)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('analytics should handle null query results', async () => {
    // Test with completely null result object
    (mockDb.query as jest.Mock).mockResolvedValueOnce(null);

    const scores = await analyticsEngine.calculateInfluenceScores();
    expect(scores).toBeDefined();
    expect(scores.scores.size).toBe(0);
  }, 120000);

  test('analytics should handle undefined rows in result', async () => {
    // Test with undefined rows
    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: undefined
    });

    const scores = await analyticsEngine.calculateInfluenceScores();
    expect(scores).toBeDefined();
    expect(scores.scores.size).toBe(0);
  }, 120000);
});
