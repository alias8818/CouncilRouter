/**
 * Property-Based Test: Base Provider Adapter Timeout Conversion
 * Feature: bug-fixes-critical, Property 3: Base Provider Adapter timeout conversion
 * 
 * Validates: Requirements 1.3
 * 
 * For any Council Member with timeout configured in seconds, the Base Provider Adapter
 * should pass the timeout value multiplied by 1000 to setTimeout.
 */

import * as fc from 'fast-check';
import { BaseProviderAdapter } from '../base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage, RetryPolicy } from '../../../types/core';

// ============================================================================
// Test Adapter Implementation
// ============================================================================

class TimeoutConversionTestAdapter extends BaseProviderAdapter {
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
      content: response.content || 'test content',
      tokenUsage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      }
    };
  }
}

// ============================================================================
// Arbitraries for Property-Based Testing
// ============================================================================

const retryPolicyArbitrary = fc.record({
  maxAttempts: fc.integer({ min: 1, max: 5 }),
  initialDelayMs: fc.integer({ min: 100, max: 2000 }),
  maxDelayMs: fc.integer({ min: 1000, max: 10000 }),
  backoffMultiplier: fc.double({ min: 1.1, max: 3.0 }),
  retryableErrors: fc.array(
    fc.constantFrom('RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE'),
    { minLength: 1, maxLength: 3 }
  )
}).filter(policy => policy.maxDelayMs >= policy.initialDelayMs);

const councilMemberArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }).map(s => `member-${s}`),
  provider: fc.constantFrom('openai', 'anthropic', 'google'),
  model: fc.string({ minLength: 1, maxLength: 20 }),
  version: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
  weight: fc.option(fc.double({ min: 0, max: 1 }), { nil: undefined }),
  timeout: fc.integer({ min: 1, max: 120 }), // Timeout in seconds
  retryPolicy: retryPolicyArbitrary
});

// ============================================================================
// Property Test: Timeout Conversion
// ============================================================================

describe('Property Test: Base Provider Adapter Timeout Conversion', () => {
  let originalSetTimeout: typeof setTimeout;
  
  beforeAll(() => {
    originalSetTimeout = global.setTimeout;
  });
  
  afterAll(() => {
    global.setTimeout = originalSetTimeout;
  });
  
  /**
   * Feature: bug-fixes-critical, Property 3: Base Provider Adapter timeout conversion
   * 
   * For any Council Member with timeout configured in seconds, the Base Provider Adapter
   * should pass the timeout value multiplied by 1000 to setTimeout.
   * 
   * Validates: Requirements 1.3
   */
  test('should convert timeout from seconds to milliseconds before setTimeout', async () => {
    // Spy on setTimeout to track timeout values
    const setTimeoutCalls: Array<{ callback: Function; delay: number; timerId: NodeJS.Timeout }> = [];
    const activeTimers: Set<NodeJS.Timeout> = new Set();
    
    global.setTimeout = jest.fn((callback: any, delay?: number) => {
      const timerId = originalSetTimeout(callback, delay);
      activeTimers.add(timerId);
      setTimeoutCalls.push({ callback, delay: delay || 0, timerId });
      return timerId as any;
    }) as any;
    
    try {
      await fc.assert(
        fc.asyncProperty(
          councilMemberArbitrary,
          async (member) => {
            // Setup
            const adapter = new TimeoutConversionTestAdapter('test-api-key');
            
            // Set up a request that will trigger timeout quickly
            adapter.testRequestFn = async () => {
              // Use a very short delay to make test fast
              await new Promise(resolve => setTimeout(resolve, 50));
              return { content: 'should not reach here' };
            };
            
            // Clear setTimeout tracking
            setTimeoutCalls.length = 0;
            
            // Execute request (this will trigger timeout setup)
            try {
              await adapter.sendRequest(member, 'test prompt');
            } catch (error) {
              // May fail, but we're testing timeout conversion
            }
            
            // Property assertions:
            // The timeout should be member.timeout * 1000 (converted to milliseconds)
            const expectedTimeoutMs = member.timeout * 1000;
            
            // Look for setTimeout calls with the expected timeout value
            const timeoutCalls = setTimeoutCalls.filter(call => 
              call.delay === expectedTimeoutMs
            );
            
            // Should have at least one setTimeout call with the correct timeout in milliseconds
            expect(timeoutCalls.length).toBeGreaterThan(0);
            
            // Verify the timeout is in milliseconds (should be >= 1000 for timeouts >= 1 second)
            if (member.timeout >= 1) {
              const foundTimeouts = setTimeoutCalls.map(call => call.delay);
              const hasMillisecondTimeout = foundTimeouts.some(delay => delay >= 1000);
              expect(hasMillisecondTimeout).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Clear all active timers
      activeTimers.forEach(timerId => clearTimeout(timerId));
      activeTimers.clear();
      
      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    }
  }, 120000);
});
