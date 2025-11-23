/**
 * Devil's Advocate Module
 * Implements critique-based synthesis for robust reasoning
 */

import { Pool } from 'pg';
import {
  IDevilsAdvocateModule,
  DevilsAdvocateStrategy,
  DevilsAdvocateCritique
} from '../interfaces/IDevilsAdvocateModule';
import {
  CouncilMember,
  DeliberationThread,
  ConsensusDecision
} from '../types/core';

export class DevilsAdvocateModule implements IDevilsAdvocateModule {
  private dbPool: Pool;

  constructor(dbPool: Pool) {
    this.dbPool = dbPool;
  }

  /**
   * Select devil's advocate from available members
   */
  selectDevilsAdvocate(
    members: CouncilMember[],
    strategy: DevilsAdvocateStrategy
  ): CouncilMember {
    if (strategy.type === 'designated') {
      const member = members.find(m => m.id === strategy.memberId);
      if (!member) {
        throw new Error(`Designated member ${strategy.memberId} not found`);
      }
      return member;
    }

    if (strategy.type === 'strongest') {
      // Select member with highest weight (or first if no weights)
      const sorted = [...members].sort((a, b) => {
        const weightA = a.weight || 1;
        const weightB = b.weight || 1;
        return weightB - weightA;
      });
      return sorted[0];
    }

    if (strategy.type === 'rotate') {
      // Simple rotation based on current time
      const index = Date.now() % members.length;
      return members[index];
    }

    throw new Error(`Unknown devil's advocate strategy: ${(strategy as any).type}`);
  }

  /**
   * Generate critique prompt for devil's advocate
   */
  generateCritiquePrompt(deliberationThread: DeliberationThread): string {
    const rounds = deliberationThread.rounds;
    const lastRound = rounds[rounds.length - 1];

    return `You are serving as the devil's advocate. Your role is to critically analyze the consensus that has emerged from the deliberation.

Review the following exchanges and identify:
1. **Weaknesses**: What are the logical flaws, unsupported assumptions, or gaps in reasoning?
2. **Alternative Interpretations**: What other ways could the information be understood?
3. **Potential Errors**: What might be wrong or misleading about the current consensus?

Deliberation exchanges:
${this.formatExchanges(lastRound.exchanges)}

Provide a thorough critique that challenges the consensus and identifies areas of concern.`;
  }

  /**
   * Synthesize with critique incorporation
   */
  async synthesizeWithCritique(
    thread: DeliberationThread,
    critique: string,
    synthesizer: CouncilMember
  ): Promise<ConsensusDecision> {
    // In a real implementation, this would call the synthesizer with the critique
    // For now, return a placeholder that includes the critique
    const decision: ConsensusDecision = {
      content: `Final synthesis incorporating devil's advocate critique: ${critique}`,
      confidence: 'medium',
      agreementLevel: 0.7,
      synthesisStrategy: { type: 'consensus-extraction' },
      contributingMembers: [synthesizer.id],
      timestamp: new Date()
    };

    return decision;
  }

  /**
   * Adjust confidence based on critique strength
   */
  adjustConfidence(
    baseConfidence: number,
    critiqueStrength: number
  ): number {
    // Strong critique reduces confidence
    // Weak critique maintains or slightly increases confidence
    const adjustment = critiqueStrength * 0.3; // Max 30% reduction
    return Math.max(0, Math.min(1, baseConfidence - adjustment));
  }

  /**
   * Format exchanges for prompt
   */
  private formatExchanges(exchanges: any[]): string {
    return exchanges
      .map((ex, idx) => {
        return `Exchange ${idx + 1} (${ex.councilMemberId}):\n${ex.content}\n`;
      })
      .join('\n');
  }
}
