/**
 * Base Model Fetcher
 * Abstract base class for fetching models from provider APIs with retry logic
 */

import { DiscoveredModel, ProviderType } from '../types/core';

export interface FetcherConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
}

export interface RateLimitStatus {
  isRateLimited: boolean;
  retryAfter?: number; // milliseconds
  lastRateLimitTime?: Date;
  rateLimitCount: number;
}

export abstract class BaseModelFetcher {
  protected config: FetcherConfig;
  protected provider: ProviderType;
  protected rateLimitStatus: RateLimitStatus;

  constructor(provider: ProviderType, config?: Partial<FetcherConfig>) {
    this.provider = provider;
    this.config = {
      maxRetries: 3,
      initialDelayMs: 1000, // 1 second
      maxDelayMs: 4000, // 4 seconds
      backoffMultiplier: 2,
      timeoutMs: 30000, // 30 seconds
      ...config
    };
    this.rateLimitStatus = {
      isRateLimited: false,
      rateLimitCount: 0
    };
  }

  /**
     * Fetch models from the provider API
     */
  async fetchModels(): Promise<DiscoveredModel[]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const models = await this.executeWithTimeout(
          () => this.fetchModelsFromAPI(),
          this.config.timeoutMs
        );

        // Clear rate limit status on success
        if (this.rateLimitStatus.isRateLimited) {
          console.log(`[ModelFetcher] Rate limit cleared for ${this.provider}`);
          this.rateLimitStatus.isRateLimited = false;
          this.rateLimitStatus.retryAfter = undefined;
        }

        return models;
      } catch (error) {
        lastError = error as Error;
        const errorCode = this.getErrorCode(error);

        // Log the error
        console.error(
          `[ModelFetcher] Attempt ${attempt + 1}/${this.config.maxRetries} failed for ${this.provider}:`,
          errorCode,
          error
        );

        // Check if error is retryable
        if (!this.isRetryableError(errorCode)) {
          throw error;
        }

        // Handle rate limiting with Retry-After header
        if (errorCode === 'RATE_LIMIT') {
          // Update rate limit status
          this.rateLimitStatus.isRateLimited = true;
          this.rateLimitStatus.lastRateLimitTime = new Date();
          this.rateLimitStatus.rateLimitCount++;

          const retryAfter = this.getRetryAfterDelay(error);
          if (retryAfter) {
            this.rateLimitStatus.retryAfter = retryAfter;
            console.log(`[ModelFetcher] Rate limited (count: ${this.rateLimitStatus.rateLimitCount}). Waiting ${retryAfter}ms before retry`);
            await this.sleep(retryAfter);
            continue;
          } else {
            // No Retry-After header, use exponential backoff
            const delay = this.calculateBackoffDelay(attempt);
            this.rateLimitStatus.retryAfter = delay;
            console.log(`[ModelFetcher] Rate limited (count: ${this.rateLimitStatus.rateLimitCount}). No Retry-After header, using exponential backoff: ${delay}ms`);
            await this.sleep(delay);
            continue;
          }
        }

        // Don't retry on last attempt
        if (attempt < this.config.maxRetries - 1) {
          const delay = this.calculateBackoffDelay(attempt);
          console.log(`[ModelFetcher] Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    throw new Error(
      `Failed to fetch models from ${this.provider} after ${this.config.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Fetch models from the provider API (to be implemented by subclasses)
   */
  protected abstract fetchModelsFromAPI(): Promise<DiscoveredModel[]>;

  /**
   * Get authentication headers for the provider
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Execute a function with timeout
   */
  protected async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Request timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const result = await Promise.race([fn(), timeoutPromise]);
      return result;
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Extract error code from error object
   */
  protected getErrorCode(error: any): string {
    if (error.code) { return error.code; }
    if (error.message?.includes('timeout')) { return 'TIMEOUT'; }
    if (error.message?.includes('rate limit')) { return 'RATE_LIMIT'; }
    if (error.message?.includes('authentication') || error.message?.includes('unauthorized')) {
      return 'AUTH_ERROR';
    }
    if (error.status === 503 || error.statusCode === 503) { return 'SERVICE_UNAVAILABLE'; }
    if (error.status === 429 || error.statusCode === 429) { return 'RATE_LIMIT'; }
    if (error.status === 401 || error.statusCode === 401) { return 'AUTH_ERROR'; }
    if (error.status === 403 || error.statusCode === 403) { return 'AUTH_ERROR'; }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Check if an error code is retryable
   */
  protected isRetryableError(errorCode: string): boolean {
    const retryableErrors = ['TIMEOUT', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR'];
    return retryableErrors.includes(errorCode);
  }

  /**
   * Get retry delay from Retry-After header
   */
  protected getRetryAfterDelay(error: any): number | null {
    // Check for Retry-After header in error response
    const retryAfter = error.response?.headers?.['retry-after'];
    if (!retryAfter) { return null; }

    // Retry-After can be in seconds or a date
    const retryAfterNum = parseInt(retryAfter, 10);
    if (!isNaN(retryAfterNum)) {
      return retryAfterNum * 1000; // Convert to milliseconds
    }

    // Try parsing as date
    const retryAfterDate = new Date(retryAfter);
    if (!isNaN(retryAfterDate.getTime())) {
      return Math.max(0, retryAfterDate.getTime() - Date.now());
    }

    return null;
  }

  /**
   * Calculate exponential backoff delay
   */
  protected calculateBackoffDelay(attempt: number): number {
    const delay =
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
    return Math.min(delay, this.config.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status for this provider
   */
  getRateLimitStatus(): RateLimitStatus {
    return { ...this.rateLimitStatus };
  }

  /**
   * Make HTTP request with authentication
   */
  protected async makeRequest(url: string, options: RequestInit = {}): Promise<any> {
    const headers = {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.statusCode = response.status;
      error.response = {
        headers: Object.fromEntries(response.headers.entries())
      };
      throw error;
    }

    return response.json();
  }
}
