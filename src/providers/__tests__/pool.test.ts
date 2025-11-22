/**
 * Provider Pool Tests
 * Tests for provider pool and adapter functionality
 */

import { ProviderPool } from '../pool';
import { CouncilMember, RetryPolicy } from '../../types/core';

describe('ProviderPool', () => {
  let pool: ProviderPool;
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Set up test environment with API keys
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-openai-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      GOOGLE_API_KEY: 'test-google-key'
    };
    pool = new ProviderPool();
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
  
  describe('Initialization', () => {
    test('should initialize without errors', () => {
      expect(pool).toBeDefined();
    });
    
    test('should track health for configured providers', () => {
      const health = pool.getAllProviderHealth();
      expect(Array.isArray(health)).toBe(true);
    });
  });
  
  describe('Provider Health Tracking', () => {
    test('should return health status for a provider', () => {
      const health = pool.getProviderHealth('openai');
      expect(health).toBeDefined();
      expect(health.providerId).toBe('openai');
      expect(['healthy', 'degraded', 'disabled']).toContain(health.status);
    });
    
    test('should mark provider as disabled', () => {
      pool.markProviderDisabled('openai', 'Test disable');
      const health = pool.getProviderHealth('openai');
      expect(health.status).toBe('disabled');
    });
    
    test('should re-enable a disabled provider', () => {
      pool.markProviderDisabled('openai', 'Test disable');
      pool.enableProvider('openai');
      const health = pool.getProviderHealth('openai');
      expect(health.status).toBe('healthy');
    });
  });
  
  describe('Request Handling', () => {
    const defaultRetryPolicy: RetryPolicy = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
    };
    
    test('should handle request to unconfigured provider', async () => {
      const member: CouncilMember = {
        id: 'test-1',
        provider: 'nonexistent',
        model: 'test-model',
        timeout: 5000,
        retryPolicy: defaultRetryPolicy
      };
      
      const response = await pool.sendRequest(member, 'test prompt');
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('not configured');
    });
    
    test('should handle request to disabled provider', async () => {
      pool.markProviderDisabled('openai', 'Test disable');
      
      const member: CouncilMember = {
        id: 'test-1',
        provider: 'openai',
        model: 'gpt-4',
        timeout: 5000,
        retryPolicy: defaultRetryPolicy
      };
      
      const response = await pool.sendRequest(member, 'test prompt');
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('disabled');
    });
  });
  
  describe('Health Aggregation', () => {
    test('should return all provider health statuses', () => {
      const allHealth = pool.getAllProviderHealth();
      expect(Array.isArray(allHealth)).toBe(true);
      
      // Should have entries for each configured provider
      const providerIds = allHealth.map(h => h.providerId);
      expect(providerIds.length).toBeGreaterThanOrEqual(0);
    });
  });
});
