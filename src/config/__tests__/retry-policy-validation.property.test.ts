/**
 * Property-Based Test: Retry Policy Rejects Invalid maxAttempts
 * Feature: bug-fixes-critical, Property 14: Retry policy rejects invalid maxAttempts
 * 
 * Validates: Requirements 8.1
 * 
 * For any retry policy with maxAttempts <= 0, the Configuration Manager should
 * reject it with a validation error. Only positive values should be accepted.
 */

import * as fc from 'fast-check';
import { ConfigurationManager, ConfigurationValidationError } from '../manager';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { CouncilConfig, RetryPolicy } from '../../types/core';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('Property Test: Retry Policy Rejects Invalid maxAttempts', () => {
  let configManager: ConfigurationManager;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    // Create mock database pool
    mockDb = {
      query: jest.fn().mockImplementation(async (query: string) => {
        // Handle version query
        if (query.includes('COALESCE(MAX(version), 0)')) {
          return { rows: [{ max_version: 0 }], rowCount: 1 };
        }
        // Handle other queries
        return { rows: [], rowCount: 0 };
      })
    } as any;

    // Create mock Redis client
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    } as any;

    configManager = new ConfigurationManager(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Property 14: Retry policy rejects invalid maxAttempts
   * 
   * For any retry policy with maxAttempts <= 0, the Configuration Manager should
   * reject it with a ConfigurationValidationError.
   * 
   * Validates: Requirements 8.1
   */
  test('should reject retry policies with maxAttempts <= 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate invalid maxAttempts values (<= 0)
        fc.oneof(
          fc.integer({ min: -100, max: 0 }), // Negative and zero values
          fc.constant(0) // Explicitly test zero
        ),
        async (invalidMaxAttempts) => {
          // Create a retry policy with invalid maxAttempts
          const invalidRetryPolicy: RetryPolicy = {
            maxAttempts: invalidMaxAttempts,
            initialDelayMs: 1000,
            maxDelayMs: 5000,
            backoffMultiplier: 2.0,
            retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
          };

          // Create a council config with the invalid retry policy
          // Need at least 2 members for council config validation
          const invalidConfig: CouncilConfig = {
            members: [
              {
                id: 'test-member-1',
                provider: 'openai',
                model: 'gpt-4',
                timeout: 30,
                retryPolicy: invalidRetryPolicy
              },
              {
                id: 'test-member-2',
                provider: 'anthropic',
                model: 'claude-3',
                timeout: 30,
                retryPolicy: {
                  maxAttempts: 3,
                  initialDelayMs: 1000,
                  maxDelayMs: 5000,
                  backoffMultiplier: 2.0,
                  retryableErrors: ['RATE_LIMIT']
                }
              }
            ],
            minimumSize: 2,
            requireMinimumForConsensus: false
          };

          // Property assertions:
          // Should throw ConfigurationValidationError
          // Note: This test will fail until task 11 (implementation fix) is completed
          // Currently maxAttempts = 0 is accepted, but should be rejected
          await expect(
            configManager.updateCouncilConfig(invalidConfig)
          ).rejects.toThrow(ConfigurationValidationError);
          
          // Verify the error message mentions maxAttempts
          try {
            await configManager.updateCouncilConfig(invalidConfig);
          } catch (error) {
            expect(error).toBeInstanceOf(ConfigurationValidationError);
            const errorMessage = (error as ConfigurationValidationError).message;
            expect(errorMessage).toContain('maxAttempts');
            
            // After fix: error message should say "must be positive"
            // Before fix: error message says "must be non-negative"
            // We verify it mentions maxAttempts regardless
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Additional test: Verify valid maxAttempts are accepted
   */
  test('should accept retry policies with maxAttempts > 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid maxAttempts values (> 0)
        fc.integer({ min: 1, max: 100 }),
        async (validMaxAttempts) => {
          // Create a retry policy with valid maxAttempts
          const validRetryPolicy: RetryPolicy = {
            maxAttempts: validMaxAttempts,
            initialDelayMs: 1000,
            maxDelayMs: 5000,
            backoffMultiplier: 2.0,
            retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
          };

          // Create a council config with the valid retry policy
          // Need at least 2 members for council config validation
          const validConfig: CouncilConfig = {
            members: [
              {
                id: 'test-member-1',
                provider: 'openai',
                model: 'gpt-4',
                timeout: 30,
                retryPolicy: validRetryPolicy
              },
              {
                id: 'test-member-2',
                provider: 'anthropic',
                model: 'claude-3',
                timeout: 30,
                retryPolicy: {
                  maxAttempts: 3,
                  initialDelayMs: 1000,
                  maxDelayMs: 5000,
                  backoffMultiplier: 2.0,
                  retryableErrors: ['RATE_LIMIT']
                }
              }
            ],
            minimumSize: 2,
            requireMinimumForConsensus: false
          };

          // Property assertions:
          // Should NOT throw an error
          await expect(
            configManager.updateCouncilConfig(validConfig)
          ).resolves.not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Test specific edge cases: maxAttempts = 0 and maxAttempts < 0
   */
  test('should reject maxAttempts = 0', async () => {
    const invalidRetryPolicy: RetryPolicy = {
      maxAttempts: 0,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2.0,
      retryableErrors: ['RATE_LIMIT']
    };

    const invalidConfig: CouncilConfig = {
      members: [
        {
          id: 'test-member-1',
          provider: 'openai',
          model: 'gpt-4',
          timeout: 30,
          retryPolicy: invalidRetryPolicy
        },
        {
          id: 'test-member-2',
          provider: 'anthropic',
          model: 'claude-3',
          timeout: 30,
          retryPolicy: {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 5000,
            backoffMultiplier: 2.0,
            retryableErrors: ['RATE_LIMIT']
          }
        }
      ],
      minimumSize: 2,
      requireMinimumForConsensus: false
    };

    await expect(
      configManager.updateCouncilConfig(invalidConfig)
    ).rejects.toThrow(ConfigurationValidationError);
  });

  test('should reject maxAttempts < 0', async () => {
    const invalidRetryPolicy: RetryPolicy = {
      maxAttempts: -1,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2.0,
      retryableErrors: ['RATE_LIMIT']
    };

    const invalidConfig: CouncilConfig = {
      members: [
        {
          id: 'test-member-1',
          provider: 'openai',
          model: 'gpt-4',
          timeout: 30,
          retryPolicy: invalidRetryPolicy
        },
        {
          id: 'test-member-2',
          provider: 'anthropic',
          model: 'claude-3',
          timeout: 30,
          retryPolicy: {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 5000,
            backoffMultiplier: 2.0,
            retryableErrors: ['RATE_LIMIT']
          }
        }
      ],
      minimumSize: 2,
      requireMinimumForConsensus: false
    };

    await expect(
      configManager.updateCouncilConfig(invalidConfig)
    ).rejects.toThrow(ConfigurationValidationError);
  });
});

