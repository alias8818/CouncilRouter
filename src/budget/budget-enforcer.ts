/**
 * Budget Enforcer
 * Manages spending limits and enforces budget caps
 */

import { Pool } from 'pg';
import { IBudgetEnforcer } from '../interfaces/IBudgetEnforcer';
import { CouncilMember, BudgetCheckResult, BudgetStatus } from '../types/core';

export class BudgetEnforcer implements IBudgetEnforcer {
  private dbPool: Pool;

  constructor(dbPool: Pool) {
    this.dbPool = dbPool;
  }

  /**
   * Check if a council member can make an API call within budget
   */
  async checkBudget(
    councilMember: CouncilMember,
    estimatedCost: number
  ): Promise<BudgetCheckResult> {
    const { provider, model } = councilMember;

    // Get all budget caps for this provider/model
    const caps = await this.getBudgetCaps(provider, model);

    if (caps.length === 0) {
      // No budget cap configured - allow unlimited spending
      return {
        allowed: true,
        currentSpending: 0,
        budgetCap: Infinity,
        percentUsed: 0
      };
    }

    // Check each period (daily, weekly, monthly)
    for (const cap of caps) {
      const periods: Array<'daily' | 'weekly' | 'monthly'> = [];

      if (cap.daily_limit) {periods.push('daily');}
      if (cap.weekly_limit) {periods.push('weekly');}
      if (cap.monthly_limit) {periods.push('monthly');}

      for (const period of periods) {
        const spending = await this.getCurrentSpending(provider, model, period);
        const limit = this.getLimitForPeriod(cap, period);

        if (limit && spending + estimatedCost > limit) {
          // Would exceed budget
          await this.markAsDisabled(provider, model, period);

          return {
            allowed: false,
            reason: `Would exceed ${period} budget cap of ${limit}`,
            currentSpending: spending,
            budgetCap: limit,
            percentUsed: (spending / limit) * 100
          };
        }
      }
    }

    // All checks passed
    const dailySpending = await this.getCurrentSpending(provider, model, 'daily');
    const dailyCap = this.getLimitForPeriod(caps[0], 'daily') || Infinity;

    return {
      allowed: true,
      currentSpending: dailySpending,
      budgetCap: dailyCap,
      percentUsed: dailyCap === Infinity ? 0 : (dailySpending / dailyCap) * 100
    };
  }

  /**
   * Record actual spending for a council member
   */
  async recordSpending(
    councilMember: CouncilMember,
    actualCost: number
  ): Promise<void> {
    const { provider, model } = councilMember;

    // Update spending for all periods
    for (const period of ['daily', 'weekly', 'monthly'] as const) {
      await this.incrementSpending(provider, model, period, actualCost);
    }
  }

  /**
   * Get budget status for providers/models
   */
  async getBudgetStatus(
    providerId?: string,
    modelId?: string
  ): Promise<BudgetStatus[]> {
    let query = `
      SELECT
        bs.provider_id,
        bs.model_id,
        bs.period_type,
        bs.current_spending,
        bs.disabled,
        bs.period_end,
        bc.daily_limit,
        bc.weekly_limit,
        bc.monthly_limit
      FROM budget_spending bs
      LEFT JOIN budget_caps bc ON bs.provider_id = bc.provider_id
        AND (bs.model_id = bc.model_id OR (bs.model_id IS NULL AND bc.model_id IS NULL))
      WHERE bs.period_start <= NOW() AND bs.period_end >= NOW()
    `;

    const params: string[] = [];

    if (providerId) {
      params.push(providerId);
      query += ` AND bs.provider_id = $${params.length}`;
    }

    if (modelId) {
      params.push(modelId);
      query += ` AND bs.model_id = $${params.length}`;
    }

    const result = await this.dbPool.query(query, params);

    return result.rows.map(row => {
      const budgetCap = this.getLimitForPeriod(row, row.period_type);
      return {
        providerId: row.provider_id,
        modelId: row.model_id,
        period: row.period_type,
        currentSpending: parseFloat(row.current_spending),
        budgetCap: budgetCap || Infinity,
        percentUsed: budgetCap ? (parseFloat(row.current_spending) / budgetCap) * 100 : 0,
        disabled: row.disabled,
        resetAt: new Date(row.period_end)
      };
    });
  }

