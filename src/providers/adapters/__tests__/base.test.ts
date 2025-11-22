/**
 * Base Provider Adapter Tests
 * Tests for retry logic, timeout handling, and error handling
 */

import { BaseProviderAdapter } from '../base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage, RetryPolicy } from '../../../types/core';

// Concrete implementation for testing
class TestAdapter extends BaseProviderAdapter {
  public testRequestFn?: () => Promise<any>;
  
  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    if (!this.testRequestFn) {
      throw new Error('testRequestFn not set');
    }
    return this.executeWithRetry(member, this.testRequestFn);
  }
  
  async getHealth(): Promise<{ available: boolean; latency?: number }> {
    return { available: true, latency: 100 };
  }
  
  protected formatRequest(prompt: string, context?: ConversationContext): any {
    return { prompt, context };
  }
  
  protected parseResponse(response: any): { content: string; tokenUsage: TokenUsage } {
    return {
      content: response.content,
      tokenUsage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      }
    };
  }
  
  // Expose protected methods for testing
  public testGetErrorCode(error: any): string {
    return this.getErrorCode(error);
  }
  
  public testCalculateBackoffDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    multiplier: number
  ): number {
    return this.calculateBackoffDelay(attempt, initialDelay, maxDelay, multiplier);
  }
}

describe('BaseProviderAdapter', () => {
  let adapter: TestAdapter;
  const defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
  };
  
  beforeEach(() => {
    adapter = new TestAdapter('test-api-key');
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
  
  describe('Error Code Detection', () => {
    test('should detect timeout errors', () => {
      const error = new Error('Request timeout');
      expect(adapter.testGetErrorCode(error)).toBe('TIMEOUT');
    });
    
    test('should detect rate limit errors from message', () => {
      const error = new Error('rate limit exceeded');
      expect(adapter.testGetErrorCode(error)).toBe('RATE_LIMIT');
    });
    
    test('should detect rate limit errors from status code', () => {
      const error: any = new Error('API error');
      error.status = 429;
      expect(adapter.testGetErrorCode(error)).toBe('RATE_LIMIT');
    });
    
    test('should detect service unavailable errors', () => {
      const error: any = new Error('Service unavailable');
      error.status = 503;
      expect(adapter.testGetErrorCode(error)).toBe('SERVICE_UNAVAILABLE');
    });
    
    test('should return error code if present', () => {
      const error: any = new Error('Custom error');
      error.code = 'CUSTOM_ERROR';
      expect(adapter.testGetErrorCode(error)).toBe('CUSTOM_ERROR');
    });
    
    test('should return UNKNOWN_ERROR for unrecognized errors', () => {
      const error = new Error('Some random error');
      expect(adapter.testGetErrorCode(error)).toBe('UNKNOWN_ERROR');
    });
  });
  
  describe('Exponential Backoff', () => {
    test('should calculate exponential backoff correctly', () => {
      const delay0 = adapter.testCalculateBackoffDelay(0, 100, 1000, 2);
      const delay1 = adapter.testCalculateBackoffDelay(1, 100, 1000, 2);
      const delay2 = adapter.testCalculateBackoffDelay(2, 100, 1000, 2);
      
      expect(delay0).toBe(100);
      expect(delay1).toBe(200);
      expect(delay2).toBe(400);
    });
    
    test('should respect maximum delay', () => {
      const delay = adapter.testCalculateBackoffDelay(10, 100, 1000, 2);
      expect(delay).toBeLessThanOrEqual(1000);
    });
    
    test('should handle zero initial delay', () => {
      const delay = adapter.testCalculateBackoffDelay(0, 0, 1000, 2);
      expect(delay).toBe(0);
    });
  });
  
  describe('Retry Logic', () => {
    test('should succeed on first attempt', async () => {
      const member: CouncilMember = {
        id: 'test-1',
        provider: 'test',
        model: 'test-model',
        timeout: 5000,
        retryPolicy: defaultRetryPolicy
      };
      
      adapter.testRequestFn = async () => ({ content: 'success' });
      
      const response = await adapter.sendRequest(member, 'test prompt');
      expect(response.success).toBe(true);
      expect(response.content).toBe('success');
    });
    
    test('should not retry on non-retryable errors', async () => {
      const member: CouncilMember = {
        id: 'test-1',
        provider: 'test',
        model: 'test-model',
        timeout: 5000,
        retryPolicy: defaultRetryPolicy
      };
      
      let attempts = 0;
      adapter.testRequestFn = async () => {
        attempts++;
        const error: any = new Error('Non-retryable error');
        error.code = 'INVALID_REQUEST';
        throw error;
      };
      
      const response = await adapter.sendRequest(member, 'test prompt');
      expect(response.success).toBe(false);
      expect(attempts).toBe(1); // Should only try once
    });
    
    test('should retry on retryable errors up to max attempts', async () => {
      const member: CouncilMember = {
        id: 'test-1',
        provider: 'test',
        model: 'test-model',
        timeout: 5000,
        retryPolicy: { ...defaultRetryPolicy, initialDelayMs: 10 }
      };
      
      let attempts = 0;
      adapter.testRequestFn = async () => {
        attempts++;
        const error: any = new Error('Rate limit');
        error.code = 'RATE_LIMIT';
        throw error;
      };
      
      const response = await adapter.sendRequest(member, 'test prompt');
      expect(response.success).toBe(false);
      expect(attempts).toBe(3); // Should try maxAttempts times
    }, 10000);
    
    test('should succeed after retries', async () => {
      const member: CouncilMember = {
        id: 'test-1',
        provider: 'test',
        model: 'test-model',
        timeout: 5000,
        retryPolicy: { ...defaultRetryPolicy, initialDelayMs: 10 }
      };
      
      let attempts = 0;
      adapter.testRequestFn = async () => {
        attempts++;
        if (attempts < 3) {
          const error: any = new Error('Rate limit');
          error.code = 'RATE_LIMIT';
          throw error;
        }
        return { content: 'success after retries' };
      };
      
      const response = await adapter.sendRequest(member, 'test prompt');
      expect(response.success).toBe(true);
      expect(attempts).toBe(3);
    }, 10000);
  });
  
  describe('Timeout Handling', () => {
    test('should timeout long-running requests', async () => {
      const member: CouncilMember = {
        id: 'test-1',
        provider: 'test',
        model: 'test-model',
        timeout: 100, // 100ms timeout
        retryPolicy: { ...defaultRetryPolicy, maxAttempts: 1 }
      };
      
      adapter.testRequestFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Takes 500ms
        return { content: 'should not reach here' };
      };
      
      const response = await adapter.sendRequest(member, 'test prompt');
      expect(response.success).toBe(false);
      expect(response.error?.message).toContain('timeout');
    }, 10000);
    
    test('should complete fast requests before timeout', async () => {
      const member: CouncilMember = {
        id: 'test-1',
        provider: 'test',
        model: 'test-model',
        timeout: 1000, // 1 second timeout
        retryPolicy: defaultRetryPolicy
      };
      
      adapter.testRequestFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50)); // Takes 50ms
        return { content: 'fast response' };
      };
      
      const response = await adapter.sendRequest(member, 'test prompt');
      expect(response.success).toBe(true);
    });
  });
});
