/**
 * Devil's Advocate Module
 * Implements critique-based synthesis for robust reasoning
 */

import { Pool } from 'pg';
import {
  IDevilsAdvocateModule,
  DevilsAdvocateStrategy,
  Critique
} from '../interfaces/IDevilsAdvocateModule';
import {
  CouncilMember,
  DeliberationThread,
  ConsensusDecision
} from '../types/core';
import { IProviderPool } from '../interfaces/IProviderPool';
import { IEventLogger } from '../interfaces/IEventLogger';

export class DevilsAdvocateModule implements IDevilsAdvocateModule {
  private dbPool: Pool;
  private providerPool: IProviderPool;
  private logger?: IEventLogger;

  constructor(dbPool: Pool, providerPool: IProviderPool, logger?: IEventLogger) {
    this.dbPool = dbPool;
    this.providerPool = providerPool;
    this.logger = logger;
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
   * Generate critique using LLM
   */
  async critique(
    query: string,
    synthesis: string,
    responses: Array<{ councilMemberId: string; content: string }>
  ): Promise<Critique> {
    const startTime = Date.now();

    try {
      // Select a council member to act as critic (use strongest available)
      // For now, we'll need to get council members from config - simplified for now
      // In production, this would come from ConfigurationManager
      const criticMember: CouncilMember = {
        id: 'critic-member',
        provider: 'openai',
        model: 'gpt-4',
        timeout: 30,
        retryPolicy: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: []
        }
      };

      // Build critique prompt
      const critiquePrompt = this.buildCritiquePrompt(query, synthesis, responses);

      // Call provider to generate critique
      const response = await this.providerPool.sendRequest(criticMember, critiquePrompt);

      if (!response.success || !response.content) {
        console.warn('Devil\'s Advocate critique generation failed:', response.error);
        return {
          weaknesses: [],
          suggestions: [],
          severity: 'minor'
        };
      }

      // Parse LLM response into Critique object
      const critique = this.parseCritiqueResponse(response.content);

      const duration = Date.now() - startTime;

      // Log critique generation
      console.log(`[Devil's Advocate] Critique generated in ${duration}ms`, {
        weaknesses: critique.weaknesses.length,
        suggestions: critique.suggestions.length,
        severity: critique.severity
      });

      return critique;
    } catch (error) {
      console.error('Devil\'s Advocate critique generation error:', error);
      // Return empty critique on error
      return {
        weaknesses: [],
        suggestions: [],
        severity: 'minor'
      };
    }
  }

  /**
   * Rewrite synthesis based on critique
   */
  async rewrite(
    query: string,
    originalSynthesis: string,
    critique: Critique
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // Select a council member to perform rewrite
      const rewriteMember: CouncilMember = {
        id: 'rewrite-member',
        provider: 'openai',
        model: 'gpt-4',
        timeout: 30,
        retryPolicy: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: []
        }
      };

      // Build rewrite prompt
      const rewritePrompt = this.buildRewritePrompt(query, originalSynthesis, critique);

      // Call provider to generate rewrite
      const response = await this.providerPool.sendRequest(rewriteMember, rewritePrompt);

      if (!response.success || !response.content) {
        console.warn('Devil\'s Advocate rewrite failed:', response.error);
        return originalSynthesis; // Return original on failure
      }

      const duration = Date.now() - startTime;
      const improved = response.content;

      // Log rewrite
      console.log(`[Devil's Advocate] Rewrite completed in ${duration}ms`, {
        originalLength: originalSynthesis.length,
        improvedLength: improved.length,
        changed: improved !== originalSynthesis
      });

