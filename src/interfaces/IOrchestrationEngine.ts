import {
  UserRequest,
  CouncilMember,
  InitialResponse,
  DeliberationThread,
  ConsensusDecision,
  ProviderResponse,
  ProcessRequestResult,
  RequestMetrics
} from '../types/core';

/**
 * Orchestration Engine Interface
 * Coordinates the entire request lifecycle
 */
export interface IOrchestrationEngine {
  /**
   * Process a user request through the entire council deliberation cycle
   */
  processRequest(request: UserRequest): Promise<ProcessRequestResult>;

  /**
   * Distribute a request to all configured council members in parallel
   */
  distributeToCouncil(
    request: UserRequest,
    councilMembers: CouncilMember[],
    metrics: RequestMetrics,
  ): Promise<InitialResponse[]>;

  /**
   * Conduct deliberation rounds where council members review each other's responses
   * @param councilMembers Optional council members for per-request preset support
   */
  conductDeliberation(
    initialResponses: InitialResponse[],
    rounds: number,
    metrics: RequestMetrics,
    councilMembers?: CouncilMember[],
  ): Promise<DeliberationThread>;

  /**
   * Handle timeout by synthesizing partial responses
   * Note: This is an internal method, partialResponses should contain TrackedResponse[]
   * with member IDs for proper attribution
   */
  handleTimeout(
    request: UserRequest,
    partialResponses: ProviderResponse[] | any[],
  ): Promise<ConsensusDecision>;
}
