/**
 * Cost Calculator
 * Calculates and tracks costs for AI provider API calls
 */

import { TokenUsage, CouncilMember } from '../types/core';

/**
 * Pricing configuration for a provider/model
 */
export interface PricingConfig {
  provider: string;
  model: string;
  promptTokenPrice: number; // Price per 1000 prompt tokens
  completionTokenPrice: number; // Price per 1000 completion tokens
  currency: string;
  version: string; // Pricing version identifier
}

/**
 * Cost calculation result for a single API call
 */
export interface CostCalculation {
  memberId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  currency: string;
  pricingVersion: string;
}

/**
 * Aggregated cost breakdown for a request
 */
export interface AggregatedCost {
  totalCost: number;
  currency: string;
  byProvider: Map<string, number>;
  byMember: Map<string, number>;
  pricingVersion: string;
  calculations: CostCalculation[];
}

/**
 * Cost alert configuration
 */
export interface CostAlert {
  threshold: number;
  currency: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  enabled: boolean;
}

/**
 * Cost Calculator utility class
 */
export class CostCalculator {
  private pricingConfigs: Map<string, PricingConfig> = new Map();
  private costAlerts: CostAlert[] = [];
  private periodCosts: Map<string, number> = new Map(); // period key -> accumulated cost

  constructor() {
    // Initialize with default pricing (as of 2024)
    this.initializeDefaultPricing();
  }

  /**
   * Initialize default pricing for common providers
   */
  private initializeDefaultPricing(): void {
    // OpenAI GPT-4 Turbo
    this.addPricingConfig({
      provider: 'openai',
      model: 'gpt-4-turbo',
      promptTokenPrice: 0.01, // $0.01 per 1K prompt tokens
      completionTokenPrice: 0.03, // $0.03 per 1K completion tokens
      currency: 'USD',
      version: 'v1.0'
    });

    // OpenAI GPT-3.5 Turbo
    this.addPricingConfig({
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      promptTokenPrice: 0.0005, // $0.0005 per 1K prompt tokens
      completionTokenPrice: 0.0015, // $0.0015 per 1K completion tokens
      currency: 'USD',
      version: 'v1.0'
    });

    // Anthropic Claude 3 Opus
    this.addPricingConfig({
      provider: 'anthropic',
      model: 'claude-3-opus',
      promptTokenPrice: 0.015, // $0.015 per 1K prompt tokens
      completionTokenPrice: 0.075, // $0.075 per 1K completion tokens
      currency: 'USD',
      version: 'v1.0'
    });

    // Anthropic Claude 3 Sonnet
    this.addPricingConfig({
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      promptTokenPrice: 0.003, // $0.003 per 1K prompt tokens
      completionTokenPrice: 0.015, // $0.015 per 1K completion tokens
      currency: 'USD',
      version: 'v1.0'
    });

    // Google Gemini Pro
    this.addPricingConfig({
      provider: 'google',
      model: 'gemini-pro',
      promptTokenPrice: 0.00025, // $0.00025 per 1K prompt tokens
      completionTokenPrice: 0.0005, // $0.0005 per 1K completion tokens
      currency: 'USD',
      version: 'v1.0'
    });
  }

  /**
   * Add or update pricing configuration for a provider/model
   */
  addPricingConfig(config: PricingConfig): void {
    const key = this.getPricingKey(config.provider, config.model);
    this.pricingConfigs.set(key, config);
  }

  /**
   * Get pricing configuration for a provider/model
   */
  getPricingConfig(provider: string, model: string): PricingConfig | undefined {
    const key = this.getPricingKey(provider, model);
    return this.pricingConfigs.get(key);
  }

  /**
   * Calculate cost for a single API call
   */
  calculateCost(
    member: CouncilMember,
    tokenUsage: TokenUsage
  ): CostCalculation {
    const pricing = this.getPricingConfig(member.provider, member.model);

    if (!pricing) {
      // If no pricing config found, return zero cost with warning
      console.warn(
        `No pricing configuration found for ${member.provider}/${member.model}. ` +
        `Cost will be calculated as $0.00`
      );

      return {
        memberId: member.id,
        provider: member.provider,
        model: member.model,
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        cost: 0,
        currency: 'USD',
        pricingVersion: 'unknown'
      };
    }

    // Calculate cost: (tokens / 1000) * price_per_1k_tokens
    const promptCost = (tokenUsage.promptTokens / 1000) * pricing.promptTokenPrice;
    const completionCost = (tokenUsage.completionTokens / 1000) * pricing.completionTokenPrice;
    const totalCost = promptCost + completionCost;

    return {
      memberId: member.id,
      provider: member.provider,
      model: member.model,
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
      totalTokens: tokenUsage.totalTokens,
      cost: totalCost,
      currency: pricing.currency,
      pricingVersion: pricing.version
    };
  }

