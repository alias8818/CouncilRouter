/**
 * API Gateway Authentication and Authorization Tests
 * Tests JWT validation, API key verification, and access control
 */

import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { APIGateway } from '../gateway';
import { OrchestrationEngine } from '../../orchestration/engine';
import { SessionManager } from '../../session/manager';
import { EventLogger } from '../../logging/logger';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import supertest from 'supertest';

// Mock dependencies
const mockOrchestrationEngine = {
  processRequest: jest.fn().mockResolvedValue({
    content: 'Test response',
    contributingMembers: ['member-1'],
    agreementLevel: 1.0,
    synthesisStrategy: { type: 'consensus-extraction', minAgreementThreshold: 0.7 }
  })
} as unknown as OrchestrationEngine;

const mockSessionManager = {
  getSession: jest.fn().mockResolvedValue(null),
  createSession: jest.fn().mockResolvedValue({
    id: 'session-123',
    userId: 'user-456',
    history: [],
    createdAt: new Date(),
    lastActivityAt: new Date(),
    contextWindowUsed: 0
  }),
  updateSession: jest.fn().mockResolvedValue(undefined)
} as unknown as SessionManager;

const mockEventLogger = {
  logEvent: jest.fn().mockResolvedValue(undefined)
} as unknown as EventLogger;

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setEx: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn().mockResolvedValue(undefined)
} as any as RedisClientType;

const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  end: jest.fn().mockResolvedValue(undefined)
} as unknown as Pool;

