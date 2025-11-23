/**
 * Base Provider Adapter
 * Abstract base class for all provider adapters
 */

import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage, RetryPolicy } from '../../types/core';

export abstract class BaseProviderAdapter {
  protected apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  /**
   * Send a request to the provider's API
   */
  abstract sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse>;
  
  /**
   * Get health status of this provider
   */
  abstract getHealth(): Promise<{ available: boolean; latency?: number }>;
  
  /**
   * Format the prompt and context for this provider's API
   */
  protected abstract formatRequest(
    prompt: string,
    context?: ConversationContext
  ): any;
  
  /**
   * Parse the provider's response into our standard format
   */
  protected abstract parseResponse(response: any): {
    content: string;
    tokenUsage: TokenUsage;
  };
  
  /**
   * Execute a request with retry logic and timeout handling
   */
  protected async executeWithRetry(
    member: CouncilMember,
    requestFn: () => Promise<any>
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const retryPolicy = member.retryPolicy;
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < retryPolicy.maxAttempts; attempt++) {
      let timeoutId: NodeJS.Timeout | null = null;

      try {
        // Create timeout promise with cleanup mechanism
        const timeoutMs = member.timeout * 1000; // Convert seconds to milliseconds
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Request timeout after ${member.timeout}s`));
          }, timeoutMs);
        });

        // Race between request and timeout
        // Use try-finally to ensure timeout is always cleared
        try {
          const response = await Promise.race([
            requestFn(),
            timeoutPromise
          ]);

          const { content, tokenUsage } = this.parseResponse(response);
          const latency = Date.now() - startTime;

          return {
            content,
            tokenUsage,
            latency,
            success: true
          };
        } finally {
          // Always clear timeout, whether request succeeded or failed
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }
      } catch (error) {
        // Ensure timeout is cleared even if error occurred before finally block
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        lastError = error as Error;
        const errorCode = this.getErrorCode(error);

        // Check if error is retryable
        if (!retryPolicy.retryableErrors.includes(errorCode)) {
          break;
        }

        // Don't retry on last attempt
        if (attempt < retryPolicy.maxAttempts - 1) {
          const delay = this.calculateBackoffDelay(
            attempt,
            retryPolicy.initialDelayMs,
            retryPolicy.maxDelayMs,
            retryPolicy.backoffMultiplier
          );
          await this.sleep(delay);
        }
      }
    }
    
    // All retries exhausted
    const latency = Date.now() - startTime;
    return {
      content: '',
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latency,
      success: false,
      error: lastError
    };
  }
  
  /**
   * Extract error code from error object
   */
  protected getErrorCode(error: any): string {
    if (error.code) return error.code;
    if (error.message?.includes('timeout')) return 'TIMEOUT';
    if (error.message?.includes('rate limit')) return 'RATE_LIMIT';
    if (error.status === 503 || error.statusCode === 503) return 'SERVICE_UNAVAILABLE';
    if (error.status === 429 || error.statusCode === 429) return 'RATE_LIMIT';
    return 'UNKNOWN_ERROR';
  }
  
  /**
   * Calculate exponential backoff delay
   */
  protected calculateBackoffDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    multiplier: number
  ): number {
    const delay = initialDelay * Math.pow(multiplier, attempt);
    return Math.min(delay, maxDelay);
  }
  
  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
