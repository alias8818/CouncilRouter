/**
 * Convergence Detector Interface
 * Monitors negotiation progress and detects deadlock patterns
 */

import { ConvergenceTrend } from '../types/core';

export interface IConvergenceDetector {
  /**
   * Analyze convergence trend
   * @param similarityHistory - Average similarity scores per round
   * @returns Convergence analysis
   */
  analyzeTrend(similarityHistory: number[]): ConvergenceTrend;

  /**
   * Detect deadlock pattern
   * @param similarityHistory - Recent similarity scores
   * @param windowSize - Number of rounds to analyze (default: 3)
   * @returns True if deadlock detected
   */
  isDeadlocked(similarityHistory: number[], windowSize?: number): boolean;

  /**
   * Calculate convergence velocity
   * @param similarityHistory - Similarity scores over time
   * @returns Rate of convergence
   */
  calculateVelocity(similarityHistory: number[]): number;

  /**
   * Predict rounds to consensus
   * @param currentSimilarity - Current average similarity
   * @param velocity - Convergence velocity
   * @param threshold - Target threshold
   * @returns Estimated rounds remaining
   */
  predictRoundsToConsensus(
    currentSimilarity: number,
    velocity: number,
    threshold: number
  ): number;
}