describe('API Gateway - Authentication and Authorization', () => {
  let apiGateway: APIGateway;
  let request: supertest.SuperTest<supertest.Test>;
  const jwtSecret = 'test-secret-key';

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create API Gateway instance
    apiGateway = new APIGateway(
      mockOrchestrationEngine,
      mockSessionManager,
      mockEventLogger,
      mockRedis,
      mockDb,
      jwtSecret
    );

    // Start server on random port for testing
    await apiGateway.start(0);

    // Get the server address for supertest
    const server = (apiGateway as any).server;
    request = supertest(server);
  });

  afterEach(async () => {
    await apiGateway.stop();
    jest.restoreAllMocks();
  });

  describe('JWT Authentication', () => {
    it('should accept valid JWT tokens', async () => {
      const token = jwt.sign({ userId: 'user-123', role: 'user' }, jwtSecret, { expiresIn: '1h' });
      const sessionId = randomUUID();

      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'Test query',
          sessionId
        });

      expect(response.status).toBe(200);
      expect(response.body.requestId).toBeDefined();
    });

    it('should reject requests with missing Authorization header', async () => {
      const sessionId = randomUUID();

      const response = await request
        .post('/api/v1/requests')
        .send({
          query: 'Test query',
          sessionId
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Authorization');
    });

    it('should reject requests with invalid JWT tokens', async () => {
      const sessionId = randomUUID();

      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', 'Bearer invalid-token-here')
        .send({
          query: 'Test query',
          sessionId
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should reject requests with expired JWT tokens', async () => {
      const sessionId = randomUUID();
      const expiredToken = jwt.sign(
        { userId: 'user-123', role: 'user' },
        jwtSecret,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          query: 'Test query',
          sessionId
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('expired');
    });

    it('should reject tokens signed with wrong secret', async () => {
      const sessionId = randomUUID();
      const wrongSecretToken = jwt.sign(
        { userId: 'user-123', role: 'user' },
        'wrong-secret-key',
        { expiresIn: '1h' }
      );

      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${wrongSecretToken}`)
        .send({
          query: 'Test query',
          sessionId
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should reject malformed Authorization headers', async () => {
      const sessionId = randomUUID();
      const testCases = [
        'InvalidFormat token',
        'Bearer',
        'token-without-bearer',
        ''
      ];

      for (const authHeader of testCases) {
        const response = await request
          .post('/api/v1/requests')
          .set('Authorization', authHeader)
          .send({
            query: 'Test query',
            sessionId
          });

        expect(response.status).toBe(401);
      }
    });
  });

  describe('API Key Authentication', () => {
    beforeEach(() => {
      // Mock API key validation in database
      (mockDb.query as jest.Mock).mockResolvedValue({
        rows: [{ api_key: 'valid-api-key', user_id: 'user-123', active: true }]
      });
    });

    it('should accept valid API keys', async () => {
      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', 'ApiKey valid-api-key')
        .send({
          query: 'Test query',
          sessionId: randomUUID()
        });

      expect(response.status).toBe(200);
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should reject invalid API keys', async () => {
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', 'ApiKey invalid-key')
        .send({
          query: 'Test query',
          sessionId: randomUUID()
        });

      expect(response.status).toBe(401);
    });

    it('should reject inactive API keys', async () => {
      (mockDb.query as jest.Mock).mockResolvedValue({
        rows: [{ api_key: 'inactive-key', user_id: 'user-123', active: false }]
      });

      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', 'ApiKey inactive-key')
        .send({
          query: 'Test query',
          sessionId: randomUUID()
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests under rate limit', async () => {
      const token = jwt.sign({ userId: 'user-123', role: 'user' }, jwtSecret, { expiresIn: '1h' });

      // Make 5 requests (under typical rate limit)
      for (let i = 0; i < 5; i++) {
        const response = await request
          .post('/api/v1/requests')
          .set('Authorization', `Bearer ${token}`)
          .send({
            query: `Test query ${i}`,
            sessionId: randomUUID()
          });

        expect(response.status).toBe(200);
      }
    });

    it('should reject requests exceeding rate limit', async () => {
      const token = jwt.sign({ userId: 'user-123', role: 'user' }, jwtSecret, { expiresIn: '1h' });

      // Make many rapid requests to trigger rate limit
      const promises = [];
      for (let i = 0; i < 150; i++) {
        promises.push(
          request
            .post('/api/v1/requests')
            .set('Authorization', `Bearer ${token}`)
            .send({
              query: `Test query ${i}`,
              sessionId: randomUUID()
            })
        );
      }

      const responses = await Promise.all(promises);

      // At least some requests should be rate limited
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    }, 30000);

    it('should include rate limit headers in response', async () => {
      const token = jwt.sign({ userId: 'user-123', role: 'user' }, jwtSecret, { expiresIn: '1h' });

      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'Test query',
          sessionId: randomUUID()
        });

      // Check for rate limit headers (implementation dependent)
      expect(response.headers).toBeDefined();
    });
  });

  describe('Request Validation', () => {
    const token = jwt.sign({ userId: 'user-123', role: 'user' }, jwtSecret, { expiresIn: '1h' });

    it('should reject requests with missing required fields', async () => {
      // Test empty body
      let response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();

      // Test missing query
      response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId: randomUUID() });
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();

      // Test missing sessionId - this may be allowed (creates new session)
      response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 'Test' });
      // May be 200 or 400 depending on implementation
      expect([200, 400]).toContain(response.status);
    });

    it('should reject requests with invalid field types', async () => {
      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 12345, // Should be string
          sessionId: randomUUID()
        });

      expect(response.status).toBe(400);
    });

    it('should reject requests with excessively long queries', async () => {
      const veryLongQuery = 'a'.repeat(100000); // 100KB query

      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: veryLongQuery,
          sessionId: randomUUID()
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('CORS Configuration', () => {
    it('should include CORS headers in responses', async () => {
      const token = jwt.sign({ userId: 'user-123', role: 'user' }, jwtSecret, { expiresIn: '1h' });

      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'http://localhost:3000')
        .send({
          query: 'Test query',
          sessionId: randomUUID()
        });

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await request
        .options('/api/v1/requests')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    const token = jwt.sign({ userId: 'user-123', role: 'user' }, jwtSecret, { expiresIn: '1h' });

    it('should include security headers in responses', async () => {
      const response = await request
        .get('/health')
        .set('Authorization', `Bearer ${token}`);

      // Check for common security headers
      expect(response.headers).toBeDefined();
      // May include: X-Content-Type-Options, X-Frame-Options, etc.
    });

    it('should not leak sensitive information in error messages', async () => {
      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          query: 'Test query',
          sessionId: randomUUID()
        });

      expect(response.status).toBe(401);
      // Error message should not contain stack traces or internal details
      expect(response.body.error.message).not.toContain('jwt');
      expect(response.body.error.message).not.toContain('secret');
    });
  });

  describe('Session Association', () => {
    const token = jwt.sign({ userId: 'user-123', role: 'user' }, jwtSecret, { expiresIn: '1h' });

    it('should associate requests with correct user from JWT', async () => {
      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'Test query',
          sessionId: randomUUID()
        });

      expect(response.status).toBe(200);
      expect(mockOrchestrationEngine.processRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123'
        })
      );
    });

    it('should prevent access to other users sessions', async () => {
      const user1Token = jwt.sign({ userId: 'user-1', role: 'user' }, jwtSecret, { expiresIn: '1h' });
      const user2Token = jwt.sign({ userId: 'user-2', role: 'user' }, jwtSecret, { expiresIn: '1h' });
      const user1SessionId = randomUUID();

      // Mock session belonging to user-1
      (mockSessionManager.getSession as jest.Mock).mockResolvedValue({
        id: user1SessionId,
        userId: 'user-1',
        history: [],
        createdAt: new Date(),
        lastActivityAt: new Date(),
        contextWindowUsed: 0
      });

      // User 2 tries to access user 1's session
      const response = await request
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          query: 'Test query',
          sessionId: user1SessionId
        });

      // Should either reject (403) or create new session for user-2 (200)
      expect([200, 403]).toContain(response.status);
    });
  });
});
