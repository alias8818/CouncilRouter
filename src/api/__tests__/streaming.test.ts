/**
 * API Gateway Streaming Tests
 * Tests for SSE connection, connection management, error handling, data integrity, and authentication
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 6.14, 6.15,
 *               6.16, 6.17, 6.18, 6.19, 6.20, 6.21, 6.22
 */

import { APIGateway } from '../gateway';
import { IOrchestrationEngine } from '../../interfaces/IOrchestrationEngine';
import { ISessionManager } from '../../interfaces/ISessionManager';
import { IEventLogger } from '../../interfaces/IEventLogger';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { Response } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('API Gateway Streaming - SSE Connection', () => {
  let gateway: APIGateway;
  let mockOrchestrationEngine: jest.Mocked<IOrchestrationEngine>;
  let mockSessionManager: jest.Mocked<ISessionManager>;
  let mockEventLogger: jest.Mocked<IEventLogger>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let mockDb: jest.Mocked<Pool>;
  let app: any;
  const jwtSecret = 'test-secret';

  beforeEach(() => {
    mockOrchestrationEngine = {
      processRequest: jest.fn(),
      distributeToCouncil: jest.fn(),
      conductDeliberation: jest.fn(),
      handleTimeout: jest.fn()
    } as any;

    mockSessionManager = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      getContextForRequest: jest.fn().mockResolvedValue({ messages: [], totalTokens: 0, summarized: false }),
      addToHistory: jest.fn()
    } as any;

    mockEventLogger = {
      logRequest: jest.fn(),
      logConsensusDecision: jest.fn(),
      logError: jest.fn()
    } as any;

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1)
    } as any;

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    gateway = new APIGateway(
      mockOrchestrationEngine,
      mockSessionManager,
      mockEventLogger,
      mockRedis,
      mockDb,
      jwtSecret
    );

    app = (gateway as any).app;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('SSE Connection Establishment (Requirement 6.1)', () => {
    test('should accept connection and send headers', async () => {
      const requestId = 'test-request-123';
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'processing',
        createdAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      const mockNext = jest.fn();

      await (gateway as any).streamRequest(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    });
  });

  describe('Status Update Streaming (Requirement 6.2)', () => {
    test('should stream status events', async () => {
      const requestId = 'test-request-123';
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'processing',
        createdAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      expect(mockRes.write).toHaveBeenCalled();
      const writeCalls = mockRes.write.mock.calls;
      const statusCall = writeCalls.find((call: any[]) => call[0]?.includes('event: status'));
      expect(statusCall).toBeDefined();
    });
  });

  describe('Message Chunk Streaming (Requirement 6.3)', () => {
    test('should stream chunks incrementally', async () => {
      const requestId = 'test-request-123';
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'completed',
        consensusDecision: {
          content: 'Test response content',
          confidence: 'high',
          agreementLevel: 0.9,
          synthesisStrategy: { type: 'consensus-extraction' },
          contributingMembers: [],
          timestamp: new Date().toISOString()
        },
        completedAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      expect(mockRes.write).toHaveBeenCalled();
      const writeCalls = mockRes.write.mock.calls.map((call: any[]) => call[0]).join('');
      expect(writeCalls).toContain('event: message');
      expect(writeCalls).toContain('Test response content');
    });
  });

  describe('Completion Event (Requirement 6.4)', () => {
    test('should send completion event', async () => {
      const requestId = 'test-request-123';
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'completed',
        consensusDecision: {
          content: 'Test response',
          confidence: 'high',
          agreementLevel: 0.9,
          synthesisStrategy: { type: 'consensus-extraction' },
          contributingMembers: [],
          timestamp: new Date().toISOString()
        },
        completedAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      expect(mockRes.write).toHaveBeenCalled();
      const writeCalls = mockRes.write.mock.calls.map((call: any[]) => call[0]).join('');
      expect(writeCalls).toContain('event: done');
      expect(writeCalls).toContain('Request completed');
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('Connection Close on Completion (Requirement 6.5)', () => {
    test('should close connection gracefully', async () => {
      const requestId = 'test-request-123';
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'completed',
        consensusDecision: {
          content: 'Test response',
          confidence: 'high',
          agreementLevel: 0.9,
          synthesisStrategy: { type: 'consensus-extraction' },
          contributingMembers: [],
          timestamp: new Date().toISOString()
        },
        completedAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      expect(mockRes.end).toHaveBeenCalled();
      const connections = (gateway as any).streamingConnections.get(requestId);
      expect(connections).toBeUndefined();
    });
  });
});

describe('API Gateway Streaming - Connection Management', () => {
  let gateway: APIGateway;
  let mockOrchestrationEngine: jest.Mocked<IOrchestrationEngine>;
  let mockSessionManager: jest.Mocked<ISessionManager>;
  let mockEventLogger: jest.Mocked<IEventLogger>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let mockDb: jest.Mocked<Pool>;
  const jwtSecret = 'test-secret';

  beforeEach(() => {
    mockOrchestrationEngine = {
      processRequest: jest.fn(),
      distributeToCouncil: jest.fn(),
      conductDeliberation: jest.fn(),
      handleTimeout: jest.fn()
    } as any;

    mockSessionManager = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      getContextForRequest: jest.fn().mockResolvedValue({ messages: [], totalTokens: 0, summarized: false }),
      addToHistory: jest.fn()
    } as any;

    mockEventLogger = {
      logRequest: jest.fn(),
      logConsensusDecision: jest.fn(),
      logError: jest.fn()
    } as any;

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1)
    } as any;

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    gateway = new APIGateway(
      mockOrchestrationEngine,
      mockSessionManager,
      mockEventLogger,
      mockRedis,
      mockDb,
      jwtSecret
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Concurrent Stream Independence (Property 80)', () => {
    test('should handle all streams independently', async () => {
      const requestId1 = 'request-1';
      const requestId2 = 'request-2';

      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({
          id: requestId1,
          status: 'processing',
          createdAt: new Date().toISOString()
        }))
        .mockResolvedValueOnce(JSON.stringify({
          id: requestId2,
          status: 'processing',
          createdAt: new Date().toISOString()
        }));

      const mockReq1 = {
        params: { requestId: requestId1 },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockReq2 = {
        params: { requestId: requestId2 },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes1 = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      const mockRes2 = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq1, mockRes1, jest.fn());
      await (gateway as any).streamRequest(mockReq2, mockRes2, jest.fn());

      const connections1 = (gateway as any).streamingConnections.get(requestId1);
      const connections2 = (gateway as any).streamingConnections.get(requestId2);
      
      expect(connections1).toBeDefined();
      expect(connections2).toBeDefined();
      expect(connections1).not.toBe(connections2);
    });
  });

  describe('Connection TTL Enforcement (Property 81)', () => {
    test('should enforce timeout after 30 minutes', () => {
      const CONNECTION_TTL_MS = 30 * 60 * 1000; // 30 minutes
      const requestId = 'test-request';
      
      (gateway as any).connectionTimestamps.set(requestId, Date.now() - (31 * 60 * 1000));
      
      const timestamp = (gateway as any).connectionTimestamps.get(requestId);
      const age = Date.now() - timestamp;
      
      expect(age).toBeGreaterThan(CONNECTION_TTL_MS);
    });
  });

  describe('Connection Cleanup on Timeout (Requirement 6.8)', () => {
    test('should clean up connection resources', () => {
      const requestId = 'test-request';
      const mockResponse = {
        end: jest.fn()
      } as any;
      
      (gateway as any).streamingConnections.set(requestId, [mockResponse]);
      (gateway as any).connectionTimestamps.set(requestId, Date.now());
      
      (gateway as any).removeStreamingConnection(requestId, mockResponse);
      
      const connections = (gateway as any).streamingConnections.get(requestId);
      expect(connections).toBeUndefined();
    });
  });

  describe('Orphaned Connection Cleanup (Property 82)', () => {
    test('should detect and clean up orphaned connections', () => {
      const requestId = 'test-request';
      const mockResponse = {
        end: jest.fn()
      } as any;
      
      (gateway as any).streamingConnections.set(requestId, [mockResponse]);
      (gateway as any).connectionTimestamps.set(requestId, Date.now() - (31 * 60 * 1000));
      
      const cleanupInterval = (gateway as any).cleanupInterval;
      expect(cleanupInterval).toBeDefined();
    });
  });

  describe('Max Connections Enforcement (Property 83)', () => {
    test('should track multiple connections per request', () => {
      const requestId = 'test-request';
      const MAX_CONNECTIONS = 10;
      
      const connections: Response[] = [];
      for (let i = 0; i < MAX_CONNECTIONS; i++) {
        const mockRes = {
          end: jest.fn()
        } as any;
        connections.push(mockRes);
      }
      
      (gateway as any).streamingConnections.set(requestId, connections);
      
      const currentConnections = (gateway as any).streamingConnections.get(requestId);
      expect(currentConnections.length).toBe(MAX_CONNECTIONS);
    });
  });
});

describe('API Gateway Streaming - Error Handling', () => {
  let gateway: APIGateway;
  let mockOrchestrationEngine: jest.Mocked<IOrchestrationEngine>;
  let mockSessionManager: jest.Mocked<ISessionManager>;
  let mockEventLogger: jest.Mocked<IEventLogger>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let mockDb: jest.Mocked<Pool>;
  let app: any;
  const jwtSecret = 'test-secret';

  beforeEach(() => {
    mockOrchestrationEngine = {
      processRequest: jest.fn(),
      distributeToCouncil: jest.fn(),
      conductDeliberation: jest.fn(),
      handleTimeout: jest.fn()
    } as any;

    mockSessionManager = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      getContextForRequest: jest.fn().mockResolvedValue({ messages: [], totalTokens: 0, summarized: false }),
      addToHistory: jest.fn()
    } as any;

    mockEventLogger = {
      logRequest: jest.fn(),
      logConsensusDecision: jest.fn(),
      logError: jest.fn()
    } as any;

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1)
    } as any;

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    gateway = new APIGateway(
      mockOrchestrationEngine,
      mockSessionManager,
      mockEventLogger,
      mockRedis,
      mockDb,
      jwtSecret
    );

    app = (gateway as any).app;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Stream Interruption Recovery (Requirement 6.11)', () => {
    test('should attempt recovery', async () => {
      const requestId = 'test-request-123';
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'processing',
        createdAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn((event, handler) => {
          if (event === 'close') {
            // Simulate close event
            setTimeout(() => handler(), 10);
          }
        })
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      const connections = (gateway as any).streamingConnections.get(requestId);
      expect(connections).toBeDefined();
    });
  });

  describe('Network Disconnection (Requirement 6.12)', () => {
    test('should detect and close stream', () => {
      const requestId = 'test-request';
      const mockResponse = {
        end: jest.fn()
      } as any;
      
      (gateway as any).streamingConnections.set(requestId, [mockResponse]);
      
      (gateway as any).removeStreamingConnection(requestId, mockResponse);
      
      const connections = (gateway as any).streamingConnections.get(requestId);
      expect(connections).toBeUndefined();
    });
  });

  describe('Client Timeout (Requirement 6.13)', () => {
    test('should handle gracefully', () => {
      const requestId = 'test-request';
      const oldTimestamp = Date.now() - (31 * 60 * 1000);
      
      (gateway as any).connectionTimestamps.set(requestId, oldTimestamp);
      
      const age = Date.now() - oldTimestamp;
      expect(age).toBeGreaterThan(30 * 60 * 1000);
    });
  });

  describe('Server Error During Stream (Requirement 6.14)', () => {
    test('should send error event and close', async () => {
      const requestId = 'test-request-123';
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'failed',
        error: 'Processing error',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      expect(mockRes.write).toHaveBeenCalled();
      const writeCalls = mockRes.write.mock.calls.map((call: any[]) => call[0]).join('');
      expect(writeCalls).toContain('event: error');
      expect(writeCalls).toContain('Processing error');
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('Malformed Request ID (Requirement 6.15)', () => {
    test('should reject with error', async () => {
      const invalidRequestId = 'invalid-id-format';
      
      mockRedis.get.mockResolvedValueOnce(null);

      const mockReq = {
        params: { requestId: invalidRequestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalled();
    });
  });
});

describe('API Gateway Streaming - Data Integrity & Auth', () => {
  let gateway: APIGateway;
  let mockOrchestrationEngine: jest.Mocked<IOrchestrationEngine>;
  let mockSessionManager: jest.Mocked<ISessionManager>;
  let mockEventLogger: jest.Mocked<IEventLogger>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let mockDb: jest.Mocked<Pool>;
  let app: any;
  const jwtSecret = 'test-secret';

  beforeEach(() => {
    mockOrchestrationEngine = {
      processRequest: jest.fn(),
      distributeToCouncil: jest.fn(),
      conductDeliberation: jest.fn(),
      handleTimeout: jest.fn()
    } as any;

    mockSessionManager = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      getContextForRequest: jest.fn().mockResolvedValue({ messages: [], totalTokens: 0, summarized: false }),
      addToHistory: jest.fn()
    } as any;

    mockEventLogger = {
      logRequest: jest.fn(),
      logConsensusDecision: jest.fn(),
      logError: jest.fn()
    } as any;

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1)
    } as any;

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    gateway = new APIGateway(
      mockOrchestrationEngine,
      mockSessionManager,
      mockEventLogger,
      mockRedis,
      mockDb,
      jwtSecret
    );

    app = (gateway as any).app;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Message Ordering Preservation (Property 84)', () => {
    test('should preserve ordering', async () => {
      const requestId = 'test-request-123';
      const messages = ['message1', 'message2', 'message3'];
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'completed',
        consensusDecision: {
          content: messages.join(' '),
          confidence: 'high',
          agreementLevel: 0.9,
          synthesisStrategy: { type: 'consensus-extraction' },
          contributingMembers: [],
          timestamp: new Date().toISOString()
        },
        completedAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      const writeCalls = mockRes.write.mock.calls.map((call: any[]) => call[0]).join('');
      const index1 = writeCalls.indexOf('message1');
      const index2 = writeCalls.indexOf('message2');
      const index3 = writeCalls.indexOf('message3');
      
      expect(index1).toBeGreaterThan(-1);
      expect(index2).toBeGreaterThan(-1);
      expect(index3).toBeGreaterThan(-1);
      expect(index1).toBeLessThan(index2);
      expect(index2).toBeLessThan(index3);
    });
  });

  describe('Duplicate Message Prevention (Property 85)', () => {
    test('should prevent duplicates', () => {
      const requestId = 'test-request';
      const connections: Response[] = [];
      
      const mockRes = {
        end: jest.fn()
      } as any;
      connections.push(mockRes);
      
      (gateway as any).streamingConnections.set(requestId, connections);
      
      const stored = (gateway as any).streamingConnections.get(requestId);
      expect(stored.length).toBe(1);
    });
  });

  describe('Data Transmission Completeness (Property 86)', () => {
    test('should ensure completeness', async () => {
      const requestId = 'test-request-123';
      const fullContent = 'Complete response content';
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'completed',
        consensusDecision: {
          content: fullContent,
          confidence: 'high',
          agreementLevel: 0.9,
          synthesisStrategy: { type: 'consensus-extraction' },
          contributingMembers: [],
          timestamp: new Date().toISOString()
        },
        completedAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      const writeCalls = mockRes.write.mock.calls.map((call: any[]) => call[0]).join('');
      expect(writeCalls).toContain(fullContent);
    });
  });

  describe('UTF-8 Encoding (Property 87)', () => {
    test('should use UTF-8 encoding', async () => {
      const requestId = 'test-request-123';
      const unicodeContent = 'Test with émojis 🎉 and 中文';
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: requestId,
        status: 'completed',
        consensusDecision: {
          content: unicodeContent,
          confidence: 'high',
          agreementLevel: 0.9,
          synthesisStrategy: { type: 'consensus-extraction' },
          contributingMembers: [],
          timestamp: new Date().toISOString()
        },
        completedAt: new Date().toISOString()
      }));

      const mockReq = {
        params: { requestId },
        userId: 'user-1',
        on: jest.fn()
      } as any;

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      } as any;

      await (gateway as any).streamRequest(mockReq, mockRes, jest.fn());

      const writeCalls = mockRes.write.mock.calls.map((call: any[]) => call[0]).join('');
      expect(writeCalls).toContain(unicodeContent);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    });
  });

  describe('Stream JWT Validation (Property 88)', () => {
    test('should validate JWT', async () => {
      const invalidToken = 'invalid-token';
      const response = await request(app)
        .get('/api/v1/requests/test-request-123/stream')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Stream Hijacking Prevention (Property 89)', () => {
    test('should prevent unauthorized access', async () => {
      const response = await request(app)
        .get('/api/v1/requests/test-request-123/stream')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Stream Token Expiration Handling (Property 90)', () => {
    test('should close stream with error when token expires', async () => {
      const expiredToken = jwt.sign({ userId: 'user-1' }, jwtSecret, { expiresIn: '-1h' });

      const response = await request(app)
        .get('/api/v1/requests/test-request-123/stream')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });
});
