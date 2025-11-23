/**
 * API Gateway Tests
 * Comprehensive test suite for API Gateway error paths and edge cases
 */

import { APIGateway } from '../gateway';
import { IOrchestrationEngine } from '../../interfaces/IOrchestrationEngine';
import { ISessionManager } from '../../interfaces/ISessionManager';
import { IEventLogger } from '../../interfaces/IEventLogger';
import { IIdempotencyCache } from '../../interfaces/IIdempotencyCache';
import { ConsensusDecision } from '../../types/core';
import jwt from 'jsonwebtoken';

// Mock dependencies
const createMockOrchestrationEngine = (): jest.Mocked<IOrchestrationEngine> => ({
  submitRequest: jest.fn(),
  getStatus: jest.fn(),
  getResult: jest.fn()
} as any);

const createMockSessionManager = (): jest.Mocked<ISessionManager> => ({
  getSession: jest.fn(),
  createSession: jest.fn(),
  updateSession: jest.fn(),
  getContext: jest.fn()
} as any);

const createMockEventLogger = (): jest.Mocked<IEventLogger> => ({
  logEvent: jest.fn(),
  logRequest: jest.fn(),
  logResponse: jest.fn(),
  logError: jest.fn()
} as any);

const createMockRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn()
} as any);

const createMockDbPool = () => ({
  query: jest.fn(),
  end: jest.fn()
} as any);

const createMockIdempotencyCache = (): jest.Mocked<IIdempotencyCache> => ({
  checkKey: jest.fn(),
  cacheResult: jest.fn(),
  cacheError: jest.fn(),
  markInProgress: jest.fn(),
  waitForCompletion: jest.fn()
} as any);

