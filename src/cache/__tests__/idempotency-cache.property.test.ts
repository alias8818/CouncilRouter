/**
 * Property-based tests for Idempotency Cache
 * Feature: council-enhancements
 */

import * as fc from 'fast-check';
import { createClient, RedisClientType } from 'redis';
import { IdempotencyCache } from '../idempotency-cache';
import { ConsensusDecision, ErrorResponse } from '../../types/core';

describe('Idempotency Cache - Property Tests', () => {
  let redis: RedisClientType;
  let cache: IdempotencyCache;

  beforeAll(async () => {
    redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    cache = new IdempotencyCache(redis);
      // Clean up test keys
      const keys = await redis.keys('idempotency:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
  });

  /**
   * Property 1: Idempotency key detection
   * Feature: council-enhancements, Property 1: For any idempotency key that has been
   * processed within the last twenty-four hours, the system should identify it as
   * previously processed.
   */
  test('Property 1: Idempotency key detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (requestId, idempotencyKey, content) => {
          const key = `test-${idempotencyKey}`;

          // Create a consensus decision
          const decision: ConsensusDecision = {
            content,
            confidence: 'high',
            agreementLevel: 0.9,
            synthesisStrategy: { type: 'consensus-extraction' },
            contributingMembers: ['member-1'],
            timestamp: new Date()
          };

          // Cache the result
          await cache.cacheResult(key, requestId, decision, 3600);

          // Check that the key is detected
          const status = await cache.checkKey(key);

          // Assertions
          expect(status.exists).toBe(true);
          expect(status.status).toBe('completed');
          expect(status.result).toBeDefined();
          expect(status.result?.requestId).toBe(requestId);
          expect(status.result?.fromCache).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Cached result return
   * Feature: council-enhancements, Property 2: For any idempotency key matching a
   * completed request, the system should return the cached result without re-processing
   * the request.
   */
  test('Property 2: Cached result return', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.float({ min: 0, max: 1 }),
        async (requestId, idempotencyKey, content, agreementLevel) => {
          const key = `test-${idempotencyKey}`;

          // Create a consensus decision
          const decision: ConsensusDecision = {
            content,
            confidence: 'high',
            agreementLevel,
            synthesisStrategy: { type: 'consensus-extraction' },
            contributingMembers: ['member-1', 'member-2'],
            timestamp: new Date()
          };

          // Cache the result
          await cache.cacheResult(key, requestId, decision, 3600);

          // Retrieve the cached result
          const status = await cache.checkKey(key);

          // Assertions
          expect(status.exists).toBe(true);
          expect(status.status).toBe('completed');
          expect(status.result).toBeDefined();
          expect(status.result?.consensusDecision).toBeDefined();
          expect(status.result?.consensusDecision?.content).toBe(content);
          expect(status.result?.consensusDecision?.agreementLevel).toBe(agreementLevel);
          expect(status.result?.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Concurrent request handling
   * Feature: council-enhancements, Property 3: For any idempotency key with an
   * in-progress request, subsequent requests with the same key should wait and
   * receive the same result.
   */
  test('Property 3: Concurrent request handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (requestId, idempotencyKey, content) => {
          const key = `test-${idempotencyKey}`;

          // Mark as in-progress
          await cache.markInProgress(key, requestId, 60);

          // Check that it's in-progress
          const statusBefore = await cache.checkKey(key);
          expect(statusBefore.status).toBe('in-progress');

          // Simulate completion in background
          const decision: ConsensusDecision = {
            content,
            confidence: 'medium',
            agreementLevel: 0.7,
            synthesisStrategy: { type: 'consensus-extraction' },
            contributingMembers: ['member-1'],
            timestamp: new Date()
          };

          // Complete the request after a short delay
          setTimeout(async () => {
            await cache.cacheResult(key, requestId, decision, 3600);
          }, 50);

          // Wait for completion
          const result = await cache.waitForCompletion(key, 5000);

          // Assertions
          expect(result.requestId).toBe(requestId);
          expect(result.consensusDecision).toBeDefined();
          expect(result.consensusDecision?.content).toBe(content);
          expect(result.fromCache).toBe(true);
        }
      ),
      { numRuns: 50 } // Fewer runs due to timing sensitivity
    );
  });

  /**
   * Property 4: Result caching with TTL
   * Feature: council-enhancements, Property 4: For any completed request with an
   * idempotency key, the result should be cached with a twenty-four hour TTL.
   */
  test('Property 4: Result caching with TTL', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (requestId, idempotencyKey, content) => {
          const key = `test-${idempotencyKey}`;
          const ttl = 2; // 2 seconds for testing

          // Create a consensus decision
          const decision: ConsensusDecision = {
            content,
            confidence: 'high',
            agreementLevel: 0.95,
            synthesisStrategy: { type: 'consensus-extraction' },
            contributingMembers: ['member-1'],
            timestamp: new Date()
          };

          // Cache the result with short TTL
          await cache.cacheResult(key, requestId, decision, ttl);

          // Verify it exists immediately
          const statusBefore = await cache.checkKey(key);
          expect(statusBefore.exists).toBe(true);
          expect(statusBefore.status).toBe('completed');

          // Wait for TTL to expire
          await new Promise(resolve => setTimeout(resolve, (ttl + 1) * 1000));

          // Verify it no longer exists
          const statusAfter = await cache.checkKey(key);
          expect(statusAfter.exists).toBe(false);
          expect(statusAfter.status).toBe('not-found');
        }
      ),
      { numRuns: 10 } // Fewer runs due to time-based nature
    );
  });

  /**
   * Property 5: Error caching
   * Feature: council-enhancements, Property 5: For any permanently failed request
   * with an idempotency key, the error response should be cached to prevent retries.
   */
  test('Property 5: Error caching', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (requestId, idempotencyKey, errorCode, errorMessage) => {
          const key = `test-${idempotencyKey}`;

          // Create an error response
          const error: ErrorResponse = {
            error: {
              code: errorCode,
              message: errorMessage,
              retryable: false
            },
            requestId,
            timestamp: new Date()
          };

          // Cache the error
          await cache.cacheError(key, requestId, error, 3600);

          // Retrieve the cached error
          const status = await cache.checkKey(key);

          // Assertions
          expect(status.exists).toBe(true);
          expect(status.status).toBe('failed');
          expect(status.result).toBeDefined();
          expect(status.result?.error).toBeDefined();
          expect(status.result?.error?.error.code).toBe(errorCode);
          expect(status.result?.error?.error.message).toBe(errorMessage);
          expect(status.result?.error?.error.retryable).toBe(false);
          expect(status.result?.consensusDecision).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
