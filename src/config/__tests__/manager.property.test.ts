/**
 * Property-Based Test: Configuration Persistence Round-Trip
 * Feature: ai-council-proxy, Property 4: Configuration persistence round-trip
 * 
 * For any valid council configuration, saving then retrieving the configuration
 * should produce an equivalent configuration.
 * 
 * Validates: Requirements 2.3
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
const configStorage: Map<string, any> = new Map();

// Arbitraries for generating test data
const retryPolicyArbitrary = fc.record({
  maxAttempts: fc.integer({ min: 1, max: 10 }),
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

describe('Property Test: Configuration Persistence Round-Trip', () => {
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
   * Property 4: Configuration persistence round-trip
   * For any valid council configuration, saving then retrieving the configuration
   * should produce an equivalent configuration.
   */
  test('should preserve configuration through save and retrieve cycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilConfigArbitrary,
        async (originalConfig) => {
          // Save the configuration
          await configManager.updateCouncilConfig(originalConfig);

          // Retrieve the configuration
          const retrievedConfig = await configManager.getCouncilConfig();

          // Property assertions:
          // 1. Retrieved config should have same number of members
          expect(retrievedConfig.members).toHaveLength(originalConfig.members.length);

          // 2. Retrieved config should have same minimumSize
          expect(retrievedConfig.minimumSize).toBe(originalConfig.minimumSize);

          // 3. Retrieved config should have same requireMinimumForConsensus
          expect(retrievedConfig.requireMinimumForConsensus).toBe(originalConfig.requireMinimumForConsensus);

          // 4. Each member should be preserved correctly
          for (let i = 0; i < originalConfig.members.length; i++) {
            const originalMember = originalConfig.members[i];
            const retrievedMember = retrievedConfig.members[i];

            expect(retrievedMember.id).toBe(originalMember.id);
            expect(retrievedMember.provider).toBe(originalMember.provider);
            expect(retrievedMember.model).toBe(originalMember.model);
            expect(retrievedMember.version).toBe(originalMember.version);
            expect(retrievedMember.weight).toBe(originalMember.weight);
            expect(retrievedMember.timeout).toBe(originalMember.timeout);

            // 5. Retry policy should be preserved
            expect(retrievedMember.retryPolicy.maxAttempts).toBe(originalMember.retryPolicy.maxAttempts);
            expect(retrievedMember.retryPolicy.initialDelayMs).toBe(originalMember.retryPolicy.initialDelayMs);
            expect(retrievedMember.retryPolicy.maxDelayMs).toBe(originalMember.retryPolicy.maxDelayMs);
            expect(retrievedMember.retryPolicy.backoffMultiplier).toBe(originalMember.retryPolicy.backoffMultiplier);
            expect(retrievedMember.retryPolicy.retryableErrors).toEqual(originalMember.retryPolicy.retryableErrors);
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  }, 120000); // Increase test timeout to accommodate property testing

  /**
   * Additional property: Configuration should be retrievable from cache after first retrieval
   * This validates that caching works correctly
   */
  test('should retrieve same configuration from cache on second call', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilConfigArbitrary,
        async (originalConfig) => {
          // Save the configuration
          await configManager.updateCouncilConfig(originalConfig);

          // First retrieval (from database)
          const firstRetrieval = await configManager.getCouncilConfig();

          // Second retrieval (should be from cache)
          const secondRetrieval = await configManager.getCouncilConfig();

          // Property assertions:
          // Both retrievals should be identical
          expect(secondRetrieval.members).toHaveLength(firstRetrieval.members.length);
          expect(secondRetrieval.minimumSize).toBe(firstRetrieval.minimumSize);
          expect(secondRetrieval.requireMinimumForConsensus).toBe(firstRetrieval.requireMinimumForConsensus);

          // Members should be identical
          for (let i = 0; i < firstRetrieval.members.length; i++) {
            expect(secondRetrieval.members[i]).toEqual(firstRetrieval.members[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Additional property: Multiple save-retrieve cycles should preserve configuration
   * This validates that versioning doesn't corrupt data
   */
  test('should preserve configuration through multiple save-retrieve cycles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(councilConfigArbitrary, { minLength: 2, maxLength: 5 }),
        async (configs) => {
          const lastSavedConfig = configs[configs.length - 1];

          // Save all configurations in sequence
          for (const config of configs) {
            await configManager.updateCouncilConfig(config);
          }

          // Retrieve the configuration (should be the last one saved)
          const retrievedConfig = await configManager.getCouncilConfig();

          // Property assertions:
          // Retrieved config should match the last saved config
          expect(retrievedConfig.members).toHaveLength(lastSavedConfig.members.length);
          expect(retrievedConfig.minimumSize).toBe(lastSavedConfig.minimumSize);
          expect(retrievedConfig.requireMinimumForConsensus).toBe(lastSavedConfig.requireMinimumForConsensus);

          // Each member should match
          for (let i = 0; i < lastSavedConfig.members.length; i++) {
            const lastMember = lastSavedConfig.members[i];
            const retrievedMember = retrievedConfig.members[i];

            expect(retrievedMember.id).toBe(lastMember.id);
            expect(retrievedMember.provider).toBe(lastMember.provider);
            expect(retrievedMember.model).toBe(lastMember.model);
            expect(retrievedMember.timeout).toBe(lastMember.timeout);
          }
        }
      ),
      { numRuns: 50 } // Fewer runs since this tests multiple configs per run
    );
  }, 180000); // Longer timeout for multiple operations
});
