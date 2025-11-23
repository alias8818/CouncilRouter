/**
 * Property-Based Test: Response attribution
 * Feature: ai-council-proxy, Property 10: Response attribution
 * 
 * Validates: Requirements 4.4
 * 
 * Property: For any logged response or deliberation exchange, the record should 
 * include the council member ID that provided it.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { EventLogger } from '../logger';
import {
  InitialResponse,
  DeliberationRound,
  TokenUsage
} from '../../types/core';

// Mock pg Pool
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('Property 10: Response attribution', () => {
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
  const tokenUsageArb = fc.record({
    promptTokens: fc.integer({ min: 1, max: 10000 }),
    completionTokens: fc.integer({ min: 1, max: 10000 }),
    totalTokens: fc.integer({ min: 2, max: 20000 })
  });

  const initialResponseArb = fc.record({
    councilMemberId: fc.string({ minLength: 1, maxLength: 50 }),
    content: fc.string({ minLength: 1, maxLength: 1000 }),
    tokenUsage: tokenUsageArb,
    latency: fc.integer({ min: 10, max: 30000 }),
    timestamp: fc.date()
  });

  const exchangeArb = fc.record({
    councilMemberId: fc.string({ minLength: 1, maxLength: 50 }),
    content: fc.string({ minLength: 1, maxLength: 1000 }),
    referencesTo: fc.array(fc.string(), { maxLength: 5 }),
    tokenUsage: tokenUsageArb
  });

  const deliberationRoundArb = fc.record({
    roundNumber: fc.integer({ min: 1, max: 5 }),
    exchanges: fc.array(exchangeArb, { minLength: 1, maxLength: 5 })
  });

  test('should include council member ID in all logged responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        fc.array(initialResponseArb, { minLength: 1, maxLength: 5 }),
        async (requestId, responses) => {
          // Reset query results for this iteration
          queryResults = [];
          mockPool.query = jest.fn().mockImplementation((query: string, values?: any[]) => {
            queryResults.push({ query, values });
            return Promise.resolve({ rows: [], rowCount: 0 });
          });

          // Log all responses
          for (const response of responses) {
            await logger.logCouncilResponse(requestId, response);
          }

          // Get all response logs
          const responseLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO council_responses')
          );

          // Property: Each logged response should include the council member ID
          expect(responseLogs).toHaveLength(responses.length);
          
          responseLogs.forEach((log, index) => {
            const councilMemberId = log.values[2]; // council_member_id is third parameter
            expect(councilMemberId).toBeDefined();
            expect(councilMemberId).toBe(responses[index].councilMemberId);
            expect(typeof councilMemberId).toBe('string');
            expect(councilMemberId.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should include council member ID in all deliberation exchanges', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        fc.array(deliberationRoundArb, { minLength: 1, maxLength: 3 }),
        async (requestId, rounds) => {
          // Reset query results for this iteration
          queryResults = [];
          mockPool.query = jest.fn().mockImplementation((query: string, values?: any[]) => {
            queryResults.push({ query, values });
            return Promise.resolve({ rows: [], rowCount: 0 });
          });

          // Log all deliberation rounds
          for (const round of rounds) {
            await logger.logDeliberationRound(requestId, round);
          }

          // Get all exchange logs
          const exchangeLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO deliberation_exchanges')
          );

          // Collect all exchanges from all rounds
          const allExchanges = rounds.flatMap(r => r.exchanges);

          // Property: Each logged exchange should include the council member ID
          expect(exchangeLogs).toHaveLength(allExchanges.length);
          
          exchangeLogs.forEach((log, index) => {
            const councilMemberId = log.values[3]; // council_member_id is fourth parameter
            expect(councilMemberId).toBeDefined();
            expect(councilMemberId).toBe(allExchanges[index].councilMemberId);
            expect(typeof councilMemberId).toBe('string');
            expect(councilMemberId.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('should preserve council member ID through the entire logging pipeline', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        initialResponseArb,
        deliberationRoundArb,
        async (requestId, response, round) => {
          // Reset query results for this iteration
          queryResults = [];
          mockPool.query = jest.fn().mockImplementation((query: string, values?: any[]) => {
            queryResults.push({ query, values });
            return Promise.resolve({ rows: [], rowCount: 0 });
          });

          // Log response and deliberation
          await logger.logCouncilResponse(requestId, response);
          await logger.logDeliberationRound(requestId, round);

          // Get logs
          const responseLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO council_responses')
          );
          const exchangeLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO deliberation_exchanges')
          );

          // Property: Council member IDs should be preserved exactly as provided
          expect(responseLogs[0].values[2]).toBe(response.councilMemberId);
          
          round.exchanges.forEach((exchange, index) => {
            expect(exchangeLogs[index].values[3]).toBe(exchange.councilMemberId);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
