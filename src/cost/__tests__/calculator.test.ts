/**
 * Unit Tests for Cost Calculator
 * Tests period matching logic and cost calculations
 */

import { CostCalculator, CostAlert } from '../calculator';
import { CouncilMember, TokenUsage } from '../../types/core';

describe('CostCalculator', () => {
  let calculator: CostCalculator;

  beforeEach(() => {
    calculator = new CostCalculator();
  });

  describe('Period Matching Logic', () => {
    // Access private method for testing
    const matchesPeriod = (periodKey: string, alertPeriod: string): boolean => {
      return (calculator as any).matchesPeriod(periodKey, alertPeriod);
    };

    it('should match exact period strings', () => {
      expect(matchesPeriod('daily', 'daily')).toBe(true);
      expect(matchesPeriod('weekly', 'weekly')).toBe(true);
      expect(matchesPeriod('monthly', 'monthly')).toBe(true);
      expect(matchesPeriod('hourly', 'hourly')).toBe(true);
    });

    it('should match valid date-prefixed periods with hyphen separator', () => {
      expect(matchesPeriod('2024-01-daily', 'daily')).toBe(true);
      expect(matchesPeriod('2024-12-weekly', 'weekly')).toBe(true);
      expect(matchesPeriod('2024-01-01-hourly', 'hourly')).toBe(true);
    });

    it('should match valid date-prefixed periods with underscore separator', () => {
      expect(matchesPeriod('2024_01_daily', 'daily')).toBe(true);
      expect(matchesPeriod('2024_12_weekly', 'weekly')).toBe(true);
    });

    it('should match numeric-only prefixes with valid years', () => {
      expect(matchesPeriod('20240115-daily', 'daily')).toBe(true);
      expect(matchesPeriod('202401-weekly', 'weekly')).toBe(true);
      expect(matchesPeriod('20241231-weekly', 'weekly')).toBe(true);
      expect(matchesPeriod('20000101-monthly', 'monthly')).toBe(true);
      expect(matchesPeriod('19991231-monthly', 'monthly')).toBe(true);
    });

    it('should reject numeric-only prefixes with invalid years', () => {
      // Too short (less than 4 digits)
      expect(matchesPeriod('123-daily', 'daily')).toBe(false);
      expect(matchesPeriod('0-weekly', 'weekly')).toBe(false);
      
      // Invalid year (outside 1900-2100 range)
      expect(matchesPeriod('1234-daily', 'daily')).toBe(false); // Year 1234 < 1900
      expect(matchesPeriod('123456-weekly', 'weekly')).toBe(false); // Year 1234 < 1900
      expect(matchesPeriod('99999999-daily', 'daily')).toBe(false); // Year 9999 > 2100
      expect(matchesPeriod('18991231-daily', 'daily')).toBe(false); // Year 1899 < 1900
      expect(matchesPeriod('21011231-daily', 'daily')).toBe(false); // Year 2101 > 2100
      expect(matchesPeriod('21010101-daily', 'daily')).toBe(false); // Year 2101 > 2100
    });

    it('should reject word prefixes', () => {
      expect(matchesPeriod('pre-daily', 'daily')).toBe(false);
      expect(matchesPeriod('test-weekly', 'weekly')).toBe(false);
      expect(matchesPeriod('alpha-monthly', 'monthly')).toBe(false);
    });

    it('should reject mixed alphanumeric prefixes that do not start with 4 digits', () => {
      expect(matchesPeriod('2x24-daily', 'daily')).toBe(false);
      expect(matchesPeriod('test123-weekly', 'weekly')).toBe(false);
      expect(matchesPeriod('123test-monthly', 'monthly')).toBe(false);
    });

    it('should accept year-month format', () => {
      expect(matchesPeriod('2024-01-daily', 'daily')).toBe(true);
      expect(matchesPeriod('2024-12-monthly', 'monthly')).toBe(true);
    });

    it('should accept year-week format', () => {
      expect(matchesPeriod('2024-W05-weekly', 'weekly')).toBe(false); // W is a letter
      expect(matchesPeriod('2024-05-weekly', 'weekly')).toBe(true);
    });

    it('should reject periods without prefix that are different', () => {
      expect(matchesPeriod('daily', 'weekly')).toBe(false);
      expect(matchesPeriod('monthly', 'hourly')).toBe(false);
    });

    it('should reject empty prefix with separator', () => {
      expect(matchesPeriod('-daily', 'daily')).toBe(false);
      expect(matchesPeriod('_weekly', 'weekly')).toBe(false);
    });

    it('should accept complex date formats', () => {
      expect(matchesPeriod('2024-01-15-daily', 'daily')).toBe(true);
      expect(matchesPeriod('2024-01-15-12-hourly', 'hourly')).toBe(true);
    });

    it('should handle case sensitivity correctly', () => {
      // The period type itself must match exactly
      expect(matchesPeriod('2024-01-Daily', 'daily')).toBe(false);
      expect(matchesPeriod('2024-01-daily', 'Daily')).toBe(false);
    });
  });

  describe('Cost Calculation', () => {
    const mockMember: CouncilMember = {
      id: 'test-member',
      provider: 'openai',
      model: 'gpt-4-turbo',
      timeout: 30,
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        retryableErrors: []
      }
    };

    const mockTokenUsage: TokenUsage = {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500
    };

    it('should calculate cost correctly for known provider/model', () => {
      const result = calculator.calculateCost(mockMember, mockTokenUsage);

      expect(result.memberId).toBe('test-member');
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4-turbo');
      expect(result.promptTokens).toBe(1000);
      expect(result.completionTokens).toBe(500);
      expect(result.totalTokens).toBe(1500);
      expect(result.cost).toBeGreaterThan(0);
      expect(result.currency).toBe('USD');
    });

    it('should return zero cost for unknown provider/model', () => {
      const unknownMember: CouncilMember = {
        ...mockMember,
        provider: 'unknown',
        model: 'unknown-model'
      };

      const result = calculator.calculateCost(unknownMember, mockTokenUsage);

      expect(result.cost).toBe(0);
      expect(result.currency).toBe('USD');
      expect(result.pricingVersion).toBe('unknown');
    });

    it('should calculate different costs for different token counts', () => {
      const usage1: TokenUsage = {
        promptTokens: 1000,
        completionTokens: 1000,
        totalTokens: 2000
      };

      const usage2: TokenUsage = {
        promptTokens: 2000,
        completionTokens: 2000,
        totalTokens: 4000
      };

      const cost1 = calculator.calculateCost(mockMember, usage1);
      const cost2 = calculator.calculateCost(mockMember, usage2);

      expect(cost2.cost).toBe(cost1.cost * 2);
    });

    it('should calculate higher cost for completion tokens than prompt tokens', () => {
      // For GPT-4 Turbo: prompt = $0.01/1K, completion = $0.03/1K
      const promptHeavy: TokenUsage = {
        promptTokens: 1000,
        completionTokens: 0,
        totalTokens: 1000
      };

      const completionHeavy: TokenUsage = {
        promptTokens: 0,
        completionTokens: 1000,
        totalTokens: 1000
      };

      const promptCost = calculator.calculateCost(mockMember, promptHeavy);
      const completionCost = calculator.calculateCost(mockMember, completionHeavy);

      expect(completionCost.cost).toBeGreaterThan(promptCost.cost);
    });
  });

  describe('Cost Aggregation', () => {
    it('should aggregate costs correctly', () => {
      const calculations = [
        {
          memberId: 'member1',
          provider: 'openai',
          model: 'gpt-4',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.01,
          currency: 'USD',
          pricingVersion: 'v1.0'
        },
        {
          memberId: 'member2',
          provider: 'anthropic',
          model: 'claude-3-opus',
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          cost: 0.02,
          currency: 'USD',
          pricingVersion: 'v1.0'
        }
      ];

      const aggregated = calculator.aggregateCosts(calculations);

      expect(aggregated.totalCost).toBe(0.03);
      expect(aggregated.currency).toBe('USD');
      expect(aggregated.byProvider.get('openai')).toBe(0.01);
      expect(aggregated.byProvider.get('anthropic')).toBe(0.02);
      expect(aggregated.byMember.get('member1')).toBe(0.01);
      expect(aggregated.byMember.get('member2')).toBe(0.02);
      expect(aggregated.calculations).toHaveLength(2);
    });

    it('should return zero cost for empty calculations', () => {
      const aggregated = calculator.aggregateCosts([]);

      expect(aggregated.totalCost).toBe(0);
      expect(aggregated.byProvider.size).toBe(0);
      expect(aggregated.byMember.size).toBe(0);
      expect(aggregated.calculations).toHaveLength(0);
    });

    it('should aggregate multiple costs from same provider', () => {
      const calculations = [
        {
          memberId: 'member1',
          provider: 'openai',
          model: 'gpt-4',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.01,
          currency: 'USD',
          pricingVersion: 'v1.0'
        },
        {
          memberId: 'member2',
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          cost: 0.005,
          currency: 'USD',
          pricingVersion: 'v1.0'
        }
      ];

      const aggregated = calculator.aggregateCosts(calculations);

      expect(aggregated.byProvider.get('openai')).toBe(0.015);
      expect(aggregated.byMember.get('member1')).toBe(0.01);
      expect(aggregated.byMember.get('member2')).toBe(0.005);
    });
  });

  describe('Cost Alerts', () => {
    it('should trigger alert when threshold exceeded', () => {
      const alert: CostAlert = {
        threshold: 10.0,
        currency: 'USD',
        period: 'daily',
        enabled: true
      };

      calculator.addCostAlert(alert);

      const alerts1 = calculator.checkCostAlerts(5.0, 'daily');
      expect(alerts1).toHaveLength(0);

      const alerts2 = calculator.checkCostAlerts(6.0, 'daily');
      expect(alerts2).toHaveLength(1);
      expect(alerts2[0]).toContain('exceeded threshold');
      expect(alerts2[0]).toContain('10.00');
    });

    it('should not trigger disabled alerts', () => {
      const alert: CostAlert = {
        threshold: 10.0,
        currency: 'USD',
        period: 'daily',
        enabled: false
      };

      calculator.addCostAlert(alert);

      const alerts = calculator.checkCostAlerts(15.0, 'daily');
      expect(alerts).toHaveLength(0);
    });

    it('should accumulate costs across multiple checks', () => {
      const alert: CostAlert = {
        threshold: 10.0,
        currency: 'USD',
        period: 'daily',
        enabled: true
      };

      calculator.addCostAlert(alert);

      calculator.checkCostAlerts(3.0, 'daily');
      calculator.checkCostAlerts(3.0, 'daily');
      calculator.checkCostAlerts(3.0, 'daily');

      const alerts = calculator.checkCostAlerts(2.0, 'daily');
      expect(alerts).toHaveLength(1); // Total is now 11.0, exceeds 10.0
    });

    it('should reset period costs', () => {
      calculator.checkCostAlerts(5.0, 'daily');
      expect(calculator.getPeriodCost('daily')).toBe(5.0);

      calculator.resetPeriodCosts('daily');
      expect(calculator.getPeriodCost('daily')).toBe(0);
    });

    it('should match period keys correctly for alerts', () => {
      const alert: CostAlert = {
        threshold: 10.0,
        currency: 'USD',
        period: 'daily',
        enabled: true
      };

      calculator.addCostAlert(alert);

      // Should match date-prefixed period keys
      const alerts = calculator.checkCostAlerts(15.0, '2024-01-15-daily');
      expect(alerts).toHaveLength(1);
    });
  });

  describe('Pricing Management', () => {
    it('should allow updating pricing', () => {
      calculator.addPricingConfig({
        provider: 'test',
        model: 'test-model',
        promptTokenPrice: 0.001,
        completionTokenPrice: 0.002,
        currency: 'USD',
        version: 'v1.0'
      });

      const config = calculator.getPricingConfig('test', 'test-model');
      expect(config).toBeDefined();
      expect(config?.promptTokenPrice).toBe(0.001);
    });

    it('should update existing pricing configuration', () => {
      calculator.addPricingConfig({
        provider: 'test',
        model: 'test-model',
        promptTokenPrice: 0.001,
        completionTokenPrice: 0.002,
        currency: 'USD',
        version: 'v1.0'
      });

      calculator.addPricingConfig({
        provider: 'test',
        model: 'test-model',
        promptTokenPrice: 0.003,
        completionTokenPrice: 0.004,
        currency: 'USD',
        version: 'v2.0'
      });

      const config = calculator.getPricingConfig('test', 'test-model');
      expect(config?.promptTokenPrice).toBe(0.003);
      expect(config?.version).toBe('v2.0');
    });

    it('should get all pricing configs', () => {
      const configs = calculator.getAllPricingConfigs();
      expect(configs.length).toBeGreaterThan(0); // Should have default configs
      expect(configs.every(c => c.provider && c.model)).toBe(true);
    });
  });
});
