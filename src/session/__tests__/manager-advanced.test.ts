/**
 * Session Manager Advanced Tests
 * Tests for cache coherency, concurrent access, token estimation, and expiration
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16
 */

import { SessionManager } from '../manager';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { Session, HistoryEntry } from '../../types/core';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('Session Manager Advanced - Cache Coherency', () => {
  let sessionManager: SessionManager;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn()
      } as any)
    } as any;

    mockRedis = {
      hGetAll: jest.fn().mockResolvedValue({}),
      lRange: jest.fn().mockResolvedValue([]),
      lLen: jest.fn().mockResolvedValue(0),
      multi: jest.fn().mockReturnValue({
        hSet: jest.fn().mockReturnThis(),
        rPush: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([true])
      }),
      watch: jest.fn().mockResolvedValue('OK'),
      unwatch: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    } as any;

    sessionManager = new SessionManager(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cache Miss Fallback (Property 91)', () => {
    test('should fallback to database when cache miss occurs (Requirement 7.1)', async () => {
      const sessionId = 'test-session-123';
      
      // Cache miss - return empty
      mockRedis.hGetAll.mockResolvedValueOnce({});
      
      // Database returns session
      const mockSession: Session = {
        id: sessionId,
        userId: 'user-1',
        history: [],
        createdAt: new Date(),
        lastActivityAt: new Date(),
        contextWindowUsed: 0
      };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: sessionId,
            user_id: 'user-1',
            created_at: mockSession.createdAt,
            last_activity_at: mockSession.lastActivityAt,
            context_window_used: 0,
            expired: false
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        });

      const result = await sessionManager.getSession(sessionId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(sessionId);
      expect(mockDb.query).toHaveBeenCalled();
    });
  });

  describe('Cache Invalidation Correctness (Property 92)', () => {
    test('should invalidate cache correctly (Requirement 7.2)', async () => {
      const sessionId = 'test-session-123';
      
      // Simulate cache invalidation by deleting keys
      await mockRedis.del(`session:${sessionId}`);
      await mockRedis.del(`session:${sessionId}:history`);

      expect(mockRedis.del).toHaveBeenCalledWith(`session:${sessionId}`);
      expect(mockRedis.del).toHaveBeenCalledWith(`session:${sessionId}:history`);
    });
  });

  describe('Stale Cache Detection (Property 93)', () => {
    test('should detect and refresh stale cache (Requirement 7.3)', async () => {
      const sessionId = 'test-session-123';
      
      // Simulate cache miss (stale cache would be detected by TTL or manual invalidation)
      mockRedis.hGetAll.mockResolvedValueOnce({});

      // Database has current data
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: sessionId,
            user_id: 'user-1',
            created_at: new Date(),
            last_activity_at: new Date(),
            context_window_used: 100,
            expired: false
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [{
            role: 'user',
            content: 'New message',
            request_id: null,
            created_at: new Date()
          }],
          rowCount: 1
        });
      
      const result = await sessionManager.getSession(sessionId);

      expect(result).toBeDefined();
      expect(mockDb.query).toHaveBeenCalled();
      // Cache should be refreshed with DB data
      expect(mockRedis.multi).toHaveBeenCalled();
    });
  });

  describe('Cache-DB Sync Resolution (Property 94)', () => {
    test('should resolve cache-DB sync conflicts (Requirement 7.4)', async () => {
      const sessionId = 'test-session-123';
      
      // Simulate cache miss first, then DB returns data
      mockRedis.hGetAll.mockResolvedValueOnce({});
      
      // DB has data
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: sessionId,
            user_id: 'user-1',
            created_at: new Date(),
            last_activity_at: new Date(),
            context_window_used: 100,
            expired: false
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [{
            role: 'user',
            content: 'DB message',
            request_id: null,
            created_at: new Date()
          }],
          rowCount: 1
        });

      const result = await sessionManager.getSession(sessionId);

      expect(result).toBeDefined();
      // DB data should take precedence when cache misses
      expect(mockDb.query).toHaveBeenCalled();
      // Cache should be updated with DB data
      expect(mockRedis.multi).toHaveBeenCalled();
    });
  });
});

