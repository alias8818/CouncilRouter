import {
  DeliberationThread,
  SynthesisStrategy,
  ConsensusDecision,
  CouncilMember,
  ModeratorStrategy,
  UserRequest
} from '../types/core';

/**
 * Synthesis Engine Interface
 * Combines council member responses into consensus
 */
export interface ISynthesisEngine {
  /**
   * Synthesize a consensus decision from deliberation thread
   * @param request - Original user request containing the query
   * @param thread - Deliberation thread with council member exchanges
   * @param strategy - Synthesis strategy to apply
   */
  synthesize(
    request: UserRequest,
    thread: DeliberationThread,
    strategy: SynthesisStrategy
  ): Promise<ConsensusDecision>;

  /**
   * Select a moderator for meta-synthesis
   */
  selectModerator(
    members: CouncilMember[],
    strategy: ModeratorStrategy
  ): Promise<CouncilMember>;
}
