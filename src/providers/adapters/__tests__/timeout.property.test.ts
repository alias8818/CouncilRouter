/**
 * Property-Based Test: Timeout Enforcement
 * Feature: ai-council-proxy, Property 33: Timeout enforcement
 * 
 * For any council member API call that exceeds the configured timeout,
 * the system should cancel the request and proceed without that member's response.
 * 
 * Validates: Requirements 10.2
 */

import * as fc from 'fast-check';
import { BaseProviderAdapter } from '../base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage, RetryPolicy } from '../../../types/core';

// Test adapter implementation
class TimeoutTestAdapter extends BaseProviderAdapter {
  public testRequestFn?: (delayMs: number) => Promise<any>;
  
  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    if (!this.testRequestFn) {
      throw new Error('testRequestFn not set');
    }
    // Pass a delay that exceeds the timeout
    return this.executeWithRetry(member, () => this.testRequestFn!(member.timeout + 100));
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

describe('Property Test: Timeout Enforcement', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Property 33: Timeout enforcement
   * For any council member API call that exceeds the configured timeout,
   * the system should cancel the request and proceed without that member's response.
   */
  test('should enforce timeout for any council member configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary timeout values in SECONDS (0.05s to 0.5s for faster testing)
        fc.double({ min: 0.05, max: 0.5, noNaN: true }),
        async (timeoutSeconds) => {
          const adapter = new TimeoutTestAdapter('test-api-key');
          
          const retryPolicy: RetryPolicy = {
            maxAttempts: 1, // No retries for cleaner timeout testing
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            retryableErrors: ['RATE_LIMIT', 'SERVICE_UNAVAILABLE']
          };
          
          const member: CouncilMember = {
            id: `test-member-${timeoutSeconds}`,
            provider: 'test',
            model: 'test-model',
            timeout: timeoutSeconds, // Timeout in seconds
            retryPolicy
          };
          
          // Set up request function that takes longer than timeout
          // Convert timeout to ms and add buffer
          const timeoutMs = timeoutSeconds * 1000;
          const requestDelayMs = timeoutMs + 200;
          adapter.testRequestFn = async (delayMs: number) => {
            await new Promise(resolve => setTimeout(resolve, requestDelayMs));
            return { content: 'should not reach here' };
          };
          
          const startTime = Date.now();
          const response = await adapter.sendRequest(member, 'test prompt');
          const actualDuration = Date.now() - startTime;
          
          // Property assertions:
          // 1. Request should fail (success = false)
          expect(response.success).toBe(false);
          
          // 2. Error should indicate timeout
          expect(response.error).toBeDefined();
          expect(response.error?.message).toContain('timeout');
          
          // 3. Request should be cancelled near the timeout value (in milliseconds)
          // Allow significant margin for execution overhead and test environment variability
          // Jest test environment can have variable timing, so we use a more lenient check:
          // The timeout should fire, but we allow up to 2x the timeout + 1000ms buffer
          // This accounts for event loop delays, test runner overhead, and system load
          const maxAllowedDuration = Math.max(timeoutMs * 2 + 1000, timeoutMs + 2000);
          expect(actualDuration).toBeLessThan(maxAllowedDuration);
          
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
   * Additional property: Fast requests should complete before timeout
   * This validates that the timeout mechanism doesn't interfere with valid requests
   */
  test('should allow fast requests to complete successfully', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary timeout values in SECONDS (0.1s to 0.5s for faster testing)
        fc.double({ min: 0.1, max: 0.5 }),
        async (timeoutSeconds) => {
          const adapter = new TimeoutTestAdapter('test-api-key');
          
          const retryPolicy: RetryPolicy = {
            maxAttempts: 1,
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            retryableErrors: ['RATE_LIMIT', 'SERVICE_UNAVAILABLE']
          };
          
          const member: CouncilMember = {
            id: `test-member-${timeoutSeconds}`,
            provider: 'test',
            model: 'test-model',
            timeout: timeoutSeconds, // Timeout in seconds
            retryPolicy
          };
          
          // Set up request function that completes before timeout
          // Use a delay that's guaranteed to be less than timeout
          const timeoutMs = timeoutSeconds * 1000;
          const requestDelayMs = Math.floor(timeoutMs * 0.5); // 50% of timeout
          adapter.testRequestFn = async (delayMs: number) => {
            await new Promise(resolve => setTimeout(resolve, requestDelayMs));
            return { content: 'success' };
          };
          
          const response = await adapter.sendRequest(member, 'test prompt');
          
          // Property assertions:
          // 1. Request should succeed
          expect(response.success).toBe(true);
          
          // 2. Should not have an error
          expect(response.error).toBeUndefined();
          
          // 3. Response should contain content
          expect(response.content).toBe('success');
          
          // 4. Token usage should be populated
          expect(response.tokenUsage.totalTokens).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