      return improved;
    } catch (error) {
      console.error('Devil\'s Advocate rewrite error:', error);
      return originalSynthesis; // Return original on error
    }
  }

  /**
   * Synthesize with critique incorporation
   */
  async synthesizeWithCritique(
    query: string,
    synthesis: string,
    responses: Array<{ councilMemberId: string; content: string }>,
    requestId?: string
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // Generate critique
      const critique = await this.critique(query, synthesis, responses);

      // If minor/no issues, return original synthesis
      if (critique.severity === 'minor' && critique.weaknesses.length === 0) {
        console.log('[Devil\'s Advocate] No significant issues found, returning original synthesis');

        // Log even when no improvement is made
        if (this.logger && requestId) {
          const duration = Date.now() - startTime;
          await this.logger.logDevilsAdvocate(
            requestId,
            critique,
            synthesis.length,
            synthesis.length,
            duration,
            false
          );
        }

        return synthesis;
      }

      // Rewrite based on critique
      const improved = await this.rewrite(query, synthesis, critique);

      const totalDuration = Date.now() - startTime;
      const improvedFlag = improved !== synthesis;

      // Log improvement indicator
      console.log(`[Devil's Advocate] Process completed in ${totalDuration}ms`, {
        critiqueSeverity: critique.severity,
        weaknessesFound: critique.weaknesses.length,
        improved: improvedFlag,
        originalLength: synthesis.length,
        improvedLength: improved.length
      });

      // Log to database if logger is available
      if (this.logger && requestId) {
        await this.logger.logDevilsAdvocate(
          requestId,
          critique,
          synthesis.length,
          improved.length,
          totalDuration,
          improvedFlag
        );
      }

      return improved;
    } catch (error) {
      console.error('Devil\'s Advocate synthesizeWithCritique error:', error);
      return synthesis; // Return original on error
    }
  }

  /**
   * Build critique prompt
   */
  private buildCritiquePrompt(
    query: string,
    synthesis: string,
    responses: Array<{ councilMemberId: string; content: string }>
  ): string {
    return `You are serving as the devil's advocate. Your role is to critically analyze a synthesized response.

ORIGINAL USER QUERY:
${query}

SYNTHESIZED RESPONSE:
${synthesis}

ORIGINAL COUNCIL MEMBER RESPONSES:
${responses.map((r, idx) => `Response ${idx + 1} (${r.councilMemberId}):\n${r.content}`).join('\n\n')}

Your task is to identify:
1. **Weaknesses**: Logical flaws, unsupported assumptions, gaps in reasoning, or areas where the synthesis could be improved
2. **Suggestions**: Specific recommendations for how to improve the synthesis
3. **Severity**: Rate the overall severity of issues as "minor", "moderate", or "critical"

Please respond in the following JSON format:
{
  "weaknesses": ["weakness1", "weakness2", ...],
  "suggestions": ["suggestion1", "suggestion2", ...],
  "severity": "minor" | "moderate" | "critical"
}

Be thorough but constructive. Focus on substantive issues that would improve the response quality.`;
  }

  /**
   * Build rewrite prompt
   */
  private buildRewritePrompt(
    query: string,
    originalSynthesis: string,
    critique: Critique
  ): string {
    return `You are improving a synthesized response based on critique feedback.

ORIGINAL USER QUERY:
${query}

ORIGINAL SYNTHESIS:
${originalSynthesis}

CRITIQUE:
Weaknesses identified:
${critique.weaknesses.map((w, idx) => `${idx + 1}. ${w}`).join('\n')}

Suggestions for improvement:
${critique.suggestions.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}

Severity: ${critique.severity}

Your task is to rewrite the synthesis to address the identified weaknesses and incorporate the suggestions, while preserving the strengths of the original response. Ensure the improved response:
1. Directly addresses the original user query
2. Incorporates the critique feedback
3. Maintains coherence and completeness
4. Preserves any correct information from the original

Provide the improved synthesis:`;
  }

  /**
   * Parse LLM response into Critique object
   */
  private parseCritiqueResponse(response: string): Critique {
    try {
      // Try to extract JSON from response (may have markdown code blocks)
      let jsonStr = response.trim();

      // Remove markdown code blocks if present
      const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        // Try to find JSON object in the response
        const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          jsonStr = braceMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr);

      return {
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        severity: ['minor', 'moderate', 'critical'].includes(parsed.severity)
          ? parsed.severity
          : 'minor'
      };
    } catch (error) {
      console.warn('Failed to parse critique response as JSON, using fallback:', error);

      // Fallback: extract weaknesses and suggestions from text
      const weaknesses: string[] = [];
      const suggestions: string[] = [];

      // Look for numbered lists or bullet points
      const lines = response.split('\n');
      let currentSection: 'weaknesses' | 'suggestions' | null = null;

      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('weakness')) {
          currentSection = 'weaknesses';
        } else if (lowerLine.includes('suggestion') || lowerLine.includes('recommendation')) {
          currentSection = 'suggestions';
        } else if (currentSection && (line.match(/^\d+\./) || line.match(/^[-*]/))) {
          const content = line.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '').trim();
          if (content) {
            if (currentSection === 'weaknesses') {
              weaknesses.push(content);
            } else {
              suggestions.push(content);
            }
          }
        }
      }

      // Determine severity based on weaknesses count
      let severity: 'minor' | 'moderate' | 'critical' = 'minor';
      if (weaknesses.length >= 5) {
        severity = 'critical';
      } else if (weaknesses.length >= 2) {
        severity = 'moderate';
      }

      return { weaknesses, suggestions, severity };
    }
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
