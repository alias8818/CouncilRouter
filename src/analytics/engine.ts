import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { IAnalyticsEngine } from '../interfaces/IAnalyticsEngine';
import {
  PerformanceMetrics,
  CostAnalytics,
  AgreementMatrix,
  InfluenceScores,
  TimeRange,
  LatencyStats
} from '../types/core';

/**
 * Analytics Engine
 * Provides analytics computation and aggregation with caching
 */
export class AnalyticsEngine implements IAnalyticsEngine {
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private db: Pool,
    private redis: RedisClientType
  ) {}

  /**
   * Calculate performance metrics (p50, p95, p99 latency)
   */
  async calculatePerformanceMetrics(
    timeRange: TimeRange
  ): Promise<PerformanceMetrics> {
    const cacheKey = `analytics:performance:${timeRange.start.getTime()}-${timeRange.end.getTime()}`;
    
    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        ...parsed,
        byCouncilSize: new Map(Object.entries(parsed.byCouncilSize)),
        byDeliberationRounds: new Map(Object.entries(parsed.byDeliberationRounds))
      };
    }

    // Query latency data
    const latencyQuery = `
      SELECT 
        total_latency_ms,
        (config_snapshot->'members')::jsonb AS members,
        (config_snapshot->'deliberation'->>'rounds')::int AS deliberation_rounds
      FROM requests
      WHERE created_at >= $1 AND created_at <= $2
        AND status = 'completed'
        AND total_latency_ms IS NOT NULL
      ORDER BY total_latency_ms ASC
    `;

    const result = await this.db.query(latencyQuery, [timeRange.start, timeRange.end]);
    const latencies = result.rows.map(r => r.total_latency_ms).sort((a, b) => a - b);

    if (latencies.length === 0) {
      return {
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        byCouncilSize: new Map(),
        byDeliberationRounds: new Map(),
        timeoutRate: 0
      };
    }

    // Calculate percentiles
    const p50Latency = this.calculatePercentile(latencies, 0.50);
    const p95Latency = this.calculatePercentile(latencies, 0.95);
    const p99Latency = this.calculatePercentile(latencies, 0.99);

    // Group by council size
    const byCouncilSize = new Map<number, LatencyStats>();
    const councilSizeGroups = new Map<number, number[]>();
    
    for (const row of result.rows) {
      const councilSize = Array.isArray(row.members) ? row.members.length : 0;
      if (!councilSizeGroups.has(councilSize)) {
        councilSizeGroups.set(councilSize, []);
      }
      councilSizeGroups.get(councilSize)!.push(row.total_latency_ms);
    }

    for (const [size, latencies] of councilSizeGroups.entries()) {
      const sortedLatencies = latencies.sort((a, b) => a - b);
      byCouncilSize.set(size, {
        p50: this.calculatePercentile(sortedLatencies, 0.50),
        p95: this.calculatePercentile(sortedLatencies, 0.95),
        p99: this.calculatePercentile(sortedLatencies, 0.99),
        count: sortedLatencies.length
      });
    }

    // Group by deliberation rounds
    const byDeliberationRounds = new Map<number, LatencyStats>();
    const roundGroups = new Map<number, number[]>();
    
    for (const row of result.rows) {
      const rounds = row.deliberation_rounds || 0;
      if (!roundGroups.has(rounds)) {
        roundGroups.set(rounds, []);
      }
      roundGroups.get(rounds)!.push(row.total_latency_ms);
    }

    for (const [rounds, latencies] of roundGroups.entries()) {
      const sortedLatencies = latencies.sort((a, b) => a - b);
      byDeliberationRounds.set(rounds, {
        p50: this.calculatePercentile(sortedLatencies, 0.50),
        p95: this.calculatePercentile(sortedLatencies, 0.95),
        p99: this.calculatePercentile(sortedLatencies, 0.99),
        count: sortedLatencies.length
      });
    }

    // Calculate timeout rate
    const timeoutQuery = `
      SELECT COUNT(*) as timeout_count
      FROM requests
      WHERE created_at >= $1 AND created_at <= $2
        AND status = 'completed'
        AND config_snapshot->>'globalTimeout' IS NOT NULL
        AND total_latency_ms >= (config_snapshot->>'globalTimeout')::int * 1000
    `;
    const timeoutResult = await this.db.query(timeoutQuery, [timeRange.start, timeRange.end]);
    const timeoutCount = parseInt(timeoutResult.rows[0]?.timeout_count || '0');
    const timeoutRate = result.rows.length > 0 ? timeoutCount / result.rows.length : 0;

    const metrics: PerformanceMetrics = {
      p50Latency,
      p95Latency,
      p99Latency,
      byCouncilSize,
      byDeliberationRounds,
      timeoutRate
    };

    // Cache the result
    await this.redis.setEx(
      cacheKey,
      this.CACHE_TTL,
      JSON.stringify({
        ...metrics,
        byCouncilSize: Object.fromEntries(metrics.byCouncilSize),
        byDeliberationRounds: Object.fromEntries(metrics.byDeliberationRounds)
      })
    );

    return metrics;
  }

  /**
   * Compute agreement matrix from deliberation data
   */
  async computeAgreementMatrix(): Promise<AgreementMatrix> {
    const cacheKey = 'analytics:agreement-matrix';
    
    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get all council members who have participated
    const membersQuery = `
      SELECT DISTINCT council_member_id
      FROM council_responses
      ORDER BY council_member_id
    `;
    const membersResult = await this.db.query(membersQuery);
    const members = membersResult.rows.map(r => r.council_member_id);

    if (members.length === 0) {
      return { members: [], disagreementRates: [] };
    }

    // Initialize disagreement matrix
    const disagreementRates: number[][] = Array(members.length)
      .fill(0)
      .map(() => Array(members.length).fill(0));

    // For each pair of members, calculate disagreement rate
    for (let i = 0; i < members.length; i++) {
      for (let j = 0; j < members.length; j++) {
        if (i === j) {
          disagreementRates[i][j] = 0;
          continue;
        }

        // Find requests where both members participated
        const pairQuery = `
          SELECT 
            r.id as request_id,
            r.consensus_decision,
            cr1.content as member1_content,
            cr2.content as member2_content
          FROM requests r
          INNER JOIN council_responses cr1 ON r.id = cr1.request_id AND cr1.council_member_id = $1
          INNER JOIN council_responses cr2 ON r.id = cr2.request_id AND cr2.council_member_id = $2
          WHERE r.status = 'completed'
            AND r.consensus_decision IS NOT NULL
        `;
        
        const pairResult = await this.db.query(pairQuery, [members[i], members[j]]);
        
        if (!pairResult || !pairResult.rows || pairResult.rows.length === 0) {
          disagreementRates[i][j] = 0;
          continue;
        }

        // Calculate disagreement: responses that differ significantly
        let disagreements = 0;
        for (const row of pairResult.rows) {
          // Skip rows with missing data
          if (!row.consensus_decision || !row.member1_content || !row.member2_content) {
            continue;
          }

          // Simple heuristic: if one response appears in consensus and other doesn't
          const consensus = row.consensus_decision.toLowerCase();
          const content1 = row.member1_content.toLowerCase();
          const content2 = row.member2_content.toLowerCase();
          
          // Check if responses have significant overlap with consensus
          const overlap1 = this.calculateOverlap(content1, consensus);
          const overlap2 = this.calculateOverlap(content2, consensus);
          
          // If one has high overlap and other has low, they disagreed
          if (Math.abs(overlap1 - overlap2) > 0.3) {
            disagreements++;
          }
        }

        disagreementRates[i][j] = pairResult.rows.length > 0 
          ? disagreements / pairResult.rows.length 
          : 0;
      }
    }

    const matrix: AgreementMatrix = {
      members,
      disagreementRates
    };

    // Cache the result
    await this.redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(matrix));

    return matrix;
  }

  /**
   * Calculate influence scores based on consensus decisions
   */
  async calculateInfluenceScores(): Promise<InfluenceScores> {
    const cacheKey = 'analytics:influence-scores';
    
    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        scores: new Map(Object.entries(parsed.scores))
      };
    }

    // Get all completed requests with consensus
    const query = `
      SELECT 
        r.id,
        r.consensus_decision,
        cr.council_member_id,
        cr.content
      FROM requests r
      INNER JOIN council_responses cr ON r.id = cr.request_id
      WHERE r.status = 'completed'
        AND r.consensus_decision IS NOT NULL
    `;

    const result = await this.db.query(query);
    
    if (result.rows.length === 0) {
      return { scores: new Map() };
    }

    // Calculate influence: how often each member's response appears in consensus
    const memberInfluence = new Map<string, { matches: number; total: number }>();

    for (const row of result.rows) {
      const memberId = row.council_member_id;
      const consensus = (row.consensus_decision || '').toLowerCase();
      const content = (row.content || '').toLowerCase();

      // Skip rows with empty or whitespace-only content
      if (!consensus.trim() || !content.trim()) {
        continue;
      }

      if (!memberInfluence.has(memberId)) {
        memberInfluence.set(memberId, { matches: 0, total: 0 });
      }

      const stats = memberInfluence.get(memberId)!;
      stats.total++;

      // Calculate overlap between member response and consensus
      const overlap = this.calculateOverlap(content, consensus);
      
      // If high overlap (>0.5), consider it a match
      if (overlap > 0.5) {
        stats.matches++;
      }
    }

    // Convert to influence scores (0-1)
    const scores = new Map<string, number>();
    for (const [memberId, stats] of memberInfluence.entries()) {
      const score = stats.total > 0 ? stats.matches / stats.total : 0;
      // Ensure score is never NaN
      scores.set(memberId, isNaN(score) ? 0 : score);
    }

    const influenceScores: InfluenceScores = { scores };

    // Cache the result
    await this.redis.setEx(
      cacheKey,
      this.CACHE_TTL,
      JSON.stringify({ scores: Object.fromEntries(scores) })
    );

    return influenceScores;
  }

  /**
   * Aggregate cost analytics by time period
   */
  async aggregateCostAnalytics(
    timeRange: TimeRange
  ): Promise<CostAnalytics> {
    const cacheKey = `analytics:cost:${timeRange.start.getTime()}-${timeRange.end.getTime()}`;
    
    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        ...parsed,
        byProvider: new Map(Object.entries(parsed.byProvider)),
        byMember: new Map(Object.entries(parsed.byMember))
      };
    }

    // Query cost data
    const costQuery = `
      SELECT 
        SUM(cost) as total_cost,
        provider,
        model,
        COUNT(DISTINCT request_id) as request_count
      FROM cost_records
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY provider, model
    `;

    const result = await this.db.query(costQuery, [timeRange.start, timeRange.end]);

    let totalCost = 0;
    const byProvider = new Map<string, number>();
    const byMember = new Map<string, number>();
    let totalRequests = 0;

    for (const row of result.rows) {
      const cost = parseFloat(row.total_cost || '0');
      totalCost += cost;

      // Aggregate by provider
      const providerCost = byProvider.get(row.provider) || 0;
      byProvider.set(row.provider, providerCost + cost);

      // Aggregate by member (provider:model)
      const memberId = `${row.provider}:${row.model}`;
      const memberCost = byMember.get(memberId) || 0;
      byMember.set(memberId, memberCost + cost);
    }

    // Get total request count
    const requestCountQuery = `
      SELECT COUNT(DISTINCT id) as count
      FROM requests
      WHERE created_at >= $1 AND created_at <= $2
        AND status = 'completed'
    `;
    const requestCountResult = await this.db.query(requestCountQuery, [timeRange.start, timeRange.end]);
    totalRequests = parseInt(requestCountResult.rows[0]?.count || '0');

    const costPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;

    // Project monthly cost based on time range
    const daysInRange = (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24);
    const projectedMonthlyCost = daysInRange > 0 ? (totalCost / daysInRange) * 30 : 0;

    const analytics: CostAnalytics = {
      totalCost,
      byProvider,
      byMember,
      costPerRequest,
      projectedMonthlyCost
    };

    // Cache the result
    await this.redis.setEx(
      cacheKey,
      this.CACHE_TTL,
      JSON.stringify({
        ...analytics,
        byProvider: Object.fromEntries(analytics.byProvider),
        byMember: Object.fromEntries(analytics.byMember)
      })
    );

    return analytics;
  }

  /**
   * Calculate cost-per-quality analysis
   */
  async calculateCostPerQuality(
    timeRange: TimeRange
  ): Promise<Array<{ cost: number; quality: number }>> {
    const query = `
      SELECT 
        r.id,
        r.total_cost as cost,
        r.agreement_level as quality
      FROM requests r
      WHERE r.created_at >= $1 AND r.created_at <= $2
        AND r.status = 'completed'
        AND r.total_cost IS NOT NULL
        AND r.agreement_level IS NOT NULL
      ORDER BY r.created_at DESC
    `;

    const result = await this.db.query(query, [timeRange.start, timeRange.end]);

    return result.rows.map(row => ({
      cost: parseFloat(row.cost),
      quality: parseFloat(row.quality)
    }));
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Calculate overlap between two texts (simple word-based similarity)
   */
  private calculateOverlap(text1: string, text2: string): number {
    const words1 = new Set(text1.trim().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.trim().split(/\s+/).filter(w => w.length > 3));
    
    // If either text has no meaningful words, return 0 (no overlap)
    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) {
        intersection++;
      }
    }

    const overlap = intersection / Math.max(words1.size, words2.size);
    
    // Ensure we never return NaN
    return isNaN(overlap) ? 0 : overlap;
  }
}
