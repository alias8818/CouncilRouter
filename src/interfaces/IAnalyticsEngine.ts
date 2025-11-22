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
}
