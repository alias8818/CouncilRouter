/**
 * Provider Pool
 * Manages connections to AI provider APIs and tracks their health
 */

import { IProviderPool } from '../interfaces/IProviderPool';
import {
  CouncilMember,
  ProviderResponse,
  ProviderHealth,
  ConversationContext,
  ProviderType
} from '../types/core';
import { BaseProviderAdapter } from './adapters/base';
import { OpenAIAdapter } from './adapters/openai';
import { AnthropicAdapter } from './adapters/anthropic';
import { GoogleAdapter } from './adapters/google';
import { GrokAdapter } from './adapters/grok';
import { OpenRouterAdapter } from './adapters/openrouter';
import {
  ProviderHealthTracker,
  getSharedHealthTracker
} from './health-tracker';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';
import { IModelRegistry } from '../interfaces/IModelRegistry';
import { Pool } from 'pg';

interface ProviderLatencyTracking {
  latencies: number[];
  successCount: number;
  totalRequests: number;
}

export class ProviderPool implements IProviderPool {
  private adapters: Map<string, BaseProviderAdapter>;
  private latencyTracking: Map<string, ProviderLatencyTracking>;
  private healthTracker: ProviderHealthTracker;
  private readonly maxLatencyHistory = 100;
  private configManager?: IConfigurationManager;
  private modelRegistry?: IModelRegistry;
  private db?: Pool;

  constructor(
    healthTracker?: ProviderHealthTracker,
    configManager?: IConfigurationManager,
    db?: Pool,
    modelRegistry?: IModelRegistry
  ) {
    this.adapters = new Map();
    this.latencyTracking = new Map();
    this.healthTracker = healthTracker || getSharedHealthTracker(db);
    this.configManager = configManager;
    this.modelRegistry = modelRegistry;
    this.db = db;
    this.initializeAdapters();
    // Initialize provider health on startup (async, don't block)
    this.initializeProviderHealth().catch((err) => {
      console.error('Failed to initialize provider health:', err);
    });
  }

  /**
   * Initialize provider adapters with API keys from environment
   */
  private initializeAdapters(): void {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;
    const xaiKey = process.env.XAI_API_KEY;

    const missingKeys: string[] = [];

    if (openaiKey) {
      this.adapters.set('openai', new OpenAIAdapter(openaiKey));
      this.initializeHealthTracking('openai');
    } else {
      missingKeys.push('OPENAI_API_KEY');
    }

    if (anthropicKey) {
      this.adapters.set('anthropic', new AnthropicAdapter(anthropicKey));
      this.initializeHealthTracking('anthropic');
    } else {
      missingKeys.push('ANTHROPIC_API_KEY');
    }

    if (googleKey) {
      this.adapters.set('google', new GoogleAdapter(googleKey));
      this.initializeHealthTracking('google');
    } else {
      missingKeys.push('GOOGLE_API_KEY');
    }

    if (xaiKey) {
      const grokAdapter = new GrokAdapter(xaiKey);
      // Register under both "xai" and "grok" for compatibility
      this.adapters.set('xai', grokAdapter);
      this.adapters.set('grok', grokAdapter);
      this.initializeHealthTracking('xai');
      this.initializeHealthTracking('grok');
    } else {
      missingKeys.push('XAI_API_KEY');
    }

    // OpenRouter adapter - unified access to all models
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey) {
      const openRouterAdapter = new OpenRouterAdapter(openRouterKey);
      this.adapters.set('openrouter', openRouterAdapter);
      this.initializeHealthTracking('openrouter');
      console.log('[ProviderPool] OpenRouter adapter initialized - unified access to 300+ models');
    }

