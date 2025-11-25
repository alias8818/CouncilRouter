/**
 * OpenRouter Provider Adapter
 * Unified adapter for all AI models through OpenRouter's API
 * Replaces individual adapters for OpenAI, Anthropic, Google, and xAI
 */

import { OpenRouter } from '@openrouter/sdk';
import { BaseProviderAdapter } from './base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage } from '../../types/core';
import { logger } from '../../utils/logger';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface OpenRouterChoice {
  index: number;
  message?: {
    role: string;
    content: string;
  };
  delta?: {
    role?: string;
    content?: string;
  };
  finish_reason?: string;
}

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: OpenRouterChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface StreamChunk {
  memberId: string;
  content: string;
  done: boolean;
}

export class OpenRouterAdapter extends BaseProviderAdapter {
  private client: OpenRouter;

  constructor(apiKey: string) {
    super(apiKey);
    this.client = new OpenRouter({
      apiKey: apiKey
    });
  }

  /**
   * Send a standard (non-streaming) request
   */
  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    return this.executeWithRetry(member, async () => {
      const requestBody = this.formatRequest(prompt, context);

      // Map provider/model format to OpenRouter format
      const openRouterModel = this.mapToOpenRouterModel(member.provider, member.model);

      logger.debug(`Sending request to ${openRouterModel}`, {
        component: 'openrouter-adapter',
        memberId: member.id,
        model: member.model,
        provider: member.provider
      });

      const response = await this.client.chat.send({
        model: openRouterModel,
        messages: requestBody.messages,
        temperature: requestBody.temperature
      });

      return response as OpenRouterResponse;
    });
  }

  /**
   * Send a streaming request - yields chunks as they arrive
   */
  async *sendStreamingRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): AsyncGenerator<StreamChunk> {
    const requestBody = this.formatRequest(prompt, context);
    const openRouterModel = this.mapToOpenRouterModel(member.provider, member.model);

    logger.debug(`Starting streaming request to ${openRouterModel}`, {
      component: 'openrouter-adapter',
      memberId: member.id
    });

    try {
      const stream = await this.client.chat.send({
        model: openRouterModel,
        messages: requestBody.messages,
        temperature: requestBody.temperature,
        stream: true
      });

      for await (const chunk of stream as AsyncIterable<any>) {
        const content = chunk.choices?.[0]?.delta?.content || '';
        if (content) {
          yield {
            memberId: member.id,
            content,
            done: false
          };
        }
      }

      yield {
        memberId: member.id,
        content: '',
        done: true
      };
    } catch (error) {
      logger.error(`Streaming error for ${member.id}`, { component: 'openrouter-adapter', memberId: member.id }, error);
      throw error;
    }
  }

  /**
   * Map internal provider/model format to OpenRouter model ID format
   * OpenRouter uses format: provider/model-name (e.g., openai/gpt-4o, anthropic/claude-3-opus)
   */
  private mapToOpenRouterModel(provider: string, model: string): string {
    // If model already includes a slash, assume it's already in OpenRouter format
    if (model.includes('/')) {
      return model;
    }

    // Map provider names to OpenRouter provider prefixes
    const providerMap: Record<string, string> = {
      'openai': 'openai',
      'anthropic': 'anthropic',
      'google': 'google',
      'xai': 'x-ai',
      'grok': 'x-ai',
      'meta': 'meta-llama',
      'mistral': 'mistralai',
      'cohere': 'cohere',
      'perplexity': 'perplexity'
    };

    const openRouterProvider = providerMap[provider.toLowerCase()] || provider.toLowerCase();
    return `${openRouterProvider}/${model}`;
  }

  async getHealth(): Promise<{ available: boolean; latency?: number }> {
    const startTime = Date.now();
    try {
      // Use the models endpoint to check health
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      const latency = Date.now() - startTime;
      return {
        available: response.ok,
        latency
      };
    } catch (error) {
      logger.error('Health check failed', { component: 'openrouter-adapter' }, error);
      return { available: false };
    }
  }

  protected formatRequest(prompt: string, context?: ConversationContext): OpenRouterRequest {
    const messages: OpenRouterMessage[] = [];

    // Add conversation history if available
    if (context?.messages) {
      for (const entry of context.messages) {
        messages.push({
          role: entry.role === 'user' ? 'user' : 'assistant',
          content: entry.content
        });
      }
    }

    // Add current prompt
    messages.push({
      role: 'user',
      content: prompt
    });

    return {
      model: '', // Will be set by sendRequest
      messages,
      temperature: 0.7
    };
  }

  protected parseResponse(response: OpenRouterResponse): { content: string; tokenUsage: TokenUsage } {
    const content = response.choices?.[0]?.message?.content || '';

    const tokenUsage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0
    };

    return { content, tokenUsage };
  }
}

/**
 * Factory function to create OpenRouter adapter
 */
export function createOpenRouterAdapter(): OpenRouterAdapter {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }
  return new OpenRouterAdapter(apiKey);
}

