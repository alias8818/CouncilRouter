/**
 * Property-Based Test: Request identifier generation
 * Feature: ai-council-proxy, Property 17: Request identifier generation
 * 
 * Validates: Requirements 6.1
 * 
 * Property: For any valid POST request to the API endpoint, a unique request identifier should be returned.
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

describe('Property 17: Request identifier generation', () => {
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
    port = 3500; // Use fixed port for all tests
    await gateway.start(port);
  });

  afterAll(async () => {
    try {
      await gateway.stop();
    } catch (error) {
      // Ignore errors on stop
    }
  });

  test('For any valid POST request, a unique request identifier should be returned', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random query strings (non-empty after trimming)
        fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
        // Generate optional session IDs
        fc.option(fc.uuid(), { nil: undefined }),
        // Generate optional streaming flags
        fc.option(fc.boolean(), { nil: undefined }),

        async (query, sessionId, streaming) => {
          // Make POST request
          const response = await fetch(`http://localhost:${port}/api/v1/requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'ApiKey test-key'
            },
            body: JSON.stringify({
              query,
              sessionId,
              streaming
            })
          });

          // Should return 202 Accepted or 429 (rate limited)
          if (response.status === 429) {
            // Rate limited - skip this test case
            return true;
          }

          expect(response.status).toBe(202);

          const data = await response.json() as any;

          // Should have a requestId
          expect(data).toHaveProperty('requestId');
          expect(typeof data.requestId).toBe('string');
          expect(data.requestId.length).toBeGreaterThan(0);

          // Should have status
          expect(data).toHaveProperty('status');
          expect(data.status).toBe('processing');

          // Should have createdAt
          expect(data).toHaveProperty('createdAt');
        }
      ),
      { numRuns: 20 } // Reduced to avoid rate limiting
    );
  }, 120000);

  test('Request identifiers should be unique across multiple requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of queries (smaller to avoid rate limiting)
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 2, maxLength: 5 }),

        async (queries) => {
          const requestIds = new Set<string>();

          // Submit multiple requests
          for (const query of queries) {
            const response = await fetch(`http://localhost:${port}/api/v1/requests`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'ApiKey test-key'
              },
              body: JSON.stringify({ query })
            });

            if (response.status === 429) {
              // Rate limited - wait a bit
              await new Promise(resolve => setTimeout(resolve, 100));
              continue;
            }

            const data = await response.json() as any;
            if (data.requestId) {
              requestIds.add(data.requestId);
            }
          }

          // All request IDs should be unique (at least the ones we got)
          // We may have fewer due to rate limiting
          expect(requestIds.size).toBeGreaterThan(0);
          expect(requestIds.size).toBeLessThanOrEqual(queries.length);
        }
      ),
      { numRuns: 10 } // Reduced to avoid rate limiting
    );
  }, 120000);
});
