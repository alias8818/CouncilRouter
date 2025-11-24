/**
 * Base Provider Adapter
 * Abstract base class for all provider adapters
 */

import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage } from '../../types/core';

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
        // Validate timeout value to prevent NaN
        if (typeof member.timeout !== 'number' || isNaN(member.timeout) || member.timeout <= 0) {
          throw new Error(`Invalid timeout value for member ${member.id}: ${member.timeout}`);
        }
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

          console.error(`[ProviderAdapter] STEP 1: Raw response received for ${member.id}:`, {
            responseType: typeof response,
            isArray: Array.isArray(response),
            responseKeys: response && typeof response === 'object' ? Object.keys(response) : [],
            responsePreview: typeof response === 'string' ? response.substring(0, 200) : JSON.stringify(response).substring(0, 500)
          });

          const { content, tokenUsage } = this.parseResponse(response);

          console.error(`[ProviderAdapter] STEP 2: After parseResponse for ${member.id}:`, {
            contentType: typeof content,
            isArray: Array.isArray(content),
            contentLength: typeof content === 'string' ? content.length : 'N/A',
            contentPreview: typeof content === 'string' ? content.substring(0, 200) : JSON.stringify(content).substring(0, 500),
            hasObjectObject: typeof content === 'string' && content.includes('[object Object]')
          });

          // Debug logging: Check content type after parsing
          if (typeof content !== 'string') {
            console.error(`[ProviderAdapter] ERROR: parseResponse returned non-string content for ${member.id}:`, {
              type: typeof content,
              isArray: Array.isArray(content),
              content: content,
              memberId: member.id,
              rawResponse: response
            });
          } else if (content.includes('[object Object]')) {
            console.error(`[ProviderAdapter] ERROR: parseResponse returned corrupted content string for ${member.id}:`, {
              content: content,
              memberId: member.id,
              responseType: typeof response,
              responseKeys: response ? Object.keys(response) : [],
              rawResponse: response
            });
          }

          const latency = Date.now() - startTime;

          const result = {
            content,
            tokenUsage,
            latency,
            success: true
          };

          console.error(`[ProviderAdapter] STEP 3: Returning ProviderResponse for ${member.id}:`, {
            resultContentType: typeof result.content,
            resultContentLength: typeof result.content === 'string' ? result.content.length : 'N/A',
            resultContentPreview: typeof result.content === 'string' ? result.content.substring(0, 200) : JSON.stringify(result.content).substring(0, 500),
            hasObjectObject: typeof result.content === 'string' && result.content.includes('[object Object]')
          });

          return result;
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
    if (error.code) {return error.code;}
    if (error.message?.includes('timeout')) {return 'TIMEOUT';}
    if (error.message?.includes('rate limit')) {return 'RATE_LIMIT';}
    if (error.status === 503 || error.statusCode === 503) {return 'SERVICE_UNAVAILABLE';}
    if (error.status === 429 || error.statusCode === 429) {return 'RATE_LIMIT';}
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
