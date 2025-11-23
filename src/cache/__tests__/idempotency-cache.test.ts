/**
 * Unit tests for Idempotency Cache with mocked Redis
 */

import { IdempotencyCache } from '../idempotency-cache';
import { ConsensusDecision, ErrorResponse } from '../../types/core';

// Mock Redis client
const createMockRedis = () => {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  return {
    get: jest.fn(async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        store.delete(key);
        return null;
      }
      return item.value;
    }),
    set: jest.fn(async (key: string, value: string, options?: any) => {
      const expiresAt = options?.EX ? Date.now() + (options.EX * 1000) : undefined;

      // Handle NX option (only set if key doesn't exist)
      if (options?.NX && store.has(key)) {
        return null;
      }

      store.set(key, { value, expiresAt });
      return 'OK';
    }),
    del: jest.fn(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      let deleted = 0;
      for (const key of keyArray) {
        if (store.delete(key)) deleted++;
      }
      return deleted;
    }),
    keys: jest.fn(async (pattern: string) => {
      // Simple pattern matching for test-*
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(store.keys()).filter(key => regex.test(key));
    }),
    // Expose store for testing purposes
    _store: store,
    _clearStore: () => store.clear()
  };
};

describe('IdempotencyCache - Unit Tests', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let cache: IdempotencyCache;

  beforeEach(() => {
    mockRedis = createMockRedis();
    cache = new IdempotencyCache(mockRedis as any);
  });

  describe('checkKey', () => {
    test('returns not-found for non-existent key', async () => {
      const status = await cache.checkKey('non-existent-key');

      expect(status.exists).toBe(false);
      expect(status.status).toBe('not-found');
      expect(mockRedis.get).toHaveBeenCalledWith('idempotency:non-existent-key');
    });

    test('returns completed status for cached result', async () => {
      const decision: ConsensusDecision = {
        content: 'Test response',
        confidence: 'high',
        agreementLevel: 0.9,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['member-1'],
        timestamp: new Date()
      };

      await cache.cacheResult('test-key', 'req-123', decision, 3600);
      const status = await cache.checkKey('test-key');

      expect(status.exists).toBe(true);
      expect(status.status).toBe('completed');
      expect(status.result).toBeDefined();
      expect(status.result?.requestId).toBe('req-123');
      expect(status.result?.consensusDecision?.content).toBe('Test response');
      expect(status.result?.fromCache).toBe(true);
    });

    test('returns failed status for cached error', async () => {
      const error: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          retryable: false
        },
        requestId: 'req-456',
        timestamp: new Date()
      };

      await cache.cacheError('test-key', 'req-456', error, 3600);
      const status = await cache.checkKey('test-key');

      expect(status.exists).toBe(true);
      expect(status.status).toBe('failed');
      expect(status.result?.error).toBeDefined();
      expect(status.result?.error?.error.code).toBe('VALIDATION_ERROR');
    });

    test('returns in-progress status for pending request', async () => {
      await cache.markInProgress('test-key', 'req-789', 3600);
      const status = await cache.checkKey('test-key');

      expect(status.exists).toBe(true);
      expect(status.status).toBe('in-progress');
      expect(status.result?.requestId).toBe('req-789');
    });
  });

  describe('cacheResult', () => {
    test('stores successful consensus decision', async () => {
      const decision: ConsensusDecision = {
        content: 'Synthesized response',
        confidence: 'medium',
        agreementLevel: 0.75,
        synthesisStrategy: { type: 'weighted-voting' },
        contributingMembers: ['member-1', 'member-2', 'member-3'],
        timestamp: new Date()
      };

      await cache.cacheResult('result-key', 'req-001', decision, 7200);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idempotency:result-key',
        expect.any(String),
        { EX: 7200 }
      );

      // Verify stored data structure
      const stored = mockRedis._store.get('idempotency:result-key');
      expect(stored).toBeDefined();
      const record = JSON.parse(stored!.value);
      expect(record.status).toBe('completed');
      expect(record.requestId).toBe('req-001');
      expect(record.consensusDecision.content).toBe('Synthesized response');
    });

    test('uses default TTL when not specified', async () => {
      const decision: ConsensusDecision = {
        content: 'Test',
        confidence: 'high',
        agreementLevel: 1.0,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['member-1'],
        timestamp: new Date()
      };

      await cache.cacheResult('ttl-key', 'req-002', decision);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idempotency:ttl-key',
        expect.any(String),
        { EX: 86400 } // 24 hours default
      );
    });
  });

  describe('cacheError', () => {
    test('stores error response', async () => {
      const error: ErrorResponse = {
        error: {
          code: 'RATE_LIMIT',
          message: 'Too many requests',
          retryable: true
        },
        requestId: 'req-error-1',
        timestamp: new Date()
      };

      await cache.cacheError('error-key', 'req-error-1', error, 1800);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idempotency:error-key',
        expect.any(String),
        { EX: 1800 }
      );

      const stored = mockRedis._store.get('idempotency:error-key');
      const record = JSON.parse(stored!.value);
      expect(record.status).toBe('failed');
      expect(record.error.error.code).toBe('RATE_LIMIT');
      expect(record.error.error.retryable).toBe(true);
    });

    test('stores non-retryable errors', async () => {
      const error: ErrorResponse = {
        error: {
          code: 'INVALID_INPUT',
          message: 'Bad request format',
          retryable: false
        },
        requestId: 'req-error-2',
        timestamp: new Date()
      };

      await cache.cacheError('permanent-error-key', 'req-error-2', error);

      const status = await cache.checkKey('permanent-error-key');
      expect(status.result?.error?.error.retryable).toBe(false);
    });
  });

  describe('markInProgress', () => {
    test('marks new request as in-progress', async () => {
      await cache.markInProgress('progress-key', 'req-prog-1', 3600);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idempotency:progress-key',
        expect.any(String),
        { NX: true, EX: 3600 }
      );

      const status = await cache.checkKey('progress-key');
      expect(status.status).toBe('in-progress');
    });

    test('throws error if key already exists', async () => {
      await cache.markInProgress('dup-key', 'req-1', 3600);

      await expect(
        cache.markInProgress('dup-key', 'req-2', 3600)
      ).rejects.toThrow('Idempotency key already exists');
    });

    test('uses default TTL when not specified', async () => {
      await cache.markInProgress('default-ttl-key', 'req-prog-2');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idempotency:default-ttl-key',
        expect.any(String),
        { NX: true, EX: 86400 }
      );
    });
  });

  describe('waitForCompletion', () => {
    test('waits for in-progress request to complete', async () => {
      await cache.markInProgress('wait-key', 'req-wait-1', 3600);

      const decision: ConsensusDecision = {
        content: 'Completed',
        confidence: 'high',
        agreementLevel: 0.85,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['member-1'],
        timestamp: new Date()
      };

      // Complete the request after a delay
      setTimeout(async () => {
        await cache.cacheResult('wait-key', 'req-wait-1', decision, 3600);
      }, 200);

      const result = await cache.waitForCompletion('wait-key', 5000);

      expect(result.requestId).toBe('req-wait-1');
      expect(result.consensusDecision?.content).toBe('Completed');
      expect(result.fromCache).toBe(true);
    });

    test('returns immediately if request already completed', async () => {
      const decision: ConsensusDecision = {
        content: 'Already done',
        confidence: 'high',
        agreementLevel: 0.9,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['member-1'],
        timestamp: new Date()
      };

      await cache.cacheResult('immediate-key', 'req-imm-1', decision, 3600);

      const startTime = Date.now();
      const result = await cache.waitForCompletion('immediate-key', 5000);
      const elapsed = Date.now() - startTime;

      expect(result.consensusDecision?.content).toBe('Already done');
      expect(elapsed).toBeLessThan(500); // Should be almost immediate
    });

    test('returns failed result if request failed', async () => {
      const error: ErrorResponse = {
        error: {
          code: 'PROCESSING_ERROR',
          message: 'Failed to process',
          retryable: false
        },
        requestId: 'req-fail-1',
        timestamp: new Date()
      };

      await cache.cacheError('fail-key', 'req-fail-1', error, 3600);

      const result = await cache.waitForCompletion('fail-key', 5000);

      expect(result.error).toBeDefined();
      expect(result.error?.error.code).toBe('PROCESSING_ERROR');
    });

    test('throws timeout error if request does not complete in time', async () => {
      await cache.markInProgress('timeout-key', 'req-timeout-1', 3600);

      await expect(
        cache.waitForCompletion('timeout-key', 500)
      ).rejects.toThrow('Timeout waiting for request completion');
    });

    test('throws error if key is deleted while waiting', async () => {
      await cache.markInProgress('delete-key', 'req-del-1', 3600);

      // Delete the key after a short delay
      setTimeout(() => {
        mockRedis._store.delete('idempotency:delete-key');
      }, 200);

      await expect(
        cache.waitForCompletion('delete-key', 5000)
      ).rejects.toThrow('Request no longer exists in cache');
    });
  });

  describe('Date serialization/deserialization', () => {
    test('correctly serializes and deserializes dates in consensus decision', async () => {
      const testDate = new Date('2024-01-15T10:30:00Z');
      const decision: ConsensusDecision = {
        content: 'Test',
        confidence: 'high',
        agreementLevel: 0.8,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['member-1'],
        timestamp: testDate
      };

      await cache.cacheResult('date-key', 'req-date-1', decision, 3600);
      const status = await cache.checkKey('date-key');

      expect(status.result?.consensusDecision?.timestamp).toBeInstanceOf(Date);
      expect(status.result?.consensusDecision?.timestamp.toISOString()).toBe(testDate.toISOString());
    });

    test('correctly serializes and deserializes dates in error response', async () => {
      const testDate = new Date('2024-02-20T15:45:00Z');
      const error: ErrorResponse = {
        error: {
          code: 'TEST_ERROR',
          message: 'Test',
          retryable: false
        },
        requestId: 'req-err-date',
        timestamp: testDate
      };

      await cache.cacheError('error-date-key', 'req-err-date', error, 3600);
      const status = await cache.checkKey('error-date-key');

      expect(status.result?.error?.timestamp).toBeInstanceOf(Date);
      expect(status.result?.error?.timestamp.toISOString()).toBe(testDate.toISOString());
    });
  });

  describe('Redis key prefixing', () => {
    test('adds idempotency prefix to all keys', async () => {
      await cache.cacheResult('my-key', 'req-1', {
        content: 'Test',
        confidence: 'high',
        agreementLevel: 0.9,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['member-1'],
        timestamp: new Date()
      }, 3600);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idempotency:my-key',
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe('Edge cases', () => {
    test('handles empty content in consensus decision', async () => {
      const decision: ConsensusDecision = {
        content: '',
        confidence: 'low',
        agreementLevel: 0.5,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: [],
        timestamp: new Date()
      };

      await cache.cacheResult('empty-key', 'req-empty', decision, 3600);
      const status = await cache.checkKey('empty-key');

      expect(status.result?.consensusDecision?.content).toBe('');
      expect(status.result?.consensusDecision?.contributingMembers).toEqual([]);
    });

    test('handles zero agreement level', async () => {
      const decision: ConsensusDecision = {
        content: 'No agreement',
        confidence: 'low',
        agreementLevel: 0,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['member-1'],
        timestamp: new Date()
      };

      await cache.cacheResult('zero-agreement', 'req-zero', decision, 3600);
      const status = await cache.checkKey('zero-agreement');

      expect(status.result?.consensusDecision?.agreementLevel).toBe(0);
    });

    test('handles maximum agreement level', async () => {
      const decision: ConsensusDecision = {
        content: 'Full agreement',
        confidence: 'high',
        agreementLevel: 1.0,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['member-1', 'member-2'],
        timestamp: new Date()
      };

      await cache.cacheResult('max-agreement', 'req-max', decision, 3600);
      const status = await cache.checkKey('max-agreement');

      expect(status.result?.consensusDecision?.agreementLevel).toBe(1.0);
    });
  });
});
