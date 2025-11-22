/**
 * Anthropic Provider Adapter
 * Handles communication with Anthropic's API (Claude)
 */

import { BaseProviderAdapter } from './base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage } from '../../types/core';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicAdapter extends BaseProviderAdapter {
  private readonly baseUrl = 'https://api.anthropic.com/v1';
  private readonly apiVersion = '2023-06-01';
  
  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    return this.executeWithRetry(member, async () => {
      const requestBody = this.formatRequest(prompt, context);
      requestBody.model = member.model;
      
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const error: any = new Error(`Anthropic API error: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      
      return await response.json();
    });
  }
  
  async getHealth(): Promise<{ available: boolean; latency?: number }> {
    const startTime = Date.now();
    try {
      // Anthropic doesn't have a dedicated health endpoint, so we'll use a minimal request
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        })
      });
      
      const latency = Date.now() - startTime;
      return {
        available: response.ok || response.status === 400, // 400 is ok for health check
        latency
      };
    } catch (error) {
      return { available: false };
    }
  }
  
  protected formatRequest(prompt: string, context?: ConversationContext): AnthropicRequest {
    const messages: AnthropicMessage[] = [];
    
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
      max_tokens: 4096,
      temperature: 0.7
    };
  }
  
  protected parseResponse(response: AnthropicResponse): { content: string; tokenUsage: TokenUsage } {
    const content = response.content[0]?.text || '';
    const tokenUsage: TokenUsage = {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens
    };
    
    return { content, tokenUsage };
  }
}
