/**
 * Admin Dashboard
 * Provides monitoring and analytics interface for the AI Council Proxy
 */

import { Pool } from 'pg';
import { IDashboard } from '../interfaces/IDashboard';
import { IAnalyticsEngine } from '../interfaces/IAnalyticsEngine';
import { IProviderPool } from '../interfaces/IProviderPool';
import { IRedTeamTester } from '../interfaces/IRedTeamTester';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';
import {
  RequestSummary,
  DeliberationThread,
  PerformanceMetrics,
  CostAnalytics,
  AgreementMatrix,
  InfluenceScores,
  RequestFilters,
  TimeRange,
  DeliberationRound,
  Exchange,
  ProviderHealth,
  RedTeamAnalytics
} from '../types/core';

/**
 * Dashboard class implementing IDashboard interface
 * Provides access to monitoring data, analytics, and configuration
 */
export class Dashboard implements IDashboard {
  constructor(
    private db: Pool,
    private analyticsEngine: IAnalyticsEngine,
    private providerPool: IProviderPool,
    private redTeamTester?: IRedTeamTester,
    private configManager?: IConfigurationManager
  ) { }

  /**
   * Get recent requests with optional filtering
   */
  async getRecentRequests(
    limit: number,
    filters?: RequestFilters
  ): Promise<RequestSummary[]> {
    let query = `
      SELECT 
        id as request_id,
        query,
        status,
        consensus_decision,
        total_cost as cost,
        total_latency_ms as latency,
        agreement_level,
        created_at as timestamp
      FROM requests
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Apply filters
    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.minCost !== undefined) {
      query += ` AND total_cost >= $${paramIndex}`;
      params.push(filters.minCost);
      paramIndex++;
    }

    if (filters?.maxCost !== undefined) {
      query += ` AND total_cost <= $${paramIndex}`;
      params.push(filters.maxCost);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.db.query(query, params);

    return result.rows.map(row => ({
      requestId: row.request_id,
      query: row.query,
      status: row.status,
      consensusDecision: row.consensus_decision || '',
      cost: parseFloat(row.cost || '0'),
      latency: parseInt(row.latency || '0'),
      agreementLevel: parseFloat(row.agreement_level || '0'),
      timestamp: row.timestamp
    }));
  }

  /**
   * Get full deliberation thread for a request
   */
  async getDeliberationThread(
    requestId: string
  ): Promise<DeliberationThread> {
    // Get initial responses (round 0)
    const initialQuery = `
      SELECT 
        council_member_id,
        content,
        token_usage,
        latency_ms,
        created_at
      FROM council_responses
      WHERE request_id = $1 AND round_number = 0
      ORDER BY created_at ASC
    `;

    const initialResult = await this.db.query(initialQuery, [requestId]);

    // Get deliberation exchanges (rounds > 0)
    const deliberationQuery = `
      SELECT 
        round_number,
        council_member_id,
        content,
        references_to,
        token_usage,
        created_at
      FROM deliberation_exchanges
      WHERE request_id = $1
      ORDER BY round_number ASC, created_at ASC
    `;

    const deliberationResult = await this.db.query(deliberationQuery, [requestId]);

    // Get total duration from request
    const durationQuery = `
      SELECT total_latency_ms
      FROM requests
      WHERE id = $1
    `;

    const durationResult = await this.db.query(durationQuery, [requestId]);
    const totalDuration = parseInt(durationResult.rows[0]?.total_latency_ms || '0');

    // Build rounds
    const rounds: DeliberationRound[] = [];

    // Add round 0 (initial responses) if exists
    if (initialResult.rows.length > 0) {
      const exchanges: Exchange[] = initialResult.rows.map(row => ({
        councilMemberId: row.council_member_id,
        content: row.content,
        referencesTo: [],
        tokenUsage: row.token_usage
      }));

      rounds.push({
        roundNumber: 0,
        exchanges
      });
    }

    // Group deliberation exchanges by round
    const roundMap = new Map<number, Exchange[]>();
    for (const row of deliberationResult.rows) {
      const roundNumber = row.round_number;
      if (!roundMap.has(roundNumber)) {
        roundMap.set(roundNumber, []);
      }

      roundMap.get(roundNumber)!.push({
        councilMemberId: row.council_member_id,
        content: row.content,
        referencesTo: row.references_to || [],
        tokenUsage: row.token_usage
      });
    }

    // Add deliberation rounds
    for (const [roundNumber, exchanges] of Array.from(roundMap.entries()).sort((a, b) => a[0] - b[0])) {
      rounds.push({
        roundNumber,
        exchanges
      });
    }

    return {
      rounds,
      totalDuration
    };
  }

  /**
   * Get performance metrics for a time range
   */
  async getPerformanceMetrics(
    timeRange: TimeRange
  ): Promise<PerformanceMetrics> {
    return this.analyticsEngine.calculatePerformanceMetrics(timeRange);
  }

  /**
   * Get cost analytics for a time range
   */
  async getCostAnalytics(
    timeRange: TimeRange
  ): Promise<CostAnalytics> {
    return this.analyticsEngine.aggregateCostAnalytics(timeRange);
  }

  /**
   * Get agreement matrix showing disagreement rates
   */
  async getAgreementMatrix(): Promise<AgreementMatrix> {
    return this.analyticsEngine.computeAgreementMatrix();
  }

  /**
   * Get influence scores for council members
   */
  async getInfluenceScores(): Promise<InfluenceScores> {
    return this.analyticsEngine.calculateInfluenceScores();
  }

  /**
   * Get provider health status for all providers
   * Returns array of provider health information including warnings for disabled members
   */
  async getProviderHealthStatus(): Promise<ProviderHealth[]> {
    const getAllHealth = (this.providerPool as any)?.getAllProviderHealth;

    if (typeof getAllHealth === 'function') {
      return getAllHealth.call(this.providerPool);
    }

    if (this.configManager) {
      // Preferred fallback: derive unique providers from council configuration
      const councilConfig = await this.configManager.getCouncilConfig();
      const uniqueProviders = Array.from(new Set(councilConfig.members.map(member => member.provider)));

      return uniqueProviders.map(providerId =>
        this.providerPool.getProviderHealth(providerId)
      );
    }

    // Final fallback: query database to map council member IDs to provider IDs
    // Join council_responses with requests to access config_snapshot which contains
    // the mapping between council_member_id and provider
    const result = await this.db.query(`
      SELECT DISTINCT
        cr.council_member_id,
        r.config_snapshot->'members' AS members
      FROM council_responses cr
      INNER JOIN requests r ON cr.request_id = r.id
      WHERE cr.council_member_id IS NOT NULL
        AND r.config_snapshot->'members' IS NOT NULL
      LIMIT 100
    `);

    if (result.rows.length === 0) {
      return [];
    }

    // Build a mapping from council_member_id to provider
    const memberToProvider = new Map<string, string>();
    const uniqueProviders = new Set<string>();

    for (const row of result.rows) {
      const councilMemberId = row.council_member_id;

      // If we already have this mapping, skip
      if (memberToProvider.has(councilMemberId)) {
        continue;
      }

      // Extract provider from config_snapshot members array
      if (row.members && Array.isArray(row.members)) {
        for (const member of row.members) {
          if (member.id === councilMemberId && member.provider) {
            memberToProvider.set(councilMemberId, member.provider);
            uniqueProviders.add(member.provider);
            break;
          }
        }
      }
    }

    // Return health status for unique providers (not council member IDs)
    return Array.from(uniqueProviders).map(providerId =>
      this.providerPool.getProviderHealth(providerId)
    );
  }

  /**
   * Get warnings for disabled council members
   * Returns array of warning messages for members that are disabled
   */
  async getDisabledMemberWarnings(): Promise<string[]> {
    const healthStatuses = await this.getProviderHealthStatus();
    const warnings: string[] = [];

    for (const health of healthStatuses) {
      if (health.status === 'disabled') {
        const providerId = health.providerId?.trim() || 'unknown-provider';

        warnings.push(
          `Warning: Council member ${providerId} is disabled. ` +
          'Reduced council participation may affect response quality.'
        );
      }
    }

    return warnings;
  }

  /**
   * Get red-team test analytics
   */
  async getRedTeamAnalytics(): Promise<RedTeamAnalytics> {
    if (!this.redTeamTester) {
      return {
        resistanceRatesByMember: new Map(),
        resistanceRatesByCategory: new Map(),
        resistanceRatesByMemberAndCategory: new Map()
      };
    }
    return this.redTeamTester.getResistanceRates();
  }

  /**
   * Get security warnings for council members
   */
  async getSecurityWarnings(): Promise<Map<string, string>> {
    if (!this.redTeamTester) {
      return new Map();
    }
    return this.redTeamTester.getSecurityWarnings();
  }

  /**
   * Check if deliberation should be shown based on transparency configuration
   * @param userPreference - User's preference for showing deliberation (optional)
   * @returns true if deliberation should be shown, false otherwise
   */
  async shouldShowDeliberation(userPreference?: boolean): Promise<boolean> {
    if (!this.configManager) {
      // If no config manager, default to user preference or false
      return userPreference ?? false;
    }

    const transparencyConfig = await this.configManager.getTransparencyConfig();

    // If forced transparency is enabled, always show deliberation
    if (transparencyConfig.forcedTransparency) {
      return true;
    }

    // If transparency is not enabled, never show deliberation
    if (!transparencyConfig.enabled) {
      return false;
    }

    // Otherwise, respect user preference (default to false)
    return userPreference ?? false;
  }

  /**
   * Get deliberation thread with transparency settings applied
   * @param requestId - The request ID
   * @param userPreference - User's preference for showing deliberation (optional)
   * @returns Deliberation thread if transparency allows, null otherwise
   */
  async getDeliberationThreadWithTransparency(
    requestId: string,
    userPreference?: boolean
  ): Promise<DeliberationThread | null> {
    const shouldShow = await this.shouldShowDeliberation(userPreference);

    if (!shouldShow) {
      return null;
    }

    return this.getDeliberationThread(requestId);
  }

  /**
   * Get iterative consensus metrics
   */
  /**
   * Get benchmark comparison between iterative consensus and fallback strategies
   */
  async getBenchmarkComparison(timeRange: TimeRange): Promise<{
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
  }> {
    return this.analyticsEngine.getBenchmarkComparison(timeRange);
  }

  async getConsensusMetrics(timeRange: TimeRange): Promise<{
    successRate: number;
    averageRounds: number;
    fallbackRateByReason: Map<string, number>;
    deadlockRate: number;
    earlyTerminationRate: number;
    costSavings: { tokensAvoided: number; estimatedCostSaved: number };
  }> {
    const [
      successRate,
      averageRounds,
      fallbackRateByReason,
      deadlockRate,
      earlyTerminationRate,
      costSavings
    ] = await Promise.all([
      this.analyticsEngine.calculateConsensusSuccessRate(timeRange),
      this.analyticsEngine.calculateAverageRoundsToConsensus(timeRange),
      this.analyticsEngine.calculateFallbackRateByReason(timeRange),
      this.analyticsEngine.calculateDeadlockRate(timeRange),
      this.analyticsEngine.calculateEarlyTerminationRate(timeRange),
      this.analyticsEngine.calculateCostSavings(timeRange)
    ]);

    return {
      successRate,
      averageRounds,
      fallbackRateByReason,
      deadlockRate,
      earlyTerminationRate,
      costSavings
    };
  }

  /**
   * Get negotiation details for a request
   */
  async getNegotiationDetails(requestId: string): Promise<{
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
  }> {
    // Get rounds
    const roundsQuery = `
      SELECT 
        round_number, average_similarity, min_similarity, max_similarity,
        convergence_velocity, deadlock_risk
      FROM negotiation_rounds
      WHERE request_id = $1
      ORDER BY round_number ASC
    `;
    const roundsResult = await this.db.query(roundsQuery, [requestId]);

    // Get responses
    const responsesQuery = `
      SELECT 
        round_number, council_member_id, content, agrees_with_member_id
      FROM negotiation_responses
      WHERE request_id = $1
      ORDER BY round_number ASC, council_member_id ASC
    `;
    const responsesResult = await this.db.query(responsesQuery, [requestId]);

    // Get metadata
    const metadataQuery = `
      SELECT 
        total_rounds, consensus_achieved, fallback_used, fallback_reason, final_similarity
      FROM consensus_metadata
      WHERE request_id = $1
    `;
    const metadataResult = await this.db.query(metadataQuery, [requestId]);

    return {
      rounds: roundsResult.rows.map(row => ({
        roundNumber: row.round_number,
        averageSimilarity: parseFloat(row.average_similarity),
        minSimilarity: parseFloat(row.min_similarity),
        maxSimilarity: parseFloat(row.max_similarity),
        convergenceVelocity: row.convergence_velocity ? parseFloat(row.convergence_velocity) : undefined,
        deadlockRisk: row.deadlock_risk || undefined
      })),
      responses: responsesResult.rows.map(row => ({
        roundNumber: row.round_number,
        councilMemberId: row.council_member_id,
        content: row.content,
        agreesWithMemberId: row.agrees_with_member_id || undefined
      })),
      metadata: metadataResult.rows.length > 0 ? {
        totalRounds: metadataResult.rows[0].total_rounds,
        consensusAchieved: metadataResult.rows[0].consensus_achieved,
        fallbackUsed: metadataResult.rows[0].fallback_used,
        fallbackReason: metadataResult.rows[0].fallback_reason || undefined,
        finalSimilarity: parseFloat(metadataResult.rows[0].final_similarity)
      } : {
        totalRounds: 0,
        consensusAchieved: false,
        fallbackUsed: false,
        finalSimilarity: 0
      }
    };
  }
}
