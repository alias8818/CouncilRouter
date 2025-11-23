/**
 * Google Adapter Tests
 * Comprehensive test suite for Google Gemini API integration
 */

import { GoogleAdapter } from '../google';
import { CouncilMember, ConversationContext, RetryPolicy } from '../../../types/core';

// Mock fetch globally
global.fetch = jest.fn();

describe('GoogleAdapter', () => {
  let adapter: GoogleAdapter;
  let testMember: CouncilMember;
  const mockApiKey = 'test-google-key-789';

  const defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 1,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: []
  };

  beforeEach(() => {
    adapter = new GoogleAdapter(mockApiKey);
    testMember = {
      id: 'test-member-google',
      provider: 'google',
      model: 'gemini-pro',
      timeout: 30,
      retryPolicy: defaultRetryPolicy
    };

    (fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendRequest', () => {
    it('should send request with correct headers and body', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Hello! How can I help you today?'
                  }
                ],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 12,
            candidatesTokenCount: 18,
            totalTokenCount: 30
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Hello', undefined);

      expect(fetch).toHaveBeenCalledWith(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${mockApiKey}`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );

      expect(result.content).toBe('Hello! How can I help you today?');
      expect(result.tokenUsage.promptTokens).toBe(12);
      expect(result.tokenUsage.completionTokens).toBe(18);
      expect(result.tokenUsage.totalTokens).toBe(30);
      expect(result.success).toBe(true);
    });

    it('should format request with conversation context', async () => {
      const context: ConversationContext = {
        messages: [
          { role: 'user', content: 'What is Gemini?', timestamp: new Date() },
          { role: 'assistant', content: 'Gemini is a family of AI models', timestamp: new Date() }
        ],
        totalTokens: 25,
        summarized: false
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Context-aware response about Gemini' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 30,
            candidatesTokenCount: 15,
            totalTokenCount: 45
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Tell me more', context);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.contents).toHaveLength(3);
      expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'What is Gemini?' }] });
      expect(body.contents[1]).toEqual({ role: 'model', parts: [{ text: 'Gemini is a family of AI models' }] });
      expect(body.contents[2]).toEqual({ role: 'user', parts: [{ text: 'Tell me more' }] });
    });

    it('should handle API errors', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      };

      (fetch as jest.Mock).mockResolvedValue(mockErrorResponse);

      const result = await adapter.sendRequest(testMember, 'Hello', undefined);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Google API error');
      expect(result.error?.message).toContain('Unauthorized');
    });

    it('should handle rate limit errors', async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      };

      (fetch as jest.Mock).mockResolvedValue(mockRateLimitResponse);

      const result = await adapter.sendRequest(testMember, 'Hello', undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Too Many Requests');
    });

    it('should handle network errors', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network connection lost'));

      const result = await adapter.sendRequest(testMember, 'Hello', undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Network connection lost');
    });

    it('should set model from council member', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 10,
            totalTokenCount: 20
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      testMember.model = 'gemini-ultra';
      await adapter.sendRequest(testMember, 'Test', undefined);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const url = callArgs[0];

      expect(url).toContain('models/gemini-ultra:generateContent');
    });

    it('should set temperature parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 5,
            totalTokenCount: 10
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Test', undefined);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.generationConfig.temperature).toBe(0.7);
    });

    it('should set maxOutputTokens parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 5,
            totalTokenCount: 10
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Test', undefined);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.generationConfig.maxOutputTokens).toBe(4096);
    });

    it('should handle empty response content', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 0,
            totalTokenCount: 10
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
    });

    it('should handle missing candidates array', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 0,
            totalTokenCount: 10
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
    });

    it('should handle different Gemini models', async () => {
      const models = ['gemini-pro', 'gemini-ultra', 'gemini-pro-vision'];

      for (const model of models) {
        const mockResponse = {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: `Response from ${model}` }],
                  role: 'model'
                },
                finishReason: 'STOP'
              }
            ],
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 10,
              totalTokenCount: 15
            }
          })
        };

        (fetch as jest.Mock).mockResolvedValue(mockResponse);

        testMember.model = model;
        const result = await adapter.sendRequest(testMember, 'Test', undefined);

        expect(result.success).toBe(true);
        expect(result.content).toBe(`Response from ${model}`);
      }
    });

    it('should handle multiple parts in response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'First part' },
                  { text: 'Second part' }
                ],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 15,
            totalTokenCount: 25
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      // The adapter uses the first part
      expect(result.content).toBe('First part');
    });
  });

  describe('getHealth', () => {
    it('should return healthy status when API is accessible', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'test' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const health = await adapter.getHealth();

      expect(health.available).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('should call generateContent endpoint for health check', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'test' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.getHealth();

      expect(fetch).toHaveBeenCalledWith(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${mockApiKey}`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'test' }] }]);
    });

    it('should return unavailable when API is down', async () => {
      const mockResponse = {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const health = await adapter.getHealth();

      expect(health.available).toBe(false);
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unavailable on network error', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const health = await adapter.getHealth();

      expect(health.available).toBe(false);
      expect(health.latency).toBeUndefined();
    });

    it('should measure latency', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'test' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2
          }
        })
      };

      // Delay the fetch response to simulate network latency
      (fetch as jest.Mock).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return mockResponse;
      });

      const health = await adapter.getHealth();

      expect(health.available).toBe(true);
      expect(health.latency).toBeGreaterThan(0);
    });
  });

  describe('request formatting', () => {
    it('should handle context with mixed message types', async () => {
      const context: ConversationContext = {
        messages: [
          { role: 'user', content: 'Question 1', timestamp: new Date() },
          { role: 'assistant', content: 'Answer 1', timestamp: new Date() },
          { role: 'user', content: 'Question 2', timestamp: new Date() },
          { role: 'assistant', content: 'Answer 2', timestamp: new Date() }
        ],
        totalTokens: 100,
        summarized: false
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 40,
            candidatesTokenCount: 10,
            totalTokenCount: 50
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Question 3', context);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.contents).toHaveLength(5);
      expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Question 1' }] });
      expect(body.contents[1]).toEqual({ role: 'model', parts: [{ text: 'Answer 1' }] });
      expect(body.contents[4]).toEqual({ role: 'user', parts: [{ text: 'Question 3' }] });
    });

    it('should handle empty context', async () => {
      const context: ConversationContext = {
        messages: [],
        totalTokens: 0,
        summarized: false
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 5,
            totalTokenCount: 10
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Test', context);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.contents).toHaveLength(1);
      expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Test' }] });
    });
  });

  describe('error handling edge cases', () => {
    it('should handle timeout errors', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Request timeout'));

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Request timeout');
    });

    it('should handle JSON parsing errors', async () => {
      const mockResponse = {
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid JSON');
    });

    it('should handle 500 server errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Internal Server Error');
    });

    it('should handle authentication errors', async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Forbidden');
    });

    it('should handle invalid API key', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request - Invalid API key'
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Bad Request');
    });
  });

  describe('token usage tracking', () => {
    it('should correctly calculate total tokens', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Response' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 150,
            candidatesTokenCount: 75,
            totalTokenCount: 225
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.tokenUsage.promptTokens).toBe(150);
      expect(result.tokenUsage.completionTokens).toBe(75);
      expect(result.tokenUsage.totalTokens).toBe(225);
    });

    it('should handle zero token usage', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 0,
            candidatesTokenCount: 0,
            totalTokenCount: 0
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, '', undefined);

      expect(result.tokenUsage.totalTokens).toBe(0);
    });
  });

  describe('finish reason handling', () => {
    it('should handle STOP finish reason', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Complete response' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 10,
            totalTokenCount: 20
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Complete response');
    });

    it('should handle MAX_TOKENS finish reason', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Truncated response' }],
                role: 'model'
              },
              finishReason: 'MAX_TOKENS'
            }
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 4096,
            totalTokenCount: 4106
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Truncated response');
    });
  });
});
