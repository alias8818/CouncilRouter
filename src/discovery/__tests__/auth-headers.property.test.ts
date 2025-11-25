/**
 * Property-Based Test: Authentication Header Presence
 * Feature: dynamic-model-pricing, Property 30: Authentication Header Presence
 * 
 * Validates: Requirements 7.1
 * 
 * For any API request to a provider, the appropriate authentication header should be included.
 */

import * as fc from 'fast-check';
import { OpenAIModelFetcher } from '../openai-fetcher';
import { AnthropicModelFetcher } from '../anthropic-fetcher';
import { GoogleModelFetcher } from '../google-fetcher';
import { XAIModelFetcher } from '../xai-fetcher';

describe('Property 30: Authentication Header Presence', () => {
    test('OpenAI fetcher includes Bearer token in Authorization header', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 10, maxLength: 100 }), // API key
                async (apiKey) => {
                    const fetcher = new OpenAIModelFetcher(apiKey);
                    const headers = (fetcher as any).getAuthHeaders();

                    // Should have Authorization header with Bearer token
                    expect(headers).toHaveProperty('Authorization');
                    expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Anthropic fetcher includes x-api-key header', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 10, maxLength: 100 }), // API key
                async (apiKey) => {
                    const fetcher = new AnthropicModelFetcher(apiKey);
                    const headers = (fetcher as any).getAuthHeaders();

                    // Should have x-api-key header
                    expect(headers).toHaveProperty('x-api-key');
                    expect(headers['x-api-key']).toBe(apiKey);

                    // Should also have anthropic-version header
                    expect(headers).toHaveProperty('anthropic-version');
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('Google fetcher includes x-goog-api-key header', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 10, maxLength: 100 }), // API key
                async (apiKey) => {
                    const fetcher = new GoogleModelFetcher(apiKey);
                    const headers = (fetcher as any).getAuthHeaders();

                    // Should have x-goog-api-key header
                    expect(headers).toHaveProperty('x-goog-api-key');
                    expect(headers['x-goog-api-key']).toBe(apiKey);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('xAI fetcher includes Bearer token in Authorization header', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 10, maxLength: 100 }), // API key
                async (apiKey) => {
                    const fetcher = new XAIModelFetcher(apiKey);
                    const headers = (fetcher as any).getAuthHeaders();

                    // Should have Authorization header with Bearer token
                    expect(headers).toHaveProperty('Authorization');
                    expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);

    test('All fetchers include authentication headers in requests', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('openai', 'anthropic', 'google', 'xai'),
                fc.string({ minLength: 10, maxLength: 100 }),
                async (provider, apiKey) => {
                    let fetcher: any;
                    let expectedHeader: string;
                    let expectedValue: string | RegExp;

                    switch (provider) {
                        case 'openai':
                            fetcher = new OpenAIModelFetcher(apiKey);
                            expectedHeader = 'Authorization';
                            expectedValue = `Bearer ${apiKey}`;
                            break;
                        case 'anthropic':
                            fetcher = new AnthropicModelFetcher(apiKey);
                            expectedHeader = 'x-api-key';
                            expectedValue = apiKey;
                            break;
                        case 'google':
                            fetcher = new GoogleModelFetcher(apiKey);
                            expectedHeader = 'x-goog-api-key';
                            expectedValue = apiKey;
                            break;
                        case 'xai':
                            fetcher = new XAIModelFetcher(apiKey);
                            expectedHeader = 'Authorization';
                            expectedValue = `Bearer ${apiKey}`;
                            break;
                    }

                    const headers = fetcher.getAuthHeaders();

                    // Verify the expected authentication header is present
                    expect(headers).toHaveProperty(expectedHeader);
                    expect(headers[expectedHeader]).toBe(expectedValue);
                }
            ),
            { numRuns: 100 }
        );
    }, 120000);
});
