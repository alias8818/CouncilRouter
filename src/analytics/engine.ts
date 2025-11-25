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

    if (!result || !result.rows) {
      return {
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        byCouncilSize: new Map(),
        byDeliberationRounds: new Map(),
        timeoutRate: 0
      };
    }

    const latencies = result.rows
      .filter(r => r && r.total_latency_ms != null)
      .map(r => r.total_latency_ms)
      .sort((a, b) => a - b);

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
      // Skip rows with missing data - CRITICAL FIX: check members before accessing
      if (!row || row.total_latency_ms == null || !row.members) {
        continue;
      }

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
      // Skip rows with missing data - CRITICAL FIX: check deliberation_rounds field
      if (!row || row.total_latency_ms == null || row.deliberation_rounds == null) {
        continue;
      }

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
        let validRows = 0;
        for (const row of pairResult.rows) {
          // Skip rows with missing data - defensive null checks
          if (!row ||
              !row.consensus_decision ||
              !row.member1_content ||
              !row.member2_content) {
            continue;
          }

          validRows++;
          const content1 = row.member1_content.toLowerCase();
          const content2 = row.member2_content.toLowerCase();

          // Compare member responses directly to each other
          const memberOverlap = this.calculateOverlap(content1, content2);

          // If members have low overlap, they disagreed
          if (memberOverlap < 0.7) {
            disagreements++;
          }
        }

        // Use validRows count instead of total rows for accurate rate
        disagreementRates[i][j] = validRows > 0
          ? disagreements / validRows
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

    if (!result || !result.rows || result.rows.length === 0) {
      return { scores: new Map() };
    }

    // Calculate influence: how often each member's response appears in consensus
    const memberInfluence = new Map<string, { matches: number; total: number }>();

    for (const row of result.rows) {
      // Skip rows with missing data - defensive null checks
      if (!row ||
          !row.council_member_id ||
          !row.consensus_decision ||
          !row.content) {
        continue;
      }

      const memberId = row.council_member_id;

      // Skip rows with whitespace-only member IDs
      if (typeof memberId !== 'string' || !memberId.trim()) {
        continue;
      }

      const consensus = row.consensus_decision.toLowerCase();
      const content = row.content.toLowerCase();

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

    if (result && result.rows) {
      for (const row of result.rows) {
        // Skip rows with missing data
        if (!row || !row.provider || !row.model) {
          continue;
        }

        const cost = parseFloat(row.total_cost || '0');
        // Skip if cost is NaN
        if (isNaN(cost)) {
          continue;
        }

        totalCost += cost;

        // Aggregate by provider
        const providerCost = byProvider.get(row.provider) || 0;
        byProvider.set(row.provider, providerCost + cost);

        // Aggregate by member (provider:model)
        const memberId = `${row.provider}:${row.model}`;
        const memberCost = byMember.get(memberId) || 0;
        byMember.set(memberId, memberCost + cost);
      }
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

    if (!result || !result.rows) {
      return [];
    }

    return result.rows
      .filter(row => row && row.cost != null && row.quality != null)
      .map(row => ({
        cost: parseFloat(row.cost),
        quality: parseFloat(row.quality)
      }))
      .filter(item => !isNaN(item.cost) && !isNaN(item.quality));
  }

  /**
   * Calculate percentile from sorted array using linear interpolation
   * Handles edge cases for small datasets (0, 1, 2 elements)
   * Uses standard percentile calculation method
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) {return 0;}
    if (sortedValues.length === 1) {return sortedValues[0];}

    // Use linear interpolation method (nearest-rank with interpolation)
    // Formula: position = (n - 1) * p + 1
    // Then interpolate between floor and ceiling positions
    const n = sortedValues.length;
    const position = (n - 1) * percentile + 1;
    const lowerIndex = Math.floor(position) - 1;
    const upperIndex = Math.ceil(position) - 1;

    // Ensure indices are within bounds
    const safeLowerIndex = Math.max(0, Math.min(lowerIndex, n - 1));
    const safeUpperIndex = Math.max(0, Math.min(upperIndex, n - 1));

    // Ensure upperIndex >= lowerIndex to maintain ordering
    const finalLowerIndex = Math.min(safeLowerIndex, safeUpperIndex);
    const finalUpperIndex = Math.max(safeLowerIndex, safeUpperIndex);

    if (finalLowerIndex === finalUpperIndex) {
      return sortedValues[finalLowerIndex];
    }

    // Linear interpolation
    const weight = position - Math.floor(position);
    const result = sortedValues[finalLowerIndex] * (1 - weight) + sortedValues[finalUpperIndex] * weight;

    // Ensure result is within bounds of the array (safety check for floating point precision)
    return Math.max(sortedValues[0], Math.min(result, sortedValues[n - 1]));
  }

  /**
   * Calculate overlap between two texts (simple word-based similarity)
   */
  private calculateOverlap(text1: string, text2: string): number {
    const trimmed1 = text1.trim();
    const trimmed2 = text2.trim();

    const words1 = new Set(trimmed1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(trimmed2.split(/\s+/).filter(w => w.length > 3));

    // If both texts have no meaningful words, compare them directly
    // Identical whitespace-only or empty strings should have full overlap
    if (words1.size === 0 && words2.size === 0) {
      return trimmed1 === trimmed2 ? 1.0 : 0;
    }

    // If only one has no meaningful words, return 0 (no overlap)
    if (words1.size === 0 || words2.size === 0) {return 0;}

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

  /**
   * Calculate iterative consensus success rate
   */
  async calculateConsensusSuccessRate(timeRange: TimeRange): Promise<number> {
    const cacheKey = `analytics:consensus-success-rate:${timeRange.start.getTime()}-${timeRange.end.getTime()}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return parseFloat(cached);
    }

    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE consensus_achieved = true) as successful,
        COUNT(*) as total
      FROM consensus_metadata cm
      INNER JOIN requests r ON cm.request_id = r.id
      WHERE r.created_at >= $1 AND r.created_at <= $2
    `;

    const result = await this.db.query(query, [timeRange.start, timeRange.end]);

    if (!result.rows || result.rows.length === 0 || result.rows[0].total === 0) {
      return 0;
    }

    const successRate = result.rows[0].successful / result.rows[0].total;
    await this.redis.setEx(cacheKey, this.CACHE_TTL, successRate.toString());
    return successRate;
  }

  /**
   * Calculate average rounds to consensus
   */
  async calculateAverageRoundsToConsensus(timeRange: TimeRange): Promise<number> {
    const cacheKey = `analytics:avg-rounds:${timeRange.start.getTime()}-${timeRange.end.getTime()}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return parseFloat(cached);
    }

    const query = `
      SELECT AVG(total_rounds) as avg_rounds
      FROM consensus_metadata cm
      INNER JOIN requests r ON cm.request_id = r.id
      WHERE r.created_at >= $1 AND r.created_at <= $2
        AND consensus_achieved = true
    `;

    const result = await this.db.query(query, [timeRange.start, timeRange.end]);

    if (!result.rows || result.rows.length === 0 || !result.rows[0].avg_rounds) {
      return 0;
    }

    const avgRounds = parseFloat(result.rows[0].avg_rounds);
    await this.redis.setEx(cacheKey, this.CACHE_TTL, avgRounds.toString());
    return avgRounds;
  }

  /**
   * Calculate fallback rate by reason
   */
  async calculateFallbackRateByReason(timeRange: TimeRange): Promise<Map<string, number>> {
    const cacheKey = `analytics:fallback-rate:${timeRange.start.getTime()}-${timeRange.end.getTime()}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return new Map(Object.entries(parsed));
    }

    const query = `
      SELECT 
        fallback_reason,
        COUNT(*) as count
      FROM consensus_metadata cm
      INNER JOIN requests r ON cm.request_id = r.id
      WHERE r.created_at >= $1 AND r.created_at <= $2
        AND fallback_used = true
      GROUP BY fallback_reason
    `;

    const result = await this.db.query(query, [timeRange.start, timeRange.end]);

    const totalQuery = `
      SELECT COUNT(*) as total
      FROM consensus_metadata cm
      INNER JOIN requests r ON cm.request_id = r.id
      WHERE r.created_at >= $1 AND r.created_at <= $2
    `;

    const totalResult = await this.db.query(totalQuery, [timeRange.start, timeRange.end]);
    const total = totalResult.rows[0]?.total || 0;

    const rates = new Map<string, number>();
    for (const row of result.rows) {
      const reason = row.fallback_reason || 'unknown';
      rates.set(reason, total > 0 ? row.count / total : 0);
    }

    await this.redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(Object.fromEntries(rates)));
    return rates;
  }

  /**
   * Calculate deadlock rate
   */
  async calculateDeadlockRate(timeRange: TimeRange): Promise<number> {
    const cacheKey = `analytics:deadlock-rate:${timeRange.start.getTime()}-${timeRange.end.getTime()}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return parseFloat(cached);
    }

    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE deadlock_detected = true) as deadlocked,
        COUNT(*) as total
      FROM consensus_metadata cm
      INNER JOIN requests r ON cm.request_id = r.id
      WHERE r.created_at >= $1 AND r.created_at <= $2
    `;

    const result = await this.db.query(query, [timeRange.start, timeRange.end]);

    if (!result.rows || result.rows.length === 0 || result.rows[0].total === 0) {
      return 0;
    }

    const deadlockRate = result.rows[0].deadlocked / result.rows[0].total;
    await this.redis.setEx(cacheKey, this.CACHE_TTL, deadlockRate.toString());
    return deadlockRate;
  }

  /**
   * Calculate early termination rate
   */
  async calculateEarlyTerminationRate(timeRange: TimeRange): Promise<number> {
    const cacheKey = `analytics:early-termination-rate:${timeRange.start.getTime()}-${timeRange.end.getTime()}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return parseFloat(cached);
    }

    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE tokens_avoided IS NOT NULL AND tokens_avoided > 0) as early_terminated,
        COUNT(*) as total
      FROM consensus_metadata cm
      INNER JOIN requests r ON cm.request_id = r.id
      WHERE r.created_at >= $1 AND r.created_at <= $2
        AND consensus_achieved = true
    `;

    const result = await this.db.query(query, [timeRange.start, timeRange.end]);

    if (!result.rows || result.rows.length === 0 || result.rows[0].total === 0) {
      return 0;
    }

    const earlyTermRate = result.rows[0].early_terminated / result.rows[0].total;
    await this.redis.setEx(cacheKey, this.CACHE_TTL, earlyTermRate.toString());
    return earlyTermRate;
  }

  /**
   * Calculate total cost savings from early termination
   */
  async calculateCostSavings(timeRange: TimeRange): Promise<{ tokensAvoided: number; estimatedCostSaved: number }> {
    const cacheKey = `analytics:cost-savings:${timeRange.start.getTime()}-${timeRange.end.getTime()}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const query = `
      SELECT 
        COALESCE(SUM(tokens_avoided), 0) as tokens_avoided,
        COALESCE(SUM(estimated_cost_saved), 0) as estimated_cost_saved
      FROM consensus_metadata cm
      INNER JOIN requests r ON cm.request_id = r.id
      WHERE r.created_at >= $1 AND r.created_at <= $2
        AND tokens_avoided IS NOT NULL
    `;

    const result = await this.db.query(query, [timeRange.start, timeRange.end]);

    const savings = {
      tokensAvoided: parseInt(result.rows[0]?.tokens_avoided || '0', 10),
      estimatedCostSaved: parseFloat(result.rows[0]?.estimated_cost_saved || '0')
    };

    await this.redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(savings));
    return savings;
  }

  /**
   * Compare iterative consensus vs fallback strategies
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
    const cacheKey = `analytics:benchmark:${timeRange.start.getTime()}-${timeRange.end.getTime()}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get iterative consensus metrics
    const iterativeQuery = `
      SELECT 
        AVG(cm.total_rounds) as avg_rounds,
        AVG(CASE WHEN cm.consensus_achieved THEN 1.0 ELSE 0.0 END) as success_rate,
        AVG(r.total_cost) as avg_cost,
        AVG(r.total_latency_ms) as avg_latency,
        AVG(cm.final_similarity) as avg_quality
      FROM consensus_metadata cm
      INNER JOIN requests r ON cm.request_id = r.id
      WHERE r.created_at >= $1 AND r.created_at <= $2
        AND r.synthesis_strategy->>'type' = 'iterative-consensus'
    `;

    const iterativeResult = await this.db.query(iterativeQuery, [timeRange.start, timeRange.end]);
    const iterativeRow = iterativeResult.rows[0] || {};

    // Get fallback strategy metrics
    const fallbackQuery = `
      SELECT 
        r.synthesis_strategy->>'type' as strategy_type,
        AVG(r.total_cost) as avg_cost,
        AVG(r.total_latency_ms) as avg_latency,
        AVG(r.agreement_level) as avg_quality
      FROM requests r
      WHERE r.created_at >= $1 AND r.created_at <= $2
        AND r.synthesis_strategy->>'type' IN ('meta-synthesis', 'consensus-extraction', 'weighted-fusion')
      GROUP BY r.synthesis_strategy->>'type'
    `;

    const fallbackResult = await this.db.query(fallbackQuery, [timeRange.start, timeRange.end]);

    const fallbackStrategies: any = {
      metaSynthesis: { avgCost: 0, avgLatency: 0, avgQuality: 0 },
      consensusExtraction: { avgCost: 0, avgLatency: 0, avgQuality: 0 },
      weightedFusion: { avgCost: 0, avgLatency: 0, avgQuality: 0 }
    };

    for (const row of fallbackResult.rows) {
      const strategyType = row.strategy_type;
      if (strategyType === 'meta-synthesis') {
        fallbackStrategies.metaSynthesis = {
          avgCost: parseFloat(row.avg_cost || '0'),
          avgLatency: parseFloat(row.avg_latency || '0'),
          avgQuality: parseFloat(row.avg_quality || '0')
        };
      } else if (strategyType === 'consensus-extraction') {
        fallbackStrategies.consensusExtraction = {
          avgCost: parseFloat(row.avg_cost || '0'),
          avgLatency: parseFloat(row.avg_latency || '0'),
          avgQuality: parseFloat(row.avg_quality || '0')
        };
      } else if (strategyType === 'weighted-fusion') {
        fallbackStrategies.weightedFusion = {
          avgCost: parseFloat(row.avg_cost || '0'),
          avgLatency: parseFloat(row.avg_latency || '0'),
          avgQuality: parseFloat(row.avg_quality || '0')
        };
      }
    }

    const comparison = {
      iterativeConsensus: {
        avgRounds: parseFloat(iterativeRow.avg_rounds || '0'),
        successRate: parseFloat(iterativeRow.success_rate || '0'),
        avgCost: parseFloat(iterativeRow.avg_cost || '0'),
        avgLatency: parseFloat(iterativeRow.avg_latency || '0'),
        avgQuality: parseFloat(iterativeRow.avg_quality || '0')
      },
      fallbackStrategies
    };

    await this.redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(comparison));
    return comparison;
  }
}
