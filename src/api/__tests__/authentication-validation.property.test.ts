/**
 * Property-Based Test: Authentication validation
 * Feature: ai-council-proxy, Property 19: Authentication validation
 * 
 * Validates: Requirements 6.4
 * 
 * Property: For any API request with invalid credentials, the system should reject the request before processing.
 */

import * as fc from 'fast-check';
import { APIGateway } from '../gateway';
import { IOrchestrationEngine } from '../../interfaces/IOrchestrationEngine';
import { ISessionManager } from '../../interfaces/ISessionManager';
import { IEventLogger } from '../../interfaces/IEventLogger';
import {
  UserRequest,
  ConsensusDecision,
  CouncilMember,
  InitialResponse,
  DeliberationThread,
  ProviderResponse,
  Session,
  HistoryEntry,
  ConversationContext
} from '../../types/core';

// Mock implementations
class MockOrchestrationEngine implements IOrchestrationEngine {
  async processRequest(request: UserRequest): Promise<ConsensusDecision> {
    return {
      content: 'Mock consensus',
      confidence: 'high',
      agreementLevel: 0.9,
      synthesisStrategy: { type: 'consensus-extraction' },
      contributingMembers: ['member1'],
      timestamp: new Date()
    };
  }

  async distributeToCouncil(
    request: UserRequest,
    councilMembers: CouncilMember[]
  ): Promise<InitialResponse[]> {
    return [];
  }

  async conductDeliberation(
    initialResponses: InitialResponse[],
    rounds: number
  ): Promise<DeliberationThread> {
    return { rounds: [], totalDuration: 0 };
  }

  async handleTimeout(
    partialResponses: ProviderResponse[]
  ): Promise<ConsensusDecision> {
    return {
      content: 'Timeout consensus',
      confidence: 'low',
      agreementLevel: 0.5,
      synthesisStrategy: { type: 'consensus-extraction' },
      contributingMembers: [],
      timestamp: new Date()
    };
  }
}

