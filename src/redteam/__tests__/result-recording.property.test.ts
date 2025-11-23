/**
 * Property-Based Test: Red-team result recording
 * Feature: ai-council-proxy, Property 46: Red-team result recording
 * 
 * Validates: Requirements 13.3
 * 
 * Property: For any red-team test execution, the system should record which 
 * council members resisted and which were compromised.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { RedTeamTester } from '../tester';
import { RedTeamTestResult } from '../../types/core';

// Mock dependencies
jest.mock('pg');
jest.mock('../../providers/pool');
jest.mock('../../config/manager');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid')
}));

describe('Property 46: Red-team result recording', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockProviderPool: any;
  let mockConfigManager: any;
  let redTeamTester: RedTeamTester;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      query: jest.fn()
    } as any;

    // Create mock provider pool
    mockProviderPool = {
      sendRequest: jest.fn()
    };

    // Create mock config manager
    mockConfigManager = {
      getCouncilConfig: jest.fn()
    };

    redTeamTester = new RedTeamTester(mockDb, mockProviderPool, mockConfigManager);
  });

  test('recorded results should include resistance status for each council member', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary test results
        fc.array(
          fc.record({
            id: fc.uuid(),
            testName: fc.string({ minLength: 1, maxLength: 100 }),
            prompt: fc.string({ minLength: 10, maxLength: 500 }),
            attackCategory: fc.constantFrom('prompt-injection', 'jailbreak', 'data-extraction', 'privilege-escalation'),
            councilMemberId: fc.string({ minLength: 1, maxLength: 50 }),
            response: fc.string({ minLength: 10, maxLength: 500 }),
            compromised: fc.boolean(),
            createdAt: fc.date()
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (results: RedTeamTestResult[]) => {
          const recordedResults: RedTeamTestResult[] = [];

          mockDb.query.mockImplementation((query: string, params?: any[]) => {
            if (query.includes('INSERT INTO red_team_tests')) {
              const [id, testName, prompt, attackCategory, councilMemberId, response, compromised, createdAt] = params!;
              recordedResults.push({
                id,
                testName,
                prompt,
                attackCategory,
                councilMemberId,
                response,
                compromised,
                createdAt
              });
              return Promise.resolve({ rows: [], rowCount: 1 } as any);
            }
            return Promise.resolve({ rows: [] } as any);
          });

          // Record all results
          for (const result of results) {
            await redTeamTester.recordResult(result);
          }

          // Property: All results should be recorded
          expect(recordedResults).toHaveLength(results.length);

          // Property: Each recorded result should include compromised status
          for (const recorded of recordedResults) {
            expect(typeof recorded.compromised).toBe('boolean');
          }

          // Property: Each recorded result should include council member ID
          for (const recorded of recordedResults) {
            expect(recorded.councilMemberId).toBeDefined();
            expect(recorded.councilMemberId.length).toBeGreaterThan(0);
          }

          // Property: Compromised status should match original
          for (const original of results) {
            const recorded = recordedResults.find(r => r.id === original.id);
            expect(recorded).toBeDefined();
            expect(recorded!.compromised).toBe(original.compromised);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('resistance rates should correctly reflect test outcomes', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test results for a single member
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 50 }), // councilMemberId
          fc.array(
            fc.record({
              compromised: fc.boolean(),
              attackCategory: fc.constantFrom('prompt-injection', 'jailbreak')
            }),
            { minLength: 5, maxLength: 20 }
          )
        ),
        async ([councilMemberId, testOutcomes]) => {
          // Mock database to calculate resistance rates
          mockDb.query.mockImplementation((query: string) => {
            if (query.includes('GROUP BY council_member_id')) {
              const totalTests = testOutcomes.length;
              const resisted = testOutcomes.filter(t => !t.compromised).length;
              
              return Promise.resolve({
                rows: [{
                  council_member_id: councilMemberId,
                  total_tests: totalTests,
                  resisted: resisted
                }]
              } as any);
            }
            return Promise.resolve({ rows: [] } as any);
          });

          const analytics = await redTeamTester.getResistanceRates();

          // Property: Resistance rate should be between 0 and 1
          const rate = analytics.resistanceRatesByMember.get(councilMemberId);
          if (rate !== undefined) {
            expect(rate).toBeGreaterThanOrEqual(0);
            expect(rate).toBeLessThanOrEqual(1);
          }

          // Property: Resistance rate should equal (resisted / total)
          const expectedResisted = testOutcomes.filter(t => !t.compromised).length;
          const expectedRate = expectedResisted / testOutcomes.length;
          
          if (rate !== undefined) {
            expect(rate).toBeCloseTo(expectedRate, 5);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('results should distinguish between resisted and compromised', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          testName: fc.string({ minLength: 1, maxLength: 100 }),
          prompt: fc.string({ minLength: 10, maxLength: 500 }),
          attackCategory: fc.constantFrom('prompt-injection', 'jailbreak'),
          councilMemberId: fc.string({ minLength: 1, maxLength: 50 }),
          response: fc.string({ minLength: 10, maxLength: 500 }),
          compromised: fc.boolean(),
          createdAt: fc.date()
        }),
        async (result: RedTeamTestResult) => {
          let recordedResult: RedTeamTestResult | null = null;

          mockDb.query.mockImplementation((query: string, params?: any[]) => {
            if (query.includes('INSERT INTO red_team_tests')) {
              const [id, testName, prompt, attackCategory, councilMemberId, response, compromised, createdAt] = params!;
              recordedResult = {
                id,
                testName,
                prompt,
                attackCategory,
                councilMemberId,
                response,
                compromised,
                createdAt
              };
              return Promise.resolve({ rows: [], rowCount: 1 } as any);
            }
            return Promise.resolve({ rows: [] } as any);
          });

          await redTeamTester.recordResult(result);

          // Property: Recorded result should preserve compromised status
          expect(recordedResult).not.toBeNull();
          expect(recordedResult!.compromised).toBe(result.compromised);

          // Property: Compromised is boolean (not null or undefined)
          expect(typeof recordedResult!.compromised).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
