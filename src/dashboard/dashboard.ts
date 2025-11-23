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
    private redTeamTester: IRedTeamTester,
    private configManager?: IConfigurationManager
  ) {}

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

    // Final fallback: query database for council member IDs when config manager is unavailable.
    // Use council_responses, which actually stores council_member_id values.
    const result = await this.db.query(`
      SELECT DISTINCT council_member_id
      FROM council_responses
      WHERE council_member_id IS NOT NULL
    `);

    if (result.rows.length === 0) {
      return [];
    }

    return result.rows.map(row =>
      this.providerPool.getProviderHealth(row.council_member_id)
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
        warnings.push(
          `Warning: Council member ${health.providerId} is disabled. ` +
          `Reduced council participation may affect response quality.`
        );
      }
    }

    return warnings;
  }

  /**
   * Get red-team test analytics
   */
  async getRedTeamAnalytics(): Promise<RedTeamAnalytics> {
    return this.redTeamTester.getResistanceRates();
  }

  /**
   * Get security warnings for council members
   */
  async getSecurityWarnings(): Promise<Map<string, string>> {
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
}
