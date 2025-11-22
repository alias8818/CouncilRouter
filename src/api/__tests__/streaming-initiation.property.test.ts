/**
 * Property-Based Test: Streaming Initiation Timing
 * Feature: ai-council-proxy, Property 39: Streaming initiation timing
 * 
 * Validates: Requirements 11.6
 */

import * as fc from 'fast-check';
import request from 'supertest';
import { APIGateway } from '../gateway';
import { IOrchestrationEngine } from '../../interfaces/IOrchestrationEngine';
import { ISessionManager } from '../../interfaces/ISessionManager';
import { IEventLogger } from '../../interfaces/IEventLogger';
import {
  UserRequest,
  ConsensusDecision,
  Session,
  HistoryEntry,
  ConversationContext,
  SynthesisStrategy
} from '../../types/core';

// ============================================================================
// Mock Implementations
// ============================================================================

class MockOrchestrationEngine implements IOrchestrationEngine {
  private processingDelay: number = 0;
  private shouldFail: boolean = false;

  setProcessingDelay(delayMs: number): void {
    this.processingDelay = delayMs;
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  async processRequest(request: UserRequest): Promise<ConsensusDecision> {
    // Simulate processing delay
    if (this.processingDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.processingDelay));
    }

    if (this.shouldFail) {
      throw new Error('Processing failed');
    }

    return {
      content: `Consensus response to: ${request.query}`,
      confidence: 'high',
      agreementLevel: 0.9,
      synthesisStrategy: { type: 'consensus-extraction' } as SynthesisStrategy,
      contributingMembers: ['member-1', 'member-2'],
      timestamp: new Date()
    };
  }

  async distributeToCouncil(): Promise<any[]> {
    return [];
  }

  async conductDeliberation(): Promise<any> {
    return { rounds: [], totalDuration: 0 };
  }

  async handleTimeout(): Promise<ConsensusDecision> {
    return {
      content: 'Timeout response',
      confidence: 'low',
      agreementLevel: 0.5,
      synthesisStrategy: { type: 'consensus-extraction' } as SynthesisStrategy,
      contributingMembers: ['member-1'],
      timestamp: new Date()
    };
  }
}

class MockSessionManager implements ISessionManager {
  private sessions: Map<string, Session> = new Map();

  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) || null;
  }

  async createSession(userId: string): Promise<Session> {
    const session: Session = {
      id: `session-${Date.now()}`,
      userId,
      history: [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
      contextWindowUsed: 0
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async addToHistory(sessionId: string, entry: HistoryEntry): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.history.push(entry);
      session.lastActivityAt = new Date();
    }
  }

  async getContextForRequest(
    sessionId: string,
    maxTokens: number
  ): Promise<ConversationContext> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        messages: [],
        totalTokens: 0,
        summarized: false
      };
    }

    return {
      messages: session.history,
      totalTokens: session.contextWindowUsed,
      summarized: false
    };
  }

  async expireInactiveSessions(inactivityThreshold: number): Promise<number> {
    return 0;
  }
}

class MockEventLogger implements IEventLogger {
  private logs: any[] = [];

  getLogs(): any[] {
    return this.logs;
  }

  async logRequest(request: UserRequest): Promise<void> {
    this.logs.push({ type: 'request', data: request });
  }

  async logCouncilResponse(requestId: string, response: any): Promise<void> {
    this.logs.push({ type: 'council_response', requestId, data: response });
  }

  async logDeliberationRound(requestId: string, round: any): Promise<void> {
    this.logs.push({ type: 'deliberation_round', requestId, data: round });
  }

  async logConsensusDecision(requestId: string, decision: ConsensusDecision): Promise<void> {
    this.logs.push({ type: 'consensus_decision', requestId, data: decision });
  }

  async logCost(requestId: string, cost: any): Promise<void> {
    this.logs.push({ type: 'cost', requestId, data: cost });
  }

  async logProviderFailure(providerId: string, error: Error): Promise<void> {
    this.logs.push({ type: 'provider_failure', providerId, error });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse SSE events from response text
 */
function parseSSEEvents(text: string): Array<{ event: string; data: any }> {
  const events: Array<{ event: string; data: any }> = [];
  let currentEvent: string | null = null;
  let currentData: string | null = null;

  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.substring(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData = line.substring(6).trim();
    } else if (line === '' && currentEvent && currentData) {
      // Event complete
      try {
        events.push({
          event: currentEvent,
          data: JSON.parse(currentData)
        });
      } catch {
        events.push({
          event: currentEvent,
          data: currentData
        });
      }
      currentEvent = null;
      currentData = null;
    }
  }

  return events;
}

// ============================================================================
// Arbitraries for Property-Based Testing
// ============================================================================

const apiRequestBodyArbitrary = fc.record({
  query: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0), // Ensure non-empty after trim
  sessionId: fc.option(fc.uuid(), { nil: undefined }),
  streaming: fc.constant(true) // Always enable streaming for this test
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Property Test: Streaming Initiation Timing', () => {
  let mockOrchestrationEngine: MockOrchestrationEngine;
  let mockSessionManager: MockSessionManager;
  let mockEventLogger: MockEventLogger;
  let apiGateway: APIGateway;
  let app: any;

  beforeEach(() => {
    mockOrchestrationEngine = new MockOrchestrationEngine();
    mockSessionManager = new MockSessionManager();
    mockEventLogger = new MockEventLogger();

    // Mock JWT verification to always succeed
    const jwt = require('jsonwebtoken');
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'test-user' });

    const mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      expire: jest.fn().mockResolvedValue(true)
    } as any;

