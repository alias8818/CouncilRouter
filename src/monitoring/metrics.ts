/**
 * Prometheus Metrics for Iterative Consensus
 * Exposes metrics for monitoring consensus negotiation performance
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a registry for iterative consensus metrics
export const consensusMetricsRegistry = new Registry();

// Consensus success rate gauge
export const consensusSuccessRate = new Gauge({
  name: 'iterative_consensus_success_rate',
  help: 'Consensus success rate (0.0-1.0)',
  labelNames: ['time_window'],
  registers: [consensusMetricsRegistry]
});

// Average rounds to consensus histogram
export const averageRoundsToConsensus = new Histogram({
  name: 'iterative_consensus_rounds_to_consensus',
  help: 'Number of rounds needed to reach consensus',
  labelNames: ['consensus_achieved'],
  buckets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  registers: [consensusMetricsRegistry]
});

// Fallback rate by reason counter
export const fallbackRateByReason = new Counter({
  name: 'iterative_consensus_fallback_total',
  help: 'Total number of fallback invocations by reason',
  labelNames: ['reason', 'fallback_strategy'],
  registers: [consensusMetricsRegistry]
});

// Deadlock rate gauge
export const deadlockRate = new Gauge({
  name: 'iterative_consensus_deadlock_rate',
  help: 'Deadlock rate (0.0-1.0)',
  registers: [consensusMetricsRegistry]
});

// Early termination rate gauge
export const earlyTerminationRate = new Gauge({
  name: 'iterative_consensus_early_termination_rate',
  help: 'Early termination rate (0.0-1.0)',
  registers: [consensusMetricsRegistry]
});

// Cost savings counter
export const costSavingsTotal = new Counter({
  name: 'iterative_consensus_cost_savings_total',
  help: 'Total cost savings from early termination',
  labelNames: ['currency'],
  registers: [consensusMetricsRegistry]
});

// Tokens avoided counter
export const tokensAvoidedTotal = new Counter({
  name: 'iterative_consensus_tokens_avoided_total',
  help: 'Total tokens avoided from early termination',
  registers: [consensusMetricsRegistry]
});

// Negotiation round duration histogram
export const negotiationRoundDuration = new Histogram({
  name: 'iterative_consensus_round_duration_seconds',
  help: 'Duration of each negotiation round in seconds',
  labelNames: ['round_number', 'negotiation_mode'],
  buckets: [0.5, 1, 2, 5, 10, 15, 30, 60],
  registers: [consensusMetricsRegistry]
});

// Similarity progression histogram
export const similarityProgression = new Histogram({
  name: 'iterative_consensus_similarity_score',
  help: 'Similarity scores during negotiation',
  labelNames: ['round_number'],
  buckets: [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.98, 1.0],
  registers: [consensusMetricsRegistry]
});

// Embedding service failures counter
export const embeddingServiceFailures = new Counter({
  name: 'iterative_consensus_embedding_failures_total',
  help: 'Total embedding service failures',
  labelNames: ['fallback_used'],
  registers: [consensusMetricsRegistry]
});

// Escalation queue size gauge
export const escalationQueueSize = new Gauge({
  name: 'iterative_consensus_escalation_queue_size',
  help: 'Current number of pending escalations',
  registers: [consensusMetricsRegistry]
});

// Consensus decision confidence histogram
export const consensusDecisionConfidence = new Histogram({
  name: 'iterative_consensus_decision_confidence',
  help: 'Confidence level of consensus decisions',
  labelNames: ['consensus_achieved'],
  buckets: [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0],
  registers: [consensusMetricsRegistry]
});

/**
 * Update metrics from consensus metadata
 */
export function updateConsensusMetrics(data: {
  consensusAchieved: boolean;
  totalRounds: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  fallbackStrategy?: string;
  deadlockDetected: boolean;
  earlyTerminated: boolean;
  tokensAvoided?: number;
  estimatedCostSaved?: number;
  finalSimilarity: number;
  confidence: number;
}): void {
  // Update rounds histogram
  averageRoundsToConsensus.observe(
    { consensus_achieved: data.consensusAchieved ? 'true' : 'false' },
    data.totalRounds
  );

  // Update fallback counter
  if (data.fallbackUsed) {
    fallbackRateByReason.inc({
      reason: data.fallbackReason || 'unknown',
      fallback_strategy: data.fallbackStrategy || 'unknown'
    });
  }

  // Update similarity histogram
  similarityProgression.observe(
    { round_number: data.totalRounds.toString() },
    data.finalSimilarity
  );

  // Update confidence histogram
  consensusDecisionConfidence.observe(
    { consensus_achieved: data.consensusAchieved ? 'true' : 'false' },
    data.confidence
  );

  // Update cost savings
  if (data.tokensAvoided && data.tokensAvoided > 0) {
    tokensAvoidedTotal.inc(data.tokensAvoided);
  }

  if (data.estimatedCostSaved && data.estimatedCostSaved > 0) {
    costSavingsTotal.inc({ currency: 'usd' }, data.estimatedCostSaved);
  }
}

/**
 * Update round duration metric
 */
export function updateRoundDuration(
  roundNumber: number,
  durationSeconds: number,
  negotiationMode: 'parallel' | 'sequential'
): void {
  negotiationRoundDuration.observe(
    {
      round_number: roundNumber.toString(),
      negotiation_mode: negotiationMode
    },
    durationSeconds
  );
}

/**
 * Update embedding failure metric
 */
export function updateEmbeddingFailure(fallbackUsed: boolean): void {
  embeddingServiceFailures.inc({ fallback_used: fallbackUsed ? 'true' : 'false' });
}

/**
 * Update escalation queue size
 */
export function updateEscalationQueueSize(size: number): void {
  escalationQueueSize.set(size);
}

/**
 * Update aggregated rates (called periodically from analytics)
 */
export function updateAggregatedRates(data: {
  successRate: number;
  deadlockRate: number;
  earlyTerminationRate: number;
}): void {
  consensusSuccessRate.set({ time_window: '1h' }, data.successRate);
  deadlockRate.set(data.deadlockRate);
  earlyTerminationRate.set(data.earlyTerminationRate);
}

