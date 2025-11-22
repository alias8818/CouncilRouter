import {
  RequestSummary,
  DeliberationThread,
  PerformanceMetrics,
  CostAnalytics,
  AgreementMatrix,
  InfluenceScores,
  RequestFilters,
  TimeRange,
  RedTeamAnalytics
} from '../types/core';

/**
 * Dashboard Interface
 * Provides monitoring and analytics data
 */
export interface IDashboard {
  /**
   * Get recent requests with optional filtering
   */
  getRecentRequests(
    limit: number,
    filters?: RequestFilters
  ): Promise<RequestSummary[]>;
  
  /**
   * Get full deliberation thread for a request
   */
  getDeliberationThread(
    requestId: string
  ): Promise<DeliberationThread>;
  
  /**
   * Get performance metrics for a time range
   */
  getPerformanceMetrics(
    timeRange: TimeRange
  ): Promise<PerformanceMetrics>;
  
  /**
   * Get cost analytics for a time range
   */
  getCostAnalytics(
    timeRange: TimeRange
  ): Promise<CostAnalytics>;
  
  /**
   * Get agreement matrix showing disagreement rates
   */
  getAgreementMatrix(): Promise<AgreementMatrix>;
  
  /**
   * Get influence scores for council members
   */
  getInfluenceScores(): Promise<InfluenceScores>;

  /**
   * Get red-team test analytics
   */
  getRedTeamAnalytics(): Promise<RedTeamAnalytics>;

  /**
   * Get security warnings for council members
   */
  getSecurityWarnings(): Promise<Map<string, string>>;
}
