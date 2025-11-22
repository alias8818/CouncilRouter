import {
  UserRequest,
  CouncilMember,
  InitialResponse,
  DeliberationThread,
  ConsensusDecision,
  ProviderResponse
} from '../types/core';

/**
 * Orchestration Engine Interface
 * Coordinates the entire request lifecycle
 */
export interface IOrchestrationEngine {
  /**
   * Process a user request through the entire council deliberation cycle
   */
  processRequest(request: UserRequest): Promise<ConsensusDecision>;
  
  /**
   * Distribute a request to all configured council members in parallel
   */
  distributeToCouncil(
    request: UserRequest,
    councilMembers: CouncilMember[]
  ): Promise<InitialResponse[]>;
  
  /**
   * Conduct deliberation rounds where council members review each other's responses
   */
  conductDeliberation(
    initialResponses: InitialResponse[],
    rounds: number
  ): Promise<DeliberationThread>;
  
  /**
   * Handle timeout by synthesizing partial responses
   * Note: This is an internal method, partialResponses should contain TrackedResponse[]
   * with member IDs for proper attribution
   */
  handleTimeout(
    partialResponses: ProviderResponse[] | any[]
  ): Promise<ConsensusDecision>;
}
