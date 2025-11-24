/**
 * OpenAI Provider Adapter
 * Handles communication with OpenAI's API
 */

import { BaseProviderAdapter } from './base';
import { CouncilMember, ProviderResponse, ConversationContext, TokenUsage } from '../../types/core';

// Inline debug logging to avoid module import issues
function debugError(message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[ERROR ${timestamp}] ${message}`;
  process.stderr.write(logMessage + '\n');
  console.error(logMessage);
  if (data !== undefined) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    process.stderr.write(dataStr + '\n');
    console.error(dataStr);
  }
}

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
      // GPT-5.1 uses the new /responses endpoint with different format
      if (member.model.startsWith('gpt-5')) {
        return this.sendGPT5Request(member, prompt, context);
      }

      // Legacy models use /chat/completions
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
        let errorBody = '';
        try {
          errorBody = await response.text();
          const parsed = JSON.parse(errorBody);
          errorBody = JSON.stringify(parsed, null, 2);
        } catch {
          errorBody = errorBody || response.statusText;
        }

        const errorMsg = `OpenAI API error (${response.status}): ${response.statusText}`;
        console.error(`[OpenAIAdapter] Request failed for model ${member.model}:`, {
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

  /**
   * Send request using GPT-5.1 new API format
   */
  private async sendGPT5Request(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<any> {
    // TEST: Log that this function is being called
    debugError(`[OpenAIAdapter] sendGPT5Request CALLED for ${member.id} with model ${member.model}`);
    process.stderr.write(`[TEST] sendGPT5Request called for ${member.id}\n`);
    console.error(`[TEST CONSOLE] sendGPT5Request called for ${member.id}`);

    // Build input text from context and prompt
    let inputText = prompt;
    if (context?.messages) {
      const contextText = context.messages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');
      inputText = `${contextText}\n\nUser: ${prompt}`;
    }

    const requestBody = {
      model: member.model,
      input: inputText,
      reasoning: { effort: 'low' }
    };

    const response = await fetch(`${this.baseUrl}/responses`, {
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

      const errorMsg = `OpenAI API error (${response.status}): ${response.statusText}`;
      console.error(`[OpenAIAdapter] GPT-5.1 request failed for model ${member.model}:`, {
        status: response.status,
        statusText: response.statusText,
        errorBody,
        model: member.model,
        endpoint: `${this.baseUrl}/responses`
      });

      const error: any = new Error(errorMsg);
      error.status = response.status;
      error.body = errorBody;
      throw error;
    }

    const data: any = await response.json();

    // TEST: Multiple logging methods
    process.stderr.write('[TEST] Got response from GPT-5.1 API\n');
    console.error('[TEST CONSOLE] Got response from GPT-5.1 API');
    debugError(`[OpenAIAdapter] GPT-5.1 FULL RESPONSE for ${member.model}`, JSON.stringify(data, null, 2));

    // Helper function to recursively extract text from any structure
    const extractText = (obj: any): string[] => {
      if (typeof obj === 'string') {
        return [obj];
      }
      if (Array.isArray(obj)) {
        // CRITICAL: Handle arrays properly - extract from each item
        const results: string[] = [];
        for (const item of obj) {
          if (typeof item === 'string') {
            results.push(item);
          } else if (item && typeof item === 'object') {
            // Try common text fields
            const textFields = ['text', 'content', 'message', 'response', 'output', 'answer', 'value'];
            for (const field of textFields) {
              if (item[field] && typeof item[field] === 'string') {
                results.push(item[field]);
                break; // Found a text field, move to next item
              }
            }
            // If no text field found, recursively search
            const nested = extractText(item);
            results.push(...nested);
          }
        }
        return results;
      }
      if (obj && typeof obj === 'object') {
        // Try common text fields first
        const textFields = ['text', 'content', 'message', 'response', 'output', 'answer', 'value'];
        for (const field of textFields) {
          if (obj[field] && typeof obj[field] === 'string') {
            return [obj[field]];
          }
        }
        // Recursively search all properties
        return Object.values(obj).flatMap(val => extractText(val));
      }
      return [];
    };

    // Extract content from GPT-5.1 response format
    // GPT-5.1 returns: { output: [{ type: "message", content: [{ type: "output_text", text: "..." }] }] }
    let content: string = '';

    debugError('[OpenAIAdapter] Attempting structured extraction from GPT-5.1 response');
    if (Array.isArray(data.output)) {
      debugError(`[OpenAIAdapter] data.output is array with ${data.output.length} items`);
      // Find the message-type output item
      const messageOutput = data.output.find((item: any) => item.type === 'message');
      if (messageOutput) {
        debugError(`[OpenAIAdapter] Found message output, content array length: ${Array.isArray(messageOutput.content) ? messageOutput.content.length : 'not array'}`);
        if (Array.isArray(messageOutput.content)) {
          // Find all output_text content items and extract their text
          const textContents = messageOutput.content
            .filter((item: any) => item.type === 'output_text' && typeof item.text === 'string')
            .map((item: any) => item.text);
          debugError(`[OpenAIAdapter] Found ${textContents.length} output_text items`);
          if (textContents.length > 0) {
            content = textContents.join(' ');
            debugError(`[OpenAIAdapter] SUCCESS: Extracted text from GPT-5.1 message content: "${content.substring(0, 200)}"`);
          } else {
            debugError('[OpenAIAdapter] No output_text items found in message content');
          }
        }
      } else {
        debugError('[OpenAIAdapter] No message-type output found in array');
      }
    } else {
      debugError(`[OpenAIAdapter] data.output is not an array: ${typeof data.output}`);
    }

    // Fallback: try recursive extraction if structured extraction failed
    if (!content) {
      debugError('[OpenAIAdapter] Structured extraction failed, trying recursive extraction');
      const extracted = extractText(data);
      debugError(`[OpenAIAdapter] Recursive extraction found ${extracted.length} total strings`);
      // Filter out IDs and other non-content strings (IDs typically start with specific prefixes)
      const filtered = extracted.filter(t =>
        t &&
        typeof t === 'string' &&
        !t.includes('[object Object]') &&
        t.length > 3 && // Filter out very short strings (likely IDs or status)
        !t.match(/^(rs_|msg_|resp_)[a-z0-9_]+$/i) && // Filter out IDs
        !t.match(/^(reasoning|message|completed|assistant|developer)$/i) && // Filter out status strings
        !t.match(/^[a-z0-9_]{20,}$/i) // Filter out long alphanumeric strings (likely IDs)
      );
      debugError(`[OpenAIAdapter] After filtering: ${filtered.length} text items`);
      content = filtered.join(' ') || '';
      if (content) {
        debugError(`[OpenAIAdapter] Recursive extraction found content: "${content.substring(0, 200)}"`);
      }
    }

    // Last resort: error message
    if (!content) {
      debugError('[OpenAIAdapter] CRITICAL: Could not extract any text from GPT-5.1 response!');
      content = 'Error: Could not extract content from GPT-5.1 response';
    }

    // Ensure content is a string
    if (typeof content !== 'string') {
      debugError('[OpenAIAdapter] Content is still not a string after extraction', { type: typeof content, content });
      content = String(content || '');
    }

    // Final validation
    if (content.includes('[object Object]')) {
      debugError('[OpenAIAdapter] CRITICAL: Content still contains [object Object] after all extraction attempts!', {
        content: content,
        originalOutput: data.output,
        originalResponse: data.response,
        dataKeys: Object.keys(data || {}),
        fullData: JSON.stringify(data, null, 2).substring(0, 2000)
      });
      // Last resort: return error message instead of corrupted content
      content = 'Error: GPT-5.1 returned invalid response format';
    }

    // CRITICAL: Final check before returning - if content is still corrupted, log and try one more recovery
    if (content.includes('[object Object]')) {
      debugError('[OpenAIAdapter] CRITICAL: Content STILL corrupted after all attempts! Raw data', JSON.stringify(data, null, 2));
      // Try one final extraction from the entire data object
      const finalExtraction = extractText(data);
      const finalContent = finalExtraction.filter(t => t && typeof t === 'string' && !t.includes('[object Object]')).join(' ');
      if (finalContent && finalContent.length > 0) {
        debugError(`[OpenAIAdapter] Recovery successful! Extracted: "${finalContent.substring(0, 100)}"`);
        content = finalContent;
      } else {
        debugError('[OpenAIAdapter] Recovery failed. Returning error message.');
        content = 'Error: Could not extract valid content from GPT-5.1 response';
      }
    }

    // Transform GPT-5.1 response format to match expected format
    const transformedResponse = {
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: content
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0
      }
    };

    debugError(`[OpenAIAdapter] Returning transformed response with content: "${content.substring(0, 100)}"`);

    return transformedResponse;
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

  protected parseResponse(response: OpenAIResponse | any): { content: string; tokenUsage: TokenUsage } {
    // Handle both legacy and GPT-5.1 response formats
    let content: any = response.choices?.[0]?.message?.content ||
                  response.output ||
                  response.response ||
                  '';

    // Debug logging
    if (typeof content !== 'string') {
      console.warn('[OpenAIAdapter] parseResponse received non-string content:', {
        type: typeof content,
        isArray: Array.isArray(content),
        content: content,
        responseKeys: Object.keys(response || {})
      });
    }

    // Handle arrays (GPT-5.1 might return arrays)
    if (Array.isArray(content)) {
      console.warn('[OpenAIAdapter] parseResponse extracting from array:', content.length);
      content = content.map((item: any) => {
        if (typeof item === 'string') {return item;}
        if (item && typeof item === 'object') {
          return item.text || item.content || item.message || JSON.stringify(item);
        }
        return String(item || '');
      }).filter((item: string) => item && !item.includes('[object Object]')).join(' ');
    } else if (content && typeof content === 'object') {
      // Handle objects
      console.warn('[OpenAIAdapter] parseResponse extracting from object:', Object.keys(content));
      content = content.text || content.content || content.message || JSON.stringify(content);
    }

    // Ensure content is always a string
    if (typeof content !== 'string') {
      content = String(content || '');
    }

    // Final check for corruption
    if (content.includes('[object Object]')) {
      console.error('[OpenAIAdapter] parseResponse produced corrupted content:', {
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
