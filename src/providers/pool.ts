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

interface ProviderHealthTracking {
  status: 'healthy' | 'degraded' | 'disabled';
  successCount: number;
  failureCount: number;
  totalRequests: number;
  latencies: number[];
  lastFailure?: Date;
  disabledReason?: string;
}

export class ProviderPool implements IProviderPool {
  private adapters: Map<string, BaseProviderAdapter>;
  private healthTracking: Map<string, ProviderHealthTracking>;
  private readonly maxLatencyHistory = 100;
  private readonly failureThreshold = 5; // consecutive failures before disabling
  
  constructor() {
    this.adapters = new Map();
    this.healthTracking = new Map();
    this.initializeAdapters();
  }
  
  /**
   * Initialize provider adapters with API keys from environment
   */
  private initializeAdapters(): void {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;
    
    if (openaiKey) {
      this.adapters.set('openai', new OpenAIAdapter(openaiKey));
      this.initializeHealthTracking('openai');
    }
    
    if (anthropicKey) {
      this.adapters.set('anthropic', new AnthropicAdapter(anthropicKey));
      this.initializeHealthTracking('anthropic');
    }
    
    if (googleKey) {
      this.adapters.set('google', new GoogleAdapter(googleKey));
      this.initializeHealthTracking('google');
    }
  }
  
  /**
   * Initialize health tracking for a provider
   */
  private initializeHealthTracking(providerId: string): void {
    this.healthTracking.set(providerId, {
      status: 'healthy',
      successCount: 0,
      failureCount: 0,
      totalRequests: 0,
      latencies: []
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
      return {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error(`Provider ${member.provider} not configured`)
      };
    }
    
    const health = this.healthTracking.get(member.provider);
    if (health?.status === 'disabled') {
      return {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error(`Provider ${member.provider} is disabled: ${health.disabledReason}`)
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
    const health = this.healthTracking.get(providerId);
    if (!health) return;
    
    health.totalRequests++;
    
    if (response.success) {
      health.successCount++;
      health.failureCount = 0; // Reset consecutive failure count
      
      // Track latency
      health.latencies.push(response.latency);
      if (health.latencies.length > this.maxLatencyHistory) {
        health.latencies.shift();
      }
      
      // Update status based on latency
      const avgLatency = this.calculateAverageLatency(health.latencies);
      if (avgLatency > 10000) {
        health.status = 'degraded';
      } else if (health.status === 'degraded') {
        health.status = 'healthy';
      }
    } else {
      health.failureCount++;
      health.lastFailure = new Date();
      
      // Check if we should disable this provider
      if (health.failureCount >= this.failureThreshold) {
        health.status = 'disabled';
        health.disabledReason = `${this.failureThreshold} consecutive failures`;
      } else {
        health.status = 'degraded';
      }
    }
  }
  
  /**
   * Calculate average latency from array
   */
  private calculateAverageLatency(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    const sum = latencies.reduce((acc, val) => acc + val, 0);
    return sum / latencies.length;
  }
  
  /**
   * Get health status of a provider
   */
  getProviderHealth(providerId: string): ProviderHealth {
    const health = this.healthTracking.get(providerId);
    
    if (!health) {
      return {
        providerId,
        status: 'disabled',
        successRate: 0,
        avgLatency: 0
      };
    }
    
    const successRate = health.totalRequests > 0
      ? health.successCount / health.totalRequests
      : 0;
    
    const avgLatency = this.calculateAverageLatency(health.latencies);
    
    return {
      providerId,
      status: health.status,
      successRate,
      avgLatency,
      lastFailure: health.lastFailure
    };
  }
  
  /**
   * Mark a provider as disabled due to failures
   */
  markProviderDisabled(providerId: string, reason: string): void {
    const health = this.healthTracking.get(providerId);
    if (health) {
      health.status = 'disabled';
      health.disabledReason = reason;
      health.lastFailure = new Date();
    }
  }
  
  /**
   * Re-enable a disabled provider (for manual recovery)
   */
  enableProvider(providerId: string): void {
    const health = this.healthTracking.get(providerId);
    if (health) {
      health.status = 'healthy';
      health.failureCount = 0;
      health.disabledReason = undefined;
    }
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
