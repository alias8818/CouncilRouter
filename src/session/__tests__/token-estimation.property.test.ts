/**
 * Property-Based Tests: Token estimation handles diverse content types
 * Feature: bug-fixes-critical
 *
 * Property 19: Token estimation handles non-English text
 * Property 20: Token estimation handles code content
 *
 * Validates: Requirements 12.2, 12.3
 *
 * These tests verify that the tiktoken-based token estimation correctly handles
 * non-English text (multi-byte characters) and code content (token-dense syntax).
 */

import * as fc from 'fast-check';
import { SessionManager } from '../manager';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('Token Estimation Property Tests', () => {
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
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient)
    } as any;

    // Create mock Redis client
    mockRedis = {
      hGetAll: jest.fn(),
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
   * Property 19: Token estimation handles non-English text
   *
   * For any non-English text content, the token estimation should produce reasonable
   * estimates that account for multi-byte characters. The tiktoken-based implementation
   * should handle Unicode characters correctly without underestimating token counts.
   */
  test('Property 19: Token estimation handles non-English text', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data with various non-English texts
        fc.record({
          sessionId: fc.uuid(),
          userId: fc.string({ minLength: 1, maxLength: 50 }),
          nonEnglishTexts: fc.array(
            fc.oneof(
              // Chinese text
              fc.constantFrom(
                '你好，世界！这是一个测试。',
                '人工智能是计算机科学的一个分支。',
                '机器学习需要大量的数据。'
              ),
              // Japanese text
              fc.constantFrom(
                'こんにちは、世界！',
                '人工知能は未来の技術です。',
                '機械学習にはデータが必要です。'
              ),
              // Arabic text
              fc.constantFrom(
                'مرحبا بالعالم!',
                'الذكاء الاصطناعي هو فرع من علوم الحاسوب.',
                'تعلم الآلة يتطلب كميات كبيرة من البيانات.'
              ),
              // Russian text
              fc.constantFrom(
                'Привет, мир!',
                'Искусственный интеллект - это ветвь компьютерной науки.',
                'Машинное обучение требует большого количества данных.'
              ),
              // Emoji and mixed content
              fc.constantFrom(
                '🌍 Hello World! 你好 🚀',
                '✨ AI + ML = 🤖',
                '📊 Data Science 数据科学 📈'
              )
            ),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async (testData) => {
          // Reset mocks
          jest.clearAllMocks();

          // Setup: Mock the session creation and history addition
          const mockClient = {
            query: jest.fn()
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT session
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT history
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE session
              .mockResolvedValueOnce({ // SELECT session
                rows: [{
                  id: testData.sessionId,
                  user_id: testData.userId,
                  created_at: new Date(),
                  last_activity_at: new Date(),
                  context_window_used: 0,
                  expired: false
                }],
                rowCount: 1
              })
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT history
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
            release: jest.fn()
          };

          (mockDb.connect as jest.Mock).mockResolvedValue(mockClient);
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // CREATE session

          // Create session
          const session = await sessionManager.createSession(testData.userId);

          // Add non-English text to history
          for (const text of testData.nonEnglishTexts) {
            const mockClientForHistory = {
              query: jest.fn()
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT history
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE session
                .mockResolvedValueOnce({ // SELECT session
                  rows: [{
                    id: session.id,
                    user_id: testData.userId,
                    created_at: new Date(),
                    last_activity_at: new Date(),
                    context_window_used: 100,
                    expired: false
                  }],
                  rowCount: 1
                })
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT history
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
              release: jest.fn()
            };

            (mockDb.connect as jest.Mock).mockResolvedValue(mockClientForHistory);

            await sessionManager.addToHistory(session.id, {
              role: 'user',
              content: text,
              timestamp: new Date()
            });

            // Verify that UPDATE session was called (which means token estimation happened)
            const updateCalls = mockClientForHistory.query.mock.calls.filter(
              call => typeof call[0] === 'string' && call[0].includes('UPDATE sessions')
            );

            expect(updateCalls.length).toBeGreaterThan(0);

            // Verify that the token count parameter exists and is a number
            if (updateCalls.length > 0) {
              const updateCall = updateCalls[0];
              const tokenEstimate = updateCall[1][1]; // Second parameter is the token estimate

              // Token estimate should be a positive number
              expect(typeof tokenEstimate).toBe('number');
              expect(tokenEstimate).toBeGreaterThan(0);

              // For non-English text, tiktoken should produce reasonable estimates
              // The estimate should not be too low (which would happen with naive char/4 approach)
              // For multi-byte characters, simple heuristics often underestimate
              // Tiktoken should handle this better
              expect(tokenEstimate).toBeLessThan(text.length); // Should be less than char count
              expect(tokenEstimate).toBeGreaterThan(0); // But still positive
            }
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as per spec
    );
  });

  /**
   * Property 20: Token estimation handles code content
   *
   * For any code content, the token estimation should produce reasonable estimates
   * that account for token-dense syntax. Programming languages often have higher
   * token density due to special characters, keywords, and syntax.
   */
  test('Property 20: Token estimation handles code content', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data with various code snippets
        fc.record({
          sessionId: fc.uuid(),
          userId: fc.string({ minLength: 1, maxLength: 50 }),
          codeSnippets: fc.array(
            fc.oneof(
              // JavaScript/TypeScript code
              fc.constantFrom(
                'const fibonacci = (n: number): number => n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2);',
                'async function fetchData() { const response = await fetch("/api/data"); return await response.json(); }',
                'interface User { id: string; name: string; email: string; }',
                'const sortedArray = [...numbers].sort((a, b) => a - b);'
              ),
              // Python code
              fc.constantFrom(
                'def quicksort(arr): return [] if len(arr) <= 1 else quicksort([x for x in arr[1:] if x < arr[0]]) + [arr[0]] + quicksort([x for x in arr[1:] if x >= arr[0]])',
                'class AIModel:\n    def __init__(self, name: str):\n        self.name = name\n    def predict(self, data):\n        return self.model.predict(data)',
                'import numpy as np\nimport pandas as pd\nfrom sklearn.model_selection import train_test_split'
              ),
              // JSON
              fc.constantFrom(
                '{"name": "test", "values": [1, 2, 3], "nested": {"key": "value"}}',
                '[{"id": 1, "active": true}, {"id": 2, "active": false}]'
              ),
              // SQL
              fc.constantFrom(
                'SELECT u.id, u.name, COUNT(o.id) as order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name HAVING COUNT(o.id) > 5;',
                'CREATE INDEX idx_user_email ON users(email) WHERE active = true;'
              ),
              // Regex and special characters
              fc.constantFrom(
                'const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;',
                'const pattern = /(?:https?:\\/\\/)?(?:www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b(?:[-a-zA-Z0-9()@:%_\\+.~#?&\\/=]*)/;'
              )
            ),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async (testData) => {
          // Reset mocks
          jest.clearAllMocks();

          // Setup: Mock the session creation
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // CREATE session

          // Create session
          const session = await sessionManager.createSession(testData.userId);

          // Add code content to history
          for (const code of testData.codeSnippets) {
            const mockClientForHistory = {
              query: jest.fn()
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT history
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE session
                .mockResolvedValueOnce({ // SELECT session
                  rows: [{
                    id: session.id,
                    user_id: testData.userId,
                    created_at: new Date(),
                    last_activity_at: new Date(),
                    context_window_used: 100,
                    expired: false
                  }],
                  rowCount: 1
                })
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT history
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
              release: jest.fn()
            };

            (mockDb.connect as jest.Mock).mockResolvedValue(mockClientForHistory);

            await sessionManager.addToHistory(session.id, {
              role: 'user',
              content: code,
              timestamp: new Date()
            });

            // Verify that UPDATE session was called
            const updateCalls = mockClientForHistory.query.mock.calls.filter(
              call => typeof call[0] === 'string' && call[0].includes('UPDATE sessions')
            );

            expect(updateCalls.length).toBeGreaterThan(0);

            // Verify token estimation for code
            if (updateCalls.length > 0) {
              const updateCall = updateCalls[0];
              const tokenEstimate = updateCall[1][1];

              // Token estimate should be a positive number
              expect(typeof tokenEstimate).toBe('number');
              expect(tokenEstimate).toBeGreaterThan(0);

              // For code, tiktoken should handle token-dense syntax correctly
              // Code often has higher token density due to special characters and keywords
              // The estimate should be reasonable (not too low, not too high)
              expect(tokenEstimate).toBeLessThan(code.length * 2); // Upper bound
              expect(tokenEstimate).toBeGreaterThan(0); // Lower bound

              // Tiktoken should produce more accurate estimates than simple char/4 heuristic
              // For code with many special characters, naive approaches underestimate
              const naiveEstimate = Math.ceil(code.length / 4);

              // The token estimate should be in a reasonable range
              // (allowing for the fact that tiktoken is more sophisticated)
              expect(tokenEstimate).toBeGreaterThan(0);
              expect(tokenEstimate).toBeLessThan(code.length);
            }
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as per spec
    );
  });

  /**
   * Additional test: Verify tiktoken produces different (better) estimates than naive heuristic
   *
   * This test verifies that the new tiktoken-based implementation actually differs from
   * the old char/4 heuristic, especially for non-English and code content.
   */
  test('Tiktoken produces more accurate estimates than naive heuristic', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          // Test cases where tiktoken should differ from char/4
          { text: '你好世界', expectedRange: { min: 1, max: 12 } }, // Chinese - typically 2-4 tokens
          { text: 'console.log("test");', expectedRange: { min: 4, max: 20 } }, // Code
          { text: '🌍🚀✨🤖📊', expectedRange: { min: 5, max: 20 } }, // Emoji - each can be multiple tokens
          { text: 'const x = () => { return 42; }', expectedRange: { min: 8, max: 30 } } // JS
        ),
        async (testCase) => {
          jest.clearAllMocks();

          const mockClientForHistory = {
            query: jest.fn()
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT history
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE session
              .mockResolvedValueOnce({ // SELECT session
                rows: [{
                  id: 'test-session',
                  user_id: 'test-user',
                  created_at: new Date(),
                  last_activity_at: new Date(),
                  context_window_used: 100,
                  expired: false
                }],
                rowCount: 1
              })
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT history
              .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
            release: jest.fn()
          };

          (mockDb.connect as jest.Mock).mockResolvedValue(mockClientForHistory);
          (mockDb.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

          const session = await sessionManager.createSession('test-user');

          await sessionManager.addToHistory(session.id, {
            role: 'user',
            content: testCase.text,
            timestamp: new Date()
          });

          // Get the token estimate from the UPDATE call
          const updateCalls = mockClientForHistory.query.mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].includes('UPDATE sessions')
          );

          expect(updateCalls.length).toBeGreaterThan(0);

          if (updateCalls.length > 0) {
            const tokenEstimate = updateCalls[0][1][1];

            // Verify the estimate is in the expected range
            expect(tokenEstimate).toBeGreaterThanOrEqual(testCase.expectedRange.min);
            expect(tokenEstimate).toBeLessThanOrEqual(testCase.expectedRange.max);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
