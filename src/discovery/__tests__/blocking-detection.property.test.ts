/**
 * Property-Based Test: Blocking Detection and Alerting
 * Feature: dynamic-model-pricing, Property 34: Blocking Detection and Alerting
 * 
 * Validates: Requirements 7.5
 * 
 * For any scraping attempt that is blocked by a provider, the event should be logged and an administrator alert should be generated.
 */

import * as fc from 'fast-check';
import { BaseHTMLScraper } from '../base-scraper';
import { ProviderType, ScrapingConfig } from '../../types/core';

// Test implementation of BaseHTMLScraper
class TestHTMLScraper extends BaseHTMLScraper {
    private blockingDetected: boolean = false;
    private alertGenerated: boolean = false;
    private loggedEvents: any[] = [];

    constructor(provider: ProviderType) {
        super(provider);
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

    // Override handleBlockingDetected to track alerts
    protected handleBlockingDetected(status: number, url: string): void {
        this.blockingDetected = true;
        this.alertGenerated = true;
        this.loggedEvents.push({ status, url, timestamp: new Date() });

        // Call parent to maintain original behavior
        super.handleBlockingDetected(status, url);
    }

    // Override isBlockingResponse to make it testable
    public testIsBlockingResponse(status: number): boolean {
        return this.isBlockingResponse(status);
    }

    wasBlockingDetected(): boolean {
        return this.blockingDetected;
    }

    wasAlertGenerated(): boolean {
        return this.alertGenerated;
    }

    getLoggedEvents(): any[] {
        return this.loggedEvents;
    }
}

describe('Property 34: Blocking Detection and Alerting', () => {
    test('HTTP 403, 429, and 451 are detected as blocking responses', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(403, 429, 451), // Blocking status codes
                async (status) => {
                    const scraper = new TestHTMLScraper('openai');

                    // Test that status is recognized as blocking
                    const isBlocking = scraper.testIsBlockingResponse(status);
                    expect(isBlocking).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Non-blocking status codes are not detected as blocking', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(200, 201, 301, 302, 400, 401, 404, 500, 502, 503), // Non-blocking codes
                async (status) => {
                    const scraper = new TestHTMLScraper('openai');

                    // Test that status is not recognized as blocking
                    const isBlocking = scraper.testIsBlockingResponse(status);
                    expect(isBlocking).toBe(false);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Blocking responses trigger detection and alerting', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(403, 429, 451), // Blocking status codes
                fc.webUrl(), // Random URL
                async (status, url) => {
                    const scraper = new TestHTMLScraper('openai');

                    // Mock fetch to return blocking response
                    const originalFetch = global.fetch;
                    global.fetch = async () => {
                        global.fetch = originalFetch;
                        return new Response('Blocked', { status });
                    };

                    try {
                        await scraper.fetchHTML(url);
                        // Should not reach here
                        expect(true).toBe(false);
                    } catch (error) {
                        // Should throw error
                        expect(error).toBeDefined();

                        // Should have detected blocking
                        expect(scraper.wasBlockingDetected()).toBe(true);

                        // Should have generated alert
                        expect(scraper.wasAlertGenerated()).toBe(true);

                        // Should have logged event
                        const events = scraper.getLoggedEvents();
                        expect(events.length).toBeGreaterThan(0);
                        expect(events[0].status).toBe(status);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Blocking events are logged with complete details', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('openai', 'anthropic', 'google', 'xai'),
                fc.constantFrom(403, 429, 451),
                fc.webUrl(),
                async (provider, status, url) => {
                    const scraper = new TestHTMLScraper(provider as ProviderType);

                    // Mock fetch to return blocking response
                    const originalFetch = global.fetch;
                    global.fetch = async () => {
                        global.fetch = originalFetch;
                        return new Response('Blocked', { status });
                    };

                    try {
                        await scraper.fetchHTML(url);
                    } catch (error) {
                        // Check logged event details
                        const events = scraper.getLoggedEvents();
                        expect(events).toHaveLength(1);

                        const event = events[0];
                        expect(event.status).toBe(status);
                        expect(event.url).toBe(url);
                        expect(event.timestamp).toBeInstanceOf(Date);
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Multiple blocking attempts are all logged', async () => {
        const scraper = new TestHTMLScraper('openai');

        // Mock fetch to return blocking responses
        let callCount = 0;
        const originalFetch = global.fetch;
        global.fetch = async () => {
            callCount++;
            if (callCount <= 3) {
                return new Response('Blocked', { status: 403 });
            }
            global.fetch = originalFetch;
            return new Response('<html></html>');
        };

        // Try multiple times
        for (let i = 0; i < 3; i++) {
            try {
                await scraper.fetchHTML(`https://example.com/test${i}`);
            } catch (error) {
                // Expected to fail
            }
        }

        // All blocking attempts should be logged
        const events = scraper.getLoggedEvents();
        expect(events).toHaveLength(3);
    }, 120000);
});
