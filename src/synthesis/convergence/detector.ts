/**
 * Convergence Detector
 * Monitors negotiation progress and detects deadlock patterns
 */

import { IConvergenceDetector } from '../../interfaces/IConvergenceDetector';
import { ConvergenceTrend } from '../../types/core';

export class ConvergenceDetector implements IConvergenceDetector {
  private readonly DEFAULT_WINDOW_SIZE = 3;
  private readonly DEADLOCK_THRESHOLD = 0.01; // Similarity change threshold for deadlock

  /**
   * Analyze convergence trend
   */
  analyzeTrend(similarityHistory: number[]): ConvergenceTrend {
    if (similarityHistory.length < 2) {
      return {
        direction: 'stagnant',
        velocity: 0,
        predictedRounds: 0,
        deadlockRisk: 'low',
        recommendation: 'Insufficient data to analyze trend'
      };
    }

    const velocity = this.calculateVelocity(similarityHistory);
    const direction = this.determineDirection(similarityHistory, velocity);
    const deadlockRisk = this.assessDeadlockRisk(similarityHistory);
    const currentSimilarity = similarityHistory[similarityHistory.length - 1];
    const threshold = 0.8; // Default threshold
    const predictedRounds = this.predictRoundsToConsensus(
      currentSimilarity,
      velocity,
      threshold
    );
    const recommendation = this.generateRecommendation(
      direction,
      deadlockRisk,
      velocity
    );

    return {
      direction,
      velocity,
      predictedRounds,
      deadlockRisk,
      recommendation
    };
  }

  /**
   * Detect deadlock pattern
   */
  isDeadlocked(
    similarityHistory: number[],
    windowSize: number = this.DEFAULT_WINDOW_SIZE
  ): boolean {
    // Filter out NaN and invalid values first
    const validHistory = similarityHistory.filter(
      (v) => !isNaN(v) && isFinite(v)
    );

    if (validHistory.length < windowSize) {
      return false;
    }

    const recent = validHistory.slice(-windowSize);

    // Check if similarity is flat or decreasing
    let isFlat = true;
    let isDecreasing = true;

    for (let i = 1; i < recent.length; i++) {
      const change = recent[i] - recent[i - 1];

      // If increasing significantly, not deadlocked
      if (change > this.DEADLOCK_THRESHOLD) {
        return false;
      }

      if (Math.abs(change) > this.DEADLOCK_THRESHOLD) {
        isFlat = false;
      }

      if (change >= 0) {
        isDecreasing = false;
      }
    }

    return isFlat || isDecreasing;
  }

  /**
   * Calculate convergence velocity
   */
  calculateVelocity(similarityHistory: number[]): number {
    if (similarityHistory.length < 2) {
      return 0;
    }

    // Filter out NaN values
    const validHistory = similarityHistory.filter((v) => !isNaN(v));

    if (validHistory.length < 2) {
      return 0;
    }

    // Calculate average change per round
    let totalChange = 0;
    for (let i = 1; i < validHistory.length; i++) {
      totalChange += validHistory[i] - validHistory[i - 1];
    }

    return totalChange / (validHistory.length - 1);
  }

  /**
   * Predict rounds to consensus
   */
  predictRoundsToConsensus(
    currentSimilarity: number,
    velocity: number,
    threshold: number
  ): number {
    if (currentSimilarity >= threshold) {
      return 0;
    }

    if (velocity <= 0) {
      // No progress or diverging - cannot predict
      return Infinity;
    }

    const remaining = threshold - currentSimilarity;
    const rounds = Math.ceil(remaining / velocity);

    return Math.max(0, rounds);
  }

  /**
   * Determine trend direction
   */
  private determineDirection(
    similarityHistory: number[],
    velocity: number
  ): 'converging' | 'diverging' | 'stagnant' {
    // Check overall trend from start to end
    if (similarityHistory.length >= 2) {
      const start = similarityHistory[0];
      const end = similarityHistory[similarityHistory.length - 1];
      const totalChange = end - start;

      // If overall change is significant, use that for direction
      if (totalChange > this.DEADLOCK_THRESHOLD) {
        return 'converging';
      } else if (totalChange < -this.DEADLOCK_THRESHOLD) {
        return 'diverging';
      }
    }

    // Otherwise use velocity
    if (Math.abs(velocity) < this.DEADLOCK_THRESHOLD) {
      return 'stagnant';
    }

    return velocity > 0 ? 'converging' : 'diverging';
  }

  /**
   * Assess deadlock risk level
   */
  private assessDeadlockRisk(
    similarityHistory: number[]
  ): 'low' | 'medium' | 'high' {
    if (similarityHistory.length < this.DEFAULT_WINDOW_SIZE) {
      return 'low';
    }

    const isDeadlock = this.isDeadlocked(similarityHistory);
    const velocity = this.calculateVelocity(similarityHistory);
    const currentSimilarity = similarityHistory[similarityHistory.length - 1];

    if (isDeadlock && currentSimilarity < 0.7) {
      return 'high';
    }

    if (isDeadlock || velocity < 0) {
      return 'medium';
    }

    if (velocity < 0.01) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Generate recommendation based on trend
   */
  private generateRecommendation(
    direction: 'converging' | 'diverging' | 'stagnant',
    deadlockRisk: 'low' | 'medium' | 'high',
    velocity: number
  ): string {
    if (deadlockRisk === 'high') {
      return 'High deadlock risk detected. Consider modifying prompts to emphasize common ground or invoking human escalation.';
    }

    if (deadlockRisk === 'medium') {
      return 'Moderate deadlock risk. Consider adjusting negotiation prompts to focus on areas of agreement.';
    }

    if (direction === 'diverging') {
      return 'Responses are diverging. Consider more structured prompts or reducing number of negotiation rounds.';
    }

    if (direction === 'stagnant') {
      return 'Progress has stalled. Consider providing more specific guidance or examples in prompts.';
    }

    if (velocity > 0.05) {
      return 'Good convergence progress. Continue current approach.';
    }

    return 'Steady progress toward consensus.';
  }
}
