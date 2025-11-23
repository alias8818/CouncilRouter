/**
 * Property-based tests for API Gateway Idempotency Integration
 * Feature: council-enhancements
 */

import * as fc from 'fast-check';
import { createClient, RedisClientType } from 'redis';
import { Pool } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { APIGateway } from '../gateway';
import { IdempotencyCache } from '../../cache/idempotency-cache';
import { IOrchestrationEngine } from '../../interfaces/IOrchestrationEngine';
import { ISessionManager } from '../../interfaces/ISessionManager';
import { IEventLogger } from '../../interfaces/IEventLogger';
import { ConsensusDecision, UserRequest } from '../../types/core';
import { getPropertyTestRuns } from '../../__tests__/test-helpers';

describe('API Gateway Idempotency Integration - Property Tests', () => {
  let redis: RedisClientType;
  let dbPool: Pool;
  let idempotencyCache: IdempotencyCache;
  let gateway: APIGateway;
  let mockOrchestration: jest.Mocked<IOrchestrationEngine>;
  let mockSessionManager: jest.Mocked<ISessionManager>;
  let mockEventLogger: jest.Mocked<IEventLogger>;

  beforeAll(async () => {
    redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    await redis.connect();

    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/test'
    });

    idempotencyCache = new IdempotencyCache(redis);
  });

  afterAll(async () => {
    await redis.quit();
    await dbPool.end();
  });

  beforeEach(async () => {
    // Ensure test environment for API key validation
    process.env.NODE_ENV = 'test';
    
    // Clean up test keys
    const keys = await redis.keys('idempotency:test-*');
    if (keys.length > 0) {
      await redis.del(keys);
    }

    // Clean up request keys
    const requestKeys = await redis.keys('request:*');
    if (requestKeys.length > 0) {
      await redis.del(requestKeys);
    }

    // Create mocks (reset between runs to avoid state leakage)
    mockOrchestration = {
      processRequest: jest.fn(),
      distributeToCouncil: jest.fn(),
      conductDeliberation: jest.fn(),
      handleTimeout: jest.fn()
    } as jest.Mocked<IOrchestrationEngine>;
    
    // Reset all mocks
    jest.clearAllMocks();

    mockSessionManager = {
      createSession: jest.fn().mockResolvedValue({ id: 'session-1' }),
      getContextForRequest: jest.fn().mockResolvedValue({ messages: [], totalTokens: 0, summarized: false }),
      addToHistory: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockEventLogger = {
      logRequest: jest.fn().mockResolvedValue(undefined),
      logConsensusDecision: jest.fn().mockResolvedValue(undefined)
    } as any;

    gateway = new APIGateway(
      mockOrchestration,
      mockSessionManager,
      mockEventLogger,
      redis,
      dbPool,
      'test-secret',
      idempotencyCache
    );
  });

  /**
   * Property 6: Normal processing without key
   * Feature: council-enhancements, Property 6: For any request without an idempotency
   * key, the system should process it normally without idempotency checks.
   */
  test('Property 6: Normal processing without key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (query) => {
          // Mock a successful consensus decision
          const decision: ConsensusDecision = {
            content: `Response to: ${query}`,
            confidence: 'high',
            agreementLevel: 0.9,
            synthesisStrategy: { type: 'consensus-extraction' },
            contributingMembers: ['member-1'],
            timestamp: new Date()
          };

          mockOrchestration.processRequest.mockResolvedValue(decision);

          // Generate a valid JWT token for authentication
          const token = jwt.sign({ userId: 'test-user' }, 'test-secret');

          // Make request without idempotency key
          const response = await request(gateway['app'])
            .post('/api/v1/requests')
            .set('Authorization', `Bearer ${token}`)
            .send({ query });

          // Should process normally without caching
          expect(response.status).toBe(202); // Accepted for async processing
          expect(response.body.status).toBe('processing');
          expect(response.body.requestId).toBeDefined();
          expect(response.body.fromCache).toBeUndefined(); // No cache flag

          // Verify orchestration was called (eventually)
          // Wait for async processing with retries to handle timing variability
          let attempts = 0;
          const maxAttempts = 10;
          while (attempts < maxAttempts && !mockOrchestration.processRequest.mock.calls.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
          }
          expect(mockOrchestration.processRequest).toHaveBeenCalled();
        }
      ),
      { numRuns: getPropertyTestRuns(50) }
    );
  });
});