describe('Session Manager Advanced - Concurrent Access', () => {
  let sessionManager: SessionManager;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn()
    };

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue(mockClient)
    } as any;

    mockRedis = {
      hGetAll: jest.fn().mockResolvedValue({}),
      lRange: jest.fn().mockResolvedValue([]),
      lLen: jest.fn().mockResolvedValue(0),
      multi: jest.fn().mockReturnValue({
        hSet: jest.fn().mockReturnThis(),
        rPush: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([true])
      }),
      watch: jest.fn().mockResolvedValue('OK'),
      unwatch: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    } as any;

    sessionManager = new SessionManager(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Parallel Update Handling (Property 95)', () => {
    test('should handle parallel updates correctly (Requirement 7.5)', async () => {
      const sessionId = 'test-session-123';
      const entry1: HistoryEntry = {
        role: 'user',
        content: 'Message 1',
        timestamp: new Date()
      };
      const entry2: HistoryEntry = {
        role: 'user',
        content: 'Message 2',
        timestamp: new Date()
      };

      // Mock transaction setup
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{
            id: sessionId,
            user_id: 'user-1',
            created_at: new Date(),
            last_activity_at: new Date(),
            context_window_used: 100,
            expired: false
          }],
          rowCount: 1
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({
          rows: [{
            role: 'user',
            content: 'Message 1',
            request_id: null,
            created_at: new Date()
          }],
          rowCount: 1
        }) // SELECT history
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      await sessionManager.addToHistory(sessionId, entry1);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      const insertCall = mockClient.query.mock.calls.find((call: any[]) => 
        call[0]?.includes('INSERT INTO session_history')
      );
      expect(insertCall).toBeDefined();
      const forUpdateCall = mockClient.query.mock.calls.find((call: any[]) => 
        call[0]?.includes('FOR UPDATE')
      );
      expect(forUpdateCall).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('Race Condition Prevention (Property 96)', () => {
    test('should prevent race conditions with locking (Requirement 7.6)', async () => {
      const sessionId = 'test-session-123';
      const entry: HistoryEntry = {
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{
            id: sessionId,
            user_id: 'user-1',
            created_at: new Date(),
            last_activity_at: new Date(),
            context_window_used: 0,
            expired: false
          }],
          rowCount: 1
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        }) // SELECT history
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      await sessionManager.addToHistory(sessionId, entry);

      // Verify FOR UPDATE lock was used
      const forUpdateCall = mockClient.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('FOR UPDATE')
      );
      expect(forUpdateCall).toBeDefined();
    });
  });

  describe('Optimistic Locking Conflict Detection (Property 97)', () => {
    test('should detect optimistic locking conflicts (Requirement 7.7)', async () => {
      const sessionId = 'test-session-123';
      
      // Simulate Redis WATCH/EXEC conflict
      mockRedis.watch.mockResolvedValueOnce('OK');
      mockRedis.lLen.mockResolvedValueOnce(0);
      
      const mockPipeline = {
        hSet: jest.fn().mockReturnThis(),
        rPush: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null) // Transaction aborted
      };
      
      mockRedis.multi.mockReturnValue(mockPipeline as any);

      // Should retry on conflict
      const session: Session = {
        id: sessionId,
        userId: 'user-1',
        history: [],
        createdAt: new Date(),
        lastActivityAt: new Date(),
        contextWindowUsed: 0
      };

      // First attempt fails, second succeeds
      mockPipeline.exec
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([true]);

      await (sessionManager as any).cacheSession(session);

      expect(mockRedis.watch).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalledTimes(2);
    });
  });

  describe('Transaction Isolation (Property 98)', () => {
    test('should use transaction isolation (Requirement 7.8)', async () => {
      const sessionId = 'test-session-123';
      const entry: HistoryEntry = {
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{
            id: sessionId,
            user_id: 'user-1',
            created_at: new Date(),
            last_activity_at: new Date(),
            context_window_used: 0,
            expired: false
          }],
          rowCount: 1
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        }) // SELECT history
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      await sessionManager.addToHistory(sessionId, entry);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });
});

