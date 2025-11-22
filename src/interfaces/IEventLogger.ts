import {
  UserRequest,
  InitialResponse,
  DeliberationRound,
  ConsensusDecision,
  CostBreakdown
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
    cost: CostBreakdown
  ): Promise<void>;
  
  /**
   * Log a provider failure
   */
  logProviderFailure(
    providerId: string,
    error: Error
  ): Promise<void>;
}