class MockSessionManager implements ISessionManager {
  async getSession(sessionId: string): Promise<Session | null> {
    return {
      id: sessionId,
      userId: 'test-user',
      history: [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
      contextWindowUsed: 0
    };
  }

  async createSession(userId: string): Promise<Session> {
    return {
      id: 'new-session-id',
      userId,
      history: [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
      contextWindowUsed: 0
    };
  }

  async addToHistory(sessionId: string, entry: HistoryEntry): Promise<void> {
    // No-op for mock
  }

  async getContextForRequest(
    sessionId: string,
    maxTokens: number
  ): Promise<ConversationContext> {
    return {
      messages: [],
      totalTokens: 0,
      summarized: false
    };
  }

  async expireInactiveSessions(inactivityThreshold: number): Promise<number> {
    return 0;
  }
}

class MockEventLogger implements IEventLogger {
  async logRequest(request: UserRequest): Promise<void> { }
  async logCouncilResponse(requestId: string, response: InitialResponse): Promise<void> { }
  async logDeliberationRound(requestId: string, round: any): Promise<void> { }
  async logConsensusDecision(requestId: string, decision: ConsensusDecision): Promise<void> { }
  async logCost(requestId: string, cost: any): Promise<void> { }
  async logProviderFailure(providerId: string, error: Error): Promise<void> { }
}

describe('Property 19: Authentication validation', () => {
  let gateway: APIGateway;
  let mockOrchestration: MockOrchestrationEngine;
  let mockSession: MockSessionManager;
  let mockLogger: MockEventLogger;
  let port: number;

  beforeAll(async () => {
    mockOrchestration = new MockOrchestrationEngine();
    mockSession = new MockSessionManager();
    mockLogger = new MockEventLogger();
    const mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      expire: jest.fn().mockResolvedValue(true)
    } as any;

    const mockDbPool = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    } as any;

    gateway = new APIGateway(mockOrchestration, mockSession, mockLogger, mockRedis, mockDbPool, 'test-secret');
    port = 3700; // Use different port from other tests
    await gateway.start(port);
  });

  afterAll(async () => {
    try {
      await gateway.stop();
    } catch (error) {
      // Ignore errors on stop
    }
  });

  test('Requests without authentication header should be rejected with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random query strings
        fc.string({ minLength: 1, maxLength: 200 }),

        async (query) => {
          // Make request without Authorization header
          const response = await fetch(`http://localhost:${port}/api/v1/requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
              // No Authorization header
            },
            body: JSON.stringify({ query })
          });

          // Should return 401 Unauthorized
          expect(response.status).toBe(401);

          const data = await response.json() as any;
          expect(data).toHaveProperty('error');
          expect(data.error.code).toBe('AUTHENTICATION_REQUIRED');
          expect(data.error.retryable).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  }, 120000);

  test('Requests with invalid Bearer token should be rejected with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random query strings
        fc.string({ minLength: 1, maxLength: 200 }),
        // Generate random invalid tokens
        fc.string({ minLength: 10, maxLength: 100 }),

        async (query, invalidToken) => {
          // Make request with invalid Bearer token
          const response = await fetch(`http://localhost:${port}/api/v1/requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${invalidToken}`
            },
            body: JSON.stringify({ query })
          });

          // Should return 401 Unauthorized
          expect(response.status).toBe(401);

          const data = await response.json() as any;
          expect(data).toHaveProperty('error');
          expect(data.error.code).toBe('INVALID_TOKEN');
          expect(data.error.retryable).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  }, 120000);

  test('Requests with malformed Authorization header should be rejected with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random query strings
        fc.string({ minLength: 1, maxLength: 200 }),
        // Generate random malformed auth headers (not starting with Bearer or ApiKey)
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.startsWith('Bearer ') && !s.startsWith('ApiKey ')),

        async (query, malformedAuth) => {
          // Make request with malformed Authorization header
          const response = await fetch(`http://localhost:${port}/api/v1/requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': malformedAuth
            },
            body: JSON.stringify({ query })
          });

          // Should return 401 Unauthorized
          expect(response.status).toBe(401);

          const data = await response.json() as any;
          expect(data).toHaveProperty('error');
          expect(data.error.code).toBe('INVALID_AUTH_FORMAT');
          expect(data.error.retryable).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  }, 120000);

  test('Requests with valid ApiKey should be accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random query strings (non-empty after trimming)
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        // Generate random API keys (non-empty after trimming, any non-empty string is valid in our mock)
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),

        async (query, apiKey) => {
          // Make request with valid ApiKey
          const response = await fetch(`http://localhost:${port}/api/v1/requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `ApiKey ${apiKey}`
            },
            body: JSON.stringify({ query })
          });

          if (response.status === 429) {
            // Rate limited - skip this test case
            return true;
          }

          // Handle validation errors (empty query after sanitization)
          if (response.status === 400) {
            // Query was rejected - skip this test case
            return true;
          }

          // Should return 202 Accepted (not 401)
          expect(response.status).toBe(202);

          const data = await response.json() as any;
          expect(data).toHaveProperty('requestId');
          expect(data.status).toBe('processing');
        }
      ),
      { numRuns: 10 } // Reduced to avoid rate limiting
    );
  }, 120000);

  test('GET requests without authentication should be rejected with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random UUIDs
        fc.uuid(),

        async (requestId) => {
          // Make GET request without Authorization header
          const response = await fetch(`http://localhost:${port}/api/v1/requests/${requestId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
              // No Authorization header
            }
          });

          // Should return 401 Unauthorized
          expect(response.status).toBe(401);

          const data = await response.json() as any;
          expect(data).toHaveProperty('error');
          expect(data.error.code).toBe('AUTHENTICATION_REQUIRED');
        }
      ),
      { numRuns: 20 }
    );
  }, 120000);
});
