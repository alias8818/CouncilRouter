import {
  CouncilMember,
  DeliberationThread,
  ConsensusDecision
} from '../types/core';

export type DevilsAdvocateStrategy =
  | { type: 'designated'; memberId: string }
  | { type: 'strongest' }
  | { type: 'rotate' };

export interface DevilsAdvocateCritique {
  councilMemberId: string;
  weaknesses: string[];
  alternatives: string[];
  potentialErrors: string[];
  overallStrength: number; // 0-1
}

/**
 * Devil's Advocate Module Interface
 * Implements critique-based synthesis for robust reasoning
 */
export interface IDevilsAdvocateModule {
  /**
   * Select devil's advocate from available members
   */
  selectDevilsAdvocate(
    members: CouncilMember[],
    strategy: DevilsAdvocateStrategy
  ): CouncilMember;

  /**
   * Generate critique prompt for devil's advocate
   */
  generateCritiquePrompt(
    deliberationThread: DeliberationThread
  ): string;

  /**
   * Synthesize with critique incorporation
   */
  synthesizeWithCritique(
    thread: DeliberationThread,
    critique: string,
    synthesizer: CouncilMember
  ): Promise<ConsensusDecision>;

  /**
   * Adjust confidence based on critique strength
   */
  adjustConfidence(
    baseConfidence: number,
    critiqueStrength: number
  ): number;
}