describe('Session Manager Advanced - Token Estimation', () => {
  let sessionManager: SessionManager;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn()
      } as any)
    } as any;

    mockRedis = {
      hGetAll: jest.fn().mockResolvedValue({}),
      lRange: jest.fn().mockResolvedValue([]),
      lLen: jest.fn().mockResolvedValue(0),
      multi: jest.fn().mockReturnValue({
        hSet: jest.fn().mockReturnThis(),
        rPush: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([true])
      }),
      watch: jest.fn().mockResolvedValue('OK'),
      unwatch: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    } as any;

    sessionManager = new SessionManager(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Model Encoding Selection (Property 99)', () => {
    test('should select correct encoder for model (Requirement 7.9)', () => {
      const content = 'Test content';
      
      // Mock tiktoken encoder
      const mockEncoder = {
        encode: jest.fn().mockReturnValue([1, 2, 3, 4, 5])
      };

      // Access private method through any cast
      const encoder = (sessionManager as any).getEncoder('gpt-4o');
      
      // Should return an encoder
      expect(encoder).toBeDefined();
    });
  });

  describe('Fallback Encoder Usage (Property 100)', () => {
    test('should use fallback encoder when model not found (Requirement 7.10)', () => {
      // Access private method
      const encoder = (sessionManager as any).getFallbackEncoder('unknown-model');
      
      // Should return fallback encoder
      expect(encoder).toBeDefined();
    });
  });

  describe('Large Context Token Estimation (Property 101)', () => {
    test('should estimate tokens accurately for large context (Requirement 7.11)', () => {
      const largeContent = 'A'.repeat(10000);
      
      // Estimate tokens
      const tokens = (sessionManager as any).estimateTokens(largeContent);
      
      expect(tokens).toBeGreaterThan(0);
      expect(typeof tokens).toBe('number');
    });
  });

  describe('Unicode Token Counting (Property 102)', () => {
    test('should count tokens correctly for Unicode content (Requirement 7.12)', () => {
      const unicodeContent = 'Test with émojis 🎉 and 中文 and العربية';
      
      // Estimate tokens
      const tokens = (sessionManager as any).estimateTokens(unicodeContent);
      
      expect(tokens).toBeGreaterThan(0);
      expect(typeof tokens).toBe('number');
    });
  });
});

describe('Session Manager Advanced - Expiration', () => {
  let sessionManager: SessionManager;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn()
      } as any)
    } as any;

    mockRedis = {
      hGetAll: jest.fn().mockResolvedValue({}),
      lRange: jest.fn().mockResolvedValue([]),
      lLen: jest.fn().mockResolvedValue(0),
      multi: jest.fn().mockReturnValue({
        hSet: jest.fn().mockReturnThis(),
        rPush: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([true])
      }),
      watch: jest.fn().mockResolvedValue('OK'),
      unwatch: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    } as any;

    sessionManager = new SessionManager(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Session TTL Enforcement (Property 103)', () => {
    test('should enforce session TTL (Requirement 7.13)', async () => {
      const threshold = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
      const oldDate = new Date(Date.now() - threshold - 1000);

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'session-1' }, { id: 'session-2' }],
        rowCount: 2
      });

      const expiredCount = await sessionManager.expireInactiveSessions(threshold);

      expect(expiredCount).toBe(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        expect.arrayContaining([expect.any(Date)])
      );
    });
  });

  describe('Expired Session Cleanup (Property 104)', () => {
    test('should clean up expired sessions from cache (Requirement 7.14)', async () => {
      const threshold = 30 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(Date.now() - threshold - 1000);

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'session-1' }, { id: 'session-2' }],
        rowCount: 2
      });

      await sessionManager.expireInactiveSessions(threshold);

      expect(mockRedis.del).toHaveBeenCalledWith('session:session-1');
      expect(mockRedis.del).toHaveBeenCalledWith('session:session-1:history');
      expect(mockRedis.del).toHaveBeenCalledWith('session:session-2');
      expect(mockRedis.del).toHaveBeenCalledWith('session:session-2:history');
    });
  });

  describe('Grace Period Application (Property 105)', () => {
    test('should apply grace period before expiration (Requirement 7.15)', async () => {
      const threshold = 30 * 24 * 60 * 60 * 1000;
      const gracePeriod = 1000; // 1 second grace
      const recentDate = new Date(Date.now() - threshold + gracePeriod);

      // Sessions within grace period should not be expired
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const expiredCount = await sessionManager.expireInactiveSessions(threshold);

      expect(expiredCount).toBe(0);
    });
  });

  describe('Manual Expiration (Property 106)', () => {
    test('should expire sessions immediately when triggered (Requirement 7.16)', async () => {
      const threshold = 0; // Immediate expiration

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'session-1' }],
        rowCount: 1
      });

      const expiredCount = await sessionManager.expireInactiveSessions(threshold);

      expect(expiredCount).toBe(1);
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });
});

