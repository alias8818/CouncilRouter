/**
 * Property-Based Test: Pricing version tracking
 * Feature: ai-council-proxy, Property 16: Pricing version tracking
 * 
 * Validates: Requirements 5.6
 * 
 * Property: For any cost record, the pricing version used for calculation should 
 * be logged with the record.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { EventLogger } from '../logger';
import { CostBreakdown } from '../../types/core';

// Mock pg Pool
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('Property 16: Pricing version tracking', () => {
  let mockPool: jest.Mocked<Pool>;
  let logger: EventLogger;
  let queryResults: any[];

  beforeEach(() => {
    queryResults = [];
    mockPool = new Pool() as jest.Mocked<Pool>;
    mockPool.query = jest.fn().mockImplementation((query: string, values?: any[]) => {
      queryResults.push({ query, values });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    logger = new EventLogger(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Arbitraries for generating test data
   */
  const pricingVersionArb = fc.oneof(
    fc.constant('v1.0'),
    fc.constant('v2.0'),
    fc.constant('v2.1'),
    fc.constant('2024-01-15'),
    fc.constant('2024-06-01'),
    fc.string({ minLength: 1, maxLength: 20 })
  );

  const costBreakdownArb = fc.record({
    totalCost: fc.double({ min: 0, max: 1000, noNaN: true }),
    currency: fc.constantFrom('USD', 'EUR', 'GBP'),
    byProvider: fc.constant(new Map<string, number>()),
    byMember: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.double({ min: 0, max: 100, noNaN: true }),
      { minKeys: 1, maxKeys: 5 }
    ).map(obj => new Map(Object.entries(obj))),
    pricingVersion: pricingVersionArb
  });

  test('should include pricing version in all cost records', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        costBreakdownArb,
        async (requestId, cost) => {
          // Reset query results for this iteration
          queryResults = [];
          mockPool.query = jest.fn().mockImplementation((query: string, values?: any[]) => {
            queryResults.push({ query, values });
            return Promise.resolve({ rows: [], rowCount: 0 });
          });

          // Log cost
          await logger.logCost(requestId, cost);

          // Get cost record logs (excluding the UPDATE query)
          const costRecordLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO cost_records')
          );

          // Property: Each cost record should include the pricing version
          expect(costRecordLogs.length).toBe(cost.byMember.size);
          
          costRecordLogs.forEach(log => {
            const pricingVersion = log.values[7]; // pricing_version is 8th parameter
            expect(pricingVersion).toBeDefined();
            expect(pricingVersion).toBe(cost.pricingVersion);
            expect(typeof pricingVersion).toBe('string');
            expect(pricingVersion.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should preserve pricing version exactly as provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        costBreakdownArb,
        async (requestId, cost) => {
          // Reset query results for this iteration
          queryResults = [];
          mockPool.query = jest.fn().mockImplementation((query: string, values?: any[]) => {
            queryResults.push({ query, values });
            return Promise.resolve({ rows: [], rowCount: 0 });
          });

          // Log cost
          await logger.logCost(requestId, cost);

          // Get cost record logs
          const costRecordLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO cost_records')
          );

          // Property: Pricing version should be preserved exactly as provided
          costRecordLogs.forEach(log => {
            expect(log.values[7]).toBe(cost.pricingVersion);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should track different pricing versions for different requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            requestId: fc.uuid(),
            cost: costBreakdownArb
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (requests) => {
          // Reset query results for this iteration
          queryResults = [];
          mockPool.query = jest.fn().mockImplementation((query: string, values?: any[]) => {
            queryResults.push({ query, values });
            return Promise.resolve({ rows: [], rowCount: 0 });
          });

          // Log costs for all requests
          for (const req of requests) {
            await logger.logCost(req.requestId, req.cost);
          }

          // Get all cost record logs
          const costRecordLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO cost_records')
          );

          // Property: Each request's cost records should have its own pricing version
          let logIndex = 0;
          for (const req of requests) {
            const numRecords = req.cost.byMember.size;
            for (let i = 0; i < numRecords; i++) {
              const log = costRecordLogs[logIndex];
              expect(log.values[1]).toBe(req.requestId); // request_id
              expect(log.values[7]).toBe(req.cost.pricingVersion); // pricing_version
              logIndex++;
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should handle various pricing version formats', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        fc.oneof(
          fc.constant('v1.0.0'),
          fc.constant('2024-01-15'),
          fc.constant('20240115'),
          fc.constant('pricing-v2'),
          fc.constant('latest'),
          fc.string({ minLength: 1, maxLength: 50 })
        ),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.double({ min: 0, max: 100, noNaN: true }),
          { minKeys: 1, maxKeys: 3 }
        ).map(obj => new Map(Object.entries(obj))),
        async (requestId, pricingVersion, byMember) => {
          // Reset query results for this iteration
          queryResults = [];
          mockPool.query = jest.fn().mockImplementation((query: string, values?: any[]) => {
            queryResults.push({ query, values });
            return Promise.resolve({ rows: [], rowCount: 0 });
          });

          const cost: CostBreakdown = {
            totalCost: 10.0,
            currency: 'USD',
            byProvider: new Map(),
            byMember,
            pricingVersion
          };

          // Log cost
          await logger.logCost(requestId, cost);

          // Get cost record logs
          const costRecordLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO cost_records')
          );

          // Property: Any valid pricing version format should be stored correctly
          costRecordLogs.forEach(log => {
            expect(log.values[7]).toBe(pricingVersion);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
