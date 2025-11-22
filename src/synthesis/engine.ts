/**
 * Synthesis Engine
 * Combines council member responses into consensus
 */

import { ISynthesisEngine } from '../interfaces/ISynthesisEngine';
import {
  DeliberationThread,
  SynthesisStrategy,
  ConsensusDecision,
  CouncilMember,
  ModeratorStrategy,
  Exchange
} from '../types/core';

/**
 * Model rankings for strongest moderator selection
 * Higher score = stronger model
 */
const MODEL_RANKINGS: Record<string, number> = {
  // OpenAI models
  'gpt-4': 95,
  'gpt-4-turbo': 98,
  'gpt-4o': 100,
  'gpt-3.5-turbo': 70,
  
  // Anthropic models
  'claude-3-opus': 98,
  'claude-3-sonnet': 90,
  'claude-3-haiku': 75,
  'claude-2': 85,
  
  // Google models
  'gemini-pro': 92,
  'gemini-ultra': 97,
  'palm-2': 80,
  
  // Default for unknown models
  'default': 50
};

export class SynthesisEngine implements ISynthesisEngine {
  private rotationIndex: number = 0;

  /**
   * Synthesize a consensus decision from deliberation thread
   */
  async synthesize(
    thread: DeliberationThread,
    strategy: SynthesisStrategy
  ): Promise<ConsensusDecision> {
    // Extract all exchanges from all rounds
    const allExchanges = thread.rounds.flatMap(round => round.exchanges);
    
    if (allExchanges.length === 0) {
      return {
        content: 'No responses available',
        confidence: 'low',
        agreementLevel: 0,
        synthesisStrategy: strategy,
        contributingMembers: [],
        timestamp: new Date()
      };
    }

    // Get unique contributing members
    const contributingMembers = Array.from(
      new Set(allExchanges.map(exchange => exchange.councilMemberId))
    );

    let content: string;
    let confidence: 'high' | 'medium' | 'low';
    let agreementLevel: number;

    switch (strategy.type) {
      case 'consensus-extraction':
        ({ content, confidence, agreementLevel } = this.consensusExtraction(allExchanges));
        break;
      
      case 'weighted-fusion':
        ({ content, confidence, agreementLevel } = this.weightedFusion(allExchanges, strategy.weights));
        break;
      
      case 'meta-synthesis':
        ({ content, confidence, agreementLevel } = this.metaSynthesis(allExchanges));
        break;
      
      default:
        // Fallback to consensus extraction
        ({ content, confidence, agreementLevel } = this.consensusExtraction(allExchanges));
    }

    return {
      content,
      confidence,
      agreementLevel,
      synthesisStrategy: strategy,
      contributingMembers,
      timestamp: new Date()
    };
  }

  /**
   * Consensus Extraction Strategy
   * Extracts areas of agreement and disagreement, produces final answer reflecting majority
   */
  private consensusExtraction(exchanges: Exchange[]): {
    content: string;
    confidence: 'high' | 'medium' | 'low';
    agreementLevel: number;
  } {
    // Calculate agreement level based on content similarity
    const agreementLevel = this.calculateAgreementLevel(exchanges);
    
    // Group responses by similarity
    const responseGroups = this.groupSimilarResponses(exchanges);
    
    // Find majority position (largest group)
    const majorityGroup = responseGroups.reduce((largest, current) => 
      current.length > largest.length ? current : largest
    );
    
    // Extract consensus from majority group
    const majorityContent = majorityGroup.map(e => e.content).join('\n\n');
    
    // Build synthesis with areas of agreement and disagreement
    let synthesis = '';
    
    if (responseGroups.length === 1) {
      // Full agreement
      synthesis = `All council members agree:\n\n${majorityContent}`;
    } else {
      // Partial agreement
      synthesis = `Majority position (${majorityGroup.length}/${exchanges.length} members):\n\n${majorityContent}`;
      
      // Add minority positions if they exist
      const minorityGroups = responseGroups.filter(g => g !== majorityGroup);
      if (minorityGroups.length > 0) {
        synthesis += '\n\nAlternative perspectives:\n\n';
        minorityGroups.forEach((group, idx) => {
          synthesis += `Position ${idx + 2} (${group.length} members):\n${group[0].content}\n\n`;
        });
      }
    }
    
    // Determine confidence based on agreement level
    const confidence = agreementLevel > 0.8 ? 'high' : agreementLevel > 0.5 ? 'medium' : 'low';
    
    return { content: synthesis, confidence, agreementLevel };
  }

