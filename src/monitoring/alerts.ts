/**
 * Prometheus Alert Configuration for Iterative Consensus
 * Defines alert rules for monitoring consensus negotiation health
 */

/**
 * Alert rule definitions for Prometheus AlertManager
 * These should be added to your Prometheus configuration
 */
export const consensusAlertRules = `
groups:
  - name: iterative_consensus
    interval: 30s
    rules:
      # Consensus success rate alert
      - alert: ConsensusSuccessRateLow
        expr: iterative_consensus_success_rate{time_window="1h"} < 0.70
        for: 5m
        labels:
          severity: warning
          component: iterative_consensus
        annotations:
          summary: "Consensus success rate is below 70%"
          description: "Consensus success rate is {{ $value | humanizePercentage }} (threshold: 70%)"

      # Average rounds alert
      - alert: AverageRoundsTooHigh
        expr: |
          histogram_quantile(0.95, 
            rate(iterative_consensus_rounds_to_consensus_bucket[5m])
          ) > 5
        for: 5m
        labels:
          severity: warning
          component: iterative_consensus
        annotations:
          summary: "Average rounds to consensus exceeds 5"
          description: "P95 rounds to consensus is {{ $value }} (threshold: 5)"

      # Embedding service failures alert
      - alert: EmbeddingServiceFailuresHigh
        expr: |
          rate(iterative_consensus_embedding_failures_total[5m]) > 0.10
        for: 5m
        labels:
          severity: critical
          component: embedding_service
        annotations:
          summary: "Embedding service failure rate exceeds 10%"
          description: "Failure rate is {{ $value | humanizePercentage }} (threshold: 10%)"

      # Deadlock rate alert
      - alert: DeadlockRateHigh
        expr: iterative_consensus_deadlock_rate > 0.20
        for: 5m
        labels:
          severity: warning
          component: iterative_consensus
        annotations:
          summary: "Deadlock rate exceeds 20%"
          description: "Deadlock rate is {{ $value | humanizePercentage }} (threshold: 20%)"

      # Escalation queue backlog alert
      - alert: EscalationQueueBacklog
        expr: iterative_consensus_escalation_queue_size > 10
        for: 5m
        labels:
          severity: warning
          component: escalation_service
        annotations:
          summary: "Escalation queue has more than 10 pending items"
          description: "Queue size is {{ $value }} (threshold: 10)"

      # Consensus decision confidence low alert
      - alert: ConsensusConfidenceLow
        expr: |
          histogram_quantile(0.50,
            rate(iterative_consensus_decision_confidence_bucket{consensus_achieved="true"}[5m])
          ) < 0.70
        for: 5m
        labels:
          severity: warning
          component: iterative_consensus
        annotations:
          summary: "Consensus decision confidence is low"
          description: "P50 confidence is {{ $value | humanizePercentage }} (threshold: 70%)"

      # Round duration alert
      - alert: NegotiationRoundDurationHigh
        expr: |
          histogram_quantile(0.95,
            rate(iterative_consensus_round_duration_seconds_bucket[5m])
          ) > 30
        for: 5m
        labels:
          severity: warning
          component: iterative_consensus
        annotations:
          summary: "Negotiation round duration exceeds 30 seconds"
          description: "P95 round duration is {{ $value }}s (threshold: 30s)"
`;

/**
 * Alert configuration for different environments
 */
export interface AlertConfig {
  successRateThreshold: number;
  averageRoundsThreshold: number;
  deadlockRateThreshold: number;
  escalationQueueThreshold: number;
  embeddingFailureRateThreshold: number;
  confidenceThreshold: number;
  roundDurationThreshold: number;
}

export const defaultAlertConfig: AlertConfig = {
  successRateThreshold: 0.70,
  averageRoundsThreshold: 5,
  deadlockRateThreshold: 0.20,
  escalationQueueThreshold: 10,
  embeddingFailureRateThreshold: 0.10,
  confidenceThreshold: 0.70,
  roundDurationThreshold: 30
};

export const strictAlertConfig: AlertConfig = {
  successRateThreshold: 0.85,
  averageRoundsThreshold: 3,
  deadlockRateThreshold: 0.10,
  escalationQueueThreshold: 5,
  embeddingFailureRateThreshold: 0.05,
  confidenceThreshold: 0.80,
  roundDurationThreshold: 20
};

export const relaxedAlertConfig: AlertConfig = {
  successRateThreshold: 0.60,
  averageRoundsThreshold: 7,
  deadlockRateThreshold: 0.30,
  escalationQueueThreshold: 20,
  embeddingFailureRateThreshold: 0.15,
  confidenceThreshold: 0.60,
  roundDurationThreshold: 45
};

/**
 * Generate alert rules from configuration
 */
export function generateAlertRules(config: AlertConfig): string {
  return `
groups:
  - name: iterative_consensus
    interval: 30s
    rules:
      - alert: ConsensusSuccessRateLow
        expr: iterative_consensus_success_rate{time_window="1h"} < ${config.successRateThreshold}
        for: 5m
        labels:
          severity: warning
          component: iterative_consensus
        annotations:
          summary: "Consensus success rate is below threshold"
          description: "Success rate is {{ $value | humanizePercentage }} (threshold: ${(config.successRateThreshold * 100).toFixed(0)}%)"

      - alert: AverageRoundsTooHigh
        expr: |
          histogram_quantile(0.95, 
            rate(iterative_consensus_rounds_to_consensus_bucket[5m])
          ) > ${config.averageRoundsThreshold}
        for: 5m
        labels:
          severity: warning
          component: iterative_consensus
        annotations:
          summary: "Average rounds to consensus exceeds threshold"
          description: "P95 rounds is {{ $value }} (threshold: ${config.averageRoundsThreshold})"

      - alert: DeadlockRateHigh
        expr: iterative_consensus_deadlock_rate > ${config.deadlockRateThreshold}
        for: 5m
        labels:
          severity: warning
          component: iterative_consensus
        annotations:
          summary: "Deadlock rate exceeds threshold"
          description: "Deadlock rate is {{ $value | humanizePercentage }} (threshold: ${(config.deadlockRateThreshold * 100).toFixed(0)}%)"

      - alert: EscalationQueueBacklog
        expr: iterative_consensus_escalation_queue_size > ${config.escalationQueueThreshold}
        for: 5m
        labels:
          severity: warning
          component: escalation_service
        annotations:
          summary: "Escalation queue backlog"
          description: "Queue size is {{ $value }} (threshold: ${config.escalationQueueThreshold})"

      - alert: EmbeddingServiceFailuresHigh
        expr: |
          rate(iterative_consensus_embedding_failures_total[5m]) > ${config.embeddingFailureRateThreshold}
        for: 5m
        labels:
          severity: critical
          component: embedding_service
        annotations:
          summary: "Embedding service failure rate high"
          description: "Failure rate is {{ $value | humanizePercentage }} (threshold: ${(config.embeddingFailureRateThreshold * 100).toFixed(0)}%)"
  `;
}

