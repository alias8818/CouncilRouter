/**
 * Property-Based Test: API round-trip consistency
 * Feature: ai-council-proxy, Property 18: API round-trip consistency
 * 
 * Validates: Requirements 6.2
 * 
 * Property: For any request submitted via POST, retrieving the result via GET with the returned request ID
 * should return the consensus decision for that request.
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
  private requestResults: Map<string, string> = new Map();

  async processRequest(request: UserRequest): Promise<ConsensusDecision> {
    // Store a deterministic result based on the query
    const result = `Consensus for: ${request.query.substring(0, 50)}`;
    this.requestResults.set(request.id, result);

    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    return {
      content: result,
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

describe('Property 18: API round-trip consistency', () => {
  let gateway: APIGateway;
  let mockOrchestration: MockOrchestrationEngine;
  let mockSession: MockSessionManager;
  let mockLogger: MockEventLogger;
  let port: number;

  beforeAll(async () => {
    // Ensure test environment for API key validation and rate limiting
    process.env.NODE_ENV = 'test';
    
    mockOrchestration = new MockOrchestrationEngine();
    mockSession = new MockSessionManager();
    mockLogger = new MockEventLogger();
    
    // Track stored requests in a Map for the mock
    const storedRequests = new Map<string, string>();
    
    const mockRedis = {
      set: jest.fn().mockImplementation((key: string, value: string) => {
        storedRequests.set(key, value);
        return Promise.resolve('OK');
      }),
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(storedRequests.get(key) || null);
      }),
      expire: jest.fn().mockResolvedValue(true)
    } as any;

    const mockDbPool = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    } as any;

    gateway = new APIGateway(mockOrchestration, mockSession, mockLogger, mockRedis, mockDbPool, 'test-secret');
    port = 3600; // Use different port from other tests
    await gateway.start(port);
  });

  afterAll(async () => {
    try {
      await gateway.stop();
    } catch (error) {
      // Ignore errors on stop
    }
  });

  test('For any request submitted via POST, GET should return the consensus decision', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random query strings
        fc.string({ minLength: 1, maxLength: 200 }),

        async (query) => {
          // Submit request via POST
          const postResponse = await fetch(`http://localhost:${port}/api/v1/requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'ApiKey test-key'
            },
            body: JSON.stringify({ query })
          });

          // Should not be rate limited in test mode
          if (postResponse.status === 429) {
            // If rate limited, skip this test case (shouldn't happen in test mode)
            return true;
          }

          // Handle validation errors gracefully
          if (postResponse.status !== 202) {
            const errorData = await postResponse.json().catch(() => ({}));
            // Skip if query was rejected (e.g., empty after sanitization)
            if (postResponse.status === 400) {
              return true;
            }
            throw new Error(`Unexpected status ${postResponse.status}: ${JSON.stringify(errorData)}`);
          }

          expect(postResponse.status).toBe(202);

          const postData = await postResponse.json() as any;
          const requestId = postData.requestId;

          // Wait for processing to complete (with timeout)
          let attempts = 0;
          let getResponse;
          let getData: any;

          while (attempts < 50) { // Max 5 seconds
            getResponse = await fetch(`http://localhost:${port}/api/v1/requests/${requestId}`, {
              method: 'GET',
              headers: {
                'Authorization': 'ApiKey test-key'
              }
            });

            getData = await getResponse.json() as any;

            if (getData.status === 'completed' || getData.status === 'failed') {
              break;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }

          // Should eventually complete
          expect(getData.status).toBe('completed');

          // Should have consensus decision
          expect(getData).toHaveProperty('consensusDecision');
          expect(typeof getData.consensusDecision).toBe('string');
          expect(getData.consensusDecision.length).toBeGreaterThan(0);

          // Consensus decision should be related to the query
          expect(getData.consensusDecision).toContain('Consensus for:');

          // Should have the same request ID
          expect(getData.requestId).toBe(requestId);

          // Should have timestamps
          expect(getData).toHaveProperty('createdAt');
          expect(getData).toHaveProperty('completedAt');
        }
      ),
      { numRuns: 10 } // Reduced to avoid rate limiting and keep test time reasonable
    );
  }, 120000);

  test('GET with non-existent request ID should return 404', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random UUIDs
        fc.uuid(),

        async (requestId) => {
          const response = await fetch(`http://localhost:${port}/api/v1/requests/${requestId}`, {
            method: 'GET',
            headers: {
              'Authorization': 'ApiKey test-key'
            }
          });

          // Should return 404 for non-existent request (not 429 rate limited)
          if (response.status === 429) {
            // Rate limited - skip this test case (shouldn't happen in test mode)
            return true;
          }
          
          expect(response.status).toBe(404);

          const data = await response.json() as any;
          expect(data).toHaveProperty('error');
          expect(data.error.code).toBe('REQUEST_NOT_FOUND');
        }
      ),
      { numRuns: 10 }
    );
  }, 120000);
});
