/**
 * Session Manager Property-Based Tests
 * Tests universal properties that should hold across all valid inputs
 */

import * as fc from 'fast-check';
import { SessionManager } from '../manager';
import { HistoryEntry } from '../../types/core';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('SessionManager Property-Based Tests', () => {
  let sessionManager: SessionManager;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      query: jest.fn()
    } as any;

    // Create mock Redis client
    mockRedis = {
      hGetAll: jest.fn(),
      hSet: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(1)
    } as any;

    sessionManager = new SessionManager(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * **Feature: ai-council-proxy, Property 25: Session history retrieval**
   * 
   * For any request with a valid session identifier, the system should retrieve 
   * and include the conversation history for that session.
   * 
   * **Validates: Requirements 8.2**
   */
  describe('Property 25: Session history retrieval', () => {
    it('should retrieve conversation history for any valid session', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random session data
          fc.record({
            sessionId: fc.uuid(),
            userId: fc.string({ minLength: 1, maxLength: 50 }),
            history: fc.array(
              fc.record({
                role: fc.constantFrom('user' as const, 'assistant' as const),
                content: fc.string({ minLength: 1, maxLength: 500 }),
                timestamp: fc.date(),
                requestId: fc.option(fc.uuid(), { nil: undefined })
              }),
              { minLength: 0, maxLength: 20 }
            ),
            createdAt: fc.date(),
            lastActivityAt: fc.date(),
            contextWindowUsed: fc.integer({ min: 0, max: 10000 })
          }),
          async (sessionData) => {
            // Reset mocks for each property test run
            jest.clearAllMocks();
            
            // Setup: Mock database to return session data
            (mockDb.query as jest.Mock)
              .mockResolvedValueOnce({
                rows: [{
                  id: sessionData.sessionId,
                  user_id: sessionData.userId,
                  created_at: sessionData.createdAt,
                  last_activity_at: sessionData.lastActivityAt,
                  context_window_used: sessionData.contextWindowUsed,
                  expired: false
                }],
                rowCount: 1
              })
              .mockResolvedValueOnce({
                rows: sessionData.history.map(entry => ({
                  role: entry.role,
                  content: entry.content,
                  request_id: entry.requestId || null,
                  created_at: entry.timestamp
                })),
                rowCount: sessionData.history.length
              });

            // Mock Redis cache miss
            (mockRedis.hGetAll as jest.Mock).mockResolvedValueOnce({});

            // Act: Retrieve the session
            const retrievedSession = await sessionManager.getSession(sessionData.sessionId);

            // Assert: Session should be retrieved with complete history
            expect(retrievedSession).not.toBeNull();
            expect(retrievedSession?.id).toBe(sessionData.sessionId);
            expect(retrievedSession?.userId).toBe(sessionData.userId);
            expect(retrievedSession?.history).toHaveLength(sessionData.history.length);
            
            // Verify all history entries are present
            retrievedSession?.history.forEach((entry, index) => {
              expect(entry.role).toBe(sessionData.history[index].role);
              expect(entry.content).toBe(sessionData.history[index].content);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-council-proxy, Property 28: Context window summarization**
   * 
   * For any session that exceeds the configured context window limit, older messages 
   * should be summarized to maintain context within token limits.
   * 
   * **Validates: Requirements 8.5**
   */
  describe('Property 28: Context window summarization', () => {
    it('should summarize older messages when context exceeds token limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate session with varying history sizes and token limits
          fc.record({
            sessionId: fc.uuid(),
            userId: fc.string({ minLength: 1, maxLength: 50 }),
            history: fc.array(
              fc.record({
                role: fc.constantFrom('user' as const, 'assistant' as const),
                content: fc.string({ minLength: 10, maxLength: 200 }),
                timestamp: fc.date()
              }),
              { minLength: 5, maxLength: 30 }
            ),
            maxTokens: fc.integer({ min: 10, max: 500 })
          }),
          async (testData) => {
            // Reset mocks for each property test run
            jest.clearAllMocks();
            
            // Calculate total tokens (rough estimate: content.length / 4)
            const totalTokens = testData.history.reduce(
              (sum, entry) => sum + Math.ceil(entry.content.length / 4),
              0
            );

            // Setup: Mock database to return session
            (mockDb.query as jest.Mock)
              .mockResolvedValueOnce({
                rows: [{
                  id: testData.sessionId,
                  user_id: testData.userId,
                  created_at: new Date(),
                  last_activity_at: new Date(),
                  context_window_used: totalTokens,
                  expired: false
                }],
                rowCount: 1
              })
              .mockResolvedValueOnce({
                rows: testData.history.map(entry => ({
                  role: entry.role,
                  content: entry.content,
                  request_id: null,
                  created_at: entry.timestamp
                })),
                rowCount: testData.history.length
              });

            // Mock Redis cache miss
            (mockRedis.hGetAll as jest.Mock).mockResolvedValueOnce({});

            // Act: Get context for request with token limit
            const context = await sessionManager.getContextForRequest(
              testData.sessionId,
              testData.maxTokens
            );

            // Assert: Context should respect token limits (with some tolerance for summary overhead)
            // The summary itself adds tokens, so we allow a small margin
            const tolerance = 50; // Allow up to 50 extra tokens for summary text
            expect(context.totalTokens).toBeLessThanOrEqual(testData.maxTokens + tolerance);

            // If original context strictly exceeded limit, it should be summarized
            if (totalTokens > testData.maxTokens) {
              expect(context.summarized).toBe(true);
              // Should have fewer or equal messages than original (edge case: all messages might fit with summary)
              expect(context.messages.length).toBeLessThanOrEqual(testData.history.length);
              // Should contain a summary marker
              const hasSummary = context.messages.some(
                msg => msg.content.includes('[Summary of earlier conversation')
              );
              expect(hasSummary).toBe(true);
            } else {
              // If within limits, should not be summarized
              expect(context.summarized).toBe(false);
              expect(context.messages.length).toBe(testData.history.length);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-council-proxy, Property 27: Response storage in history**
   * 
   * For any council member response, the response should be added to the session history.
   * 
   * **Validates: Requirements 8.4**
   */
  describe('Property 27: Response storage in history', () => {
    it('should store any response in session history', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random session and response data
          fc.record({
            sessionId: fc.uuid(),
            response: fc.record({
              role: fc.constantFrom('user' as const, 'assistant' as const),
              content: fc.string({ minLength: 1, maxLength: 500 }),
              timestamp: fc.date(),
              requestId: fc.option(fc.uuid(), { nil: undefined })
            })
          }),
          async (testData) => {
            // Reset mocks for each property test run
            jest.clearAllMocks();
            
            // Setup: Mock database insert and update
            (mockDb.query as jest.Mock).mockResolvedValue({
              rows: [],
              rowCount: 1
            });

            // Act: Add response to history
            await sessionManager.addToHistory(testData.sessionId, testData.response);

            // Assert: Database should be called at least twice (insert + update)
            expect(mockDb.query).toHaveBeenCalled();
            
            // Find the insert call
            const calls = (mockDb.query as jest.Mock).mock.calls;
            const insertCall = calls.find(call => call[0].includes('INSERT INTO session_history'));
            expect(insertCall).toBeDefined();
            
            // Verify the insert call contains correct data
            expect(insertCall[1]).toEqual(
              expect.arrayContaining([
                expect.any(String), // id (UUID)
                testData.sessionId,
                testData.response.role,
                testData.response.content,
                testData.response.requestId || null,
                testData.response.timestamp
              ])
            );
            
            // Find the update call
            const updateCall = calls.find(call => call[0].includes('UPDATE sessions'));
            expect(updateCall).toBeDefined();
            
            // Verify the update call contains session ID
            expect(updateCall[1]).toEqual(
              expect.arrayContaining([
                expect.any(Date), // last_activity_at
                expect.any(Number), // token estimate
                testData.sessionId
              ])
            );
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('should store multiple responses in order', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate session with multiple responses
          fc.record({
            sessionId: fc.uuid(),
            responses: fc.array(
              fc.record({
                role: fc.constantFrom('user' as const, 'assistant' as const),
                content: fc.string({ minLength: 1, maxLength: 200 }),
                timestamp: fc.date(),
                requestId: fc.option(fc.uuid(), { nil: undefined })
              }),
              { minLength: 2, maxLength: 10 }
            )
          }),
          async (testData) => {
            // Reset mocks for each property test run
            jest.clearAllMocks();
            
            // Setup: Mock database insert and update
            (mockDb.query as jest.Mock).mockResolvedValue({
              rows: [],
              rowCount: 1
            });

            // Act: Add all responses to history
            for (const response of testData.responses) {
              await sessionManager.addToHistory(testData.sessionId, response);
            }

            // Assert: Database should be called for each response
            expect(mockDb.query).toHaveBeenCalled();
            
            // Find all insert calls
            const calls = (mockDb.query as jest.Mock).mock.calls;
            const insertCalls = calls.filter(call => call[0].includes('INSERT INTO session_history'));
            
            // Should have one insert call per response
            expect(insertCalls.length).toBe(testData.responses.length);
            
            // Verify each response was inserted with correct data
            for (let i = 0; i < testData.responses.length; i++) {
              expect(insertCalls[i][1]).toEqual(
                expect.arrayContaining([
                  expect.any(String), // id
                  testData.sessionId,
                  testData.responses[i].role,
                  testData.responses[i].content,
                  testData.responses[i].requestId || null,
                  testData.responses[i].timestamp
                ])
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-council-proxy, Property 29: Session expiration detection**
   * 
   * For any session with age exceeding the configured inactivity timeout, 
   * the session should be marked as expired.
   * 
   * **Validates: Requirements 8.6**
   */
  describe('Property 29: Session expiration detection', () => {
    it('should expire sessions older than inactivity threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate sessions with varying last activity times
          fc.record({
            sessions: fc.array(
              fc.record({
                id: fc.uuid(),
                userId: fc.string({ minLength: 1, maxLength: 50 }),
                lastActivityAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
              }),
              { minLength: 1, maxLength: 10 }
            ),
            inactivityThresholdMs: fc.integer({ min: 3600000, max: 86400000 }) // 1 hour to 1 day
          }),
          async (testData) => {
            // Reset mocks for each property test run
            jest.clearAllMocks();
            
            const now = Date.now();
            const thresholdDate = new Date(now - testData.inactivityThresholdMs);

            // Determine which sessions should be expired
            const sessionsToExpire = testData.sessions.filter(
              session => session.lastActivityAt < thresholdDate
            );

            // Setup: Mock database to return expired sessions
            (mockDb.query as jest.Mock).mockResolvedValueOnce({
              rows: sessionsToExpire.map(s => ({ id: s.id })),
              rowCount: sessionsToExpire.length
            });

            // Act: Expire inactive sessions
            const expiredCount = await sessionManager.expireInactiveSessions(
              testData.inactivityThresholdMs
            );

            // Assert: Correct number of sessions should be expired
            expect(expiredCount).toBe(sessionsToExpire.length);

            // Verify database was called with correct threshold
            expect(mockDb.query).toHaveBeenCalledWith(
              expect.stringContaining('UPDATE sessions'),
              expect.arrayContaining([expect.any(Date)])
            );

            // Verify Redis cache was cleared for expired sessions
            expect(mockRedis.del).toHaveBeenCalledTimes(sessionsToExpire.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not expire sessions within inactivity threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sessionId: fc.uuid(),
            inactivityThresholdMs: fc.integer({ min: 3600000, max: 86400000 })
          }),
          async (testData) => {
            // Reset mocks for each property test run
            jest.clearAllMocks();
            
            // Create a session with recent activity (within threshold)
            const recentActivity = new Date(Date.now() - testData.inactivityThresholdMs / 2);

            // Setup: Mock database to return no expired sessions
            (mockDb.query as jest.Mock).mockResolvedValueOnce({
              rows: [],
              rowCount: 0
            });

            // Act: Expire inactive sessions
            const expiredCount = await sessionManager.expireInactiveSessions(
              testData.inactivityThresholdMs
            );

            // Assert: No sessions should be expired
            expect(expiredCount).toBe(0);
            expect(mockRedis.del).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
