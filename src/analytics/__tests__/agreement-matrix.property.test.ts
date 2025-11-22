/**
 * Property-Based Test: Agreement Matrix Computation
 * Feature: ai-council-proxy, Property 11: Agreement matrix computation
 * 
 * Validates: Requirements 4.6
 * 
 * Property: For any set of deliberation threads, the agreement matrix should 
 * correctly reflect the disagreement rates between each pair of council members.
 */

import fc from 'fast-check';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { AnalyticsEngine } from '../engine';

// Mock pg and redis
jest.mock('pg');
jest.mock('redis');

describe('Property 11: Agreement matrix computation', () => {
  let mockDb: any;
  let mockRedis: any;
  let engine: AnalyticsEngine;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK')
    };

    engine = new AnalyticsEngine(mockDb, mockRedis);
  });

  test('agreement matrix should have symmetric dimensions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }).map(arr => [...new Set(arr)]),
        async (memberIds) => {
          // Setup: Mock database to return these members
          mockDb.query
            .mockResolvedValueOnce({
              rows: memberIds.map(id => ({ council_member_id: id }))
            } as any)
            // Mock pair queries to return empty results
            .mockResolvedValue({ rows: [] } as any);

          const matrix = await engine.computeAgreementMatrix();

          // Property: Matrix should be square (n x n)
          expect(matrix.members.length).toBe(memberIds.length);
          expect(matrix.disagreementRates.length).toBe(memberIds.length);
          
          for (const row of matrix.disagreementRates) {
            expect(row.length).toBe(memberIds.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('agreement matrix diagonal should be zero (member agrees with itself)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }).map(arr => [...new Set(arr)]),
        async (memberIds) => {
          // Setup: Mock database to return these members
          mockDb.query
            .mockResolvedValueOnce({
              rows: memberIds.map(id => ({ council_member_id: id }))
            } as any)
            // Mock pair queries to return empty results
            .mockResolvedValue({ rows: [] } as any);

          const matrix = await engine.computeAgreementMatrix();

          // Property: Diagonal elements should be 0 (member doesn't disagree with itself)
          for (let i = 0; i < matrix.members.length; i++) {
            expect(matrix.disagreementRates[i][i]).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('disagreement rates should be between 0 and 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 5 }).map(arr => [...new Set(arr)]),
        fc.array(
          fc.record({
            request_id: fc.uuid(),
            consensus_decision: fc.lorem({ maxCount: 50 }),
            member1_content: fc.lorem({ maxCount: 50 }),
            member2_content: fc.lorem({ maxCount: 50 })
          }),
          { minLength: 0, maxLength: 20 }
        ),
        async (memberIds, pairData) => {
          // Setup: Mock database
          const queryMock = mockDb.query as jest.Mock;
          queryMock.mockClear();
          
          queryMock.mockResolvedValueOnce({
            rows: memberIds.map(id => ({ council_member_id: id }))
          });

          // Mock pair queries with generated data
          for (let i = 0; i < memberIds.length; i++) {
            for (let j = 0; j < memberIds.length; j++) {
              queryMock.mockResolvedValueOnce({
                rows: pairData
              });
            }
          }

          const matrix = await engine.computeAgreementMatrix();

          // Property: All disagreement rates should be in [0, 1]
          for (const row of matrix.disagreementRates) {
            for (const rate of row) {
              expect(rate).toBeGreaterThanOrEqual(0);
              expect(rate).toBeLessThanOrEqual(1);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('empty deliberation data should produce zero disagreement rates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }).map(arr => [...new Set(arr)]),
        async (memberIds) => {
          // Setup: Mock database with no pair data
          mockDb.query
            .mockResolvedValueOnce({
              rows: memberIds.map(id => ({ council_member_id: id }))
            } as any)
            // All pair queries return empty
            .mockResolvedValue({ rows: [] } as any);

          const matrix = await engine.computeAgreementMatrix();

          // Property: With no data, all disagreement rates should be 0
          for (let i = 0; i < matrix.members.length; i++) {
            for (let j = 0; j < matrix.members.length; j++) {
              expect(matrix.disagreementRates[i][j]).toBe(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('member list should match database members', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }).map(arr => [...new Set(arr)]),
        async (memberIds) => {
          // Setup: Mock database
          mockDb.query
            .mockResolvedValueOnce({
              rows: memberIds.map(id => ({ council_member_id: id }))
            } as any)
            .mockResolvedValue({ rows: [] } as any);

          const matrix = await engine.computeAgreementMatrix();

          // Property: Returned members should match input members
          expect(matrix.members).toEqual(memberIds);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