  /**
   * Weighted Fusion Strategy
   * Weights each council member's contribution according to configured weights
   */
  private weightedFusion(exchanges: Exchange[], weights: Map<string, number>): {
    content: string;
    confidence: 'high' | 'medium' | 'low';
    agreementLevel: number;
  } {
    // Calculate agreement level
    const agreementLevel = this.calculateAgreementLevel(exchanges);
    
    // Group exchanges by council member
    const exchangesByMember = new Map<string, Exchange[]>();
    exchanges.forEach(exchange => {
      const existing = exchangesByMember.get(exchange.councilMemberId) || [];
      existing.push(exchange);
      exchangesByMember.set(exchange.councilMemberId, existing);
    });
    
    // Build weighted synthesis
    let synthesis = 'Weighted synthesis of council responses:\n\n';
    
    // Sort members by weight (highest first)
    const sortedMembers = Array.from(exchangesByMember.keys()).sort((a, b) => {
      const weightA = weights.get(a) || 1.0;
      const weightB = weights.get(b) || 1.0;
      return weightB - weightA;
    });
    
    sortedMembers.forEach(memberId => {
      const memberExchanges = exchangesByMember.get(memberId)!;
      const weight = weights.get(memberId) || 1.0;
      const memberContent = memberExchanges.map(e => e.content).join('\n');
      
      synthesis += `[Weight: ${weight.toFixed(2)}] ${memberId}:\n${memberContent}\n\n`;
    });
    
    // Confidence based on weight distribution and agreement
    const weightValues = Array.from(weights.values());
    const maxWeight = Math.max(...weightValues);
    const minWeight = Math.min(...weightValues);
    const weightSpread = maxWeight - minWeight;
    
    // High confidence if weights are well-distributed and agreement is high
    const confidence = (weightSpread < 0.5 && agreementLevel > 0.7) ? 'high' : 
                      (agreementLevel > 0.5) ? 'medium' : 'low';
    
    return { content: synthesis, confidence, agreementLevel };
  }

  /**
   * Meta-Synthesis Strategy
   * Uses a designated council member to synthesize all responses
   */
  private metaSynthesis(exchanges: Exchange[]): {
    content: string;
    confidence: 'high' | 'medium' | 'low';
    agreementLevel: number;
  } {
    // Calculate agreement level
    const agreementLevel = this.calculateAgreementLevel(exchanges);
    
    // In a real implementation, this would call the moderator model with all responses
    // For now, we'll create a structured summary
    let synthesis = 'Meta-synthesis of council deliberation:\n\n';
    
    // Group by council member
    const exchangesByMember = new Map<string, Exchange[]>();
    exchanges.forEach(exchange => {
      const existing = exchangesByMember.get(exchange.councilMemberId) || [];
      existing.push(exchange);
      exchangesByMember.set(exchange.councilMemberId, existing);
    });
    
    // Summarize each member's contribution
    exchangesByMember.forEach((memberExchanges, memberId) => {
      synthesis += `${memberId}:\n`;
      memberExchanges.forEach(exchange => {
        synthesis += `${exchange.content}\n`;
      });
      synthesis += '\n';
    });
    
    // Add synthesis conclusion
    synthesis += '\nSynthesized conclusion:\n';
    synthesis += this.extractCommonThemes(exchanges);
    
    // Confidence based on agreement level
    const confidence = agreementLevel > 0.7 ? 'high' : agreementLevel > 0.5 ? 'medium' : 'low';
    
    return { content: synthesis, confidence, agreementLevel };
  }

