/**
 * Property-Based Test: Per-Provider Configuration Support
 * Feature: ai-council-proxy, Property 36: Per-provider configuration support
 * 
 * For any provider or model, the system should accept and store different
 * timeout and retry values.
 * 
 * Validates: Requirements 10.6
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { ConfigurationManager } from '../manager';
import { CouncilConfig, CouncilMember, RetryPolicy } from '../../types/core';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

// Test database and Redis setup
let mockDb: jest.Mocked<Pool>;
let mockRedis: jest.Mocked<RedisClientType>;
let configManager: ConfigurationManager;

// Storage for simulating database persistence
let configStorage: Map<string, any> = new Map();

// Arbitraries for generating test data with diverse timeout and retry values
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

// Generate council configs where members have DIFFERENT timeout and retry values
const diverseCouncilConfigArbitrary = fc.record({
  members: fc.array(councilMemberArbitrary, { minLength: 2, maxLength: 10 }),
  minimumSize: fc.integer({ min: 1, max: 10 }),
  requireMinimumForConsensus: fc.boolean()
}).filter(config => {
  // Ensure minimum size is valid
  if (config.minimumSize > config.members.length) {
    return false;
  }
  
  // Ensure at least two members have different timeout values
  const timeouts = config.members.map(m => m.timeout);
  const uniqueTimeouts = new Set(timeouts);
  if (uniqueTimeouts.size < 2) {
    return false;
  }
  
  return true;
});

describe('Property Test: Per-Provider Configuration Support', () => {
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
   * Property 36: Per-provider configuration support
   * For any provider or model, the system should accept and store different
   * timeout and retry values.
   */
  test('should accept and preserve different timeout values per provider/model', async () => {
    await fc.assert(
      fc.asyncProperty(
        diverseCouncilConfigArbitrary,
        async (originalConfig) => {
          // Save the configuration with diverse timeout values
          await configManager.updateCouncilConfig(originalConfig);

          // Retrieve the configuration
          const retrievedConfig = await configManager.getCouncilConfig();

          // Property assertions:
          // 1. Each member should preserve its unique timeout value
          for (let i = 0; i < originalConfig.members.length; i++) {
            const originalMember = originalConfig.members[i];
            const retrievedMember = retrievedConfig.members[i];

            // Timeout should be preserved exactly
            expect(retrievedMember.timeout).toBe(originalMember.timeout);
          }

          // 2. Verify that different members can have different timeouts
          const retrievedTimeouts = retrievedConfig.members.map(m => m.timeout);
          const uniqueTimeouts = new Set(retrievedTimeouts);
          
          // Should have at least 2 different timeout values (as per filter)
          expect(uniqueTimeouts.size).toBeGreaterThanOrEqual(2);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  }, 120000);

  /**
   * Property: Per-provider retry policy support
   * Each provider/model should be able to have its own retry policy
   */
  test('should accept and preserve different retry policies per provider/model', async () => {
    await fc.assert(
      fc.asyncProperty(
        diverseCouncilConfigArbitrary,
        async (originalConfig) => {
          // Save the configuration
          await configManager.updateCouncilConfig(originalConfig);

          // Retrieve the configuration
          const retrievedConfig = await configManager.getCouncilConfig();

          // Property assertions:
          // Each member should preserve its unique retry policy
          for (let i = 0; i < originalConfig.members.length; i++) {
            const originalMember = originalConfig.members[i];
            const retrievedMember = retrievedConfig.members[i];

            // All retry policy fields should be preserved
            expect(retrievedMember.retryPolicy.maxAttempts).toBe(originalMember.retryPolicy.maxAttempts);
            expect(retrievedMember.retryPolicy.initialDelayMs).toBe(originalMember.retryPolicy.initialDelayMs);
            expect(retrievedMember.retryPolicy.maxDelayMs).toBe(originalMember.retryPolicy.maxDelayMs);
            expect(retrievedMember.retryPolicy.backoffMultiplier).toBe(originalMember.retryPolicy.backoffMultiplier);
            expect(retrievedMember.retryPolicy.retryableErrors).toEqual(originalMember.retryPolicy.retryableErrors);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property: Same provider with different models can have different configs
   * Multiple members from the same provider should be able to have different
   * timeout and retry configurations
   */
  test('should support different configs for same provider with different models', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('openai', 'anthropic', 'google'),
        fc.integer({ min: 10, max: 60 }),
        fc.integer({ min: 61, max: 120 }),
        retryPolicyArbitrary,
        retryPolicyArbitrary,
        async (provider, timeout1, timeout2, retryPolicy1, retryPolicy2) => {
          // Create a config with two members from the same provider but different configs
          const config: CouncilConfig = {
            members: [
              {
                id: `${provider}-model-1`,
                provider: provider,
                model: 'model-1',
                timeout: timeout1,
                retryPolicy: retryPolicy1
              },
              {
                id: `${provider}-model-2`,
                provider: provider,
                model: 'model-2',
                timeout: timeout2,
                retryPolicy: retryPolicy2
              }
            ],
            minimumSize: 2,
            requireMinimumForConsensus: false
          };

          // Save the configuration
          await configManager.updateCouncilConfig(config);

          // Retrieve the configuration
          const retrievedConfig = await configManager.getCouncilConfig();

          // Property assertions:
          // 1. Both members should be from the same provider
          expect(retrievedConfig.members[0].provider).toBe(provider);
          expect(retrievedConfig.members[1].provider).toBe(provider);

          // 2. But they should have different timeouts
          expect(retrievedConfig.members[0].timeout).toBe(timeout1);
          expect(retrievedConfig.members[1].timeout).toBe(timeout2);
          expect(retrievedConfig.members[0].timeout).not.toBe(retrievedConfig.members[1].timeout);

          // 3. And different retry policies
          expect(retrievedConfig.members[0].retryPolicy).toEqual(retryPolicy1);
          expect(retrievedConfig.members[1].retryPolicy).toEqual(retryPolicy2);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property: Configuration validation should accept diverse timeout values
   * The system should not reject configurations just because members have
   * different timeout values
   */
  test('should validate and accept configs with diverse timeout values', async () => {
    await fc.assert(
      fc.asyncProperty(
        diverseCouncilConfigArbitrary,
        async (config) => {
          // This should not throw an error
          await expect(
            configManager.updateCouncilConfig(config)
          ).resolves.not.toThrow();

          // Verify the config was actually saved
          const retrieved = await configManager.getCouncilConfig();
          expect(retrieved.members.length).toBe(config.members.length);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
