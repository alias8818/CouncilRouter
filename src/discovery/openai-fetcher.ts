/**
 * OpenAI Model Fetcher
 * Fetches available models from OpenAI API
 */

import { BaseModelFetcher } from './base-fetcher';
import { DiscoveredModel, ModelCapability } from '../types/core';

export class OpenAIModelFetcher extends BaseModelFetcher {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.openai.com') {
    super('openai');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  protected async fetchModelsFromAPI(): Promise<DiscoveredModel[]> {
    const url = `${this.baseUrl}/v1/models`;
    const response = await this.makeRequest(url);

    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('Invalid response format from OpenAI API');
    }

    return response.data.map((model: any) => this.parseModel(model));
  }

  private parseModel(model: any): DiscoveredModel {
    const capabilities = this.inferCapabilities(model.id);

    return {
      id: model.id,
      provider: 'openai',
      displayName: model.id,
      ownedBy: model.owned_by,
      created: model.created,
      contextWindow: this.extractContextWindow(model),
      capabilities,
      deprecated: false
    };
  }

  private extractContextWindow(model: any): number | undefined {
    // Try to extract from model metadata if available
    // OpenAI doesn't always provide this in the API response
    // We'll need to maintain a mapping for known models
    const contextWindowMap: Record<string, number> = {
      'gpt-4-turbo': 128000,
      'gpt-4-turbo-preview': 128000,
      'gpt-4-0125-preview': 128000,
      'gpt-4-1106-preview': 128000,
      'gpt-4': 8192,
      'gpt-4-0613': 8192,
      'gpt-4-32k': 32768,
      'gpt-4-32k-0613': 32768,
      'gpt-3.5-turbo': 16385,
      'gpt-3.5-turbo-16k': 16385,
      'gpt-3.5-turbo-0125': 16385,
      'gpt-3.5-turbo-1106': 16385,
      'text-embedding-3-large': 8191,
      'text-embedding-3-small': 8191,
      'text-embedding-ada-002': 8191
    };

    // Check for exact match
    if (contextWindowMap[model.id]) {
      return contextWindowMap[model.id];
    }

    // Check for partial match (e.g., gpt-4-turbo-2024-04-09)
    for (const [key, value] of Object.entries(contextWindowMap)) {
      if (model.id.startsWith(key)) {
        return value;
      }
    }

    return undefined;
  }

  private inferCapabilities(modelId: string): ModelCapability[] {
    const capabilities: ModelCapability[] = [];

    // Chat models
    if (modelId.includes('gpt-4') || modelId.includes('gpt-3.5')) {
      capabilities.push({ type: 'chat', supported: true });
      capabilities.push({ type: 'completion', supported: true });
    }

    // Embedding models
    if (modelId.includes('embedding')) {
      capabilities.push({ type: 'embedding', supported: true });
    }

    // Vision models
    if (modelId.includes('vision') || modelId.includes('gpt-4-turbo')) {
      capabilities.push({ type: 'vision', supported: true });
    }

    // Function calling (most GPT-4 and GPT-3.5 models support this)
    if (modelId.includes('gpt-4') || modelId.includes('gpt-3.5-turbo')) {
      capabilities.push({ type: 'function_calling', supported: true });
      capabilities.push({ type: 'tools', supported: true });
    }

    return capabilities;
  }
}