describe('APIGateway - Error Paths and Edge Cases', () => {
  let gateway: APIGateway;
  let mockOrchestration: jest.Mocked<IOrchestrationEngine>;
  let mockSessionManager: jest.Mocked<ISessionManager>;
  let mockEventLogger: jest.Mocked<IEventLogger>;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockDbPool: ReturnType<typeof createMockDbPool>;
  let mockIdempotencyCache: jest.Mocked<IIdempotencyCache>;
  let jwtSecret: string;

  beforeEach(() => {
    mockOrchestration = createMockOrchestrationEngine();
    mockSessionManager = createMockSessionManager();
    mockEventLogger = createMockEventLogger();
    mockRedis = createMockRedis();
    mockDbPool = createMockDbPool();
    mockIdempotencyCache = createMockIdempotencyCache();
    jwtSecret = 'test-secret-key-12345';

    // Set test environment
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
  });

  describe('Constructor and Initialization', () => {
    it('should throw error if JWT_SECRET is missing in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      expect(() => {
        new APIGateway(
          mockOrchestration,
          mockSessionManager,
          mockEventLogger,
          mockRedis,
          mockDbPool
        );
      }).toThrow('JWT_SECRET environment variable is required in production');
    });

    it('should use environment JWT_SECRET if provided', () => {
      process.env.JWT_SECRET = 'env-secret-key';

      const gatewayInstance = new APIGateway(
        mockOrchestration,
        mockSessionManager,
        mockEventLogger,
        mockRedis,
        mockDbPool
      );

      expect(gatewayInstance).toBeDefined();
    });

    it('should warn and use default JWT_SECRET in development when not provided', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env.NODE_ENV = 'development';

      const gatewayInstance = new APIGateway(
        mockOrchestration,
        mockSessionManager,
        mockEventLogger,
        mockRedis,
        mockDbPool
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Using default JWT_SECRET')
      );
      expect(gatewayInstance).toBeDefined();

      consoleWarnSpy.mockRestore();
    });

    it('should use provided jwtSecret parameter', () => {
      const gatewayInstance = new APIGateway(
        mockOrchestration,
        mockSessionManager,
        mockEventLogger,
        mockRedis,
        mockDbPool,
        'custom-jwt-secret'
      );

      expect(gatewayInstance).toBeDefined();
    });

    it('should initialize with idempotency cache when provided', () => {
      const gatewayInstance = new APIGateway(
        mockOrchestration,
        mockSessionManager,
        mockEventLogger,
        mockRedis,
        mockDbPool,
        jwtSecret,
        mockIdempotencyCache
      );

      expect(gatewayInstance).toBeDefined();
    });
  });

  describe('Authentication Middleware', () => {
    beforeEach(() => {
      gateway = new APIGateway(
        mockOrchestration,
        mockSessionManager,
        mockEventLogger,
        mockRedis,
        mockDbPool,
        jwtSecret
      );
    });

    it('should reject requests without Authorization header', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: {},
        body: { query: 'test query' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(res.body.error.message).toContain('Authorization header is required');
    });

    it('should reject requests with empty Authorization header', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: '   ' },
        body: { query: 'test query' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should reject Bearer token with empty value', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: 'Bearer    ' },
        body: { query: 'test query' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_AUTH_FORMAT');
      expect(res.body.error.message).toContain('Bearer token cannot be empty');
    });

    it('should reject invalid JWT token', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: 'Bearer invalid-token-xyz' },
        body: { query: 'test query' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
      expect(res.body.error.message).toContain('Invalid or expired authentication token');
    });

    it('should reject expired JWT token', async () => {
      const expiredToken = jwt.sign(
        { userId: 'user-123' },
        jwtSecret,
        { expiresIn: '-1h' }
      );

      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${expiredToken}` },
        body: { query: 'test query' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject ApiKey with empty value', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: 'ApiKey    ' },
        body: { query: 'test query' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_AUTH_FORMAT');
      expect(res.body.error.message).toContain('API key cannot be empty');
    });

    it('should reject invalid authorization format', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: 'Basic somevalue' },
        body: { query: 'test query' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_AUTH_FORMAT');
      expect(res.body.error.message).toContain('Authorization header must be in format');
    });
  });

  describe('Request Validation Middleware', () => {
    let validToken: string;

    beforeEach(() => {
      gateway = new APIGateway(
        mockOrchestration,
        mockSessionManager,
        mockEventLogger,
        mockRedis,
        mockDbPool,
        jwtSecret
      );
      validToken = jwt.sign({ userId: 'user-123' }, jwtSecret);
    });

    it('should reject request without query field', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${validToken}` },
        body: {}
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
      expect(res.body.error.message).toContain('must include a "query" field');
    });

    it('should reject request with non-string query', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${validToken}` },
        body: { query: 123 }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });

    it('should reject empty query after sanitization', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${validToken}` },
        body: { query: '   \n\t   ' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMPTY_QUERY');
      expect(res.body.error.message).toContain('Query cannot be empty');
    });

    it('should reject query exceeding maximum length', async () => {
      const longQuery = 'a'.repeat(100001); // 100KB + 1
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${validToken}` },
        body: { query: longQuery }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QUERY_TOO_LONG');
      expect(res.body.error.message).toContain('exceeds maximum length');
    });

    it('should sanitize query by removing null bytes', async () => {
      mockOrchestration.submitRequest.mockResolvedValue({
        requestId: 'req-123',
        status: 'processing'
      });

      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${validToken}` },
        body: { query: 'test\x00query\x00with\x00nulls' }
      };

      const res = await makeRequest(gateway, req);

      // Should not fail validation
      expect(res.status).toBe(202);
    });

    it('should reject non-string sessionId', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${validToken}` },
        body: { query: 'test', sessionId: 12345 }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SESSION_ID');
      expect(res.body.error.message).toContain('must be a string');
    });

    it('should reject invalid UUID format for sessionId', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${validToken}` },
        body: { query: 'test', sessionId: 'not-a-uuid' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SESSION_ID');
      expect(res.body.error.message).toContain('must be a valid UUID');
    });

    it('should accept valid UUID for sessionId', async () => {
      mockOrchestration.submitRequest.mockResolvedValue({
        requestId: 'req-123',
        status: 'processing'
      });

      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${validToken}` },
        body: {
          query: 'test',
          sessionId: '550e8400-e29b-41d4-a716-446655440000'
        }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(202);
    });

    it('should reject non-boolean streaming flag', async () => {
      const req = {
        method: 'POST',
        url: '/api/v1/requests',
        headers: { authorization: `Bearer ${validToken}` },
        body: { query: 'test', streaming: 'true' }
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STREAMING_FLAG');
      expect(res.body.error.message).toContain('streaming must be a boolean');
    });
  });

  describe('Health Check Endpoint', () => {
    beforeEach(() => {
      gateway = new APIGateway(
        mockOrchestration,
        mockSessionManager,
        mockEventLogger,
        mockRedis,
        mockDbPool,
        jwtSecret
      );
    });

    it('should return healthy status', async () => {
      const req = {
        method: 'GET',
        url: '/health',
        headers: {},
        body: {}
      };

      const res = await makeRequest(gateway, req);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.timestamp).toBeDefined();
    });
  });
});

/**
 * Helper function to simulate HTTP requests to the gateway
 */
async function makeRequest(
  gateway: APIGateway,
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: any;
  }
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve) => {
    const app = (gateway as any).app;

    // Create mock request and response
    const req: any = {
      method: request.method,
      url: request.url,
      path: request.url.split('?')[0],
      headers: request.headers,
      body: request.body
    };

    const res: any = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        resolve({
          status: this.statusCode,
          body: this.body,
          headers: this.headers
        });
        return this;
      },
      setHeader(key: string, value: string) {
        this.headers[key] = value;
        return this;
      },
      write(chunk: any) {
        if (!this.body) this.body = '';
        this.body += chunk;
      },
      end(data?: any) {
        if (data) this.body = data;
        resolve({
          status: this.statusCode,
          body: this.body,
          headers: this.headers
        });
      }
    };

    // Find matching route and execute
    const routes = (app as any)._router.stack.filter((layer: any) => layer.route);

    for (const layer of routes) {
      const route = layer.route;
      if (route.path === req.path || matchPath(route.path, req.path)) {
        const methods = Object.keys(route.methods);
        if (methods.includes(req.method.toLowerCase())) {
          // Execute middleware chain
          let index = 0;
          const next = (err?: any) => {
            if (err) {
              // Error handling
              if (res.statusCode === 200) res.statusCode = 500;
              res.json({ error: { message: err.message } });
              return;
            }
            if (index < route.stack.length) {
              const middleware = route.stack[index++].handle;
              try {
                middleware(req, res, next);
              } catch (error: any) {
                next(error);
              }
            }
          };
          next();
          return;
        }
      }
    }

    // No route found
    res.status(404).json({ error: 'Not found' });
  });
}

/**
 * Helper to match Express-style route paths
 */
function matchPath(routePath: string, requestPath: string): boolean {
  const routeRegex = routePath.replace(/:(\w+)/g, '([^/]+)');
  const regex = new RegExp(`^${routeRegex}$`);
  return regex.test(requestPath);
}
