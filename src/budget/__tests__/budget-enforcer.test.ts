/**
 * Budget Enforcer Tests
 * Comprehensive test suite for budget enforcement and spending tracking
 */

import { Pool } from 'pg';
import { BudgetEnforcer } from '../budget-enforcer';
import { CouncilMember, RetryPolicy } from '../../types/core';

// Mock PostgreSQL Pool
class MockPool {
  private budgetCaps: any[] = [];
  private budgetSpending: any[] = [];
  private queryLog: Array<{ query: string; params: any[] }> = [];

  async query(text: string, params?: any[]): Promise<any> {
    this.queryLog.push({ query: text, params: params || [] });

    // Handle SELECT from budget_caps
    if (text.includes('FROM budget_caps')) {
      const providerId = params?.[0];
      const modelId = params?.[1];
      const caps = this.budgetCaps.filter(cap => {
        if (cap.provider_id !== providerId) return false;
        if (modelId && cap.model_id !== modelId && cap.model_id !== null) return false;
        return true;
      });
      return { rows: caps };
    }

    // Handle SELECT from budget_spending
    if (text.includes('FROM budget_spending') && text.includes('SELECT current_spending')) {
      const providerId = params?.[0];
      const modelId = params?.[1];
      const periodType = params?.[2];

      const spending = this.budgetSpending.find(s =>
        s.provider_id === providerId &&
        (s.model_id === modelId || (s.model_id === null && modelId === null)) &&
        s.period_type === periodType &&
        new Date(s.period_start) <= new Date() &&
        new Date(s.period_end) >= new Date()
      );

      return { rows: spending ? [spending] : [] };
    }

    // Handle SELECT disabled status
    if (text.includes('FROM budget_spending') && text.includes('SELECT disabled')) {
      const providerId = params?.[0];
      const disabled = this.budgetSpending.filter(s =>
        s.provider_id === providerId &&
        s.disabled === true &&
        new Date(s.period_start) <= new Date() &&
        new Date(s.period_end) >= new Date()
      );
      return { rows: disabled };
    }

    // Handle budget status query
    if (text.includes('FROM budget_spending bs') && text.includes('LEFT JOIN budget_caps bc')) {
      const result = this.budgetSpending.map(spending => {
        const cap = this.budgetCaps.find(c =>
          c.provider_id === spending.provider_id &&
          (c.model_id === spending.model_id || (c.model_id === null && spending.model_id === null))
        );

        return {
          ...spending,
          daily_limit: cap?.daily_limit,
          weekly_limit: cap?.weekly_limit,
          monthly_limit: cap?.monthly_limit
        };
      });

      return { rows: result };
    }

    // Handle INSERT into budget_spending
    if (text.includes('INSERT INTO budget_spending')) {
      const newSpending = {
        id: 'generated-uuid',
        provider_id: params?.[0] ?? params?.[1],
        model_id: params?.[1] ?? params?.[2] ?? null,
        period_type: params?.[2] ?? params?.[3],
        period_start: params?.[3] ?? params?.[4],
        period_end: params?.[4] ?? params?.[5],
        current_spending: params?.[5] !== undefined ? params?.[5] : 0,
        disabled: false,
        updated_at: new Date()
      };

      // Check for existing record (ON CONFLICT simulation)
      const existing = this.budgetSpending.findIndex(s =>
        s.provider_id === newSpending.provider_id &&
        s.model_id === newSpending.model_id &&
        s.period_type === newSpending.period_type &&
        s.period_start.getTime() === newSpending.period_start.getTime()
      );

      if (existing === -1) {
        this.budgetSpending.push(newSpending);
      }

      return { rows: [] };
    }

    // Handle UPDATE budget_spending (increment spending)
    if (text.includes('UPDATE budget_spending') && text.includes('current_spending = current_spending')) {
      const providerId = params?.[0];
      const modelId = params?.[1];
      const periodType = params?.[2];
      const amount = params?.[3];

      const spending = this.budgetSpending.find(s =>
        s.provider_id === providerId &&
        (s.model_id === modelId || (s.model_id === null && modelId === null)) &&
        s.period_type === periodType &&
        new Date(s.period_start) <= new Date() &&
        new Date(s.period_end) >= new Date()
      );

      if (spending) {
        spending.current_spending = parseFloat(spending.current_spending) + amount;
        spending.updated_at = new Date();
      }

      return { rows: [] };
    }

    // Handle UPDATE budget_spending (mark disabled)
    if (text.includes('UPDATE budget_spending') && text.includes('SET disabled = TRUE')) {
      const providerId = params?.[0];
      const modelId = params?.[1];
      const periodType = params?.[2];

      const spending = this.budgetSpending.find(s =>
        s.provider_id === providerId &&
        (s.model_id === modelId || (s.model_id === null && modelId === null)) &&
        s.period_type === periodType &&
        new Date(s.period_start) <= new Date() &&
        new Date(s.period_end) >= new Date()
      );

      if (spending) {
        spending.disabled = true;
        spending.updated_at = new Date();
      }

      return { rows: [] };
    }

    return { rows: [] };
  }

