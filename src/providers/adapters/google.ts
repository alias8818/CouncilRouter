/**
 * Google Provider Adapter
 * Handles communication with Google's Gemini API
 */

import { BaseProviderAdapter } from './base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage } from '../../types/core';

interface GoogleContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GoogleRequest {
  contents: GoogleContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

interface GoogleResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GoogleAdapter extends BaseProviderAdapter {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    return this.executeWithRetry(member, async () => {
      const requestBody = this.formatRequest(prompt, context);
      const modelPath = `models/${member.model}:generateContent`;

      const response = await fetch(`${this.baseUrl}/${modelPath}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error: any = new Error(`Google API error: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    });
  }

  async getHealth(): Promise<{ available: boolean; latency?: number }> {
    const startTime = Date.now();
    try {
      // Use a minimal request to check health
      const response = await fetch(
        `${this.baseUrl}/models/gemini-pro:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'test' }] }]
          })
        }
      );

      const latency = Date.now() - startTime;
      return {
        available: response.ok,
        latency
      };
    } catch (error) {
      return { available: false };
    }
  }

  protected formatRequest(prompt: string, context?: ConversationContext): GoogleRequest {
    const contents: GoogleContent[] = [];

    // Add conversation history if available
    if (context?.messages) {
      for (const entry of context.messages) {
        contents.push({
          role: entry.role === 'user' ? 'user' : 'model',
          parts: [{ text: entry.content }]
        });
      }
    }

    // Add current prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    return {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };
  }

  protected parseResponse(response: GoogleResponse): { content: string; tokenUsage: TokenUsage } {
    const content = response.candidates[0]?.content?.parts[0]?.text || '';
    const tokenUsage: TokenUsage = {
      promptTokens: response.usageMetadata.promptTokenCount,
      completionTokens: response.usageMetadata.candidatesTokenCount,
      totalTokens: response.usageMetadata.totalTokenCount
    };

    return { content, tokenUsage };
  }
}
