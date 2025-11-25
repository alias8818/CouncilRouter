/**
 * Google Gemini Model Fetcher
 * Fetches available models from Google Gemini API
 */

import { BaseModelFetcher } from './base-fetcher';
import { DiscoveredModel, ModelCapability } from '../types/core';

export class GoogleModelFetcher extends BaseModelFetcher {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://generativelanguage.googleapis.com') {
    super('google');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-goog-api-key': this.apiKey
    };
  }

  protected async fetchModelsFromAPI(): Promise<DiscoveredModel[]> {
    const url = `${this.baseUrl}/v1beta/models?key=${this.apiKey}`;

    // Google uses query parameter for API key, so we don't need auth headers
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }

    const data: any = await response.json();

    if (!data.models || !Array.isArray(data.models)) {
      throw new Error('Invalid response format from Google API');
    }

    return data.models
      .filter((model: any) => this.isGenerativeModel(model))
      .map((model: any) => this.parseModel(model));
  }

  private isGenerativeModel(model: any): boolean {
    // Filter to only generative models (not embedding-only models)
    const supportedMethods = model.supportedGenerationMethods || [];
    return (
      supportedMethods.includes('generateContent') ||
            supportedMethods.includes('generateMessage')
    );
  }

  private parseModel(model: any): DiscoveredModel {
    const capabilities = this.inferCapabilities(model);

    return {
      id: this.extractModelId(model.name),
      provider: 'google',
      displayName: model.displayName || this.extractModelId(model.name),
      ownedBy: 'google',
      contextWindow: this.extractContextWindow(model),
      capabilities,
      deprecated: false
    };
  }

  private extractModelId(fullName: string): string {
    // Google returns names like "models/gemini-pro"
    // Extract just the model ID
    const parts = fullName.split('/');
    return parts[parts.length - 1];
  }

  private extractContextWindow(model: any): number | undefined {
    // Try to extract from model metadata
    if (model.inputTokenLimit) {
      return model.inputTokenLimit;
    }

    // Fall back to known values
    const modelId = this.extractModelId(model.name);
    return this.getKnownContextWindow(modelId);
  }

  private getKnownContextWindow(modelId: string): number | undefined {
    const contextWindowMap: Record<string, number> = {
      'gemini-1.5-pro': 2097152, // 2M tokens
      'gemini-1.5-pro-latest': 2097152,
      'gemini-1.5-flash': 1048576, // 1M tokens
      'gemini-1.5-flash-latest': 1048576,
      'gemini-1.0-pro': 32768,
      'gemini-1.0-pro-latest': 32768,
      'gemini-pro': 32768,
      'gemini-pro-vision': 16384
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
    const supportedMethods = model.supportedGenerationMethods || [];

    // Chat/completion support
    if (
      supportedMethods.includes('generateContent') ||
            supportedMethods.includes('generateMessage')
    ) {
      capabilities.push({ type: 'chat', supported: true });
      capabilities.push({ type: 'completion', supported: true });
    }

    // Vision support
    const modelId = this.extractModelId(model.name);
    if (modelId.includes('vision') || modelId.includes('1.5')) {
      capabilities.push({ type: 'vision', supported: true });
    }

    // Tool/function calling support
    if (supportedMethods.includes('generateContent')) {
      capabilities.push({ type: 'tools', supported: true });
      capabilities.push({ type: 'function_calling', supported: true });
    }

    return capabilities;
  }
}