  /**
   * Reset budget period
   */
  async resetBudgetPeriod(period: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    // Calculate new period bounds
    const { start, end } = this.calculatePeriodBounds(period);

    // Archive old periods and create new ones
    await this.dbPool.query(`
      INSERT INTO budget_spending (
        id,
        provider_id,
        model_id,
        period_type,
        period_start,
        period_end,
        current_spending,
        disabled
      )
      SELECT
        gen_random_uuid(),
        provider_id,
        model_id,
        $1,
        $2,
        $3,
        0,
        FALSE
      FROM budget_caps
      ON CONFLICT (provider_id, model_id, period_type, period_start)
      DO UPDATE SET
        current_spending = 0,
        disabled = FALSE,
        updated_at = NOW()
    `, [period, start, end]);
  }

  /**
   * Check if council member is budget-disabled
   */
  async isDisabled(councilMember: CouncilMember): Promise<boolean> {
    const { provider, model } = councilMember;

    const result = await this.dbPool.query(`
      SELECT disabled
      FROM budget_spending
      WHERE provider_id = $1
        AND (model_id = $2 OR model_id IS NULL)
        AND period_start <= NOW()
        AND period_end >= NOW()
        AND disabled = TRUE
      LIMIT 1
    `, [provider, model || null]);

    return result.rows.length > 0;
  }

  private async getBudgetCaps(providerId: string, modelId?: string): Promise<any[]> {
    const result = await this.dbPool.query(`
      SELECT *
      FROM budget_caps
      WHERE provider_id = $1
        AND (model_id = $2 OR model_id IS NULL)
    `, [providerId, modelId || null]);

    return result.rows;
  }

  private async getCurrentSpending(
    providerId: string,
    modelId: string | undefined,
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<number> {
    const result = await this.dbPool.query(`
      SELECT current_spending
      FROM budget_spending
      WHERE provider_id = $1
        AND (model_id = $2 OR model_id IS NULL)
        AND period_type = $3
        AND period_start <= NOW()
        AND period_end >= NOW()
    `, [providerId, modelId || null, period]);

    if (result.rows.length === 0) {
      // No spending record exists yet - create one
      const { start, end } = this.calculatePeriodBounds(period);
      await this.dbPool.query(`
        INSERT INTO budget_spending (
          id, provider_id, model_id, period_type, period_start, period_end, current_spending
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, 0
        )
        ON CONFLICT (provider_id, model_id, period_type, period_start) DO NOTHING
      `, [providerId, modelId || null, period, start, end]);
      return 0;
    }

    return parseFloat(result.rows[0].current_spending);
  }

  private async incrementSpending(
    providerId: string,
    modelId: string | undefined,
    period: 'daily' | 'weekly' | 'monthly',
    amount: number
  ): Promise<void> {
    // Ensure record exists
    await this.getCurrentSpending(providerId, modelId, period);

    // Increment spending
    await this.dbPool.query(`
      UPDATE budget_spending
      SET
        current_spending = current_spending + $4,
        updated_at = NOW()
      WHERE provider_id = $1
        AND (model_id = $2 OR model_id IS NULL)
        AND period_type = $3
        AND period_start <= NOW()
        AND period_end >= NOW()
    `, [providerId, modelId || null, period, amount]);
  }

  private async markAsDisabled(
    providerId: string,
    modelId: string | undefined,
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<void> {
    await this.dbPool.query(`
      UPDATE budget_spending
      SET disabled = TRUE, updated_at = NOW()
      WHERE provider_id = $1
        AND (model_id = $2 OR model_id IS NULL)
        AND period_type = $3
        AND period_start <= NOW()
        AND period_end >= NOW()
    `, [providerId, modelId || null, period]);
  }

  private getLimitForPeriod(cap: any, period: 'daily' | 'weekly' | 'monthly'): number | null {
    if (period === 'daily') {return cap.daily_limit;}
    if (period === 'weekly') {return cap.weekly_limit;}
    if (period === 'monthly') {return cap.monthly_limit;}
    return null;
  }

  private calculatePeriodBounds(period: 'daily' | 'weekly' | 'monthly'): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (period === 'daily') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'weekly') {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
      // Create end from start to ensure correct week boundary
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'monthly') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }
}
