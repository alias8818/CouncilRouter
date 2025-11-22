import {
  DeliberationThread,
  SynthesisStrategy,
  ConsensusDecision,
  CouncilMember,
  ModeratorStrategy
} from '../types/core';

/**
 * Synthesis Engine Interface
 * Combines council member responses into consensus
 */
export interface ISynthesisEngine {
  /**
   * Synthesize a consensus decision from deliberation thread
   */
  synthesize(
    thread: DeliberationThread,
    strategy: SynthesisStrategy
  ): Promise<ConsensusDecision>;
  
  /**
   * Select a moderator for meta-synthesis
   */
  selectModerator(
    members: CouncilMember[],
    strategy: ModeratorStrategy
  ): CouncilMember;
}
