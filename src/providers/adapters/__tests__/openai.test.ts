/**
 * OpenAI Adapter Tests
 * Comprehensive test suite for OpenAI API integration
 */

import { OpenAIAdapter } from '../openai';
import { CouncilMember, ConversationContext, RetryPolicy } from '../../../types/core';

// Mock fetch globally
global.fetch = jest.fn();

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;
  let testMember: CouncilMember;
  const mockApiKey = 'test-api-key-123';

  const defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 1,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: []
  };

  beforeEach(() => {
    adapter = new OpenAIAdapter(mockApiKey);
    testMember = {
      id: 'test-member',
      provider: 'openai',
      model: 'gpt-4',
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
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello! How can I help you today?'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Hello', undefined);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockApiKey}`
          }
        })
      );

      expect(result.content).toBe('Hello! How can I help you today!');
      expect(result.tokenUsage.promptTokens).toBe(10);
      expect(result.tokenUsage.completionTokens).toBe(20);
      expect(result.tokenUsage.totalTokens).toBe(30);
      expect(result.success).toBe(true);
    });

    it('should format request with conversation context', async () => {
      const context: ConversationContext = {
        messages: [
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' }
        ]
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Context-aware response'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 25,
            completion_tokens: 15,
            total_tokens: 40
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Current question', context);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.messages).toHaveLength(3);
      expect(body.messages[0]).toEqual({ role: 'user', content: 'Previous question' });
      expect(body.messages[1]).toEqual({ role: 'assistant', content: 'Previous answer' });
      expect(body.messages[2]).toEqual({ role: 'user', content: 'Current question' });
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
      expect(result.error?.message).toContain('OpenAI API error');
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
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await adapter.sendRequest(testMember, 'Hello', undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Network error');
    });

    it('should set model from council member', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Response'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      testMember.model = 'gpt-4-turbo';
      await adapter.sendRequest(testMember, 'Test', undefined);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.model).toBe('gpt-4-turbo');
    });

    it('should set temperature parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Response'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Test', undefined);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.temperature).toBe(0.7);
    });

    it('should handle empty response content', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: ''
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 0,
            total_tokens: 10
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
    });

    it('should handle missing choices array', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 0,
            total_tokens: 10
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
    });
  });

  describe('getHealth', () => {
    it('should return healthy status when API is accessible', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: [] })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const health = await adapter.getHealth();

      expect(health.available).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('should call models endpoint for health check', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: [] })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.getHealth();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${mockApiKey}`
          }
        })
      );
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
      expect(health.latency).toBeUndefined();
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
        json: async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return { data: [] };
        }
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const health = await adapter.getHealth();

      expect(health.available).toBe(true);
      expect(health.latency).toBeGreaterThan(0);
    });
  });

  describe('request formatting', () => {
    it('should handle context with mixed message types', async () => {
      const context: ConversationContext = {
        messages: [
          { role: 'user', content: 'Question 1' },
          { role: 'assistant', content: 'Answer 1' },
          { role: 'user', content: 'Question 2' },
          { role: 'assistant', content: 'Answer 2' }
        ]
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Response'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 40,
            completion_tokens: 10,
            total_tokens: 50
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Question 3', context);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.messages).toHaveLength(5);
      expect(body.messages[4].content).toBe('Question 3');
    });

    it('should handle empty context', async () => {
      const context: ConversationContext = {
        messages: []
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Response'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 5,
            total_tokens: 10
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Test', context);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].content).toBe('Test');
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
  });
});