    // Log warnings for all missing API keys
    if (missingKeys.length > 0) {
      const providers = missingKeys
        .map((key) => key.replace('_API_KEY', '').toLowerCase())
        .join(', ');
      console.warn(
        `WARNING: Missing API keys detected: ${missingKeys.join(', ')}. ` +
          `The following providers will not be available: ${providers}. ` +
          'Please set the required environment variables to enable these providers.'
      );
    }
  }

  /**
   * Initialize health tracking for a provider
   */
  private initializeHealthTracking(providerId: string): void {
    this.healthTracker.initializeProvider(providerId);
    this.latencyTracking.set(providerId, {
      latencies: [],
      successCount: 0,
      totalRequests: 0
    });
  }

  /**
   * Send a request to a specific council member's provider
   */
  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    const adapter = this.adapters.get(member.provider);

    if (!adapter) {
      const envVarName = `${member.provider.toUpperCase()}_API_KEY`;
      const errorMsg =
        `Provider ${member.provider} not configured. ` +
        `Please set the ${envVarName} environment variable to enable this provider.`;
      console.error(`[ProviderPool] ${errorMsg}`);
      return {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error(errorMsg)
      };
    }

    if (this.healthTracker.isDisabled(member.provider)) {
      const disabledReason = this.healthTracker.getDisabledReason(
        member.provider
      );
      return {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error(
          `Provider ${member.provider} is disabled: ${disabledReason || 'Unknown reason'}`
        )
      };
    }

    const startTime = Date.now();
    try {
      const response = await adapter.sendRequest(member, prompt, context);
      const latency = response.latency || Date.now() - startTime;
      this.updateHealthTracking(member.provider, response, latency);
      return response;
    } catch (error) {
      const latency = Date.now() - startTime;
      const failedResponse: ProviderResponse = {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency,
        success: false,
        error: error as Error
      };
      this.updateHealthTracking(member.provider, failedResponse, latency);
      return failedResponse;
    }
  }

  /**
   * Update health tracking based on request result
   */
  private updateHealthTracking(
    providerId: string,
    response: ProviderResponse,
    measuredLatency: number
  ): void {
    // Check if metrics tracking is enabled
    const enableMetricsTracking =
      process.env.ENABLE_METRICS_TRACKING !== 'false';
    if (!enableMetricsTracking) {
      return; // Skip health tracking if disabled
    }

    const healthStartTime = Date.now();
    const latency = this.latencyTracking.get(providerId);
    if (!latency) {
      this.initializeHealthTracking(providerId);
      const newLatency = this.latencyTracking.get(providerId)!;
      newLatency.totalRequests++;
      if (response.success) {
        newLatency.successCount++;
        newLatency.latencies.push(measuredLatency);
        // Record success with latency (async, don't block)
        this.healthTracker
          .recordSuccess(providerId, measuredLatency)
          .catch((err) => {
            console.error(`Failed to record success for ${providerId}:`, err);
          });
      } else {
        // Record failure (async, don't block)
        this.healthTracker
          .recordFailure(providerId, response.error)
          .catch((err) => {
            console.error(`Failed to record failure for ${providerId}:`, err);
          });
      }
      return;
    }

    latency.totalRequests++;

    if (response.success) {
      latency.successCount++;

      // Track latency locally (for ProviderHealth calculation)
      latency.latencies.push(measuredLatency);
      if (latency.latencies.length > this.maxLatencyHistory) {
        latency.latencies.shift();
      }

      // Record success with latency (async, don't block)
      this.healthTracker
        .recordSuccess(providerId, measuredLatency)
        .catch((err) => {
          console.error(`Failed to record success for ${providerId}:`, err);
        });
    } else {
      // Record failure (async, don't block)
      this.healthTracker
        .recordFailure(providerId, response.error)
        .catch((err) => {
          console.error(`Failed to record failure for ${providerId}:`, err);
        });
    }

    // Performance monitoring
    const healthOverhead = Date.now() - healthStartTime;
    if (healthOverhead > 50) {
      console.warn(
        `Health tracking overhead for ${providerId}: ${healthOverhead}ms (threshold: 50ms)`
      );
    }
  }

  /**
   * Calculate average latency from array
   */
  private calculateAverageLatency(latencies: number[]): number {
    if (latencies.length === 0) {
      return 0;
    }
    const sum = latencies.reduce((acc, val) => acc + val, 0);
    return sum / latencies.length;
  }

  /**
   * Get health status of a provider
   */
  getProviderHealth(providerId: string): ProviderHealth {
    const latency = this.latencyTracking.get(providerId);
    const status = this.healthTracker.getHealthStatus(providerId);

    if (!latency) {
      return {
        providerId,
        status,
        successRate: 0,
        avgLatency: 0
      };
    }

    // Use rolling window success rate from health tracker for accurate metrics
    // This provides more responsive metrics that reflect recent performance
    const successRate = this.healthTracker.getSuccessRate(providerId);

    const avgLatency = this.calculateAverageLatency(latency.latencies);

    // Get actual last failure timestamp from health tracker
    const lastFailure = this.healthTracker.getLastFailure(providerId);

    return {
      providerId,
      status,
      successRate,
      avgLatency,
      lastFailure
    };
  }

  /**
   * Mark a provider as disabled due to failures
   */
  markProviderDisabled(providerId: string, reason: string): void {
    this.healthTracker.markDisabled(providerId, reason);
  }

  /**
   * Re-enable a disabled provider (for manual recovery)
   */
  enableProvider(providerId: string): void {
    this.healthTracker.enableProvider(providerId);
  }

  /**
   * Get all provider health statuses
   */
  getAllProviderHealth(): ProviderHealth[] {
    const healthStatuses: ProviderHealth[] = [];

    for (const providerId of this.adapters.keys()) {
      healthStatuses.push(this.getProviderHealth(providerId));
    }

    return healthStatuses;
  }

  /**
   * Initialize provider health entries for all configured providers
   */
  private async initializeProviderHealth(): Promise<void> {
    if (!this.configManager || !this.db) {
      return; // No config manager or database, skip initialization
    }

    try {
      const councilConfig = await this.configManager.getCouncilConfig();
      const providerIds = new Set<string>();

      // Collect unique provider IDs from council members
      for (const member of councilConfig.members) {
        providerIds.add(member.provider);
      }

      // Initialize health entries for each provider
      for (const providerId of providerIds) {
        // Initialize in memory tracker
        this.healthTracker.initializeProvider(providerId);

        // Insert initial health record if not exists
        await this.db.query(
          `
          INSERT INTO provider_health (
            provider_id, status, success_rate, avg_latency_ms, updated_at
          ) VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (provider_id) DO NOTHING
        `,
          [providerId, 'healthy', 1.0, 0]
        );
      }
    } catch (error) {
      console.error('Failed to initialize provider health:', error);
    }
  }

  /**
   * Get available models from Model Registry
   * Queries registry for active models and filters by usability status
   */
  async getAvailableModels(provider?: string): Promise<
    Array<{
      id: string;
      provider: string;
      displayName: string;
      classification: string[];
      contextWindow: number;
      capabilities: any[];
      usability: string;
    }>
  > {
    if (!this.modelRegistry) {
      console.warn(
        '[ProviderPool] Model Registry not configured, returning empty list'
      );
      return [];
    }

    try {
      const filter = provider
        ? {
          provider: provider as ProviderType,
          usability: 'available' as const
        }
        : { usability: 'available' as const };
      const models = await this.modelRegistry.getModels(filter);

      return models.map((model) => ({
        id: model.id,
        provider: model.provider,
        displayName: model.displayName,
        classification: model.classification,
        contextWindow: model.contextWindow,
        capabilities: model.capabilities,
        usability: model.usability
      }));
    } catch (error) {
      console.error('[ProviderPool] Error fetching available models:', error);
      return [];
    }
  }

  /**
   * Check if a model is available and usable
   * Uses Model Registry to verify model status
   */
  async isModelAvailable(modelId: string): Promise<boolean> {
    if (!this.modelRegistry) {
      // Fallback to checking if adapter exists
      return this.adapters.size > 0;
    }

    try {
      const model = await this.modelRegistry.getModel(modelId);
      return model !== null && model.usability === 'available';
    } catch (error) {
      console.error(
        `[ProviderPool] Error checking model availability for ${modelId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Get model capabilities from Model Registry
   * Returns capabilities for model selection logic
   */
  async getModelCapabilities(modelId: string): Promise<any[]> {
    if (!this.modelRegistry) {
      return [];
    }

    try {
      const model = await this.modelRegistry.getModel(modelId);
      return model?.capabilities || [];
    } catch (error) {
      console.error(
        `[ProviderPool] Error fetching capabilities for ${modelId}:`,
        error
      );
      return [];
    }
  }

  /**
   * Get the adapter for a specific provider
   * Used for direct access to adapter methods like streaming
   */
  getAdapter(providerId: string): BaseProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }
}
