/**
 * Grok Provider Adapter (x.AI)
 * Handles communication with x.AI's Grok API
 */

import { BaseProviderAdapter } from './base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage } from '../../types/core';

interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GrokRequest {
  model: string;
  messages: GrokMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface GrokResponse {
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

export class GrokAdapter extends BaseProviderAdapter {
  private readonly baseUrl = 'https://api.x.ai/v1';

  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    return this.executeWithRetry(member, async () => {
      const requestBody = this.formatRequest(prompt, context);
      requestBody.model = member.model;
      requestBody.stream = false; // Always use non-streaming for consistency

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
          const parsed = JSON.parse(errorBody);
          errorBody = JSON.stringify(parsed, null, 2);
        } catch {
          errorBody = errorBody || response.statusText;
        }

        const errorMsg = `Grok API error (${response.status}): ${response.statusText}`;
        console.error(`[GrokAdapter] Request failed for model ${member.model}:`, {
          status: response.status,
          statusText: response.statusText,
          errorBody,
          model: member.model,
          endpoint: `${this.baseUrl}/chat/completions`
        });

        const error: any = new Error(errorMsg);
        error.status = response.status;
        error.body = errorBody;
        throw error;
      }

      return response.json();
    });
  }

  async getHealth(): Promise<{ available: boolean; latency?: number }> {
    const startTime = Date.now();
    try {
      // Use a minimal request to check health
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'grok-4-1-fast-non-reasoning',
          messages: [
            {
              role: 'user',
              content: 'test'
            }
          ],
          max_tokens: 5
        })
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

  protected formatRequest(prompt: string, context?: ConversationContext): GrokRequest {
    const messages: GrokMessage[] = [];

    // Add system message (Grok expects this)
    messages.push({
      role: 'system',
      content: 'You are Grok, a highly intelligent, helpful AI assistant.'
    });

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
      temperature: 0.7,
      stream: false
    };
  }

  protected parseResponse(response: GrokResponse | any): { content: string; tokenUsage: TokenUsage } {
    let content: any = response.choices?.[0]?.message?.content || '';

    // Ensure content is always a string
    if (typeof content !== 'string') {
      console.warn('[GrokAdapter] parseResponse received non-string content:', {
        type: typeof content,
        isArray: Array.isArray(content),
        content: content,
        responseKeys: Object.keys(response || {})
      });

      // Handle arrays
      if (Array.isArray(content)) {
        content = content.map((item: any) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object') {
            return item.text || item.content || item.message || JSON.stringify(item);
          }
          return String(item || '');
        }).filter((item: string) => item && !item.includes('[object Object]')).join(' ');
      } else if (content && typeof content === 'object') {
        content = content.text || content.content || content.message || JSON.stringify(content);
      } else {
        content = String(content || '');
      }
    }

    // Ensure content is definitely a string after all conversions
    if (typeof content !== 'string') {
      content = String(content || '');
    }

    // Final check for corruption
    if (typeof content === 'string' && content.includes('[object Object]')) {
      console.error('[GrokAdapter] parseResponse produced corrupted content:', {
        content: content,
        originalType: typeof response.choices?.[0]?.message?.content,
        originalContent: response.choices?.[0]?.message?.content
      });
    }

    const tokenUsage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens || response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completion_tokens || response.usage?.completionTokens || 0,
      totalTokens: response.usage?.total_tokens || response.usage?.totalTokens || 0
    };

    return { content, tokenUsage };
  }
}

