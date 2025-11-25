/**
 * Property-Based Test: Rate Limit Backoff
 * Feature: dynamic-model-pricing, Property 31: Rate Limit Backoff
 * 
 * Validates: Requirements 7.2
 * 
 * For any rate limit error from a provider, the system should wait for the specified delay before retrying.
 */

import * as fc from 'fast-check';
import { BaseModelFetcher, RateLimitStatus } from '../base-fetcher';
import { DiscoveredModel } from '../../types/core';

// Test implementation of BaseModelFetcher
class TestModelFetcher extends BaseModelFetcher {
    private mockResponse: (() => Promise<DiscoveredModel[]>) | null = null;
    private callCount = 0;
    private skipSleep = false;

    constructor(skipSleep: boolean = false) {
        super('openai');
        this.skipSleep = skipSleep;
    }

    setMockResponse(fn: () => Promise<DiscoveredModel[]>) {
        this.mockResponse = fn;
        this.callCount = 0;
    }

    getCallCount(): number {
        return this.callCount;
    }

    protected getAuthHeaders(): Record<string, string> {
        return { 'Authorization': 'Bearer test-key' };
    }

    protected async fetchModelsFromAPI(): Promise<DiscoveredModel[]> {
        this.callCount++;
        if (this.mockResponse) {
            return this.mockResponse();
        }
        return [];
    }

    // Override sleep to speed up tests when needed
    protected async sleep(ms: number): Promise<void> {
        if (this.skipSleep) {
            return Promise.resolve();
        }
        return super.sleep(ms);
    }

    // Expose protected methods for testing
    public testGetRetryAfterDelay(error: any): number | null {
        return this.getRetryAfterDelay(error);
    }

    public testCalculateBackoffDelay(attempt: number): number {
        return this.calculateBackoffDelay(attempt);
    }
}

describe('Property 31: Rate Limit Backoff', () => {
    test('Retry-After header in seconds is parsed correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 300 }), // Retry-After in seconds
                async (retryAfterSeconds) => {
                    const fetcher = new TestModelFetcher();

                    const error = {
                        status: 429,
                        response: {
                            headers: {
                                'retry-after': retryAfterSeconds.toString()
                            }
                        }
                    };

                    const delayMs = fetcher.testGetRetryAfterDelay(error);

                    // Should convert seconds to milliseconds
                    expect(delayMs).toBe(retryAfterSeconds * 1000);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Retry-After header as date is parsed correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 2000, max: 60000 }), // Future time in milliseconds (min 2s to avoid timing issues)
                async (futureMs) => {
                    const fetcher = new TestModelFetcher();
                    const now = Date.now();
                    const futureDate = new Date(now + futureMs);

                    const error = {
                        status: 429,
                        response: {
                            headers: {
                                'retry-after': futureDate.toUTCString()
                            }
                        }
                    };

                    const delayMs = fetcher.testGetRetryAfterDelay(error);

                    // Should calculate delay from now to future date
                    // The delay should be close to futureMs, accounting for execution time
                    // Since we're measuring from the same 'now', the delay should be less than futureMs
                    // but not by more than 1 second (generous tolerance for test overhead)
                    expect(delayMs).toBeGreaterThanOrEqual(0);
                    expect(delayMs).toBeLessThanOrEqual(futureMs);
                    // Verify it's reasonably close (within 1 second of expected)
                    expect(Math.abs(delayMs - futureMs)).toBeLessThan(1000);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Exponential backoff increases delay with each attempt', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 0, max: 5 }), // Attempt number
                async (attempt) => {
                    const fetcher = new TestModelFetcher();

                    const delay = fetcher.testCalculateBackoffDelay(attempt);

                    // Delay should be: initialDelay * (backoffMultiplier ^ attempt)
                    // With default config: 1000 * (2 ^ attempt)
                    const expectedDelay = Math.min(1000 * Math.pow(2, attempt), 4000);

                    expect(delay).toBe(expectedDelay);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Rate limit status is tracked correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 3 }), // Number of rate limit errors
                async (rateLimitCount) => {
                    // Skip sleep to speed up test
                    const fetcher = new TestModelFetcher(true);
                    let attemptCount = 0;

                    // Mock response that fails with rate limit errors
                    fetcher.setMockResponse(async () => {
                        attemptCount++;
                        if (attemptCount <= rateLimitCount) {
                            const error: any = new Error('Rate limited');
                            error.status = 429;
                            error.statusCode = 429;
                            error.response = {
                                headers: {
                                    'retry-after': '1' // 1 second
                                }
                            };
                            throw error;
                        }
                        return [];
                    });

                    try {
                        await fetcher.fetchModels();

                        // After success, rate limit should be cleared
                        const status = fetcher.getRateLimitStatus();
                        expect(status.isRateLimited).toBe(false);
                        expect(status.rateLimitCount).toBe(rateLimitCount);
                    } catch (error) {
                        // If all retries exhausted, rate limit status should still be set
                        const status = fetcher.getRateLimitStatus();
                        expect(status.isRateLimited).toBe(true);
                        expect(status.rateLimitCount).toBeGreaterThan(0);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Rate limit without Retry-After header uses exponential backoff', async () => {
        const fetcher = new TestModelFetcher();
        let attemptCount = 0;
        const startTime = Date.now();

        // Mock response that fails with rate limit but no Retry-After header
        fetcher.setMockResponse(async () => {
            attemptCount++;
            if (attemptCount <= 2) {
                const error: any = new Error('Rate limited');
                error.status = 429;
                error.statusCode = 429;
                error.response = {
                    headers: {} // No Retry-After header
                };
                throw error;
            }
            return [];
        });

        await fetcher.fetchModels();
        const elapsed = Date.now() - startTime;

        // Should have used exponential backoff
        // First retry: 1000ms, Second retry: 2000ms
        // Total minimum delay: 3000ms
        expect(elapsed).toBeGreaterThanOrEqual(3000);

        const status = fetcher.getRateLimitStatus();
        expect(status.rateLimitCount).toBe(2);
    }, 120000);
});
