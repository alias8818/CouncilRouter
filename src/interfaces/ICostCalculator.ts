/**
 * Cost Calculator Interface
 */

import { TokenUsage, CouncilMember } from '../types/core';
import {
  PricingConfig,
  CostCalculation,
  AggregatedCost,
  CostAlert
} from '../cost/calculator';

export interface ICostCalculator {
  /**
   * Add or update pricing configuration for a provider/model
   */
  addPricingConfig(config: PricingConfig): void;

  /**
   * Get pricing configuration for a provider/model
   */
  getPricingConfig(provider: string, model: string): PricingConfig | undefined;

  /**
   * Calculate cost for a single API call
   */
  calculateCost(member: CouncilMember, tokenUsage: TokenUsage): CostCalculation;

  /**
   * Aggregate costs for multiple council member responses
   */
  aggregateCosts(calculations: CostCalculation[]): AggregatedCost;

  /**
   * Add a cost alert threshold
   */
  addCostAlert(alert: CostAlert): void;

  /**
   * Check if any cost alerts should be triggered
   */
  checkCostAlerts(cost: number, period: string): string[];

  /**
   * Reset period costs (called at period boundaries)
   */
  resetPeriodCosts(period: string): void;

  /**
   * Get accumulated cost for a period
   */
  getPeriodCost(period: string): number;

  /**
   * Update pricing version for a provider/model
   */
  updatePricingVersion(
    provider: string,
    model: string,
    newVersion: string,
    newPromptPrice?: number,
    newCompletionPrice?: number
  ): void;

  /**
   * Get all pricing configurations
   */
  getAllPricingConfigs(): PricingConfig[];
}
