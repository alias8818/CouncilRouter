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
 * Critique interface for Devil's Advocate module
 */
export interface Critique {
  weaknesses: string[];
  suggestions: string[];
  severity: 'minor' | 'moderate' | 'critical';
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
   * Generate critique using LLM
   * @param query - Original user query
   * @param synthesis - Synthesized response to critique
   * @param responses - Original council member responses
   */
  critique(
    query: string,
    synthesis: string,
    responses: Array<{ councilMemberId: string; content: string }>
  ): Promise<Critique>;

  /**
   * Rewrite synthesis based on critique
   * @param query - Original user query
   * @param originalSynthesis - Original synthesized response
   * @param critique - Critique containing weaknesses and suggestions
   */
  rewrite(
    query: string,
    originalSynthesis: string,
    critique: Critique
  ): Promise<string>;

  /**
   * Synthesize with critique incorporation
   * @param query - Original user query
   * @param synthesis - Synthesized response
   * @param responses - Original council member responses
   * @param requestId - Optional request ID for logging
   */
  synthesizeWithCritique(
    query: string,
    synthesis: string,
    responses: Array<{ councilMemberId: string; content: string }>,
    requestId?: string
  ): Promise<string>;

  /**
   * Adjust confidence based on critique strength
   */
  adjustConfidence(
    baseConfidence: number,
    critiqueStrength: number
  ): number;
}
