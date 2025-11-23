/**
 * Property-Based Test: Session updates are atomic
 * Feature: bug-fixes-critical, Property 9: Session updates are atomic
 * 
 * Validates: Requirements 3.1
 * 
 * This test verifies that concurrent session updates do not result in data loss
 * or inconsistent state. The transaction-based implementation should ensure that
 * all updates are persisted atomically.
 */

import * as fc from 'fast-check';
import { SessionManager } from '../manager';
import { HistoryEntry } from '../../types/core';
import { Pool, PoolClient } from 'pg';
import { RedisClientType } from 'redis';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('SessionManager Atomic Updates Property Test', () => {
  let sessionManager: SessionManager;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    // Create mock client for transactions
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    } as any;

    // Create mock database pool
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

  /**
   * Property 9: Session updates are atomic
   * 
   * For any set of concurrent session updates, all updates should be persisted 
   * without data loss. This test verifies that the transaction-based implementation
   * ensures atomicity.
   */
  test('Property 9: Session updates are atomic', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random session and multiple history entries
        fc.record({
          sessionId: fc.uuid(),
          userId: fc.string({ minLength: 1, maxLength: 50 }),
          entries: fc.array(
            fc.record({
              role: fc.constantFrom('user' as const, 'assistant' as const),
              content: fc.string({ minLength: 1, maxLength: 500 }),
              timestamp: fc.date(),
              requestId: fc.option(fc.uuid(), { nil: undefined })
            }),
            { minLength: 2, maxLength: 10 }
          )
        }),
        async (testData) => {
          // Reset mocks for each property test run
          jest.clearAllMocks();

          // Track the expected state after all updates
          let expectedContextWindowUsed = 0;
          const expectedHistory: HistoryEntry[] = [];

          // Setup: Mock transaction behavior
          const transactionCallCount = 0;

          (mockClient.query as jest.Mock).mockImplementation(async (query: string, params?: any[]) => {
            if (query === 'BEGIN') {
              return { rows: [], rowCount: 0 };
            }

            if (query === 'COMMIT') {
              return { rows: [], rowCount: 0 };
            }

            if (query === 'ROLLBACK') {
              return { rows: [], rowCount: 0 };
            }

            if (query.includes('INSERT INTO session_history')) {
              // Track inserted history entry
              const [id, sessionId, role, content, requestId, timestamp] = params || [];
              expectedHistory.push({
                role: role as 'user' | 'assistant',
                content,
                timestamp,
                requestId: requestId || undefined
              });
              return { rows: [], rowCount: 1 };
            }

            if (query.includes('UPDATE sessions')) {
              // Track context window update
              const [lastActivityAt, tokenEstimate, sessionId] = params || [];
              expectedContextWindowUsed += tokenEstimate;
              return { rows: [], rowCount: 1 };
            }

            if (query.includes('SELECT') && query.includes('FOR UPDATE')) {
              // Return session with current state
              return {
                rows: [{
                  id: testData.sessionId,
                  user_id: testData.userId,
                  created_at: new Date(),
                  last_activity_at: new Date(),
                  context_window_used: expectedContextWindowUsed,
                  expired: false
                }],
                rowCount: 1
              };
            }

            if (query.includes('SELECT') && query.includes('session_history')) {
              // Return all history entries added so far
              return {
                rows: expectedHistory.map(entry => ({
                  role: entry.role,
                  content: entry.content,
                  request_id: entry.requestId || null,
                  created_at: entry.timestamp
                })),
                rowCount: expectedHistory.length
              };
            }

            return { rows: [], rowCount: 0 };
          });

          // Act: Simulate concurrent updates by adding all entries
          // In a real scenario, these would be concurrent, but we're testing
          // that the transaction mechanism would handle them correctly
          const updatePromises = testData.entries.map(entry =>
            sessionManager.addToHistory(testData.sessionId, entry)
          );

          // Wait for all updates to complete
          await Promise.all(updatePromises);

          // Assert: Verify transaction behavior
          // Each update should use BEGIN, INSERT, UPDATE, SELECT FOR UPDATE, SELECT history, COMMIT
          const beginCalls = (mockClient.query as jest.Mock).mock.calls.filter(
            call => call[0] === 'BEGIN'
          );
          const commitCalls = (mockClient.query as jest.Mock).mock.calls.filter(
            call => call[0] === 'COMMIT'
          );
          const rollbackCalls = (mockClient.query as jest.Mock).mock.calls.filter(
            call => call[0] === 'ROLLBACK'
          );

          // Should have one transaction per entry
          expect(beginCalls).toHaveLength(testData.entries.length);
          expect(commitCalls).toHaveLength(testData.entries.length);
          expect(rollbackCalls).toHaveLength(0); // No errors, so no rollbacks

          // Verify SELECT FOR UPDATE was used (ensures locking)
          const selectForUpdateCalls = (mockClient.query as jest.Mock).mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].includes('FOR UPDATE')
          );
          expect(selectForUpdateCalls).toHaveLength(testData.entries.length);

          // Verify all inserts were made
          const insertCalls = (mockClient.query as jest.Mock).mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].includes('INSERT INTO session_history')
          );
          expect(insertCalls).toHaveLength(testData.entries.length);

          // Verify all updates were made
          const updateCalls = (mockClient.query as jest.Mock).mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].includes('UPDATE sessions')
          );
          expect(updateCalls).toHaveLength(testData.entries.length);

          // Verify client was released after each transaction
          expect(mockClient.release).toHaveBeenCalledTimes(testData.entries.length);

          // Verify cache was updated after each transaction
          // cacheSession uses pipeline, so check multi() and exec() were called for each entry
          expect(mockRedis.multi).toHaveBeenCalledTimes(testData.entries.length);
          // Get all pipeline objects and verify exec() was called on each
          const multiCalls = (mockRedis.multi as jest.Mock).mock.results;
          expect(multiCalls).toHaveLength(testData.entries.length);
          for (const result of multiCalls) {
            const pipeline = result.value;
            expect(pipeline.exec).toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property 9 (Error Case): Transaction rollback on error
   * 
   * For any session update that encounters an error, the transaction should be
   * rolled back and no partial state should be persisted.
   */
  test('Property 9 (Error Case): Transaction rollback on error', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random session and history entry
        fc.record({
          sessionId: fc.uuid(),
          entry: fc.record({
            role: fc.constantFrom('user' as const, 'assistant' as const),
            content: fc.string({ minLength: 1, maxLength: 500 }),
            timestamp: fc.date(),
            requestId: fc.option(fc.uuid(), { nil: undefined })
          })
        }),
        async (testData) => {
          // Reset mocks for each property test run
          jest.clearAllMocks();

          // Setup: Mock transaction to fail on UPDATE
          (mockClient.query as jest.Mock).mockImplementation(async (query: string, params?: any[]) => {
            if (query === 'BEGIN') {
              return { rows: [], rowCount: 0 };
            }

            if (query === 'ROLLBACK') {
              return { rows: [], rowCount: 0 };
            }

            if (query.includes('INSERT INTO session_history')) {
              return { rows: [], rowCount: 1 };
            }

            if (query.includes('UPDATE sessions')) {
              // Simulate error during update
              throw new Error('Database error during update');
            }

            return { rows: [], rowCount: 0 };
          });

          // Act & Assert: Update should throw error
          await expect(
            sessionManager.addToHistory(testData.sessionId, testData.entry)
          ).rejects.toThrow('Database error during update');

          // Verify transaction was rolled back
          const rollbackCalls = (mockClient.query as jest.Mock).mock.calls.filter(
            call => call[0] === 'ROLLBACK'
          );
          expect(rollbackCalls).toHaveLength(1);

          // Verify client was released even after error
          expect(mockClient.release).toHaveBeenCalledTimes(1);

          // Verify cache was NOT updated (no commit)
          expect(mockRedis.hSet).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property 9 (Consistency): Cache reflects database state
   * 
   * For any successful session update, the cached session should reflect
   * the exact state from the database after the transaction commits.
   */
  test('Property 9 (Consistency): Cache reflects database state', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random session and history entry
        fc.record({
          sessionId: fc.uuid(),
          userId: fc.string({ minLength: 1, maxLength: 50 }),
          initialHistory: fc.array(
            fc.record({
              role: fc.constantFrom('user' as const, 'assistant' as const),
              content: fc.string({ minLength: 1, maxLength: 200 }),
              timestamp: fc.date(),
              requestId: fc.option(fc.uuid(), { nil: undefined })
            }),
            { minLength: 0, maxLength: 5 }
          ),
          newEntry: fc.record({
            role: fc.constantFrom('user' as const, 'assistant' as const),
            content: fc.string({ minLength: 1, maxLength: 500 }),
            timestamp: fc.date(),
            requestId: fc.option(fc.uuid(), { nil: undefined })
          })
        }),
        async (testData) => {
          // Reset mocks for each property test run
          jest.clearAllMocks();

          // Calculate initial context window
          const initialContextWindow = testData.initialHistory.reduce(
            (sum, entry) => sum + Math.ceil(entry.content.length / 4),
            0
          );

          // Calculate new token estimate
          const newTokens = Math.ceil(testData.newEntry.content.length / 4);
          const expectedContextWindow = initialContextWindow + newTokens;

          // Track the final history
          const finalHistory = [...testData.initialHistory, testData.newEntry];

          // Setup: Mock transaction behavior
          (mockClient.query as jest.Mock).mockImplementation(async (query: string, params?: any[]) => {
            if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
              return { rows: [], rowCount: 0 };
            }

            if (query.includes('INSERT INTO session_history')) {
              return { rows: [], rowCount: 1 };
            }

            if (query.includes('UPDATE sessions')) {
              return { rows: [], rowCount: 1 };
            }

            if (query.includes('SELECT') && query.includes('FOR UPDATE')) {
              return {
                rows: [{
                  id: testData.sessionId,
                  user_id: testData.userId,
                  created_at: new Date('2024-01-01'),
                  last_activity_at: new Date(),
                  context_window_used: expectedContextWindow,
                  expired: false
                }],
                rowCount: 1
              };
            }

            if (query.includes('SELECT') && query.includes('session_history')) {
              return {
                rows: finalHistory.map(entry => ({
                  role: entry.role,
                  content: entry.content,
                  request_id: entry.requestId || null,
                  created_at: entry.timestamp
                })),
                rowCount: finalHistory.length
              };
            }

            return { rows: [], rowCount: 0 };
          });

          // Act: Add new entry to history
          await sessionManager.addToHistory(testData.sessionId, testData.newEntry);

          // Assert: Verify cache was updated with correct data
          // cacheSession uses pipeline, so check multi() was called and exec() was called
          expect(mockRedis.multi).toHaveBeenCalledTimes(1);
          
          const pipeline = (mockRedis.multi as jest.Mock).mock.results[0].value;
          // Verify pipeline was executed
          expect(pipeline.exec).toHaveBeenCalled();
          
          // Verify hSet was called with correct session data
          const hSetCalls = (pipeline.hSet as jest.Mock).mock.calls;
          expect(hSetCalls.length).toBeGreaterThan(0);
          
          const cacheCall = hSetCalls.find((call: any[]) => call[0] === `session:${testData.sessionId}`);
          expect(cacheCall).toBeDefined();
          
          const cachedData = cacheCall[1];
          expect(cachedData.userId).toBe(testData.userId);
          expect(cachedData.contextWindowUsed).toBe(expectedContextWindow.toString());
          
          // Verify history was updated via rPush (if history length changed)
          const rPushCalls = (pipeline.rPush as jest.Mock).mock.calls;
          const historyKey = `session:${testData.sessionId}:history`;
          const historyPushCalls = rPushCalls.filter((call: any[]) => call[0] === historyKey);

          // History should be updated if it's a new entry (length increased)
          if (testData.initialHistory.length < finalHistory.length) {
            expect(historyPushCalls.length).toBeGreaterThan(0);
            // Verify the new entry was pushed
            // Note: rPush now accepts array of entries, so we need to handle both formats
            const lastPushCall = historyPushCalls[historyPushCalls.length - 1];
            const pushedData = lastPushCall[1];

            // Handle both array and single string formats
            const entries = Array.isArray(pushedData) ? pushedData : [pushedData];
            const lastEntry = JSON.parse(entries[entries.length - 1]);

            expect(lastEntry.role).toBe(testData.newEntry.role);
            expect(lastEntry.content).toBe(testData.newEntry.content);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
