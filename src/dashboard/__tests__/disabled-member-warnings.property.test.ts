/**
 * Property-Based Test: Disabled member warnings
 * Feature: ai-council-proxy, Property 32: Disabled member warnings
 * 
 * Validates: Requirements 9.5
 * 
 * Property: For any disabled council member, the dashboard should display 
 * a warning indicating reduced council participation.
 */

import * as fc from 'fast-check';
import { Dashboard } from '../dashboard';
import { AnalyticsEngine } from '../../analytics/engine';
import { ProviderHealth } from '../../types/core';

describe('Property 32: Disabled member warnings', () => {
  let mockDb: any;
  let mockRedis: any;
  let mockProviderPool: any;
  let mockRedTeamTester: any;
  let analyticsEngine: AnalyticsEngine;
  let dashboard: Dashboard;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], command: '', oid: 0, rowCount: 0, fields: [] })
    };

    // Create mock Redis
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK')
    };

    // Create mock provider pool
    mockProviderPool = {
      getProviderHealth: jest.fn().mockReturnValue({
        providerId: 'test',
        status: 'healthy',
        successRate: 1.0,
        avgLatency: 100
      }),
      getAllProviderHealth: jest.fn().mockReturnValue([
        { providerId: 'openai', status: 'healthy', successRate: 1.0, avgLatency: 100 },
        { providerId: 'anthropic', status: 'healthy', successRate: 1.0, avgLatency: 100 },
        { providerId: 'google', status: 'healthy', successRate: 1.0, avgLatency: 100 }
      ])
    };

    // Create mock red team tester
    mockRedTeamTester = {
      runTest: jest.fn().mockResolvedValue({ compromised: false }),
      getResults: jest.fn().mockResolvedValue([])
    };

    // Create analytics engine
    analyticsEngine = new AnalyticsEngine(mockDb, mockRedis);

    // Create dashboard
    dashboard = new Dashboard(mockDb, analyticsEngine, mockProviderPool, mockRedTeamTester);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Property: For any set of council members with at least one disabled member,
   * the dashboard should display a warning for each disabled member
   */
  test('disabled members generate warnings', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of provider health statuses with at least one disabled and unique IDs
        fc.uniqueArray(
          fc.record({
            providerId: fc.string({ minLength: 1, maxLength: 50 }).filter(id => id.trim().length > 0),
            status: fc.constantFrom('healthy', 'degraded', 'disabled'),
            successRate: fc.double({ min: 0, max: 1 }),
            avgLatency: fc.integer({ min: 0, max: 10000 })
          }),
          { minLength: 1, maxLength: 10, selector: (h) => h.providerId.trim() || 'unknown-provider' }
        ).chain(healthStatuses => {
          // Normalize provider IDs first to ensure uniqueness after trimming
          const normalized = healthStatuses.map(h => ({
            ...h,
            providerId: h.providerId.trim() || 'unknown-provider'
          }));
          
          // Remove duplicates based on normalized provider IDs
          const seen = new Set<string>();
          const uniqueNormalized = normalized.filter(h => {
            if (seen.has(h.providerId)) {
              return false;
            }
            seen.add(h.providerId);
            return true;
          });
          
          // Ensure at least one is disabled
          const hasDisabled = uniqueNormalized.some(h => h.status === 'disabled');
          if (hasDisabled) {
            return fc.constant(uniqueNormalized);
          }
          // Force at least one to be disabled
          const modified = [...uniqueNormalized];
          modified[0] = { ...modified[0], status: 'disabled' };
          return fc.constant(modified);
        }),
        async (healthStatuses) => {
          // healthStatuses are already normalized and unique at this point
          const normalizedHealth = healthStatuses;

          // Mock getProviderHealthStatus to return the normalized health statuses
          // This allows getDisabledMemberWarnings to execute its real implementation
          jest
            .spyOn(dashboard, 'getProviderHealthStatus')
            .mockResolvedValue(normalizedHealth as ProviderHealth[]);

          // Get warnings
          const warnings = await dashboard.getDisabledMemberWarnings();

          // Count disabled members
          const disabledCount = normalizedHealth.filter(h => h.status === 'disabled').length;

          // Property: Number of warnings should equal number of disabled members
          expect(warnings.length).toBe(disabledCount);

          // Property: Each warning should mention the disabled member
          const disabledIds = normalizedHealth
            .filter(h => h.status === 'disabled')
            .map(h => h.providerId);

          for (const disabledId of disabledIds) {
            const hasWarning = warnings.some(w => w.includes(disabledId));
            expect(hasWarning).toBe(true);
          }

          // Property: Each warning should indicate reduced participation
          for (const warning of warnings) {
            expect(warning.toLowerCase()).toMatch(/disabled|reduced|participation/);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property: For any set of council members with no disabled members,
   * the dashboard should display no warnings
   */
  test('healthy members generate no warnings', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of provider health statuses with no disabled members and unique IDs
        fc.uniqueArray(
          fc.record({
            providerId: fc.string({ minLength: 1, maxLength: 50 }).filter(id => id.trim().length > 0),
            status: fc.constantFrom('healthy', 'degraded'),
            successRate: fc.double({ min: 0, max: 1 }),
            avgLatency: fc.integer({ min: 0, max: 10000 })
          }),
          { minLength: 1, maxLength: 10, selector: (h) => h.providerId.trim() || 'unknown-provider' }
        ).chain(healthStatuses => {
          // Normalize provider IDs first to ensure uniqueness after trimming
          const normalized = healthStatuses.map(h => ({
            ...h,
            providerId: h.providerId.trim() || 'unknown-provider'
          }));
          
          // Remove duplicates based on normalized provider IDs
          const seen = new Set<string>();
          const uniqueNormalized = normalized.filter(h => {
            if (seen.has(h.providerId)) {
              return false;
            }
            seen.add(h.providerId);
            return true;
          });
          
          return fc.constant(uniqueNormalized);
        }),
        async (healthStatuses) => {
          // healthStatuses are already normalized and unique at this point
          const normalizedHealth = healthStatuses;

          // Mock getProviderHealthStatus to return the normalized health statuses
          // This allows getDisabledMemberWarnings to execute its real implementation
          jest
            .spyOn(dashboard, 'getProviderHealthStatus')
            .mockResolvedValue(normalizedHealth as ProviderHealth[]);

          // Get warnings
          const warnings = await dashboard.getDisabledMemberWarnings();

          // Property: No disabled members means no warnings
          expect(warnings.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property: Each disabled member generates exactly one warning
   */
  test('one warning per disabled member', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array with multiple disabled members with unique IDs
        fc.uniqueArray(
          fc.record({
            providerId: fc.string({ minLength: 1, maxLength: 50 }).filter(id => id.trim().length > 0),
            status: fc.constant('disabled'),
            successRate: fc.double({ min: 0, max: 1 }),
            avgLatency: fc.integer({ min: 0, max: 10000 })
          }),
          { minLength: 1, maxLength: 5, selector: (h) => h.providerId.trim() || 'unknown-provider' }
        ).chain(healthStatuses => {
          // Normalize provider IDs first to ensure uniqueness after trimming
          const normalized = healthStatuses.map(h => ({
            ...h,
            providerId: h.providerId.trim() || 'unknown-provider'
          }));
          
          // Remove duplicates based on normalized provider IDs
          const seen = new Set<string>();
          const uniqueNormalized = normalized.filter(h => {
            if (seen.has(h.providerId)) {
              return false;
            }
            seen.add(h.providerId);
            return true;
          });
          
          return fc.constant(uniqueNormalized);
        }),
        async (healthStatuses) => {
          // healthStatuses are already normalized and unique at this point
          const normalizedHealth = healthStatuses;

          // Mock getProviderHealthStatus to return the normalized health statuses
          // This allows getDisabledMemberWarnings to execute its real implementation
          jest
            .spyOn(dashboard, 'getProviderHealthStatus')
            .mockResolvedValue(normalizedHealth as ProviderHealth[]);

          // Get warnings
          const warnings = await dashboard.getDisabledMemberWarnings();

          // Property: Exactly one warning per disabled member
          expect(warnings.length).toBe(normalizedHealth.length);

          // Property: Each provider ID appears in exactly one warning
          for (const health of normalizedHealth) {
            const pattern = `Council member ${health.providerId} is disabled`;
            const matchingWarnings = warnings.filter(w => w.includes(pattern));
            expect(matchingWarnings.length).toBe(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
