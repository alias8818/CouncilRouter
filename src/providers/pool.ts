/**
 * Provider Pool
 * Manages connections to AI provider APIs and tracks their health
 */

import { IProviderPool } from '../interfaces/IProviderPool';
import { CouncilMember, ProviderResponse, ProviderHealth, ConversationContext } from '../types/core';
import { BaseProviderAdapter } from './adapters/base';
import { OpenAIAdapter } from './adapters/openai';
import { AnthropicAdapter } from './adapters/anthropic';
import { GoogleAdapter } from './adapters/google';
import { GrokAdapter } from './adapters/grok';
import { ProviderHealthTracker, getSharedHealthTracker } from './health-tracker';

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

  constructor(healthTracker?: ProviderHealthTracker) {
    this.adapters = new Map();
    this.latencyTracking = new Map();
    this.healthTracker = healthTracker || getSharedHealthTracker();
    this.initializeAdapters();
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
      this.adapters.set('grok', new GrokAdapter(xaiKey));
      this.initializeHealthTracking('grok');
    } else {
      missingKeys.push('XAI_API_KEY');
    }

    // Log warnings for all missing API keys
    if (missingKeys.length > 0) {
      const providers = missingKeys.map(key => key.replace('_API_KEY', '').toLowerCase()).join(', ');
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
      const errorMsg = `Provider ${member.provider} not configured. ` +
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
      const disabledReason = this.healthTracker.getDisabledReason(member.provider);
      return {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error(`Provider ${member.provider} is disabled: ${disabledReason || 'Unknown reason'}`)
      };
    }

    try {
      const response = await adapter.sendRequest(member, prompt, context);
      this.updateHealthTracking(member.provider, response);
      return response;
    } catch (error) {
      const failedResponse: ProviderResponse = {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: error as Error
      };
      this.updateHealthTracking(member.provider, failedResponse);
      return failedResponse;
    }
  }

  /**
   * Update health tracking based on request result
   */
  private updateHealthTracking(providerId: string, response: ProviderResponse): void {
    const latency = this.latencyTracking.get(providerId);
    if (!latency) {
      this.initializeHealthTracking(providerId);
      const newLatency = this.latencyTracking.get(providerId)!;
      newLatency.totalRequests++;
      if (response.success) {
        newLatency.successCount++;
        newLatency.latencies.push(response.latency);
        this.healthTracker.recordSuccess(providerId);
      } else {
        this.healthTracker.recordFailure(providerId);
      }
      return;
    }

    latency.totalRequests++;

    if (response.success) {
      latency.successCount++;

      // Track latency locally (for ProviderHealth calculation)
      latency.latencies.push(response.latency);
      if (latency.latencies.length > this.maxLatencyHistory) {
        latency.latencies.shift();
      }

      // Record success in shared tracker
      this.healthTracker.recordSuccess(providerId);
    } else {
      // Record failure in shared tracker
      this.healthTracker.recordFailure(providerId);
    }
  }

  /**
   * Calculate average latency from array
   */
  private calculateAverageLatency(latencies: number[]): number {
    if (latencies.length === 0) {return 0;}
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
}
