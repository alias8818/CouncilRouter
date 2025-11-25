/**
 * xAI Model Fetcher
 * Fetches available models from xAI API
 */

import { BaseModelFetcher } from './base-fetcher';
import { DiscoveredModel, ModelCapability } from '../types/core';

export class XAIModelFetcher extends BaseModelFetcher {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.x.ai') {
    super('xai');
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
      throw new Error('Invalid response format from xAI API');
    }

    return response.data.map((model: any) => this.parseModel(model));
  }

  private parseModel(model: any): DiscoveredModel {
    const capabilities = this.inferCapabilities(model);

    return {
      id: model.id,
      provider: 'xai',
      displayName: model.id,
      ownedBy: model.owned_by || 'xai',
      created: model.created,
      contextWindow: this.extractContextWindow(model),
      capabilities,
      deprecated: false
    };
  }

  private extractContextWindow(model: any): number | undefined {
    // Try to extract from model metadata
    if (model.context_window) {
      return model.context_window;
    }

    if (model.max_tokens) {
      return model.max_tokens;
    }

    // Fall back to known values
    return this.getKnownContextWindow(model.id);
  }

  private getKnownContextWindow(modelId: string): number | undefined {
    const contextWindowMap: Record<string, number> = {
      'grok-beta': 131072, // 128K tokens
      'grok-1': 131072,
      'grok-2': 131072,
      'grok-2-latest': 131072
    };

    // Check for exact match
    if (contextWindowMap[modelId]) {
      return contextWindowMap[modelId];
    }

    // Check for partial match
    for (const [key, value] of Object.entries(contextWindowMap)) {
      if (modelId.startsWith(key)) {
        return value;
      }
    }

    return undefined;
  }

  private inferCapabilities(model: any): ModelCapability[] {
    const capabilities: ModelCapability[] = [];

    // All Grok models support chat and completion
    capabilities.push({ type: 'chat', supported: true });
    capabilities.push({ type: 'completion', supported: true });

    // Check for tool support in model metadata
    if (model.supports_tools || model.capabilities?.includes('tools')) {
      capabilities.push({ type: 'tools', supported: true });
      capabilities.push({ type: 'function_calling', supported: true });
    }

    // Check for vision support
    if (model.supports_vision || model.capabilities?.includes('vision')) {
      capabilities.push({ type: 'vision', supported: true });
    }

    return capabilities;
  }
}
