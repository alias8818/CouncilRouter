/**
 * Property-Based Test: Request Throttling
 * Feature: dynamic-model-pricing, Property 33: Request Throttling
 * 
 * Validates: Requirements 7.4
 * 
 * For any sequence of scraping requests to the same provider, there should be a minimum delay between consecutive requests.
 */

import * as fc from 'fast-check';
import { BaseHTMLScraper } from '../base-scraper';
import { ProviderType, ScrapingConfig } from '../../types/core';

// Test implementation of BaseHTMLScraper
class TestHTMLScraper extends BaseHTMLScraper {
    private requestTimes: number[] = [];

    constructor(provider: ProviderType, throttleDelayMs?: number) {
        super(provider, throttleDelayMs !== undefined ? { throttleDelayMs } : undefined);
    }

    protected async getDefaultScrapingConfig(): Promise<ScrapingConfig> {
        return {
            url: 'https://example.com/pricing',
            selectors: {
                table: 'table',
                modelNameColumn: 0,
                inputCostColumn: 1,
                outputCostColumn: 2
            }
        };
    }

    // Override fetchHTML to track request times
    protected async fetchHTML(url: string): Promise<string> {
        // Mock fetch to avoid actual network calls
        const originalFetch = global.fetch;
        global.fetch = async () => {
            this.requestTimes.push(Date.now());
            global.fetch = originalFetch;
            return new Response('<html><body><table></table></body></html>');
        };

        try {
            return await super.fetchHTML(url);
        } catch (error) {
            // Ignore errors, we just want to track timing
            return '<html></html>';
        }
    }

    getRequestTimes(): number[] {
        return this.requestTimes;
    }

    getThrottleDelay(): number {
        return (this as any).config.throttleDelayMs;
    }
}

describe('Property 33: Request Throttling', () => {
    test('Consecutive requests are throttled with minimum delay', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 100, max: 300 }), // Throttle delay in ms
                async (throttleDelay) => {
                    const scraper = new TestHTMLScraper('openai', throttleDelay);

                    // Make 2 consecutive requests
                    await scraper.fetchHTML('https://example.com/test1');
                    await scraper.fetchHTML('https://example.com/test2');

                    const requestTimes = scraper.getRequestTimes();

                    // Check that we have 2 requests
                    expect(requestTimes).toHaveLength(2);

                    // Check delay between requests
                    const delay = requestTimes[1] - requestTimes[0];

                    // Delay should be at least the throttle delay
                    // Allow 50ms tolerance for execution time
                    expect(delay).toBeGreaterThanOrEqual(throttleDelay - 50);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Default throttle delay is 1 second', async () => {
        const scraper = new TestHTMLScraper('openai');

        // Check default throttle delay
        const throttleDelay = scraper.getThrottleDelay();
        expect(throttleDelay).toBe(1000);
    }, 120000);

    test('Throttle delay is configurable per scraper instance', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 100, max: 5000 }), // Custom throttle delay
                async (customDelay) => {
                    const scraper = new TestHTMLScraper('openai', customDelay);

                    const throttleDelay = scraper.getThrottleDelay();
                    expect(throttleDelay).toBe(customDelay);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('First request is not throttled', async () => {
        const scraper = new TestHTMLScraper('openai', 1000);
        const startTime = Date.now();

        // Make first request
        await scraper.fetchHTML('https://example.com/test');

        const elapsed = Date.now() - startTime;

        // First request should not be delayed by throttling
        // Allow 200ms for execution overhead
        expect(elapsed).toBeLessThan(200);
    }, 120000);

    test('Throttling applies to same provider instance', async () => {
        const scraper = new TestHTMLScraper('openai', 300);
        const startTime = Date.now();

        // Make three consecutive requests
        await scraper.fetchHTML('https://example.com/test1');
        await scraper.fetchHTML('https://example.com/test2');
        await scraper.fetchHTML('https://example.com/test3');

        const elapsed = Date.now() - startTime;

        // Total time should be at least 2 * throttleDelay (for 2nd and 3rd requests)
        // Allow 200ms tolerance
        expect(elapsed).toBeGreaterThanOrEqual(600 - 200);
    }, 120000);
});
