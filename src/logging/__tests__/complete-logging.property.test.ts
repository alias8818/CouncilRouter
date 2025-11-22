/**
 * Property-Based Test: Complete logging
 * Feature: ai-council-proxy, Property 9: Complete logging
 * 
 * Validates: Requirements 4.1
 * 
 * Property: For any processed request, the event log should contain all council member 
 * responses, all deliberation exchanges, and the final consensus decision.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { EventLogger } from '../logger';
import {
  UserRequest,
  InitialResponse,
  DeliberationRound,
  ConsensusDecision,
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

describe('Property 9: Complete logging', () => {
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

  const userRequestArb = fc.record({
    id: fc.uuid(),
    query: fc.string({ minLength: 1, maxLength: 500 }),
    sessionId: fc.option(fc.uuid(), { nil: undefined }),
    timestamp: fc.date()
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

  const consensusDecisionArb = fc.record({
    content: fc.string({ minLength: 1, maxLength: 2000 }),
    confidence: fc.constantFrom('high' as const, 'medium' as const, 'low' as const),
    agreementLevel: fc.double({ min: 0, max: 1 }),
    synthesisStrategy: fc.constant({ type: 'consensus-extraction' as const }),
    contributingMembers: fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
    timestamp: fc.date()
  });

  test('should log all components of a processed request', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArb,
        fc.array(initialResponseArb, { minLength: 1, maxLength: 5 }),
        fc.array(deliberationRoundArb, { minLength: 0, maxLength: 3 }),
        consensusDecisionArb,
        async (request, responses, rounds, decision) => {
          // Reset query results for this iteration
          queryResults = [];
          mockPool.query = jest.fn().mockImplementation((query: string, values?: any[]) => {
            queryResults.push({ query, values });
            return Promise.resolve({ rows: [], rowCount: 0 });
          });

          // Log all components
          await logger.logRequest(request);
          
          for (const response of responses) {
            await logger.logCouncilResponse(request.id, response);
          }
          
          for (const round of rounds) {
            await logger.logDeliberationRound(request.id, round);
          }
          
          await logger.logConsensusDecision(request.id, decision);

          // Verify all components were logged
          const requestLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO requests')
          );
          const responseLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO council_responses')
          );
          const exchangeLogs = queryResults.filter(r => 
            r.query.includes('INSERT INTO deliberation_exchanges')
          );
          const decisionLogs = queryResults.filter(r => 
            r.query.includes('UPDATE requests') && 
            r.query.includes('consensus_decision')
          );

          // Property: All components should be logged
          expect(requestLogs.length).toBe(1);
          expect(responseLogs.length).toBe(responses.length);
          
          const totalExchanges = rounds.reduce((sum, r) => sum + r.exchanges.length, 0);
          expect(exchangeLogs.length).toBe(totalExchanges);
          
          expect(decisionLogs.length).toBe(1);

          // Verify request ID is consistent across all logs
          expect(requestLogs[0].values[0]).toBe(request.id);
          responseLogs.forEach(log => {
            expect(log.values[1]).toBe(request.id); // request_id is second parameter
          });
          exchangeLogs.forEach(log => {
            expect(log.values[1]).toBe(request.id); // request_id is second parameter
          });
          decisionLogs.forEach(log => {
            expect(log.values[4]).toBe(request.id); // request_id is last parameter in UPDATE
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
