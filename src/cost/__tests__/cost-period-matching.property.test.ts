/**
 * Property-Based Test: Cost Period Matching is Exact
 * Feature: bug-fixes-critical, Property 15: Cost period matching is exact
 * 
 * Validates: Requirements 9.1
 * 
 * For any cost alert period matching, the matching should be exact (===) not
 * substring-based (includes). Partial matches should not trigger alerts.
 */

import * as fc from 'fast-check';
import { CostCalculator, CostAlert } from '../calculator';

describe('Property Test: Cost Period Matching is Exact', () => {
  let calculator: CostCalculator;

  beforeEach(() => {
    calculator = new CostCalculator();
  });

  /**
   * Property 15: Cost period matching is exact
   * 
   * For any cost alert period matching, the matching should be exact (===) not
   * substring-based (includes). Partial matches should not trigger alerts.
   * 
   * Validates: Requirements 9.1
   */
  test('should match periods exactly, not by substring', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate alert period and period key
        fc.constantFrom('hourly' as const, 'daily' as const, 'weekly' as const, 'monthly' as const),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (alertPeriod, periodKey) => {
          // Create an alert for the specific period
          const alert: CostAlert = {
            threshold: 100,
            currency: 'USD',
            period: alertPeriod,
            enabled: true
          };

          calculator.addCostAlert(alert);

          // Add a cost that exceeds threshold
          const cost = 150;
          const alerts = calculator.checkCostAlerts(cost, periodKey);

          // Property assertions:
          // Alert should only trigger if periodKey exactly equals alertPeriod
          // Not if periodKey contains alertPeriod as a substring
          const exactMatch = periodKey === alertPeriod;
          const substringMatch = periodKey.includes(alertPeriod) && !exactMatch;

          if (exactMatch) {
            // Exact match: alert should trigger
            expect(alerts.length).toBeGreaterThan(0);
          } else if (substringMatch) {
            // Substring match but not exact: alert should NOT trigger
            // This test will fail until task 12 (implementation fix) is completed
            expect(alerts.length).toBe(0);
          }
          // If no match at all, no alert (already correct)
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Test specific cases: partial matches should not trigger
   */
  test('should not trigger alert for partial period matches', () => {
    const alert: CostAlert = {
      threshold: 100,
      currency: 'USD',
      period: 'daily',
      enabled: true
    };

    calculator.addCostAlert(alert);

    // Test cases where periodKey contains 'daily' but is not exactly 'daily'
    const partialMatches = [
      'daily-report',
      'daily-summary-2024',
      'pre-daily',
      'daily2024',
      '2024-daily-report'
    ];

    for (const periodKey of partialMatches) {
      const alerts = calculator.checkCostAlerts(150, periodKey);
      // Should NOT trigger because it's not an exact match
      // This test will fail until task 12 (implementation fix) is completed
      expect(alerts.length).toBe(0);
    }
  });

  /**
   * Test exact matches should trigger
   */
  test('should trigger alert for exact period matches', () => {
    const alert: CostAlert = {
      threshold: 100,
      currency: 'USD',
      period: 'daily',
      enabled: true
    };

    calculator.addCostAlert(alert);

    // Exact match should trigger
    const alerts = calculator.checkCostAlerts(150, 'daily');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]).toContain('daily');
  });

  /**
   * Test that different periods don't match each other
   */
  test('should not match different periods', () => {
    const alert: CostAlert = {
      threshold: 100,
      currency: 'USD',
      period: 'hourly',
      enabled: true
    };

    calculator.addCostAlert(alert);

    // Different periods should not match
    const differentPeriods = ['daily', 'weekly', 'monthly'];
    
    for (const periodKey of differentPeriods) {
      const alerts = calculator.checkCostAlerts(150, periodKey);
      expect(alerts.length).toBe(0);
    }
  });

  /**
   * Test that exact match works for all valid periods
   */
  test('should match all valid periods exactly', () => {
    const validPeriods: Array<'hourly' | 'daily' | 'weekly' | 'monthly'> = ['hourly', 'daily', 'weekly', 'monthly'];

    for (const period of validPeriods) {
      calculator = new CostCalculator(); // Reset for each test
      
      const alert: CostAlert = {
        threshold: 100,
        currency: 'USD',
        period: period,
        enabled: true
      };

      calculator.addCostAlert(alert);

      // Exact match should trigger
      const alerts = calculator.checkCostAlerts(150, period);
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]).toContain(period);
    }
  });
});

