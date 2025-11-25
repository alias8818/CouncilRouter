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

  /**
   * Get iterative consensus metrics
   */
  getConsensusMetrics(timeRange: TimeRange): Promise<{
    successRate: number;
    averageRounds: number;
    fallbackRateByReason: Map<string, number>;
    deadlockRate: number;
    earlyTerminationRate: number;
    costSavings: { tokensAvoided: number; estimatedCostSaved: number };
  }>;

  /**
   * Get negotiation details for a request
   */
  getNegotiationDetails(requestId: string): Promise<{
    rounds: Array<{
      roundNumber: number;
      averageSimilarity: number;
      minSimilarity: number;
      maxSimilarity: number;
      convergenceVelocity?: number;
      deadlockRisk?: string;
    }>;
    responses: Array<{
      roundNumber: number;
      councilMemberId: string;
      content: string;
      agreesWithMemberId?: string;
    }>;
    metadata: {
      totalRounds: number;
      consensusAchieved: boolean;
      fallbackUsed: boolean;
      fallbackReason?: string;
      finalSimilarity: number;
    };
  }>;

  /**
   * Get benchmark comparison between iterative consensus and fallback strategies
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
