/**
 * Anthropic Adapter Tests
 * Comprehensive test suite for Anthropic API integration
 */

import { AnthropicAdapter } from '../anthropic';
import { CouncilMember, ConversationContext, RetryPolicy } from '../../../types/core';

// Mock fetch globally
global.fetch = jest.fn();

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;
  let testMember: CouncilMember;
  const mockApiKey = 'test-anthropic-key-456';

  const defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 1,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: []
  };

  beforeEach(() => {
    adapter = new AnthropicAdapter(mockApiKey);
    testMember = {
      id: 'test-member-anthropic',
      provider: 'anthropic',
      model: 'claude-3-opus-20240229',
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
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Hello! I am Claude, an AI assistant created by Anthropic.'
            }
          ],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 15,
            output_tokens: 25
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Hello', undefined);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': mockApiKey,
            'anthropic-version': '2023-06-01'
          }
        })
      );

      expect(result.content).toBe('Hello! I am Claude, an AI assistant created by Anthropic.');
      expect(result.tokenUsage.promptTokens).toBe(15);
      expect(result.tokenUsage.completionTokens).toBe(25);
      expect(result.tokenUsage.totalTokens).toBe(40);
      expect(result.success).toBe(true);
    });

    it('should format request with conversation context', async () => {
      const context: ConversationContext = {
        messages: [
          { role: 'user', content: 'What is AI?', timestamp: new Date() },
          { role: 'assistant', content: 'AI stands for Artificial Intelligence', timestamp: new Date() }
        ],
        totalTokens: 30,
        summarized: false
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_456',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Context-aware response about AI'
            }
          ],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 35,
            output_tokens: 20
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Tell me more', context);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.messages).toHaveLength(3);
      expect(body.messages[0]).toEqual({ role: 'user', content: 'What is AI?' });
      expect(body.messages[1]).toEqual({ role: 'assistant', content: 'AI stands for Artificial Intelligence' });
      expect(body.messages[2]).toEqual({ role: 'user', content: 'Tell me more' });
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
      expect(result.error?.message).toContain('Anthropic API error');
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
      (fetch as jest.Mock).mockRejectedValue(new Error('Network connection failed'));

      const result = await adapter.sendRequest(testMember, 'Hello', undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Network connection failed');
    });

    it('should set model from council member', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_789',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Response'
            }
          ],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 10
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      testMember.model = 'claude-3-sonnet-20240229';
      await adapter.sendRequest(testMember, 'Test', undefined);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.model).toBe('claude-3-sonnet-20240229');
    });

    it('should set temperature parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_temp',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Response'
            }
          ],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 5,
            output_tokens: 5
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Test', undefined);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.temperature).toBe(0.7);
    });

    it('should set max_tokens parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_max_tokens',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Response'
            }
          ],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 5,
            output_tokens: 5
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.sendRequest(testMember, 'Test', undefined);

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.max_tokens).toBe(4096);
    });

    it('should handle empty response content', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_empty',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: ''
            }
          ],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 0
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
    });

    it('should handle missing content array', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_no_content',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 0
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
    });

    it('should handle multiple content blocks', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_multi',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'First block'
            },
            {
              type: 'text',
              text: 'Second block'
            }
          ],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 15
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.success).toBe(true);
      // The adapter uses the first content block
      expect(result.content).toBe('First block');
    });

    it('should handle different Claude models', async () => {
      const models = [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ];

      for (const model of models) {
        const mockResponse = {
          ok: true,
          json: async () => ({
            id: `msg_${model}`,
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: `Response from ${model}` }],
            model,
            stop_reason: 'end_turn',
            usage: { input_tokens: 5, output_tokens: 10 }
          })
        };

        (fetch as jest.Mock).mockResolvedValue(mockResponse);

        testMember.model = model;
        const result = await adapter.sendRequest(testMember, 'Test', undefined);

        expect(result.success).toBe(true);
        expect(result.content).toBe(`Response from ${model}`);
      }
    });
  });

  describe('getHealth', () => {
    it('should return healthy status when API is accessible', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_health',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'test' }],
          model: 'claude-3-haiku-20240307',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const health = await adapter.getHealth();

      expect(health.available).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('should call messages endpoint for health check', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_health',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'test' }],
          model: 'claude-3-haiku-20240307',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await adapter.getHealth();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': mockApiKey,
            'anthropic-version': '2023-06-01'
          }
        })
      );

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.model).toBe('claude-3-haiku-20240307');
      expect(body.messages).toEqual([{ role: 'user', content: 'test' }]);
      expect(body.max_tokens).toBe(1);
    });

    it('should return available for 400 errors (validation errors)', async () => {
      // Anthropic considers 400 as "available" for health check
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const health = await adapter.getHealth();

      expect(health.available).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
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
          id: 'msg_latency',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'test' }],
          model: 'claude-3-haiku-20240307',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 }
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
          id: 'msg_mixed',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 40, output_tokens: 10 }
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
        messages: [],
        totalTokens: 0,
        summarized: false
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_empty_ctx',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 5 }
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
  });

  describe('token usage tracking', () => {
    it('should correctly calculate total tokens', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_tokens',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, 'Test', undefined);

      expect(result.tokenUsage.promptTokens).toBe(100);
      expect(result.tokenUsage.completionTokens).toBe(50);
      expect(result.tokenUsage.totalTokens).toBe(150);
    });

    it('should handle zero token usage', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg_zero_tokens',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: '' }],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 0,
            output_tokens: 0
          }
        })
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await adapter.sendRequest(testMember, '', undefined);

      expect(result.tokenUsage.totalTokens).toBe(0);
    });
  });
});
