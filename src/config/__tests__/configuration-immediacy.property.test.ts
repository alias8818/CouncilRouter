/**
 * Property-Based Test: Configuration Immediacy
 * Feature: ai-council-proxy, Property 35: Configuration immediacy
 * 
 * For any timeout or retry setting modification, the new settings should apply
 * to all subsequent requests immediately.
 * 
 * Validates: Requirements 10.5
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { ConfigurationManager } from '../manager';
import { CouncilConfig, RetryPolicy } from '../../types/core';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

// Test database and Redis setup
let mockDb: jest.Mocked<Pool>;
let mockRedis: jest.Mocked<RedisClientType>;
let configManager: ConfigurationManager;

// Storage for simulating database persistence
let configStorage: Map<string, any> = new Map();

// Arbitraries for generating test data
const retryPolicyArbitrary = fc.record({
  maxAttempts: fc.integer({ min: 0, max: 10 }),
  initialDelayMs: fc.integer({ min: 100, max: 5000 }),
  maxDelayMs: fc.integer({ min: 1000, max: 30000 }),
  backoffMultiplier: fc.double({ min: 1.1, max: 5.0, noNaN: true }),
  retryableErrors: fc.array(
    fc.constantFrom('RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR'),
    { minLength: 1, maxLength: 4 }
  )
}).filter(policy => policy.maxDelayMs >= policy.initialDelayMs && !isNaN(policy.backoffMultiplier));

const councilMemberArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }).map(s => `member-${s}`),
  provider: fc.constantFrom('openai', 'anthropic', 'google'),
  model: fc.string({ minLength: 1, maxLength: 50 }),
  version: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  weight: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
  timeout: fc.integer({ min: 1, max: 300 }),
  retryPolicy: retryPolicyArbitrary
}).filter(member => member.weight === undefined || !isNaN(member.weight));

const councilConfigArbitrary = fc.record({
  members: fc.array(councilMemberArbitrary, { minLength: 2, maxLength: 10 }),
  minimumSize: fc.integer({ min: 1, max: 10 }),
  requireMinimumForConsensus: fc.boolean()
}).filter(config => config.minimumSize <= config.members.length);

describe('Property Test: Configuration Immediacy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset storage
    configStorage.clear();
    
    // Create mock database with simulated persistence
    mockDb = {
      query: jest.fn().mockImplementation((sql: string, params?: any[]) => {
        // Simulate INSERT
        if (sql.includes('INSERT INTO configurations')) {
          const configData = params?.[0];
          const version = params?.[1];
          
          // Extract config_type from the SQL or use 'council' as default
          const configType = 'council';
          
          configStorage.set(configType, {
            config_data: configData,
            version: version,
            active: true
          });
          
          return Promise.resolve({ rows: [], rowCount: 1 });
        }
        
        // Simulate SELECT for version
        if (sql.includes('MAX(version)')) {
          const configType = 'council';
          const stored = configStorage.get(configType);
          return Promise.resolve({
            rows: [{ max_version: stored?.version || 0 }],
            rowCount: 1
          });
        }
        
        // Simulate SELECT for active config
        if (sql.includes('SELECT config_data FROM configurations')) {
          const configType = 'council';
          const stored = configStorage.get(configType);
          
          if (stored) {
            return Promise.resolve({
              rows: [{ config_data: stored.config_data }],
              rowCount: 1
            });
          }
          
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        
        // Simulate UPDATE (deactivate old configs)
        if (sql.includes('UPDATE configurations')) {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        
        return Promise.resolve({ rows: [], rowCount: 0 });
      })
    } as any;

    // Create mock Redis client with simulated caching
    const redisCache = new Map<string, string>();
    
    mockRedis = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(redisCache.get(key) || null);
      }),
      set: jest.fn().mockImplementation((key: string, value: string) => {
        redisCache.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn().mockImplementation((key: string) => {
        redisCache.delete(key);
        return Promise.resolve(1);
      })
    } as any;

    configManager = new ConfigurationManager(mockDb, mockRedis);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Property 35: Configuration immediacy
   * For any timeout or retry setting modification, the new settings should apply
   * to all subsequent requests immediately.
   */
  test('should apply modified timeout settings to subsequent requests immediately', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilConfigArbitrary,
        councilConfigArbitrary,
        async (initialConfig, modifiedConfig) => {
          // Save initial configuration
          await configManager.updateCouncilConfig(initialConfig);

          // Retrieve initial configuration (simulating a "request")
          const retrievedInitial = await configManager.getCouncilConfig();

          // Verify initial configuration is active
          expect(retrievedInitial.members[0].timeout).toBe(initialConfig.members[0].timeout);
          expect(retrievedInitial.members[0].retryPolicy.maxAttempts).toBe(
            initialConfig.members[0].retryPolicy.maxAttempts
          );

          // Modify configuration (change timeout and retry settings)
          await configManager.updateCouncilConfig(modifiedConfig);

          // Retrieve configuration immediately after modification (simulating next "request")
          const retrievedModified = await configManager.getCouncilConfig();

          // Property assertions:
          // 1. Modified timeout should be applied immediately (matches modified config exactly)
          expect(retrievedModified.members[0].timeout).toBe(modifiedConfig.members[0].timeout);

          // 2. Modified retry policy should be applied immediately
          expect(retrievedModified.members[0].retryPolicy.maxAttempts).toBe(
            modifiedConfig.members[0].retryPolicy.maxAttempts
          );
          expect(retrievedModified.members[0].retryPolicy.initialDelayMs).toBe(
            modifiedConfig.members[0].retryPolicy.initialDelayMs
          );
          expect(retrievedModified.members[0].retryPolicy.maxDelayMs).toBe(
            modifiedConfig.members[0].retryPolicy.maxDelayMs
          );
          expect(retrievedModified.members[0].retryPolicy.backoffMultiplier).toBe(
            modifiedConfig.members[0].retryPolicy.backoffMultiplier
          );

          // 3. All members should have updated settings
          for (let i = 0; i < modifiedConfig.members.length; i++) {
            expect(retrievedModified.members[i].timeout).toBe(modifiedConfig.members[i].timeout);
            expect(retrievedModified.members[i].retryPolicy.maxAttempts).toBe(
              modifiedConfig.members[i].retryPolicy.maxAttempts
            );
          }

          // 4. The retrieved config should match the modified config, not the initial config
          // This ensures the update was applied immediately
          expect(retrievedModified.members.length).toBe(modifiedConfig.members.length);
          expect(retrievedModified.minimumSize).toBe(modifiedConfig.minimumSize);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  }, 120000); // Increase test timeout to accommodate property testing

  /**
   * Additional property: Multiple consecutive modifications should each apply immediately
   * This validates that there's no delay or batching of configuration updates
   */
  test('should apply each modification immediately in sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(councilConfigArbitrary, { minLength: 3, maxLength: 5 }),
        async (configs) => {
          // Apply each configuration in sequence and verify it's immediately active
          for (let i = 0; i < configs.length; i++) {
            const config = configs[i];

            // Save configuration
            await configManager.updateCouncilConfig(config);

            // Immediately retrieve and verify it's active
            const retrieved = await configManager.getCouncilConfig();

            // Property assertions:
            // The retrieved config should match the just-saved config
            expect(retrieved.members[0].timeout).toBe(config.members[0].timeout);
            expect(retrieved.members[0].retryPolicy.maxAttempts).toBe(
              config.members[0].retryPolicy.maxAttempts
            );
            expect(retrieved.members[0].retryPolicy.initialDelayMs).toBe(
              config.members[0].retryPolicy.initialDelayMs
            );

            // If there was a previous config, verify it's different (unless by chance they're the same)
            if (i > 0) {
              const previousConfig = configs[i - 1];
              // At least one setting should be different to ensure we're testing actual changes
              const hasChange = 
                retrieved.members[0].timeout !== previousConfig.members[0].timeout ||
                retrieved.members[0].retryPolicy.maxAttempts !== previousConfig.members[0].retryPolicy.maxAttempts ||
                retrieved.members[0].retryPolicy.initialDelayMs !== previousConfig.members[0].retryPolicy.initialDelayMs;

              // If there's a change, verify the new values are from the current config, not previous
              if (hasChange) {
                expect(retrieved.members[0].timeout).toBe(config.members[0].timeout);
              }
            }
          }
        }
      ),
      { numRuns: 50 } // Fewer runs since this tests multiple configs per run
    );
  }, 180000); // Longer timeout for multiple operations

  /**
   * Additional property: Cache invalidation ensures immediate application
   * This validates that cache is properly invalidated on configuration updates
   */
  test('should invalidate cache on modification to ensure immediate application', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilConfigArbitrary,
        councilConfigArbitrary,
        async (initialConfig, modifiedConfig) => {
          // Save initial configuration
          await configManager.updateCouncilConfig(initialConfig);

          // Retrieve to populate cache
          await configManager.getCouncilConfig();

          // Verify cache was populated (Redis set should have been called)
          expect(mockRedis.set).toHaveBeenCalled();

          // Clear mock call history
          (mockRedis.del as jest.Mock).mockClear();

          // Modify configuration
          await configManager.updateCouncilConfig(modifiedConfig);

          // Property assertion:
          // Cache should have been invalidated (del should have been called)
          expect(mockRedis.del).toHaveBeenCalledWith('config:council');

          // Retrieve configuration - should get modified version from database, not cache
          const retrieved = await configManager.getCouncilConfig();

          // Verify we got the modified configuration
          expect(retrieved.members[0].timeout).toBe(modifiedConfig.members[0].timeout);
          expect(retrieved.members[0].retryPolicy.maxAttempts).toBe(
            modifiedConfig.members[0].retryPolicy.maxAttempts
          );
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Additional property: Timeout-only modifications apply immediately
   * This validates that changing just timeout (not retry policy) works correctly
   */
  test('should apply timeout-only modifications immediately', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilConfigArbitrary,
        fc.integer({ min: 1, max: 300 }),
        async (initialConfig, newTimeout) => {
          // Save initial configuration
          await configManager.updateCouncilConfig(initialConfig);

          // Create modified config with only timeout changed
          const modifiedConfig: CouncilConfig = {
            ...initialConfig,
            members: initialConfig.members.map(member => ({
              ...member,
              timeout: newTimeout
            }))
          };

          // Modify configuration
          await configManager.updateCouncilConfig(modifiedConfig);

          // Retrieve immediately
          const retrieved = await configManager.getCouncilConfig();

          // Property assertions:
          // All members should have the new timeout
          for (const member of retrieved.members) {
            expect(member.timeout).toBe(newTimeout);
          }

          // Retry policies should remain unchanged
          for (let i = 0; i < retrieved.members.length; i++) {
            expect(retrieved.members[i].retryPolicy.maxAttempts).toBe(
              initialConfig.members[i].retryPolicy.maxAttempts
            );
            expect(retrieved.members[i].retryPolicy.initialDelayMs).toBe(
              initialConfig.members[i].retryPolicy.initialDelayMs
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Additional property: Retry-policy-only modifications apply immediately
   * This validates that changing just retry policy (not timeout) works correctly
   */
  test('should apply retry-policy-only modifications immediately', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilConfigArbitrary,
        retryPolicyArbitrary,
        async (initialConfig, newRetryPolicy) => {
          // Save initial configuration
          await configManager.updateCouncilConfig(initialConfig);

          // Store original timeouts
          const originalTimeouts = initialConfig.members.map(m => m.timeout);

          // Create modified config with only retry policy changed
          const modifiedConfig: CouncilConfig = {
            ...initialConfig,
            members: initialConfig.members.map(member => ({
              ...member,
              retryPolicy: newRetryPolicy
            }))
          };

          // Modify configuration
          await configManager.updateCouncilConfig(modifiedConfig);

          // Retrieve immediately
          const retrieved = await configManager.getCouncilConfig();

          // Property assertions:
          // All members should have the new retry policy
          for (const member of retrieved.members) {
            expect(member.retryPolicy.maxAttempts).toBe(newRetryPolicy.maxAttempts);
            expect(member.retryPolicy.initialDelayMs).toBe(newRetryPolicy.initialDelayMs);
            expect(member.retryPolicy.maxDelayMs).toBe(newRetryPolicy.maxDelayMs);
            expect(member.retryPolicy.backoffMultiplier).toBe(newRetryPolicy.backoffMultiplier);
          }

          // Timeouts should remain unchanged
          for (let i = 0; i < retrieved.members.length; i++) {
            expect(retrieved.members[i].timeout).toBe(originalTimeouts[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
