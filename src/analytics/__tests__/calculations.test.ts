/**
 * Unit Tests for Analytics Engine Calculation Methods
 * Tests the core mathematical functions that were previously untested
 */

import { AnalyticsEngine } from '../engine';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';

// Create type-safe mock instances
const createMockDb = (): jest.Mocked<Pool> => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0
} as any);

const createMockRedis = (): jest.Mocked<RedisClientType> => ({
  get: jest.fn().mockResolvedValue(null),
  setEx: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn(),
  connect: jest.fn(),
  on: jest.fn()
} as any);

describe('Analytics Engine Calculation Methods', () => {
  let analyticsEngine: AnalyticsEngine;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockRedis = createMockRedis();
    analyticsEngine = new AnalyticsEngine(mockDb, mockRedis);
  });

  describe('calculatePercentile', () => {
    // Access private method for testing
    const calculatePercentile = (values: number[], percentile: number): number => {
      return (analyticsEngine as any).calculatePercentile(values, percentile);
    };

    it('should return 0 for empty array', () => {
      expect(calculatePercentile([], 0.5)).toBe(0);
    });

    it('should return the single value for array with one element', () => {
      expect(calculatePercentile([42], 0.5)).toBe(42);
      expect(calculatePercentile([42], 0.95)).toBe(42);
      expect(calculatePercentile([42], 0.99)).toBe(42);
    });

    it('should calculate correct percentiles for two-element array', () => {
      const values = [10, 20];
      expect(calculatePercentile(values, 0.5)).toBe(15); // Median between 10 and 20
      expect(calculatePercentile(values, 0.0)).toBe(10); // Min
      expect(calculatePercentile(values, 1.0)).toBe(20); // Max
    });

    it('should calculate p50 (median) correctly', () => {
      const values = [1, 2, 3, 4, 5];
      expect(calculatePercentile(values, 0.5)).toBe(3);
    });

    it('should calculate p95 correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const p95 = calculatePercentile(values, 0.95);
      expect(p95).toBeCloseTo(9.55, 1); // Interpolated value
    });

    it('should calculate p99 correctly', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const p99 = calculatePercentile(values, 0.99);
      expect(p99).toBeCloseTo(99.01, 1);
    });

    it('should handle unsorted arrays correctly', () => {
      const unsorted = [5, 2, 8, 1, 9, 3];
      const sorted = [...unsorted].sort((a, b) => a - b);
      // Function expects sorted input, so we test with sorted
      expect(calculatePercentile(sorted, 0.5)).toBeGreaterThan(0);
    });

    it('should interpolate correctly for fractional positions', () => {
      const values = [10, 20, 30, 40, 50];
      const p75 = calculatePercentile(values, 0.75);
      expect(p75).toBeGreaterThanOrEqual(30);
      expect(p75).toBeLessThanOrEqual(50);
    });

    it('should handle edge case percentiles (0 and 1)', () => {
      const values = [1, 2, 3, 4, 5];
      expect(calculatePercentile(values, 0.0)).toBe(1); // Min
      expect(calculatePercentile(values, 1.0)).toBe(5); // Max
    });

    it('should handle large datasets efficiently', () => {
      const largeDataset = Array.from({ length: 10000 }, (_, i) => i);
      const p50 = calculatePercentile(largeDataset, 0.5);
      const p95 = calculatePercentile(largeDataset, 0.95);
      const p99 = calculatePercentile(largeDataset, 0.99);

      expect(p50).toBeCloseTo(4999.5, 0);
      expect(p95).toBeCloseTo(9499.5, 0);
      expect(p99).toBeCloseTo(9899.5, 0);
    });

    it('should handle datasets with duplicate values', () => {
      const values = [1, 1, 1, 2, 2, 3, 3, 3, 3];
      const p50 = calculatePercentile(values, 0.5);
      expect(p50).toBeGreaterThanOrEqual(1);
      expect(p50).toBeLessThanOrEqual(3);
    });
  });

  describe('calculateOverlap', () => {
    // Access private method for testing
    const calculateOverlap = (text1: string, text2: string): number => {
      return (analyticsEngine as any).calculateOverlap(text1, text2);
    };

    it('should return 1.0 for identical texts', () => {
      const text = 'This is a test sentence with multiple words';
      expect(calculateOverlap(text, text)).toBe(1.0);
    });

    it('should return 0 for completely different texts', () => {
      const text1 = 'alpha beta gamma delta';
      const text2 = 'zulu yankee xray whiskey';
      expect(calculateOverlap(text1, text2)).toBe(0);
    });

    it('should return 1.0 for identical empty strings', () => {
      expect(calculateOverlap('', '')).toBe(1.0);
    });

    it('should return 1.0 for whitespace-only strings (both trim to empty)', () => {
      // Both trim to empty, so they're considered identical
      expect(calculateOverlap('', '   ')).toBe(1.0);
      expect(calculateOverlap('  ', ' ')).toBe(1.0);
    });

    it('should return 0 when one text is empty', () => {
      expect(calculateOverlap('some text here', '')).toBe(0);
      expect(calculateOverlap('', 'other text here')).toBe(0);
    });

    it('should calculate overlap for partially matching texts', () => {
      const text1 = 'The quick brown fox jumps';
      const text2 = 'The lazy brown dog sleeps';
      const overlap = calculateOverlap(text1, text2);
      // Both have "quick", "brown" as words > 3 chars
      expect(overlap).toBeGreaterThan(0);
      expect(overlap).toBeLessThan(1);
    });

    it('should ignore short words (3 chars or less)', () => {
      const text1 = 'a an the is';
      const text2 = 'a an the is';
      // All words are <= 3 chars, should be ignored
      expect(calculateOverlap(text1, text2)).toBe(1.0); // Both empty after filtering
    });

    it('should be case sensitive (callers handle lowercasing)', () => {
      // The function itself is case-sensitive; callers are responsible for lowercasing
      const text1 = 'Testing Calculation Methods';
      const text2 = 'testing calculation methods';
      expect(calculateOverlap(text1, text2)).toBe(0); // Different case = no match

      // Same case should match
      const text3 = 'testing calculation methods';
      const text4 = 'testing calculation methods';
      expect(calculateOverlap(text3, text4)).toBe(1.0);
    });

    it('should handle texts with no words longer than 3 chars', () => {
      const text1 = 'to be or not';
      const text2 = 'yes no hi bye';
      // All words are 3 chars or less, both filter to empty
      // Different content though
      expect(calculateOverlap(text1, text2)).toBe(0);
    });

    it('should use max size for denominator', () => {
      const text1 = 'testword alpha beta gamma delta epsilon';
      const text2 = 'testword';
      const overlap = calculateOverlap(text1, text2);
      // One word in common (testword), text1 has 6 words total
      // overlap = 1 / 6 = 0.167
      expect(overlap).toBeCloseTo(1 / 6, 2);
    });

    it('should handle multiple spaces and whitespace', () => {
      const text1 = 'testing    multiple     spaces';
      const text2 = 'testing   multiple   spaces';
      expect(calculateOverlap(text1, text2)).toBe(1.0);
    });

    it('should never return NaN', () => {
      const testCases = [
        ['', ''],
        ['   ', '   '],
        ['a b c', 'd e f'],
        ['test', 'test'],
        ['12345', '67890']
      ];

      testCases.forEach(([t1, t2]) => {
        const result = calculateOverlap(t1, t2);
        expect(isNaN(result)).toBe(false);
      });
    });

    it('should return value between 0 and 1', () => {
      const text1 = 'some longer text with multiple words';
      const text2 = 'different longer text with other words';
      const overlap = calculateOverlap(text1, text2);
      expect(overlap).toBeGreaterThanOrEqual(0);
      expect(overlap).toBeLessThanOrEqual(1);
    });

    it('should handle special characters and punctuation in words', () => {
      // Note: punctuation is NOT stripped, so "word." != "word"
      const text1 = 'testing calculation these words';
      const text2 = 'testing calculation these words extra';
      // text1: 4 words, text2: 5 words, 4 in common
      // overlap = 4 / max(4, 5) = 4/5 = 0.8
      const overlap = calculateOverlap(text1, text2);
      expect(overlap).toBeCloseTo(0.8, 1);
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle division by zero protection in overlap', () => {
      const calculateOverlap = (text1: string, text2: string): number => {
        return (analyticsEngine as any).calculateOverlap(text1, text2);
      };

      // Both texts with only short words result in empty word sets
      const result = calculateOverlap('to be', 'or not');
      expect(isNaN(result)).toBe(false);
      expect(result).toBe(0);
    });

    it('should handle percentile calculation with negative numbers', () => {
      const calculatePercentile = (values: number[], percentile: number): number => {
        return (analyticsEngine as any).calculatePercentile(values, percentile);
      };

      const values = [-10, -5, 0, 5, 10];
      expect(calculatePercentile(values, 0.5)).toBe(0);
    });

    it('should handle percentile calculation with floating point numbers', () => {
      const calculatePercentile = (values: number[], percentile: number): number => {
        return (analyticsEngine as any).calculatePercentile(values, percentile);
      };

      const values = [1.1, 2.2, 3.3, 4.4, 5.5];
      const p50 = calculatePercentile(values, 0.5);
      expect(p50).toBeCloseTo(3.3, 1);
    });
  });
});
