/**
 * Iterative Consensus Synthesizer Interface
 * Orchestrates multi-round negotiations until consensus is achieved
 */

import {
  UserRequest,
  DeliberationThread,
  ConsensusDecision,
  IterativeConsensusConfig,
  NegotiationResponse,
  SimilarityResult
} from '../types/core';

export interface IIterativeConsensusSynthesizer {
  /**
   * Execute iterative consensus synthesis
   * @param request - User request with query
   * @param thread - Deliberation thread with Round 0 responses
   * @param config - Iterative consensus configuration
   * @returns Consensus decision with metadata
   */
  synthesize(
    request: UserRequest,
    thread: DeliberationThread,
    config: IterativeConsensusConfig
  ): Promise<ConsensusDecision>;

  /**
   * Execute a single negotiation round
   * @param roundNumber - Current round number
   * @param currentResponses - Council member responses from previous round
   * @param query - Original user query
   * @param config - Configuration
   * @returns New responses from negotiation round
   */
  executeNegotiationRound(
    roundNumber: number,
    currentResponses: NegotiationResponse[],
    query: string,
    config: IterativeConsensusConfig
  ): Promise<NegotiationResponse[]>;

  /**
   * Calculate pairwise similarity scores
   * @param responses - Council member responses
   * @param config - Configuration
   * @returns Similarity matrix and average score
   */
  calculateSimilarity(
    responses: NegotiationResponse[],
    config: IterativeConsensusConfig
  ): Promise<SimilarityResult>;

  /**
   * Check if consensus is achieved
   * @param similarityResult - Similarity scores
   * @param threshold - Agreement threshold
   * @returns True if all pairs meet threshold
   */
  isConsensusAchieved(
    similarityResult: SimilarityResult,
    threshold: number
  ): boolean;

  /**
   * Detect potential deadlock
   * @param history - Similarity scores from recent rounds
   * @returns True if deadlock pattern detected
   */
  detectDeadlock(history: number[]): boolean;

  /**
   * Select final response from converged answers
   * @param responses - Semantically equivalent responses
   * @returns Best articulated version
   */
  selectFinalResponse(responses: NegotiationResponse[]): string;
}

