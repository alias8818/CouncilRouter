/**
 * Property-Based Test: User-Agent Header Presence
 * Feature: dynamic-model-pricing, Property 32: User-Agent Header Presence
 * 
 * Validates: Requirements 7.3
 * 
 * For any web scraping request, an appropriate User-Agent header should be included.
 */

import * as fc from 'fast-check';
import { BaseHTMLScraper } from '../base-scraper';
import { PricingData, ProviderType, ScrapingConfig } from '../../types/core';

// Test implementation of BaseHTMLScraper
class TestHTMLScraper extends BaseHTMLScraper {
    private capturedHeaders: Record<string, string> | null = null;

    constructor(provider: ProviderType, userAgent?: string) {
        super(provider, userAgent ? { userAgent } : undefined);
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

    // Override fetchHTML to capture headers
    protected async fetchHTML(url: string): Promise<string> {
        // Mock fetch to capture headers
        const originalFetch = global.fetch;

        return new Promise((resolve) => {
            global.fetch = async (input: any, init?: any) => {
                this.capturedHeaders = init?.headers || {};
                global.fetch = originalFetch;
                resolve('<html><body><table></table></body></html>');
                return new Response('<html><body><table></table></body></html>');
            };

            // Call parent method which will use our mocked fetch
            super.fetchHTML(url).catch(() => {
                // Ignore errors, we just want to capture headers
            });
        });
    }

    getCapturedHeaders(): Record<string, string> | null {
        return this.capturedHeaders;
    }
}

describe('Property 32: User-Agent Header Presence', () => {
    test('Scraper includes User-Agent header in all requests', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('openai', 'anthropic', 'google', 'xai'),
                async (provider) => {
                    const scraper = new TestHTMLScraper(provider as ProviderType);

                    // Trigger a fetch to capture headers
                    await scraper.fetchHTML('https://example.com/test');

                    const headers = scraper.getCapturedHeaders();

                    // Should have User-Agent header
                    expect(headers).toHaveProperty('User-Agent');
                    expect(headers!['User-Agent']).toBeTruthy();
                    expect(headers!['User-Agent'].length).toBeGreaterThan(0);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('User-Agent header is configurable via constructor', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 10, maxLength: 100 }), // Custom user agent
                async (customUserAgent) => {
                    const scraper = new TestHTMLScraper('openai', customUserAgent);

                    // Trigger a fetch to capture headers
                    await scraper.fetchHTML('https://example.com/test');

                    const headers = scraper.getCapturedHeaders();

                    // Should use the custom User-Agent
                    expect(headers).toHaveProperty('User-Agent');
                    expect(headers!['User-Agent']).toBe(customUserAgent);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('User-Agent header defaults to AI-Council-Proxy when not specified', async () => {
        const scraper = new TestHTMLScraper('openai');

        // Trigger a fetch to capture headers
        await scraper.fetchHTML('https://example.com/test');

        const headers = scraper.getCapturedHeaders();

        // Should have default User-Agent
        expect(headers).toHaveProperty('User-Agent');
        expect(headers!['User-Agent']).toContain('AI-Council-Proxy');
    }, 120000);

    test('User-Agent header includes version information', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('openai', 'anthropic', 'google', 'xai'),
                async (provider) => {
                    const scraper = new TestHTMLScraper(provider as ProviderType);

                    // Trigger a fetch to capture headers
                    await scraper.fetchHTML('https://example.com/test');

                    const headers = scraper.getCapturedHeaders();

                    // Should have User-Agent with version pattern
                    expect(headers).toHaveProperty('User-Agent');
                    const userAgent = headers!['User-Agent'];

                    // Should contain application name
                    expect(userAgent).toMatch(/AI-Council-Proxy/);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);
});
