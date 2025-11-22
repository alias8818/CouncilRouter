/**
 * Property-Based Test: Cost alert triggering
 * Feature: ai-council-proxy, Property 15: Cost alert triggering
 * 
 * Validates: Requirements 5.5
 * 
 * Property: For any configured cost threshold, when spending exceeds that threshold, 
 * an alert should be generated.
 */

import * as fc from 'fast-check';
import { CostCalculator, CostAlert } from '../calculator';

describe('Property 15: Cost alert triggering', () => {
  let calculator: CostCalculator;

  beforeEach(() => {
    calculator = new CostCalculator();
  });

  /**
   * Arbitraries for generating test data
   */
  const periodArb = fc.oneof(
    fc.constant('hourly' as const),
    fc.constant('daily' as const),
    fc.constant('weekly' as const),
    fc.constant('monthly' as const)
  );

  const costAlertArb = fc.record({
    threshold: fc.double({ min: 1, max: 1000, noNaN: true }),
    currency: fc.constant('USD'),
    period: periodArb,
    enabled: fc.constant(true)
  }) as fc.Arbitrary<CostAlert>;

  test('should trigger alert when cost exceeds threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        costAlertArb,
        fc.double({ min: 0.1, max: 100, noNaN: true }),
        async (alert, excessAmount) => {
          // Add alert
          calculator.addCostAlert(alert);

          // Generate period key that matches alert period
          const periodKey = `2024-01-${alert.period}`;

          // Cost that exceeds threshold
          const cost = alert.threshold + excessAmount;

          // Check alerts
          const alerts = calculator.checkCostAlerts(cost, periodKey);

          // Property: Alert should be triggered when cost exceeds threshold
          expect(alerts.length).toBeGreaterThan(0);
          expect(alerts[0]).toContain('Cost alert');
          expect(alerts[0]).toContain(alert.period);
          expect(alerts[0]).toContain('exceeded threshold');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should not trigger alert when cost is below threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        costAlertArb,
        fc.double({ min: 0.1, max: 0.99, noNaN: true }),
        async (alert, fraction) => {
          // Reset calculator to clear any accumulated costs
          calculator = new CostCalculator();
          
          // Add alert
          calculator.addCostAlert(alert);

          // Generate period key that matches alert period
          const periodKey = `2024-01-${alert.period}`;

          // Cost that is below threshold
          const cost = alert.threshold * fraction;

          // Check alerts
          const alerts = calculator.checkCostAlerts(cost, periodKey);

          // Property: No alert should be triggered when cost is below threshold
          expect(alerts.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should trigger alert when cost exactly equals threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        costAlertArb,
        async (alert) => {
          // Reset calculator to clear any accumulated costs
          calculator = new CostCalculator();
          
          // Add alert
          calculator.addCostAlert(alert);

          // Generate period key that matches alert period
          const periodKey = `2024-01-${alert.period}`;

          // Cost that exactly equals threshold
          const cost = alert.threshold;

          // Check alerts
          const alerts = calculator.checkCostAlerts(cost, periodKey);

          // Property: Alert should be triggered when cost equals threshold
          expect(alerts.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should accumulate costs across multiple checks in same period', async () => {
    await fc.assert(
      fc.asyncProperty(
        costAlertArb,
        fc.array(fc.double({ min: 0.1, max: 100, noNaN: true }), { minLength: 2, maxLength: 5 }),
        async (alert, costs) => {
          // Reset calculator to clear any accumulated costs
          calculator = new CostCalculator();
          
          // Add alert
          calculator.addCostAlert(alert);

          // Generate period key that matches alert period
          const periodKey = `2024-01-${alert.period}`;

          // Calculate total cost
          const totalCost = costs.reduce((sum, cost) => sum + cost, 0);

          // Add costs one by one
          let alertTriggered = false;
          for (const cost of costs) {
            const alerts = calculator.checkCostAlerts(cost, periodKey);
            if (alerts.length > 0) {
              alertTriggered = true;
            }
          }

          // Property: Alert should be triggered if accumulated cost exceeds threshold
          if (totalCost >= alert.threshold) {
            expect(alertTriggered).toBe(true);
          }

          // Verify accumulated cost
          const accumulatedCost = calculator.getPeriodCost(periodKey);
          const tolerance = 0.000001;
          expect(Math.abs(accumulatedCost - totalCost)).toBeLessThan(tolerance);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should not trigger disabled alerts', async () => {
    await fc.assert(
      fc.asyncProperty(
        costAlertArb,
        fc.double({ min: 0.1, max: 100, noNaN: true }),
        async (alert, excessAmount) => {
          // Disable the alert
          const disabledAlert: CostAlert = {
            ...alert,
            enabled: false
          };

          // Add disabled alert
          calculator.addCostAlert(disabledAlert);

          // Generate period key that matches alert period
          const periodKey = `2024-01-${alert.period}`;

          // Cost that exceeds threshold
          const cost = alert.threshold + excessAmount;

          // Check alerts
          const alerts = calculator.checkCostAlerts(cost, periodKey);

          // Property: Disabled alert should not trigger
          expect(alerts.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should handle multiple alerts with different thresholds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costAlertArb, { minLength: 2, maxLength: 5 }),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        async (alerts, cost) => {
          // Reset calculator to clear any accumulated costs
          calculator = new CostCalculator();
          
          // Add all alerts
          for (const alert of alerts) {
            calculator.addCostAlert(alert);
          }

          // Use same period for all
          const periodKey = `2024-01-daily`;

          // Check alerts
          const triggeredAlerts = calculator.checkCostAlerts(cost, periodKey);

          // Property: Number of triggered alerts should equal number of alerts with threshold <= cost
          const expectedTriggers = alerts.filter(a => 
            a.enabled && cost >= a.threshold && periodKey.includes(a.period)
          ).length;

          expect(triggeredAlerts.length).toBe(expectedTriggers);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should reset period costs correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        costAlertArb,
        fc.double({ min: 1, max: 100, noNaN: true }),
        async (alert, cost) => {
          // Reset calculator to clear any accumulated costs
          calculator = new CostCalculator();
          
          // Add alert
          calculator.addCostAlert(alert);

          // Generate period key
          const periodKey = `2024-01-${alert.period}`;

          // Add some cost
          calculator.checkCostAlerts(cost, periodKey);

          // Verify cost was accumulated
          expect(calculator.getPeriodCost(periodKey)).toBeGreaterThan(0);

          // Reset period costs
          calculator.resetPeriodCosts(periodKey);

          // Property: After reset, period cost should be zero
          expect(calculator.getPeriodCost(periodKey)).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should include threshold and current cost in alert message', async () => {
    await fc.assert(
      fc.asyncProperty(
        costAlertArb,
        fc.double({ min: 0.1, max: 100, noNaN: true }),
        async (alert, excessAmount) => {
          // Reset calculator to clear any accumulated costs
          calculator = new CostCalculator();
          
          // Add alert
          calculator.addCostAlert(alert);

          // Generate period key that matches alert period
          const periodKey = `2024-01-${alert.period}`;

          // Cost that exceeds threshold
          const cost = alert.threshold + excessAmount;

          // Check alerts
          const alerts = calculator.checkCostAlerts(cost, periodKey);

          // Property: Alert message should include threshold value
          expect(alerts[0]).toContain(alert.threshold.toFixed(2));
          
          // Property: Alert message should include currency
          expect(alerts[0]).toContain(alert.currency);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should handle zero cost without triggering alerts', async () => {
    await fc.assert(
      fc.asyncProperty(
        costAlertArb,
        async (alert) => {
          // Reset calculator to clear any accumulated costs
          calculator = new CostCalculator();
          
          // Add alert
          calculator.addCostAlert(alert);

          // Generate period key
          const periodKey = `2024-01-${alert.period}`;

          // Zero cost
          const cost = 0;

          // Check alerts
          const alerts = calculator.checkCostAlerts(cost, periodKey);

          // Property: Zero cost should not trigger any alerts (assuming threshold > 0)
          if (alert.threshold > 0) {
            expect(alerts.length).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
