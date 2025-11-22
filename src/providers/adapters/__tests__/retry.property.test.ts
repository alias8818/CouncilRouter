/**
 * Property-Based Test: Retry Attempt Count
 * Feature: ai-council-proxy, Property 34: Retry attempt count
 * 
 * For any council member with retry enabled, the system should attempt
 * exactly the configured number of retries before marking the call as failed.
 * 
 * Validates: Requirements 10.3
 */

import * as fc from 'fast-check';
import { BaseProviderAdapter } from '../base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage, RetryPolicy } from '../../../types/core';

// Test adapter implementation that tracks retry attempts
class RetryTestAdapter extends BaseProviderAdapter {
  public attemptCount: number = 0;
  public shouldFail: boolean = true;
  public errorCode: string = 'RATE_LIMIT';
  
  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    this.attemptCount = 0; // Reset counter for each sendRequest call
    return this.executeWithRetry(member, async () => {
      this.attemptCount++;
      
      if (this.shouldFail) {
        const error: any = new Error(`Test error: ${this.errorCode}`);
        error.code = this.errorCode;
        throw error;
      }
      
      return { content: 'success' };
    });
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
}

describe('Property Test: Retry Attempt Count', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Property 34: Retry attempt count
   * For any council member with retry enabled, the system should attempt
   * exactly the configured number of retries before marking the call as failed.
   */
  test('should attempt exactly maxAttempts retries for retryable errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary retry configurations
        fc.integer({ min: 1, max: 5 }), // maxAttempts
        fc.integer({ min: 10, max: 100 }), // initialDelayMs
        fc.integer({ min: 100, max: 1000 }), // maxDelayMs
        fc.double({ min: 1.5, max: 3.0 }), // backoffMultiplier
        fc.constantFrom('RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'TIMEOUT'), // retryable error
        async (maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier, errorCode) => {
          const adapter = new RetryTestAdapter('test-api-key');
          adapter.shouldFail = true;
          adapter.errorCode = errorCode;
          
          const retryPolicy: RetryPolicy = {
            maxAttempts,
            initialDelayMs,
            maxDelayMs,
            backoffMultiplier,
            retryableErrors: ['RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'TIMEOUT']
          };
          
          const member: CouncilMember = {
            id: `test-member-${maxAttempts}`,
            provider: 'test',
            model: 'test-model',
            timeout: 5000, // High timeout to avoid timeout interference
            retryPolicy
          };
          
          const response = await adapter.sendRequest(member, 'test prompt');
          
          // Property assertions:
          // 1. Should attempt exactly maxAttempts times
          expect(adapter.attemptCount).toBe(maxAttempts);
          
          // 2. Request should fail after all retries exhausted
          expect(response.success).toBe(false);
          
          // 3. Error should be defined
          expect(response.error).toBeDefined();
          
          // 4. Response should not contain successful content
          expect(response.content).toBe('');
          
          // 5. Token usage should be zero for failed requests
          expect(response.tokenUsage.totalTokens).toBe(0);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  }, 120000); // Increase test timeout to accommodate property testing
  
  /**
   * Additional property: Non-retryable errors should fail immediately
   * This validates that the retry mechanism doesn't retry non-retryable errors
   */
  test('should not retry for non-retryable errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary retry configurations
        fc.integer({ min: 2, max: 5 }), // maxAttempts (at least 2 to test no retry)
        fc.constantFrom('AUTHENTICATION_ERROR', 'INVALID_REQUEST', 'UNKNOWN_ERROR'), // non-retryable error
        async (maxAttempts, errorCode) => {
          const adapter = new RetryTestAdapter('test-api-key');
          adapter.shouldFail = true;
          adapter.errorCode = errorCode;
          
          const retryPolicy: RetryPolicy = {
            maxAttempts,
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            retryableErrors: ['RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'TIMEOUT']
          };
          
          const member: CouncilMember = {
            id: `test-member-${maxAttempts}`,
            provider: 'test',
            model: 'test-model',
            timeout: 5000,
            retryPolicy
          };
          
          const response = await adapter.sendRequest(member, 'test prompt');
          
          // Property assertions:
          // 1. Should attempt only once (no retries for non-retryable errors)
          expect(adapter.attemptCount).toBe(1);
          
          // 2. Request should fail
          expect(response.success).toBe(false);
          
          // 3. Error should be defined
          expect(response.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Additional property: Successful request on retry should stop retrying
   * This validates that the system stops retrying once a request succeeds
   */
  test('should stop retrying once request succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary retry configurations
        fc.integer({ min: 2, max: 5 }), // maxAttempts (at least 2)
        fc.integer({ min: 1, max: 4 }), // successOnAttempt (must be < maxAttempts)
        async (maxAttempts, successOnAttemptRaw) => {
          // Ensure successOnAttempt is less than maxAttempts
          const successOnAttempt = (successOnAttemptRaw % maxAttempts) + 1;
          
          // Create a custom adapter that succeeds on a specific attempt
          class SuccessOnAttemptAdapter extends BaseProviderAdapter {
            public attemptCount: number = 0;
            private successOnAttempt: number;
            
            constructor(apiKey: string, successOnAttempt: number) {
              super(apiKey);
              this.successOnAttempt = successOnAttempt;
            }
            
            async sendRequest(
              member: CouncilMember,
              prompt: string,
              context?: ConversationContext
            ): Promise<ProviderResponse> {
              this.attemptCount = 0;
              return this.executeWithRetry(member, async () => {
                this.attemptCount++;
                
                if (this.attemptCount < this.successOnAttempt) {
                  const error: any = new Error('Test error: RATE_LIMIT');
                  error.code = 'RATE_LIMIT';
                  throw error;
                }
                
                return { content: 'success' };
              });
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
          }
          
          const adapter = new SuccessOnAttemptAdapter('test-api-key', successOnAttempt);
          
          const retryPolicy: RetryPolicy = {
            maxAttempts,
            initialDelayMs: 10,
            maxDelayMs: 100,
            backoffMultiplier: 2,
            retryableErrors: ['RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'TIMEOUT']
          };
          
          const member: CouncilMember = {
            id: `test-member-${maxAttempts}`,
            provider: 'test',
            model: 'test-model',
            timeout: 5000,
            retryPolicy
          };
          
          const response = await adapter.sendRequest(member, 'test prompt');
          
          // Property assertions:
          // 1. Should attempt exactly successOnAttempt times (not maxAttempts)
          expect(adapter.attemptCount).toBe(successOnAttempt);
          
          // 2. Request should succeed
          expect(response.success).toBe(true);
          
          // 3. Should not have an error
          expect(response.error).toBeUndefined();
          
          // 4. Response should contain content
          expect(response.content).toBe('success');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
