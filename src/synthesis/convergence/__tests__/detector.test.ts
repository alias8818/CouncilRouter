/**
 * Convergence Detector Unit Tests
 */

import { ConvergenceDetector } from '../detector';

describe('ConvergenceDetector', () => {
  let detector: ConvergenceDetector;

  beforeEach(() => {
    detector = new ConvergenceDetector();
  });

  describe('analyzeTrend', () => {
    it('should identify converging trend', () => {
      const history = [0.5, 0.6, 0.7, 0.8];
      const trend = detector.analyzeTrend(history);

      expect(trend.direction).toBe('converging');
      expect(trend.velocity).toBeGreaterThan(0);
      expect(trend.deadlockRisk).toBe('low');
    });

    it('should identify diverging trend', () => {
      const history = [0.8, 0.7, 0.6, 0.5];
      const trend = detector.analyzeTrend(history);

      expect(trend.direction).toBe('diverging');
      expect(trend.velocity).toBeLessThan(0);
    });

    it('should identify stagnant trend', () => {
      const history = [0.7, 0.7, 0.7, 0.7];
      const trend = detector.analyzeTrend(history);

      expect(trend.direction).toBe('stagnant');
      expect(Math.abs(trend.velocity)).toBeLessThan(0.01);
    });

    it('should handle insufficient data', () => {
      const history = [0.7];
      const trend = detector.analyzeTrend(history);

      expect(trend.direction).toBe('stagnant');
      expect(trend.recommendation).toContain('Insufficient data');
    });
  });

  describe('isDeadlocked', () => {
    it('should detect deadlock with flat similarity', () => {
      const history = [0.7, 0.7, 0.7, 0.7];
      const isDeadlock = detector.isDeadlocked(history);

      expect(isDeadlock).toBe(true);
    });

    it('should detect deadlock with decreasing similarity', () => {
      const history = [0.8, 0.75, 0.7, 0.65];
      const isDeadlock = detector.isDeadlocked(history);

      expect(isDeadlock).toBe(true);
    });

    it('should not detect deadlock with increasing similarity', () => {
      const history = [0.6, 0.7, 0.8, 0.9];
      const isDeadlock = detector.isDeadlocked(history);

      expect(isDeadlock).toBe(false);
    });

    it('should require minimum window size', () => {
      const history = [0.7, 0.7];
      const isDeadlock = detector.isDeadlocked(history, 3);

      expect(isDeadlock).toBe(false);
    });
  });

  describe('calculateVelocity', () => {
    it('should calculate positive velocity for converging', () => {
      const history = [0.5, 0.6, 0.7, 0.8];
      const velocity = detector.calculateVelocity(history);

      expect(velocity).toBeGreaterThan(0);
      expect(velocity).toBeCloseTo(0.1, 2);
    });

    it('should calculate negative velocity for diverging', () => {
      const history = [0.8, 0.7, 0.6, 0.5];
      const velocity = detector.calculateVelocity(history);

      expect(velocity).toBeLessThan(0);
    });

    it('should return 0 for single value', () => {
      const history = [0.7];
      const velocity = detector.calculateVelocity(history);

      expect(velocity).toBe(0);
    });
  });

  describe('predictRoundsToConsensus', () => {
    it('should predict rounds correctly', () => {
      const currentSimilarity = 0.7;
      const velocity = 0.05; // 0.05 per round
      const threshold = 0.8;

      const rounds = detector.predictRoundsToConsensus(currentSimilarity, velocity, threshold);

      // Math.ceil((0.8 - 0.7) / 0.05) = Math.ceil(2.0000000000000004) = 3 due to floating point
      expect(rounds).toBe(3);
    });

    it('should return 0 if already at threshold', () => {
      const rounds = detector.predictRoundsToConsensus(0.8, 0.05, 0.8);

      expect(rounds).toBe(0);
    });

    it('should return Infinity for negative velocity', () => {
      const rounds = detector.predictRoundsToConsensus(0.7, -0.05, 0.8);

      expect(rounds).toBe(Infinity);
    });
  });
});

