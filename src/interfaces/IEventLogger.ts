import {
  UserRequest,
  InitialResponse,
  DeliberationRound,
  ConsensusDecision,
  CostBreakdown,
  NegotiationResponse,
  SimilarityResult
} from '../types/core';

/**
 * Event Logger Interface
 * Logs all system events for monitoring and analytics
 */
export interface IEventLogger {
  /**
   * Log a user request
   */
  logRequest(request: UserRequest): Promise<void>;

  /**
   * Log a council member response
   */
  logCouncilResponse(
    requestId: string,
    response: InitialResponse
  ): Promise<void>;

  /**
   * Log a deliberation round
   */
  logDeliberationRound(
    requestId: string,
    round: DeliberationRound
  ): Promise<void>;

  /**
   * Log the final consensus decision
   */
  logConsensusDecision(
    requestId: string,
    decision: ConsensusDecision
  ): Promise<void>;

  /**
   * Log cost information
   */
  logCost(
    requestId: string,
    cost: CostBreakdown,
    tokens?: Map<string, { prompt: number; completion: number }>
  ): Promise<void>;

  /**
   * Log a provider failure
   */
  logProviderFailure(
    providerId: string,
    error: Error
  ): Promise<void>;

  /**
   * Log Devil's Advocate activity
   */
  logDevilsAdvocate(
    requestId: string,
    critique: {
      weaknesses: string[];
      suggestions: string[];
      severity: 'minor' | 'moderate' | 'critical';
    },
    originalLength: number,
    improvedLength: number,
    timeTakenMs: number,
    improved: boolean
  ): Promise<void>;

  /**
   * Log a negotiation round
   */
  logNegotiationRound(
    requestId: string,
    roundNumber: number,
    similarityResult: SimilarityResult,
    convergenceVelocity?: number,
    deadlockRisk?: 'low' | 'medium' | 'high'
  ): Promise<void>;

  /**
   * Log a negotiation response
   */
  logNegotiationResponse(
    requestId: string,
    response: NegotiationResponse,
    embeddingModel: string
  ): Promise<void>;

  /**
   * Log consensus metadata
   */
  logConsensusMetadata(
    requestId: string,
    metadata: {
      totalRounds: number;
      consensusAchieved: boolean;
      fallbackUsed: boolean;
      fallbackReason?: string;
      tokensAvoided?: number;
      estimatedCostSaved?: number;
      deadlockDetected: boolean;
      humanEscalationTriggered: boolean;
      finalSimilarity: number;
    }
  ): Promise<void>;
}