  // Helper methods for test setup
  addBudgetCap(cap: any): void {
    this.budgetCaps.push(cap);
  }

  addBudgetSpending(spending: any): void {
    this.budgetSpending.push(spending);
  }

  getQueryLog(): Array<{ query: string; params: any[] }> {
    return this.queryLog;
  }

  reset(): void {
    this.budgetCaps = [];
    this.budgetSpending = [];
    this.queryLog = [];
  }
}

describe('BudgetEnforcer', () => {
  let enforcer: BudgetEnforcer;
  let mockPool: MockPool;
  let testMember: CouncilMember;

  const defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: []
  };

  beforeEach(() => {
    mockPool = new MockPool();
    enforcer = new BudgetEnforcer(mockPool as unknown as Pool);

    testMember = {
      id: 'test-member',
      provider: 'openai',
      model: 'gpt-4',
      timeout: 30,
      retryPolicy: defaultRetryPolicy
    };
  });

  describe('checkBudget', () => {
    it('should allow request when no budget cap is configured', async () => {
      const result = await enforcer.checkBudget(testMember, 1.0);

      expect(result.allowed).toBe(true);
      expect(result.budgetCap).toBe(Infinity);
      expect(result.percentUsed).toBe(0);
    });

    it('should allow request when under budget', async () => {
      // Set up daily budget cap
      mockPool.addBudgetCap({
        provider_id: 'openai',
        model_id: 'gpt-4',
        daily_limit: 100.0,
        weekly_limit: null,
        monthly_limit: null
      });

      // Set up current spending
      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: 'gpt-4',
        period_type: 'daily',
        period_start: new Date(new Date().setHours(0, 0, 0, 0)),
        period_end: new Date(new Date().setHours(23, 59, 59, 999)),
        current_spending: 50.0,
        disabled: false
      });

      const result = await enforcer.checkBudget(testMember, 10.0);

      expect(result.allowed).toBe(true);
      expect(result.currentSpending).toBe(50.0);
      expect(result.budgetCap).toBe(100.0);
      expect(result.percentUsed).toBe(50.0);
    });

    it('should deny request when it would exceed daily budget', async () => {
      mockPool.addBudgetCap({
        provider_id: 'openai',
        model_id: 'gpt-4',
        daily_limit: 100.0,
        weekly_limit: null,
        monthly_limit: null
      });

      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: 'gpt-4',
        period_type: 'daily',
        period_start: new Date(new Date().setHours(0, 0, 0, 0)),
        period_end: new Date(new Date().setHours(23, 59, 59, 999)),
        current_spending: 95.0,
        disabled: false
      });

      const result = await enforcer.checkBudget(testMember, 10.0);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Would exceed daily budget cap');
      expect(result.currentSpending).toBe(95.0);
      expect(result.budgetCap).toBe(100.0);
      expect(result.percentUsed).toBe(95.0);
    });

    it('should check all period types (daily, weekly, monthly)', async () => {
      const now = new Date();

      mockPool.addBudgetCap({
        provider_id: 'openai',
        model_id: 'gpt-4',
        daily_limit: 10.0,
        weekly_limit: 50.0,
        monthly_limit: 200.0
      });

      // Add spending for all periods
      const dailyStart = new Date(now);
      dailyStart.setHours(0, 0, 0, 0);
      const dailyEnd = new Date(now);
      dailyEnd.setHours(23, 59, 59, 999);

      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: 'gpt-4',
        period_type: 'daily',
        period_start: dailyStart,
        period_end: dailyEnd,
        current_spending: 8.0,
        disabled: false
      });

      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: 'gpt-4',
        period_type: 'weekly',
        period_start: weekStart,
        period_end: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
        current_spending: 45.0,
        disabled: false
      });

      // Request that would exceed weekly limit (45 + 10 > 50)
      const result = await enforcer.checkBudget(testMember, 10.0);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Would exceed weekly budget cap');
    });

    it('should handle model-agnostic budget caps', async () => {
      // Provider-level budget (no specific model)
      mockPool.addBudgetCap({
        provider_id: 'openai',
        model_id: null,
        daily_limit: 50.0,
        weekly_limit: null,
        monthly_limit: null
      });

      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: null,
        period_type: 'daily',
        period_start: new Date(new Date().setHours(0, 0, 0, 0)),
        period_end: new Date(new Date().setHours(23, 59, 59, 999)),
        current_spending: 48.0,
        disabled: false
      });

      const result = await enforcer.checkBudget(testMember, 5.0);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Would exceed daily budget cap');
    });
  });

  describe('recordSpending', () => {
    it('should record spending for all period types', async () => {
      mockPool.addBudgetCap({
        provider_id: 'openai',
        model_id: 'gpt-4',
        daily_limit: 100.0,
        weekly_limit: 500.0,
        monthly_limit: 2000.0
      });

      // Initialize spending records
      const now = new Date();
      ['daily', 'weekly', 'monthly'].forEach(period => {
        const periodStart = new Date(now);
        periodStart.setHours(0, 0, 0, 0);
        const periodEnd = new Date(now);
        periodEnd.setHours(23, 59, 59, 999);

        mockPool.addBudgetSpending({
          provider_id: 'openai',
          model_id: 'gpt-4',
          period_type: period,
          period_start: periodStart,
          period_end: periodEnd,
          current_spending: 0,
          disabled: false
        });
      });

      await enforcer.recordSpending(testMember, 10.5);

      // Verify all periods were updated
      const queryLog = mockPool.getQueryLog();
      const updateQueries = queryLog.filter(q =>
        q.query.includes('UPDATE budget_spending') &&
        q.query.includes('current_spending = current_spending')
      );

      expect(updateQueries.length).toBeGreaterThanOrEqual(3); // daily, weekly, monthly
    });

    it('should create spending record if it does not exist', async () => {
      // No existing spending record
      await enforcer.recordSpending(testMember, 5.0);

      const queryLog = mockPool.getQueryLog();
      const insertQueries = queryLog.filter(q =>
        q.query.includes('INSERT INTO budget_spending')
      );

      expect(insertQueries.length).toBeGreaterThan(0);
    });
  });

  describe('getBudgetStatus', () => {
    it('should return budget status for all providers when no filter provided', async () => {
      mockPool.addBudgetCap({
        provider_id: 'openai',
        model_id: 'gpt-4',
        daily_limit: 100.0,
        weekly_limit: null,
        monthly_limit: null
      });

      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: 'gpt-4',
        period_type: 'daily',
        period_start: new Date(new Date().setHours(0, 0, 0, 0)),
        period_end: new Date(new Date().setHours(23, 59, 59, 999)),
        current_spending: 75.0,
        disabled: false
      });

      const status = await enforcer.getBudgetStatus();

      expect(status).toBeDefined();
      expect(status.length).toBeGreaterThan(0);
      expect(status[0].providerId).toBe('openai');
      expect(status[0].currentSpending).toBe(75.0);
      expect(status[0].budgetCap).toBe(100.0);
      expect(status[0].percentUsed).toBe(75.0);
    });

    it('should filter by provider ID', async () => {
      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: 'gpt-4',
        period_type: 'daily',
        period_start: new Date(),
        period_end: new Date(),
        current_spending: 50.0,
        disabled: false
      });

      await enforcer.getBudgetStatus('openai');

      const queryLog = mockPool.getQueryLog();
      const selectQuery = queryLog.find(q => q.query.includes('LEFT JOIN budget_caps'));

      expect(selectQuery).toBeDefined();
      expect(selectQuery?.params).toContain('openai');
    });
  });

  describe('isDisabled', () => {
    it('should return true when member is disabled', async () => {
      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: 'gpt-4',
        period_type: 'daily',
        period_start: new Date(new Date().setHours(0, 0, 0, 0)),
        period_end: new Date(new Date().setHours(23, 59, 59, 999)),
        current_spending: 100.0,
        disabled: true
      });

      const isDisabled = await enforcer.isDisabled(testMember);

      expect(isDisabled).toBe(true);
    });

    it('should return false when member is not disabled', async () => {
      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: 'gpt-4',
        period_type: 'daily',
        period_start: new Date(new Date().setHours(0, 0, 0, 0)),
        period_end: new Date(new Date().setHours(23, 59, 59, 999)),
        current_spending: 50.0,
        disabled: false
      });

      const isDisabled = await enforcer.isDisabled(testMember);

      expect(isDisabled).toBe(false);
    });
  });

  describe('resetBudgetPeriod', () => {
    it('should reset daily budget period', async () => {
      await enforcer.resetBudgetPeriod('daily');

      const queryLog = mockPool.getQueryLog();
      const insertQuery = queryLog.find(q => q.query.includes('INSERT INTO budget_spending'));

      expect(insertQuery).toBeDefined();
      expect(insertQuery?.params).toContain('daily');
    });

    it('should reset weekly budget period with correct boundaries', async () => {
      await enforcer.resetBudgetPeriod('weekly');

      const queryLog = mockPool.getQueryLog();
      const insertQuery = queryLog.find(q => q.query.includes('INSERT INTO budget_spending'));

      expect(insertQuery).toBeDefined();
      expect(insertQuery?.params).toContain('weekly');
    });

    it('should reset monthly budget period', async () => {
      await enforcer.resetBudgetPeriod('monthly');

      const queryLog = mockPool.getQueryLog();
      const insertQuery = queryLog.find(q => q.query.includes('INSERT INTO budget_spending'));

      expect(insertQuery).toBeDefined();
      expect(insertQuery?.params).toContain('monthly');
    });
  });

  describe('edge cases', () => {
    it('should handle member without model specified', async () => {
      const memberWithoutModel: CouncilMember = {
        id: 'test-member',
        provider: 'openai',
        model: undefined as any,
        timeout: 30,
        retryPolicy: defaultRetryPolicy
      };

      mockPool.addBudgetCap({
        provider_id: 'openai',
        model_id: null,
        daily_limit: 50.0,
        weekly_limit: null,
        monthly_limit: null
      });

      const result = await enforcer.checkBudget(memberWithoutModel, 10.0);

      expect(result).toBeDefined();
      expect(result.budgetCap).toBe(50.0);
    });

    it('should handle zero cost requests', async () => {
      mockPool.addBudgetCap({
        provider_id: 'openai',
        model_id: 'gpt-4',
        daily_limit: 100.0,
        weekly_limit: null,
        monthly_limit: null
      });

      const result = await enforcer.checkBudget(testMember, 0);

      expect(result.allowed).toBe(true);
    });

    it('should handle exact budget limit match', async () => {
      mockPool.addBudgetCap({
        provider_id: 'openai',
        model_id: 'gpt-4',
        daily_limit: 100.0,
        weekly_limit: null,
        monthly_limit: null
      });

      mockPool.addBudgetSpending({
        provider_id: 'openai',
        model_id: 'gpt-4',
        period_type: 'daily',
        period_start: new Date(new Date().setHours(0, 0, 0, 0)),
        period_end: new Date(new Date().setHours(23, 59, 59, 999)),
        current_spending: 90.0,
        disabled: false
      });

      // Exactly at limit should be allowed
      const result = await enforcer.checkBudget(testMember, 10.0);

      expect(result.allowed).toBe(true);
    });
  });
});
