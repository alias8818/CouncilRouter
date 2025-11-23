import { CouncilMember, BudgetCheckResult, BudgetStatus } from '../types/core';

/**
 * Budget Enforcer Interface
 * Manages budget caps and spending limits
 */
export interface IBudgetEnforcer {
  /**
   * Check if a council member can make an API call within budget
   */
  checkBudget(
    councilMember: CouncilMember,
    estimatedCost: number
  ): Promise<BudgetCheckResult>;

  /**
   * Record actual spending for a council member
   */
  recordSpending(
    councilMember: CouncilMember,
    actualCost: number
  ): Promise<void>;

  /**
   * Get budget status for providers/models
   */
  getBudgetStatus(
    providerId?: string,
    modelId?: string
  ): Promise<BudgetStatus[]>;

  /**
   * Reset budget period (called by scheduler)
   */
  resetBudgetPeriod(
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<void>;

  /**
   * Check if a council member is budget-disabled
   */
  isDisabled(councilMember: CouncilMember): Promise<boolean>;
}
