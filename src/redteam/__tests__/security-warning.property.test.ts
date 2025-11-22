/**
 * Property-Based Test: Security warning generation
 * Feature: ai-council-proxy, Property 48: Security warning generation
 * 
 * Validates: Requirements 13.5
 * 
 * Property: For any council member that consistently fails red-team tests, 
 * the dashboard should display a security warning for that member.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { RedTeamTester } from '../tester';

// Mock dependencies
jest.mock('pg');
jest.mock('../../providers/pool');
jest.mock('../../config/manager');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid')
}));

describe('Property 48: Security warning generation', () => {
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

  test('members with high failure rates should generate security warnings', async () => {
    // Generator for valid member IDs (alphanumeric, hyphens, underscores, no whitespace)
    const memberIdArbitrary = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/);

    await fc.assert(
      fc.asyncProperty(
        // Generate council members with varying failure rates
        fc.array(
          fc.record({
            memberId: memberIdArbitrary,
            failureRate: fc.double({ min: 0, max: 1 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (members) => {
          // Mock database to return resistance rates
          mockDb.query.mockImplementation((query: string) => {
            if (query.includes('GROUP BY council_member_id')) {
              const rows = members.map(m => ({
                council_member_id: m.memberId,
                total_tests: 100,
                resisted: Math.floor(100 * (1 - m.failureRate))
              }));

              return Promise.resolve({ rows } as any);
            }
            return Promise.resolve({ rows: [] } as any);
          });

          const warnings = await redTeamTester.getSecurityWarnings();

          // Property: Members with failure rate >= 30% should have warnings
          for (const member of members) {
            const hasWarning = warnings.has(member.memberId);

            if (member.failureRate > 0.3) {
              expect(hasWarning).toBe(true);

              // Property: Warning message should mention the member ID
              const warning = warnings.get(member.memberId);
              expect(warning).toContain(member.memberId);

              // Property: Warning should indicate it's a security warning
              expect(warning?.toLowerCase()).toContain('security warning');
            } else {
              expect(hasWarning).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('warnings should include failure rate information', async () => {
    // Generator for valid member IDs (alphanumeric, hyphens, underscores, no whitespace)
    const memberIdArbitrary = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/);

    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          memberIdArbitrary, // memberId
          fc.double({ min: 0.31, max: 1 }) // failureRate (strictly above threshold)
        ),
        async ([memberId, failureRate]) => {
          // Mock database to return specific failure rate
          mockDb.query.mockImplementation((query: string) => {
            if (query.includes('GROUP BY council_member_id, attack_category')) {
              const totalTests = 100;
              const resisted = Math.floor(totalTests * (1 - failureRate));

              return Promise.resolve({
                rows: [{
                  council_member_id: memberId,
                  attack_category: 'jailbreak', // Add attack_category
                  total_tests: totalTests,
                  resisted: resisted
                }]
              } as any);
            }

            if (query.includes('GROUP BY council_member_id')) {
              const totalTests = 100;
              const resisted = Math.floor(totalTests * (1 - failureRate));

              return Promise.resolve({
                rows: [{
                  council_member_id: memberId,
                  total_tests: totalTests,
                  resisted: resisted
                }]
              } as any);
            }
            return Promise.resolve({ rows: [] } as any);
          });

          const warnings = await redTeamTester.getSecurityWarnings();

          // Property: Warning should exist for high failure rate
          expect(warnings.has(memberId)).toBe(true);

          const warning = warnings.get(memberId);

          // Property: Warning should be a non-empty string
          expect(warning).toBeDefined();
          expect(warning!.length).toBeGreaterThan(0);

          // Property: Warning should mention failure rate
          expect(warning).toContain('%');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('members with low failure rates should not generate warnings', async () => {
    // Generator for valid member IDs (alphanumeric, hyphens, underscores, no whitespace)
    const memberIdArbitrary = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/);

    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          memberIdArbitrary, // memberId
          fc.double({ min: 0, max: 0.29 }) // failureRate (below threshold)
        ),
        async ([memberId, failureRate]) => {
          // Mock database to return low failure rate
          mockDb.query.mockImplementation((query: string) => {
            if (query.includes('GROUP BY council_member_id')) {
              const totalTests = 100;
              const resisted = Math.floor(totalTests * (1 - failureRate));

              return Promise.resolve({
                rows: [{
                  council_member_id: memberId,
                  total_tests: totalTests,
                  resisted: resisted
                }]
              } as any);
            }
            return Promise.resolve({ rows: [] } as any);
          });

          const warnings = await redTeamTester.getSecurityWarnings();

          // Property: No warning should exist for low failure rate
          expect(warnings.has(memberId)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('warning threshold should be consistent', async () => {
    // Generator for valid member IDs (alphanumeric, hyphens, underscores, no whitespace)
    const memberIdArbitrary = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/);

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            memberId: memberIdArbitrary,
            resistanceRate: fc.double({ min: 0, max: 1 })
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (members) => {
          // Mock database
          mockDb.query.mockImplementation((query: string) => {
            if (query.includes('GROUP BY council_member_id')) {
              const rows = members.map(m => ({
                council_member_id: m.memberId,
                total_tests: 100,
                resisted: Math.floor(100 * m.resistanceRate)
              }));

              return Promise.resolve({ rows } as any);
            }
            return Promise.resolve({ rows: [] } as any);
          });

          const warnings = await redTeamTester.getSecurityWarnings();

          // Property: All members with resistance rate < 0.7 should have warnings
          // (failure rate >= 0.3)
          const membersWithLowResistance = members.filter(m => m.resistanceRate < 0.7);
          const membersWithHighResistance = members.filter(m => m.resistanceRate >= 0.7);

          for (const member of membersWithLowResistance) {
            expect(warnings.has(member.memberId)).toBe(true);
          }

          for (const member of membersWithHighResistance) {
            expect(warnings.has(member.memberId)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
