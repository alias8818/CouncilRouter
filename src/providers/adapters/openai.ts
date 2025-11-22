/**
 * OpenAI Provider Adapter
 * Handles communication with OpenAI's API
 */

import { BaseProviderAdapter } from './base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage } from '../../types/core';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIAdapter extends BaseProviderAdapter {
  private readonly baseUrl = 'https://api.openai.com/v1';
  
  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    return this.executeWithRetry(member, async () => {
      const requestBody = this.formatRequest(prompt, context);
      requestBody.model = member.model;
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const error: any = new Error(`OpenAI API error: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      
      return await response.json();
    });
  }
  
  async getHealth(): Promise<{ available: boolean; latency?: number }> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
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
      return { available: false };
    }
  }
  
  protected formatRequest(prompt: string, context?: ConversationContext): OpenAIRequest {
    const messages: OpenAIMessage[] = [];
    
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
  
  protected parseResponse(response: OpenAIResponse): { content: string; tokenUsage: TokenUsage } {
    const content = response.choices[0]?.message?.content || '';
    const tokenUsage: TokenUsage = {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens
    };
    
    return { content, tokenUsage };
  }
}
