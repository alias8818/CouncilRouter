/**
 * Anthropic Model Fetcher
 * Fetches available models from Anthropic API
 */

import { BaseModelFetcher } from './base-fetcher';
import { DiscoveredModel, ModelCapability } from '../types/core';

export class AnthropicModelFetcher extends BaseModelFetcher {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.anthropic.com') {
    super('anthropic');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01'
    };
  }

  protected async fetchModelsFromAPI(): Promise<DiscoveredModel[]> {
    const url = `${this.baseUrl}/v1/models`;

    try {
      const response = await this.makeRequest(url);

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format from Anthropic API');
      }

      return response.data.map((model: any) => this.parseModel(model));
    } catch (error: any) {
      // Anthropic may not have a models endpoint yet, fall back to known models
      if (error.status === 404) {
        console.warn('[AnthropicFetcher] Models endpoint not available, using known models');
        return this.getKnownModels();
      }
      throw error;
    }
  }

  private parseModel(model: any): DiscoveredModel {
    const capabilities = this.inferCapabilities(model);

    return {
      id: model.id || model.name,
      provider: 'anthropic',
      displayName: model.display_name || model.name || model.id,
      ownedBy: 'anthropic',
      contextWindow: this.extractContextWindow(model),
      capabilities,
      deprecated: model.deprecated || false
    };
  }

  private extractContextWindow(model: any): number | undefined {
    // Try to extract from model metadata
    if (model.max_tokens_input) {
      return model.max_tokens_input;
    }

    // Fall back to known values
    const modelId = model.id || model.name;
    return this.getKnownContextWindow(modelId);
  }

  private getKnownContextWindow(modelId: string): number | undefined {
    const contextWindowMap: Record<string, number> = {
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-haiku-20240307': 200000,
      'claude-3-5-sonnet-20240620': 200000,
      'claude-3-5-sonnet-20241022': 200000,
      'claude-2.1': 200000,
      'claude-2.0': 100000,
      'claude-instant-1.2': 100000
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
    const modelId = model.id || model.name || '';

    // All Claude models support chat
    capabilities.push({ type: 'chat', supported: true });
    capabilities.push({ type: 'completion', supported: true });

    // Check for vision support
    if (model.supports_vision || modelId.includes('claude-3')) {
      capabilities.push({ type: 'vision', supported: true });
    }

    // Check for tool use
    if (model.supports_tools || modelId.includes('claude-3') || modelId.includes('claude-2')) {
      capabilities.push({ type: 'tools', supported: true });
      capabilities.push({ type: 'function_calling', supported: true });
    }

    return capabilities;
  }

  private getKnownModels(): DiscoveredModel[] {
    // Note: This fallback list should be updated when models change
    // The system should fetch live models from the API when possible
    const knownModels = [
      // Claude 4 series (newest)
      {
        id: 'claude-opus-4-5-20251101',
        displayName: 'Claude Opus 4.5',
        contextWindow: 200000
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        displayName: 'Claude Sonnet 4.5',
        contextWindow: 200000
      },
      {
        id: 'claude-haiku-4-5-20251001',
        displayName: 'Claude Haiku 4.5',
        contextWindow: 200000
      },
      {
        id: 'claude-opus-4-1-20250805',
        displayName: 'Claude Opus 4.1',
        contextWindow: 200000
      },
      {
        id: 'claude-opus-4-20250514',
        displayName: 'Claude Opus 4',
        contextWindow: 200000
      },
      {
        id: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
        contextWindow: 200000
      },
      // Claude 3.5 series
      {
        id: 'claude-3-5-haiku-20241022',
        displayName: 'Claude 3.5 Haiku',
        contextWindow: 200000
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        contextWindow: 200000
      },
      {
        id: 'claude-3-5-sonnet-20240620',
        displayName: 'Claude 3.5 Sonnet (June)',
        contextWindow: 200000
      },
      // Claude 3 series
      {
        id: 'claude-3-opus-20240229',
        displayName: 'Claude 3 Opus',
        contextWindow: 200000
      },
      {
        id: 'claude-3-sonnet-20240229',
        displayName: 'Claude 3 Sonnet',
        contextWindow: 200000
      },
      {
        id: 'claude-3-haiku-20240307',
        displayName: 'Claude 3 Haiku',
        contextWindow: 200000
      }
    ];

    return knownModels.map((model) => ({
      id: model.id,
      provider: 'anthropic' as const,
      displayName: model.displayName,
      ownedBy: 'anthropic',
      contextWindow: model.contextWindow,
      capabilities: [
        { type: 'chat' as const, supported: true },
        { type: 'completion' as const, supported: true },
        { type: 'tools' as const, supported: true },
        { type: 'function_calling' as const, supported: true }
      ],
      deprecated: false
    }));
  }
}
