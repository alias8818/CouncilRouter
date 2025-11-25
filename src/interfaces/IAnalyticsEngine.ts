import {
  PerformanceMetrics,
  CostAnalytics,
  AgreementMatrix,
  InfluenceScores,
  TimeRange
} from '../types/core';

/**
 * Analytics Engine Interface
 * Provides analytics computation and aggregation
 */
export interface IAnalyticsEngine {
  /**
   * Calculate performance metrics (p50, p95, p99 latency)
   */
  calculatePerformanceMetrics(
    timeRange: TimeRange
  ): Promise<PerformanceMetrics>;

  /**
   * Compute agreement matrix from deliberation data
   */
  computeAgreementMatrix(): Promise<AgreementMatrix>;

  /**
   * Calculate influence scores based on consensus decisions
   */
  calculateInfluenceScores(): Promise<InfluenceScores>;

  /**
   * Aggregate cost analytics by time period
   */
  aggregateCostAnalytics(
    timeRange: TimeRange
  ): Promise<CostAnalytics>;

  /**
   * Calculate cost-per-quality analysis
   */
  calculateCostPerQuality(
    timeRange: TimeRange
  ): Promise<Array<{ cost: number; quality: number }>>;

  /**
   * Calculate iterative consensus success rate
   */
  calculateConsensusSuccessRate(timeRange: TimeRange): Promise<number>;

  /**
   * Calculate average rounds to consensus
   */
  calculateAverageRoundsToConsensus(timeRange: TimeRange): Promise<number>;

  /**
   * Calculate fallback rate by reason
   */
  calculateFallbackRateByReason(timeRange: TimeRange): Promise<Map<string, number>>;

  /**
   * Calculate deadlock rate
   */
  calculateDeadlockRate(timeRange: TimeRange): Promise<number>;

  /**
   * Calculate early termination rate
   */
  calculateEarlyTerminationRate(timeRange: TimeRange): Promise<number>;

  /**
   * Calculate total cost savings from early termination
   */
  calculateCostSavings(timeRange: TimeRange): Promise<{ tokensAvoided: number; estimatedCostSaved: number }>;

  /**
   * Compare iterative consensus vs fallback strategies
   * Returns metrics comparison: round count, response quality, cost, latency
   */
  getBenchmarkComparison(timeRange: TimeRange): Promise<{
    iterativeConsensus: {
      avgRounds: number;
      successRate: number;
      avgCost: number;
      avgLatency: number;
      avgQuality: number;
    };
    fallbackStrategies: {
      metaSynthesis: {
        avgCost: number;
        avgLatency: number;
        avgQuality: number;
      };
      consensusExtraction: {
        avgCost: number;
        avgLatency: number;
        avgQuality: number;
      };
      weightedFusion: {
        avgCost: number;
        avgLatency: number;
        avgQuality: number;
      };
    };
  }>;
}