  /**
   * Aggregate costs for multiple council member responses
   */
  aggregateCosts(calculations: CostCalculation[]): AggregatedCost {
    if (calculations.length === 0) {
      return {
        totalCost: 0,
        currency: 'USD',
        byProvider: new Map(),
        byMember: new Map(),
        pricingVersion: 'unknown',
        calculations: []
      };
    }

    let totalCost = 0;
    const byProvider = new Map<string, number>();
    const byMember = new Map<string, number>();
    const currency = calculations[0].currency; // Assume all same currency
    const pricingVersion = calculations[0].pricingVersion; // Use first version

    for (const calc of calculations) {
      totalCost += calc.cost;

      // Aggregate by provider
      const providerCost = byProvider.get(calc.provider) || 0;
      byProvider.set(calc.provider, providerCost + calc.cost);

      // Aggregate by member
      const memberCost = byMember.get(calc.memberId) || 0;
      byMember.set(calc.memberId, memberCost + calc.cost);
    }

    return {
      totalCost,
      currency,
      byProvider,
      byMember,
      pricingVersion,
      calculations
    };
  }

  /**
   * Add a cost alert threshold
   */
  addCostAlert(alert: CostAlert): void {
    this.costAlerts.push(alert);
  }

  /**
   * Check if any cost alerts should be triggered
   */
  checkCostAlerts(cost: number, period: string): string[] {
    const alerts: string[] = [];

    // Get accumulated cost for this period
    const periodKey = period;
    const currentPeriodCost = (this.periodCosts.get(periodKey) || 0) + cost;
    this.periodCosts.set(periodKey, currentPeriodCost);

    // Check each alert
    for (const alert of this.costAlerts) {
      if (!alert.enabled) continue;

      // Check if this alert applies to the current period
      if (this.matchesPeriod(period, alert.period)) {
        if (currentPeriodCost >= alert.threshold) {
          alerts.push(
            `Cost alert: ${alert.period} spending (${alert.currency} ${currentPeriodCost.toFixed(2)}) ` +
            `has exceeded threshold of ${alert.currency} ${alert.threshold.toFixed(2)}`
          );
        }
      }
    }

    return alerts;
  }

  /**
   * Reset period costs (called at period boundaries)
   */
  resetPeriodCosts(period: string): void {
    this.periodCosts.delete(period);
  }

  /**
   * Get accumulated cost for a period
   */
  getPeriodCost(period: string): number {
    return this.periodCosts.get(period) || 0;
  }

  /**
   * Update pricing version for a provider/model
   */
  updatePricingVersion(
    provider: string,
    model: string,
    newVersion: string,
    newPromptPrice?: number,
    newCompletionPrice?: number
  ): void {
    const pricing = this.getPricingConfig(provider, model);

    if (!pricing) {
      console.warn(`No pricing configuration found for ${provider}/${model}`);
      return;
    }

    // Create updated pricing config
    const updatedPricing: PricingConfig = {
      ...pricing,
      version: newVersion,
      promptTokenPrice: newPromptPrice ?? pricing.promptTokenPrice,
      completionTokenPrice: newCompletionPrice ?? pricing.completionTokenPrice
    };

    this.addPricingConfig(updatedPricing);
  }

  /**
   * Get all pricing configurations
   */
  getAllPricingConfigs(): PricingConfig[] {
    return Array.from(this.pricingConfigs.values());
  }

  /**
   * Generate pricing key for map lookup
   */
  private getPricingKey(provider: string, model: string): string {
    return `${provider}:${model}`;
  }

  /**
   * Check if a period string matches an alert period
   */
  private matchesPeriod(periodKey: string, alertPeriod: string): boolean {
    // Simple implementation - in production would use proper date parsing
    return periodKey.includes(alertPeriod);
  }
}