  /**
   * Calculate agreement level between exchanges (0-1)
   * Based on content similarity
   */
  private calculateAgreementLevel(exchanges: Exchange[]): number {
    if (exchanges.length <= 1) {
      return 1.0;
    }
    
    // Simple similarity metric: count common words
    const allWords = exchanges.map(e => this.extractWords(e.content));
    
    // Calculate pairwise similarity
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < allWords.length; i++) {
      for (let j = i + 1; j < allWords.length; j++) {
        const similarity = this.calculateWordSimilarity(allWords[i], allWords[j]);
        totalSimilarity += similarity;
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Extract words from content for similarity comparison
   */
  private extractWords(content: string): Set<string> {
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2); // Filter out very short words (1-2 chars)
    
    return new Set(words);
  }

  /**
   * Calculate similarity between two word sets (Jaccard similarity)
   */
  private calculateWordSimilarity(words1: Set<string>, words2: Set<string>): number {
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Group similar responses together
   */
  private groupSimilarResponses(exchanges: Exchange[]): Exchange[][] {
    if (exchanges.length === 0) {
      return [];
    }
    
    const groups: Exchange[][] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < exchanges.length; i++) {
      if (used.has(i)) continue;
      
      const group: Exchange[] = [exchanges[i]];
      used.add(i);
      
      const words1 = this.extractWords(exchanges[i].content);
      
      for (let j = i + 1; j < exchanges.length; j++) {
        if (used.has(j)) continue;
        
        const words2 = this.extractWords(exchanges[j].content);
        const similarity = this.calculateWordSimilarity(words1, words2);
        
        // Group if similarity > 0.7 (stricter threshold for grouping)
        if (similarity > 0.7) {
          group.push(exchanges[j]);
          used.add(j);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  /**
   * Extract common themes from exchanges
   */
  private extractCommonThemes(exchanges: Exchange[]): string {
    // Find most common words across all exchanges
    const wordFrequency = new Map<string, number>();
    
    exchanges.forEach(exchange => {
      const words = this.extractWords(exchange.content);
      words.forEach(word => {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      });
    });
    
    // Get top themes (words appearing in multiple responses)
    const commonWords = Array.from(wordFrequency.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
    
    if (commonWords.length === 0) {
      return 'Council members provided diverse perspectives with limited overlap.';
    }
    
    return `Common themes across responses: ${commonWords.join(', ')}`;
  }

  /**
   * Select a moderator for meta-synthesis
   */
  selectModerator(
    members: CouncilMember[],
    strategy: ModeratorStrategy
  ): CouncilMember {
    if (members.length === 0) {
      throw new Error('No council members available for moderator selection');
    }
    
    switch (strategy.type) {
      case 'permanent':
        const permanentMember = members.find(m => m.id === strategy.memberId);
        if (!permanentMember) {
          throw new Error(`Permanent moderator ${strategy.memberId} not found`);
        }
        return permanentMember;
      
      case 'rotate':
        // Rotate through members
        const selectedMember = members[this.rotationIndex % members.length];
        this.rotationIndex++;
        return selectedMember;
      
      case 'strongest':
        // Select based on model rankings
        return this.selectStrongestMember(members);
      
      default:
        return members[0];
    }
  }

  /**
   * Select the strongest member based on model rankings
   */
  private selectStrongestMember(members: CouncilMember[]): CouncilMember {
    let strongest = members[0];
    let highestScore = this.getModelScore(strongest);
    
    for (const member of members) {
      const score = this.getModelScore(member);
      if (score > highestScore) {
        highestScore = score;
        strongest = member;
      }
    }
    
    return strongest;
  }

  /**
   * Get ranking score for a model
   */
  private getModelScore(member: CouncilMember): number {
    // Try exact match first
    if (MODEL_RANKINGS[member.model]) {
      return MODEL_RANKINGS[member.model];
    }
    
    // Try partial match (e.g., "gpt-4-turbo-preview" matches "gpt-4-turbo")
    for (const [modelName, score] of Object.entries(MODEL_RANKINGS)) {
      if (member.model.includes(modelName)) {
        return score;
      }
    }
    
    // Return default score
    return MODEL_RANKINGS['default'];
  }
}
