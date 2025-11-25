/**
 * Property-Based Tests for Convergence Detector
 * Feature: iterative-consensus
 */

import * as fc from "fast-check";
import { ConvergenceDetector } from "../detector";

describe("ConvergenceDetector - Property-Based Tests", () => {
  let detector: ConvergenceDetector;

  beforeEach(() => {
    detector = new ConvergenceDetector();
  });

  /**
   * Property 7: Deadlock Detection Accuracy
   * For any similarity history where deadlock is flagged, the average similarity
   * must have decreased or remained flat (within 0.01) for at least three consecutive rounds.
   * Validates: Requirements 5.3, 5.4
   */
  describe("Property 7: Deadlock Detection Accuracy", () => {
    it("should only flag deadlock when similarity is flat or decreasing", () => {
      fc.assert(
        fc.property(
          fc.array(fc.float({ min: Math.fround(0), max: Math.fround(1) }), {
            minLength: 3,
            maxLength: 10,
          }),
          (history) => {
            const isDeadlock = detector.isDeadlocked(history);

            if (isDeadlock && history.length >= 3) {
              const recent = history.slice(-3);
              let isFlatOrDecreasing = true;

              for (let i = 1; i < recent.length; i++) {
                const change = recent[i] - recent[i - 1];
                if (change > 0.01) {
                  isFlatOrDecreasing = false;
                  break;
                }
              }

              expect(isFlatOrDecreasing).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should not flag deadlock for consistently increasing similarity", () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.1), max: Math.fround(0.9) }),
          fc.float({ min: Math.fround(0.02), max: Math.fround(0.1) }),
          (start, increment) => {
            // Ensure increment is positive and meaningful
            const actualIncrement = Math.max(0.02, Math.abs(increment));

            const history: number[] = [];
            for (let i = 0; i < 4; i++) {
              history.push(Math.min(1, start + i * actualIncrement));
            }

            // Verify the sequence is strictly increasing
            let isStrictlyIncreasing = true;
            for (let i = 1; i < history.length; i++) {
              if (history[i] <= history[i - 1]) {
                isStrictlyIncreasing = false;
                break;
              }
            }

            // Only test if the sequence is strictly increasing
            if (isStrictlyIncreasing && history.length >= 3) {
              const isDeadlock = detector.isDeadlocked(history);
              expect(isDeadlock).toBe(false);
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 12: Convergence Monotonicity
   * For any successful consensus, the average similarity must be non-decreasing
   * across rounds (allowing for small fluctuations ≤ 0.05).
   * Validates: Requirements 5.1, 5.2
   */
  describe("Property 12: Convergence Monotonicity", () => {
    it("should calculate velocity correctly for non-decreasing sequences", () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.5), max: Math.fround(0.9) }),
          fc.float({ min: Math.fround(0), max: Math.fround(0.1) }),
          fc.integer({ min: 3, max: 10 }),
          (start, increment, length) => {
            const history: number[] = [];
            for (let i = 0; i < length; i++) {
              history.push(Math.min(1, start + i * increment));
            }

            const velocity = detector.calculateVelocity(history);
            expect(velocity).toBeGreaterThanOrEqual(-0.05); // Allow small fluctuations
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should identify converging direction for increasing similarity", () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.5), max: Math.fround(0.8) }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(0.1) }),
          fc.integer({ min: 2, max: 10 }),
          (start, increment, length) => {
            const history: number[] = [];
            for (let i = 0; i < length; i++) {
              history.push(Math.min(1, start + i * increment));
            }

            const trend = detector.analyzeTrend(history);

            if (
              history.length >= 2 &&
              history[history.length - 1] > history[0] + 0.01
            ) {
              expect(trend.direction).toBe("converging");
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
