/**
 * Property-Based Test: Percentile Latency Computation
 * Feature: ai-council-proxy, Property 38: Percentile latency computation
 * 
 * Validates: Requirements 11.3
 * 
 * Property: For any time range, the dashboard should correctly compute p50, p95, 
 * and p99 latency values from the request latency data.
 */

import fc from 'fast-check';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { AnalyticsEngine } from '../engine';
import { TimeRange } from '../../types/core';

// Mock pg and redis
jest.mock('pg');
jest.mock('redis');

describe('Property 38: Percentile latency computation', () => {
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

  test('p50 should be less than or equal to p95', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 10, maxLength: 100 }),
        fc.date(),
        async (latencies, startDate) => {
          const endDate = new Date(startDate.getTime() + 86400000); // +1 day
          const timeRange: TimeRange = { start: startDate, end: endDate };

          // Setup: Mock database
          const rows = latencies.map(latency => ({
            total_latency_ms: latency,
            members: [],
            deliberation_rounds: 0
          }));

          mockDb.query
            .mockResolvedValueOnce({ rows } as any)
            .mockResolvedValueOnce({ rows: [{ timeout_count: '0' }] } as any);

          const metrics = await engine.calculatePerformanceMetrics(timeRange);

          // Property: p50 <= p95 <= p99
          expect(metrics.p50Latency).toBeLessThanOrEqual(metrics.p95Latency);
          expect(metrics.p95Latency).toBeLessThanOrEqual(metrics.p99Latency);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('p95 should be less than or equal to p99', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 10, maxLength: 100 }),
        fc.date(),
        async (latencies, startDate) => {
          const endDate = new Date(startDate.getTime() + 86400000);
          const timeRange: TimeRange = { start: startDate, end: endDate };

          const rows = latencies.map(latency => ({
            total_latency_ms: latency,
            members: [],
            deliberation_rounds: 0
          }));

          mockDb.query
            .mockResolvedValueOnce({ rows } as any)
            .mockResolvedValueOnce({ rows: [{ timeout_count: '0' }] } as any);

          const metrics = await engine.calculatePerformanceMetrics(timeRange);

          // Property: p95 <= p99
          expect(metrics.p95Latency).toBeLessThanOrEqual(metrics.p99Latency);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('percentiles should be within the range of input latencies', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 10, maxLength: 100 }),
        fc.date(),
        async (latencies, startDate) => {
          const endDate = new Date(startDate.getTime() + 86400000);
          const timeRange: TimeRange = { start: startDate, end: endDate };

          const rows = latencies.map(latency => ({
            total_latency_ms: latency,
            members: [],
            deliberation_rounds: 0
          }));

          mockDb.query
            .mockResolvedValueOnce({ rows } as any)
            .mockResolvedValueOnce({ rows: [{ timeout_count: '0' }] } as any);

          const metrics = await engine.calculatePerformanceMetrics(timeRange);

          const min = Math.min(...latencies);
          const max = Math.max(...latencies);

          // Property: All percentiles should be within [min, max]
          expect(metrics.p50Latency).toBeGreaterThanOrEqual(min);
          expect(metrics.p50Latency).toBeLessThanOrEqual(max);
          expect(metrics.p95Latency).toBeGreaterThanOrEqual(min);
          expect(metrics.p95Latency).toBeLessThanOrEqual(max);
          expect(metrics.p99Latency).toBeGreaterThanOrEqual(min);
          expect(metrics.p99Latency).toBeLessThanOrEqual(max);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('with uniform latencies, all percentiles should be equal', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 10, max: 100 }),
        fc.date(),
        async (latency, count, startDate) => {
          const endDate = new Date(startDate.getTime() + 86400000);
          const timeRange: TimeRange = { start: startDate, end: endDate };

          // All latencies are the same
          const rows = Array(count).fill(null).map(() => ({
            total_latency_ms: latency,
            members: [],
            deliberation_rounds: 0
          }));

          mockDb.query
            .mockResolvedValueOnce({ rows } as any)
            .mockResolvedValueOnce({ rows: [{ timeout_count: '0' }] } as any);

          const metrics = await engine.calculatePerformanceMetrics(timeRange);

          // Property: With uniform data, all percentiles should be equal
          expect(metrics.p50Latency).toBe(latency);
          expect(metrics.p95Latency).toBe(latency);
          expect(metrics.p99Latency).toBe(latency);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('empty latency data should produce zero percentiles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date(),
        async (startDate) => {
          const endDate = new Date(startDate.getTime() + 86400000);
          const timeRange: TimeRange = { start: startDate, end: endDate };

          // No latency data
          mockDb.query
            .mockResolvedValueOnce({ rows: [] } as any);

          const metrics = await engine.calculatePerformanceMetrics(timeRange);

          // Property: No data should yield zero percentiles
          expect(metrics.p50Latency).toBe(0);
          expect(metrics.p95Latency).toBe(0);
          expect(metrics.p99Latency).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('timeout rate should be between 0 and 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 1, maxLength: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.date(),
        async (latencies, timeoutCount, startDate) => {
          const endDate = new Date(startDate.getTime() + 86400000);
          const timeRange: TimeRange = { start: startDate, end: endDate };

          const rows = latencies.map(latency => ({
            total_latency_ms: latency,
            members: [],
            deliberation_rounds: 0
          }));

          // Ensure timeout count doesn't exceed total requests
          const actualTimeoutCount = Math.min(timeoutCount, latencies.length);

          mockDb.query
            .mockResolvedValueOnce({ rows } as any)
            .mockResolvedValueOnce({ rows: [{ timeout_count: actualTimeoutCount.toString() }] } as any);

          const metrics = await engine.calculatePerformanceMetrics(timeRange);

          // Property: Timeout rate should be in [0, 1]
          expect(metrics.timeoutRate).toBeGreaterThanOrEqual(0);
          expect(metrics.timeoutRate).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('latency stats by council size should have correct counts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            latency: fc.integer({ min: 1, max: 10000 }),
            councilSize: fc.integer({ min: 1, max: 10 })
          }),
          { minLength: 10, maxLength: 100 }
        ),
        fc.date(),
        async (data, startDate) => {
          const endDate = new Date(startDate.getTime() + 86400000);
          const timeRange: TimeRange = { start: startDate, end: endDate };

          const rows = data.map(d => ({
            total_latency_ms: d.latency,
            members: Array(d.councilSize).fill({}),
            deliberation_rounds: 0
          }));

          mockDb.query
            .mockResolvedValueOnce({ rows } as any)
            .mockResolvedValueOnce({ rows: [{ timeout_count: '0' }] } as any);

          const metrics = await engine.calculatePerformanceMetrics(timeRange);

          // Property: Sum of counts by council size should equal total requests
          let totalCount = 0;
          for (const stats of metrics.byCouncilSize.values()) {
            totalCount += stats.count;
            
            // Each group should have valid percentiles
            expect(stats.p50).toBeGreaterThanOrEqual(0);
            expect(stats.p95).toBeGreaterThanOrEqual(0);
            expect(stats.p99).toBeGreaterThanOrEqual(0);
            expect(stats.p50).toBeLessThanOrEqual(stats.p95);
            expect(stats.p95).toBeLessThanOrEqual(stats.p99);
          }

          expect(totalCount).toBe(data.length);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('latency stats by deliberation rounds should have correct counts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            latency: fc.integer({ min: 1, max: 10000 }),
            rounds: fc.integer({ min: 0, max: 5 })
          }),
          { minLength: 10, maxLength: 100 }
        ),
        fc.date(),
        async (data, startDate) => {
          const endDate = new Date(startDate.getTime() + 86400000);
          const timeRange: TimeRange = { start: startDate, end: endDate };

          const rows = data.map(d => ({
            total_latency_ms: d.latency,
            members: [],
            deliberation_rounds: d.rounds
          }));

          mockDb.query
            .mockResolvedValueOnce({ rows } as any)
            .mockResolvedValueOnce({ rows: [{ timeout_count: '0' }] } as any);

          const metrics = await engine.calculatePerformanceMetrics(timeRange);

          // Property: Sum of counts by deliberation rounds should equal total requests
          let totalCount = 0;
          for (const stats of metrics.byDeliberationRounds.values()) {
            totalCount += stats.count;
            
            // Each group should have valid percentiles
            expect(stats.p50).toBeGreaterThanOrEqual(0);
            expect(stats.p95).toBeGreaterThanOrEqual(0);
            expect(stats.p99).toBeGreaterThanOrEqual(0);
            expect(stats.p50).toBeLessThanOrEqual(stats.p95);
            expect(stats.p95).toBeLessThanOrEqual(stats.p99);
          }

          expect(totalCount).toBe(data.length);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