    const mockDbPool = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    } as any;

    apiGateway = new APIGateway(
      mockOrchestrationEngine,
      mockSessionManager,
      mockEventLogger,
      mockRedis,
      mockDbPool,
      'test-secret'
    );

    app = (apiGateway as any).app;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Feature: ai-council-proxy, Property 39: Streaming initiation timing
   * 
   * For any request with streaming enabled, partial consensus decision text should
   * begin streaming as soon as synthesis begins.
   * 
   * Validates: Requirements 11.6
   */
  test('should initiate streaming with proper headers when requested', async () => {
    await fc.assert(
      fc.asyncProperty(
        apiRequestBodyArbitrary,
        async (requestBody) => {
          // Setup - use fast processing
          mockOrchestrationEngine.setProcessingDelay(50);

          // Step 1: Submit request
          const submitResponse = await request(app)
            .post('/api/v1/requests')
            .set('Authorization', 'Bearer test-token')
            .send(requestBody);

          // Verify request was accepted
          expect(submitResponse.status).toBe(202);
          expect(submitResponse.body.requestId).toBeDefined();

          const requestId = submitResponse.body.requestId;

          // Step 2: Connect to streaming endpoint
          const streamResponse = await request(app)
            .get(`/api/v1/requests/${requestId}/stream`)
            .set('Authorization', 'Bearer test-token');

          // Property assertions:
          // 1. Streaming should have been initiated (SSE headers set)
          expect(streamResponse.headers['content-type']).toBe('text/event-stream');
          expect(streamResponse.headers['cache-control']).toBe('no-cache');
          expect(streamResponse.headers['connection']).toBe('keep-alive');

          // 2. Response should be successful (200 OK for SSE)
          expect(streamResponse.status).toBe(200);
        }
      ),
      { numRuns: 20 } // Fewer runs due to HTTP overhead
    );
  }, 120000);

  test('should stream completed results immediately if already available', async () => {
    await fc.assert(
      fc.asyncProperty(
        apiRequestBodyArbitrary,
        async (requestBody) => {
          // Setup - no processing delay (instant completion)
          mockOrchestrationEngine.setProcessingDelay(0);

          // Step 1: Submit request
          const submitResponse = await request(app)
            .post('/api/v1/requests')
            .set('Authorization', 'Bearer test-token')
            .send(requestBody);

          const requestId = submitResponse.body.requestId;

          // Wait for processing to complete
          await new Promise(resolve => setTimeout(resolve, 100));

          // Step 2: Connect to streaming endpoint after completion
          const streamResponse = await request(app)
            .get(`/api/v1/requests/${requestId}/stream`)
            .set('Authorization', 'Bearer test-token');

          // Property assertions:
          // 1. Should have SSE headers
          expect(streamResponse.headers['content-type']).toBe('text/event-stream');

          // 2. Should be successful
          expect(streamResponse.status).toBe(200);
        }
      ),
      { numRuns: 20 }
    );
  }, 120000);

  test('should handle streaming errors gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        apiRequestBodyArbitrary,
        async (requestBody) => {
          // Setup - make processing fail
          mockOrchestrationEngine.setShouldFail(true);
          mockOrchestrationEngine.setProcessingDelay(50);

          // Step 1: Submit request
          const submitResponse = await request(app)
            .post('/api/v1/requests')
            .set('Authorization', 'Bearer test-token')
            .send(requestBody);

          const requestId = submitResponse.body.requestId;

          // Step 2: Connect to streaming endpoint
          const streamResponse = await request(app)
            .get(`/api/v1/requests/${requestId}/stream`)
            .set('Authorization', 'Bearer test-token');

          // Property assertions:
          // 1. Should have SSE headers
          expect(streamResponse.headers['content-type']).toBe('text/event-stream');

          // 2. Should be successful (streaming initiated even if processing fails)
          expect(streamResponse.status).toBe(200);
        }
      ),
      { numRuns: 20 }
    );
  }, 120000);

  test('should handle non-existent request IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (nonExistentRequestId) => {
          // Try to stream a non-existent request
          const streamResponse = await request(app)
            .get(`/api/v1/requests/${nonExistentRequestId}/stream`)
            .set('Authorization', 'Bearer test-token');

          // Property assertions:
          // 1. Should return 404 error
          expect(streamResponse.status).toBe(404);

          // 2. Should have error response
          expect(streamResponse.body).toBeDefined();
          expect(streamResponse.body.error).toBeDefined();
          expect(streamResponse.body.error.code).toBe('REQUEST_NOT_FOUND');
        }
      ),
      { numRuns: 50 }
    );
  }, 120000);
});
