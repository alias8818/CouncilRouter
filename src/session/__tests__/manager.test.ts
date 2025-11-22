/**
 * Session Manager Tests
 */

import { SessionManager } from '../manager';
import { Session, HistoryEntry } from '../../types/core';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    // Create mock client for transactions
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn()
    };

    // Create mock database
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue(mockClient)
    } as any;

    // Create mock Redis client
    mockRedis = {
      hGetAll: jest.fn().mockResolvedValue({}),
      hSet: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(1),
      lRange: jest.fn().mockResolvedValue([]),
      lLen: jest.fn().mockResolvedValue(0),
      multi: jest.fn().mockReturnValue({
        hSet: jest.fn().mockReturnThis(),
        rPush: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      })
    } as any;

    sessionManager = new SessionManager(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('createSession', () => {
    it('should create a new session with correct structure', async () => {
      const session = await sessionManager.createSession('user123');

      expect(session).toMatchObject({
        userId: 'user123',
        history: [],
        contextWindowUsed: 0
      });
      expect(session.id).toBeDefined();
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivityAt).toBeInstanceOf(Date);
    });

    it('should store session in database', async () => {
      await sessionManager.createSession('user123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        expect.arrayContaining(['user123'])
      );
    });

    it('should cache session in Redis', async () => {
      const session = await sessionManager.createSession('user123');

      // cacheSession uses pipeline, so check multi() was called and pipeline operations
      expect(mockRedis.multi).toHaveBeenCalled();
      const pipeline = (mockRedis.multi as jest.Mock).mock.results[0].value;
      
      // Verify pipeline was executed
      expect(pipeline.exec).toHaveBeenCalled();
      
      // Verify hSet was called with correct session data
      expect(pipeline.hSet).toHaveBeenCalledWith(
        `session:${session.id}`,
        expect.objectContaining({
          userId: 'user123'
        })
      );
      
      // Verify expire was called
      expect(pipeline.expire).toHaveBeenCalledWith(`session:${session.id}`, 2592000);
    });
  });

  describe('getSession', () => {
    it('should return session from cache if available', async () => {
      const mockSessionData = {
        userId: 'user123',
        history: JSON.stringify([]),
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        contextWindowUsed: '0'
      };

      (mockRedis.hGetAll as jest.Mock).mockResolvedValueOnce(mockSessionData);

      const session = await sessionManager.getSession('session-id');

      expect(session).toBeDefined();
      expect(session?.userId).toBe('user123');
    });

    it('should return null for non-existent session', async () => {
      const session = await sessionManager.getSession('non-existent');

      expect(session).toBeNull();
    });
  });

  describe('addToHistory', () => {
    it('should add entry to database within transaction', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn()
      };
      (mockDb.connect as jest.Mock).mockResolvedValueOnce(mockClient);

      const entry: HistoryEntry = {
        role: 'user',
        content: 'Hello',
        timestamp: new Date()
      };

      await sessionManager.addToHistory('session-id', entry);

      // Verify transaction was used
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO session_history'),
        expect.arrayContaining(['session-id', 'user', 'Hello'])
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should update session last activity within transaction', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn()
      };
      (mockDb.connect as jest.Mock).mockResolvedValueOnce(mockClient);

      const entry: HistoryEntry = {
        role: 'user',
        content: 'Hello',
        timestamp: new Date()
      };

      await sessionManager.addToHistory('session-id', entry);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        expect.arrayContaining(['session-id'])
      );
    });

    it('should rollback transaction on error', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
          .mockRejectedValueOnce(new Error('Database error')), // UPDATE fails
        release: jest.fn()
      };
      (mockDb.connect as jest.Mock).mockResolvedValueOnce(mockClient);

      const entry: HistoryEntry = {
        role: 'user',
        content: 'Hello',
        timestamp: new Date()
      };

      await expect(sessionManager.addToHistory('session-id', entry)).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getContextForRequest', () => {
    it('should return empty context for non-existent session', async () => {
      const context = await sessionManager.getContextForRequest('non-existent', 1000);

      expect(context).toEqual({
        messages: [],
        totalTokens: 0,
        summarized: false
      });
    });

    it('should return all messages when within token limit', async () => {
      const history: HistoryEntry[] = [
        { role: 'user', content: 'Hi', timestamp: new Date() },
        { role: 'assistant', content: 'Hello', timestamp: new Date() }
      ];

      const mockSessionData = {
        userId: 'user123',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        contextWindowUsed: '10'
      };

      // Mock the new cache structure: metadata in hash, history in list
      (mockRedis.hGetAll as jest.Mock).mockResolvedValueOnce(mockSessionData);
      (mockRedis.lRange as jest.Mock).mockResolvedValueOnce(
        history.map(entry => JSON.stringify(entry))
      );

      const context = await sessionManager.getContextForRequest('session-id', 1000);

      expect(context.messages).toHaveLength(2);
      expect(context.summarized).toBe(false);
    });
  });

  describe('expireInactiveSessions', () => {
    it('should expire sessions older than threshold', async () => {
      const expiredSessions = [
        { id: 'session1' },
        { id: 'session2' }
      ];

      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: expiredSessions,
        rowCount: 2
      });

      const count = await sessionManager.expireInactiveSessions(86400000); // 1 day

      expect(count).toBe(2);
      // expireInactiveSessions deletes both session metadata and history keys (2 per session)
      expect(mockRedis.del).toHaveBeenCalledTimes(4);
      expect(mockRedis.del).toHaveBeenCalledWith('session:session1');
      expect(mockRedis.del).toHaveBeenCalledWith('session:session1:history');
      expect(mockRedis.del).toHaveBeenCalledWith('session:session2');
      expect(mockRedis.del).toHaveBeenCalledWith('session:session2:history');
    });

    it('should return 0 when no sessions to expire', async () => {
      const count = await sessionManager.expireInactiveSessions(86400000);

      expect(count).toBe(0);
    });
  });
});
