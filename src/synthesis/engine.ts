/**
 * Synthesis Engine
 * Combines council member responses into consensus
 */

import { ISynthesisEngine } from '../interfaces/ISynthesisEngine';
import { IProviderPool } from '../interfaces/IProviderPool';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';
import { IDevilsAdvocateModule } from '../interfaces/IDevilsAdvocateModule';
import {
  DeliberationThread,
  SynthesisStrategy,
  ConsensusDecision,
  CouncilMember,
  ModeratorStrategy,
  Exchange,
  UserRequest
} from '../types/core';
import { CodeDetector } from './code-detector';
import { CodeSimilarityCalculator } from './code-similarity';
import { CodeValidator } from './code-validator';

import { ModelRankings } from '../types/core';

export class SynthesisEngine implements ISynthesisEngine {
  private rotationIndex: number = 0;
  private rotationLock: Promise<void> = Promise.resolve();
  private providerPool: IProviderPool;
  private configManager: IConfigurationManager;
  private devilsAdvocate?: IDevilsAdvocateModule;
  private codeDetector: CodeDetector;
  private codeSimilarityCalculator: CodeSimilarityCalculator;
  private codeValidator: CodeValidator;
  private modelRankingsCache: ModelRankings | null = null;
  private rankingsCachePromise: Promise<ModelRankings> | null = null;

  constructor(
    providerPool: IProviderPool,
    configManager: IConfigurationManager,
    devilsAdvocate?: IDevilsAdvocateModule
  ) {
    this.providerPool = providerPool;
    this.configManager = configManager;
    this.devilsAdvocate = devilsAdvocate;
    this.codeDetector = new CodeDetector();
    this.codeSimilarityCalculator = new CodeSimilarityCalculator();
    this.codeValidator = new CodeValidator();
  }

  /**
   * Synthesize a consensus decision from deliberation thread
   */
  async synthesize(
    request: UserRequest,
    thread: DeliberationThread,
    strategy: SynthesisStrategy
  ): Promise<ConsensusDecision> {
    // Extract query from request
    const query = request.query;

    // Validate query (null/empty check)
    if (!query || query.trim().length === 0) {
      console.warn('User query is null or empty, proceeding with degraded synthesis');
    }

    // Extract all exchanges from all rounds
    const allExchanges = thread.rounds.flatMap(round => round.exchanges);

    // Fixed: Throw error instead of returning placeholder when no exchanges exist
    // This allows callers to properly handle the failure case
    if (allExchanges.length === 0) {
      throw new Error('Cannot synthesize consensus: no council member responses available');
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
        ({ content, confidence, agreementLevel } = this.consensusExtraction(allExchanges, query));
        break;

      case 'weighted-fusion':
        ({ content, confidence, agreementLevel } = this.weightedFusion(allExchanges, strategy.weights, query));
        break;

      case 'meta-synthesis':
        ({ content, confidence, agreementLevel } = await this.metaSynthesis(allExchanges, strategy.moderatorStrategy, query));
        break;

      default:
        // Fallback to consensus extraction
        ({ content, confidence, agreementLevel } = this.consensusExtraction(allExchanges, query));
    }

    // Conditionally invoke Devil's Advocate if enabled and matches request type
    if (this.devilsAdvocate) {
      try {
        const devilsAdvocateConfig = await this.configManager.getDevilsAdvocateConfig();

        if (devilsAdvocateConfig.enabled) {
          // Detect if this is a code request
          const isCodeRequest = allExchanges.some(e => {
            try {
              return this.codeDetector.detectCode(e.content);
            } catch {
              return false;
            }
          });

          // Check if Devil's Advocate should be applied to this request type
          const shouldApply = (isCodeRequest && devilsAdvocateConfig.applyToCodeRequests) ||
                              (!isCodeRequest && devilsAdvocateConfig.applyToTextRequests);

          if (shouldApply) {
            // Prepare responses for Devil's Advocate
            const responses = allExchanges.map(e => ({
              councilMemberId: e.councilMemberId,
              content: e.content
            }));

            // Invoke Devil's Advocate
            const improvedContent = await this.devilsAdvocate.synthesizeWithCritique(
              query,
              content,
              responses,
              request.id
            );

            // Use improved content if it differs
            if (improvedContent !== content) {
              content = improvedContent;
              // Optionally adjust confidence based on critique
              // For now, we keep the original confidence
            }
          }
        }
      } catch (error) {
        // Log error but don't fail synthesis
        console.error('Devil\'s Advocate error, using original synthesis:', error);
      }
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
  private consensusExtraction(exchanges: Exchange[], _query?: string): {
    content: string;
    confidence: 'high' | 'medium' | 'low';
    agreementLevel: number;
  } {
    // Calculate agreement level based on content similarity
    const agreementLevel = this.calculateAgreementLevel(exchanges);

    // Apply validation weights if code is detected
    const validationWeights = this.weightByValidation(exchanges);

    // Detect if responses contain code
    const isCodeRequest = exchanges.some(e => {
      try {
        return this.codeDetector.detectCode(e.content);
      } catch {
        return false;
      }
    });

    // Filter out responses with critical errors
    const validExchanges = exchanges.filter(exchange => {
      const validation = validationWeights.get(exchange.councilMemberId);
      // If validation weight is 0.0, it's a critical error
      return validation !== undefined && validation > 0.0;
    });

    // If all exchanges have critical errors, use original exchanges (degraded mode)
    const exchangesToUse = validExchanges.length > 0 ? validExchanges : exchanges;

    // Group responses by similarity
    const responseGroups = this.groupSimilarResponses(exchangesToUse);

    // Find majority position (largest group, weighted by validation if code detected)
    const majorityGroup = responseGroups.reduce((largest, current) => {
      // Calculate weighted size (size * average validation weight)
      const currentAvgWeight = current.reduce((sum, e) => {
        return sum + (validationWeights.get(e.councilMemberId) || 1.0);
      }, 0) / current.length;
      const currentWeightedSize = current.length * currentAvgWeight;

      const largestAvgWeight = largest.reduce((sum, e) => {
        return sum + (validationWeights.get(e.councilMemberId) || 1.0);
      }, 0) / largest.length;
      const largestWeightedSize = largest.length * largestAvgWeight;

      return currentWeightedSize > largestWeightedSize ? current : largest;
    });

    // For code: select single best response from majority group based on validation weight
    // For text: keep existing concatenation logic
    let majorityContent: string;
    if (isCodeRequest) {
      // Select single best response from majority group
      const bestResponse = majorityGroup.reduce((best, current) => {
        const bestValidation = validationWeights.get(best.councilMemberId) || 0;
        const currentValidation = validationWeights.get(current.councilMemberId) || 0;
        return currentValidation > bestValidation ? current : best;
      });
      majorityContent = bestResponse.content;
    } else {
      // Text: concatenate majority group responses
      majorityContent = majorityGroup.map(e => e.content).join('\n\n');
    }

    // Build synthesis with areas of agreement and disagreement
    let synthesis = '';

    if (responseGroups.length === 1) {
      // Full agreement
      synthesis = `All council members agree:\n\n${majorityContent}`;
    } else {
      // Partial agreement
      synthesis = `Majority position (${majorityGroup.length}/${exchangesToUse.length} members):\n\n${majorityContent}`;

      // Add minority positions if they exist (only for text, not code)
      if (!isCodeRequest) {
        const minorityGroups = responseGroups.filter(g => g !== majorityGroup);
        if (minorityGroups.length > 0) {
          synthesis += '\n\nAlternative perspectives:\n\n';
          minorityGroups.forEach((group, idx) => {
            synthesis += `Position ${idx + 2} (${group.length} members):\n${group[0].content}\n\n`;
          });
        }
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
  private weightedFusion(exchanges: Exchange[], weights: Map<string, number>, _query?: string): {
    content: string;
    confidence: 'high' | 'medium' | 'low';
    agreementLevel: number;
  } {
    // Calculate agreement level
    const agreementLevel = this.calculateAgreementLevel(exchanges);

    // Apply validation weights if code is detected
    const validationWeights = this.weightByValidation(exchanges);

    // Detect if responses contain code
    const isCodeRequest = exchanges.some(e => {
      try {
        return this.codeDetector.detectCode(e.content);
      } catch {
        return false;
      }
    });

    // Filter out responses with critical errors
    const validExchanges = exchanges.filter(exchange => {
      const validation = validationWeights.get(exchange.councilMemberId);
      // If validation weight is 0.0, it's a critical error
      return validation !== undefined && validation > 0.0;
    });

    // If all exchanges have critical errors, use original exchanges (degraded mode)
    const exchangesToUse = validExchanges.length > 0 ? validExchanges : exchanges;

    // Multiply base weights by validation weights
    const finalWeights = new Map<string, number>();
    exchangesToUse.forEach(exchange => {
      const baseWeight = weights.get(exchange.councilMemberId) || 1.0;
      const validationWeight = validationWeights.get(exchange.councilMemberId) || 1.0;
      finalWeights.set(exchange.councilMemberId, baseWeight * validationWeight);
    });

    // For code: select highest-weighted response (no concatenation)
    // For text: keep existing weighted concatenation logic
    if (isCodeRequest) {
      // Select highest-weighted response
      const bestExchange = exchangesToUse.reduce((best, current) => {
        const bestWeight = finalWeights.get(best.councilMemberId) || 0;
        const currentWeight = finalWeights.get(current.councilMemberId) || 0;
        return currentWeight > bestWeight ? current : best;
      });

      const confidence = agreementLevel > 0.8 ? 'high' : agreementLevel > 0.5 ? 'medium' : 'low';
      return { content: bestExchange.content, confidence, agreementLevel };
    }

    // Text: weighted concatenation
    // Group exchanges by council member
    const exchangesByMember = new Map<string, Exchange[]>();
    exchangesToUse.forEach(exchange => {
      const existing = exchangesByMember.get(exchange.councilMemberId) || [];
      existing.push(exchange);
      exchangesByMember.set(exchange.councilMemberId, existing);
    });

    // Build weighted synthesis
    let synthesis = 'Weighted synthesis of council responses:\n\n';

    // Sort members by final weight (highest first)
    const sortedMembers = Array.from(exchangesByMember.keys()).sort((a, b) => {
      const weightA = finalWeights.get(a) || 1.0;
      const weightB = finalWeights.get(b) || 1.0;
      return weightB - weightA;
    });

    sortedMembers.forEach(memberId => {
      const memberExchanges = exchangesByMember.get(memberId)!;
      const weight = finalWeights.get(memberId) || 1.0;
      const memberContent = memberExchanges.map(e => e.content).join('\n');

      synthesis += `[Weight: ${weight.toFixed(2)}] ${memberId}:\n${memberContent}\n\n`;
    });

    // Confidence based on weight distribution and agreement
    const weightValues = Array.from(finalWeights.values());
    // Handle empty weights case: if no weights provided, all members have equal weight (1.0),
    // so weightSpread is 0
    const weightSpread = weightValues.length === 0
      ? 0
      : Math.max(...weightValues) - Math.min(...weightValues);

    // High confidence if weights are well-distributed and agreement is high
    const confidence = (weightSpread < 0.5 && agreementLevel > 0.7) ? 'high' :
      (agreementLevel > 0.5) ? 'medium' : 'low';

    return { content: synthesis, confidence, agreementLevel };
  }

  /**
   * Meta-Synthesis Strategy
   * Uses a designated council member to synthesize all responses
   */
  private async metaSynthesis(
    exchanges: Exchange[],
    moderatorStrategy: ModeratorStrategy | undefined,
    query?: string
  ): Promise<{
    content: string;
    confidence: 'high' | 'medium' | 'low';
    agreementLevel: number;
  }> {
    // Calculate agreement level
    const agreementLevel = this.calculateAgreementLevel(exchanges);

    try {
      // Get council members to select moderator from
      const councilConfig = await this.configManager.getCouncilConfig();

      // Select moderator
      const moderator = await this.selectModerator(
        councilConfig.members,
        moderatorStrategy || { type: 'strongest' }
      );

      // Detect if responses contain code
      const isCodeRequest = exchanges.some(e => {
        try {
          return this.codeDetector.detectCode(e.content);
        } catch {
          return false;
        }
      });

      // Filter out responses with critical errors
      const validationWeights = this.weightByValidation(exchanges);
      const validExchanges = exchanges.filter(exchange => {
        const validation = validationWeights.get(exchange.councilMemberId);
        return validation !== undefined && validation > 0.0;
      });
      const exchangesToUse = validExchanges.length > 0 ? validExchanges : exchanges;

      // Construct prompt for moderator
      let prompt = 'You are the Moderator for an AI Council. Your task is to synthesize the responses from multiple AI models into a single, coherent, and comprehensive answer.\n\n';

      // Include original user query
      if (query && query.trim().length > 0) {
        // Sanitize query to prevent prompt injection (basic sanitization)
        const sanitizedQuery = query.replace(/```/g, '').substring(0, 2000);
        prompt += 'ORIGINAL USER QUERY:\n';
        prompt += `${sanitizedQuery}\n\n`;
      }

      prompt += 'Here are the responses from the council members:\n\n';

      exchangesToUse.forEach((exchange, _index) => {
        prompt += `--- Council Member ${exchange.councilMemberId} ---\n`;
        prompt += `${exchange.content}\n\n`;
      });

      // Use code-specific prompt template for code requests
      if (isCodeRequest) {
        prompt += 'CRITICAL REQUIREMENTS FOR PRODUCTION-READY CODE:\n';
        prompt += '1. Correctness: Code must be syntactically correct and logically sound. Validate that the code addresses the original user requirements.\n';
        prompt += '2. Security: Check for common vulnerabilities (injection, XSS, etc.). Ensure input validation and secure coding practices.\n';
        prompt += '3. Error Handling: Include proper try-catch blocks and error messages. Handle edge cases gracefully.\n';
        prompt += '4. Best Practices: Follow language-specific conventions and patterns. Use appropriate data structures and algorithms.\n';
        prompt += '5. User Constraints: Strictly adhere to requirements in the original query. Ensure all requested functionality is implemented.\n';
        prompt += '6. Completeness: Ensure all requested functionality is implemented. Do not leave TODO comments or incomplete implementations.\n\n';
        prompt += 'Synthesize a single, production-ready code solution that addresses the original query.\n';
        prompt += 'Do NOT concatenate multiple solutions. Select or combine the best elements.\n';
      } else {
        prompt += 'Instructions:\n';
        prompt += '1. Identify the core consensus among the models.\n';
        prompt += '2. Highlight any significant disagreements or alternative perspectives.\n';
        prompt += '3. Synthesize the best parts of each response into a final, high-quality answer.\n';
        prompt += '4. Do not just list the responses; integrate them.\n';
        prompt += '5. If there are conflicts, explain the trade-offs.\n';
        if (query && query.trim().length > 0) {
          prompt += '6. Ensure your response directly addresses the original user query.\n';
        }
        prompt += '\n';
      }
      prompt += 'Provide your synthesized response now:';

      // Send request to moderator
      const response = await this.providerPool.sendRequest(moderator, prompt);

      if (!response.success) {
        throw new Error(`Moderator synthesis failed: ${response.error?.message}`);
      }

      // Confidence based on agreement level and moderator success
      const confidence = agreementLevel > 0.7 ? 'high' : agreementLevel > 0.5 ? 'medium' : 'low';

      return { content: response.content, confidence, agreementLevel };

    } catch (error) {
      console.error('Meta-synthesis failed, falling back to structured summary:', error);

      // Fallback to structured summary
      let synthesis = 'Meta-synthesis of council deliberation (Fallback):\n\n';

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

      const confidence = agreementLevel > 0.7 ? 'high' : agreementLevel > 0.5 ? 'medium' : 'low';

      return { content: synthesis, confidence, agreementLevel };
    }
  }
  private calculateAgreementLevel(exchanges: Exchange[]): number {
    if (exchanges.length <= 1) {
      return 1.0;
    }

    // Detect if responses contain code
    try {
      const hasCode = exchanges.some(e => this.codeDetector.detectCode(e.content));

      if (hasCode) {
        return this.calculateCodeAgreement(exchanges);
      }
    } catch (error) {
      // Fall back to text similarity on code detection failure
      console.warn('Code detection failed, falling back to text similarity:', error);
    }

    // Fall back to existing text-based similarity
    return this.calculateTextAgreement(exchanges);
  }

  /**
   * Calculate agreement for code responses
   */
  private calculateCodeAgreement(exchanges: Exchange[]): number {
    try {
      const codeBlocks = exchanges.map(e => {
        // Use extractCodeSegments which handles both markdown blocks
        // and keyword-detected code segments
        const blocks = this.codeDetector.extractCodeSegments(e.content);

        // If we found code segments, use them; otherwise fall back to text similarity
        if (blocks.length > 0) {
          return blocks.join('\n');
        }

        // No code segments found - this shouldn't happen if detectCode returned true,
        // but if it does, fall back to text similarity for this exchange
        return null;
      });

      // Filter out null entries (exchanges where no code was actually extracted)
      const validCodeBlocks = codeBlocks.filter((block): block is string => block !== null);

      // If we couldn't extract code from any exchanges, fall back to text similarity
      if (validCodeBlocks.length === 0) {
        console.warn('Code detected but extraction failed, falling back to text similarity');
        return this.calculateTextAgreement(exchanges);
      }

      // If we only have one valid code block, we can't compare
      if (validCodeBlocks.length === 1) {
        return 0.5; // Neutral similarity score
      }

      let totalSimilarity = 0;
      let comparisons = 0;

      for (let i = 0; i < validCodeBlocks.length; i++) {
        for (let j = i + 1; j < validCodeBlocks.length; j++) {
          try {
            const similarity = this.codeSimilarityCalculator.calculateSimilarity(
              validCodeBlocks[i],
              validCodeBlocks[j]
            );
            totalSimilarity += similarity;
            comparisons++;
          } catch (error) {
            // Skip failed comparisons
            console.warn('Code similarity calculation failed:', error);
          }
        }
      }

      return comparisons > 0 ? totalSimilarity / comparisons : 0;
    } catch (error) {
      // Fall back to text similarity on error
      console.warn('Code agreement calculation failed, falling back to text similarity:', error);
      return this.calculateTextAgreement(exchanges);
    }
  }

  /**
   * Calculate text-based agreement (existing implementation)
   */
  private calculateTextAgreement(exchanges: Exchange[]): number {
    // Use TF-IDF Cosine Similarity for better semantic agreement detection
    const vectors = this.computeTfIdfVectors(exchanges.map(e => e.content));

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const similarity = this.cosineSimilarity(vectors[i], vectors[j]);
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Apply validation-based weighting
   */
  private weightByValidation(exchanges: Exchange[]): Map<string, number> {
    const weights = new Map<string, number>();

    for (const exchange of exchanges) {
      try {
        const codeBlocks = this.codeDetector.extractCode(exchange.content);

        if (codeBlocks.length === 0) {
          // No code detected, use neutral weight
          weights.set(exchange.councilMemberId, 1.0);
          continue;
        }

        // Validate all code blocks and average the weights
        let totalWeight = 0;
        for (const code of codeBlocks) {
          try {
            const validation = this.codeValidator.validateCode(code);
            totalWeight += validation.weight;
          } catch (error) {
            // On validation failure, use neutral weight
            totalWeight += 1.0;
            console.warn('Code validation failed:', error);
          }
        }

        const avgWeight = totalWeight / codeBlocks.length;
        weights.set(exchange.councilMemberId, avgWeight);
      } catch (error) {
        // On extraction failure, use neutral weight
        weights.set(exchange.councilMemberId, 1.0);
        console.warn('Code extraction failed for validation:', error);
      }
    }

    return weights;
  }

  /**
   * Extract words from content for similarity comparison
   */
  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2); // Filter out very short words (1 and 2 chars)
  }

  /**
   * Compute TF-IDF vectors for a set of documents
   */
  private computeTfIdfVectors(documents: string[]): Map<string, number>[] {
    // 1. Tokenize and count term frequencies (TF)
    const termFreqs = documents.map(doc => {
      const terms = this.tokenize(doc);
      const tf = new Map<string, number>();
      terms.forEach(term => {
        tf.set(term, (tf.get(term) || 0) + 1);
      });
      // Normalize TF (only if terms exist to avoid division by zero)
      if (terms.length > 0) {
        tf.forEach((count, term) => tf.set(term, count / terms.length));
      }
      return tf;
    });

    // 2. Calculate Document Frequencies (DF)
    const docFreqs = new Map<string, number>();
    const allTerms = new Set<string>();

    termFreqs.forEach(tf => {
      tf.forEach((_, term) => {
        docFreqs.set(term, (docFreqs.get(term) || 0) + 1);
        allTerms.add(term);
      });
    });

    // 3. Calculate TF-IDF vectors
    const N = documents.length;
    return termFreqs.map(tf => {
      const vector = new Map<string, number>();
      allTerms.forEach(term => {
        const tfVal = tf.get(term) || 0;
        const dfVal = docFreqs.get(term) || 0;
        const idf = Math.log(N / (dfVal + 1)) + 1; // Smooth IDF
        vector.set(term, tfVal * idf);
      });
      return vector;
    });
  }

  /**
   * Calculate Cosine Similarity between two vectors
   */
  private cosineSimilarity(vec1: Map<string, number>, vec2: Map<string, number>): number {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    const allKeys = new Set([...vec1.keys(), ...vec2.keys()]);

    allKeys.forEach(key => {
      const val1 = vec1.get(key) || 0;
      const val2 = vec2.get(key) || 0;
      dotProduct += val1 * val2;
      mag1 += val1 * val1;
      mag2 += val2 * val2;
    });

    if (mag1 === 0 || mag2 === 0) {return 0;}
    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  }

  /**
   * Group similar responses together
   */
  private groupSimilarResponses(exchanges: Exchange[]): Exchange[][] {
    if (exchanges.length === 0) {
      return [];
    }

    const vectors = this.computeTfIdfVectors(exchanges.map(e => e.content));
    const groups: Exchange[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < exchanges.length; i++) {
      if (used.has(i)) {continue;}

      const group: Exchange[] = [exchanges[i]];
      used.add(i);

      for (let j = i + 1; j < exchanges.length; j++) {
        if (used.has(j)) {continue;}

        const similarity = this.cosineSimilarity(vectors[i], vectors[j]);

        // Group if similarity > 0.6 (stricter threshold for grouping)
        if (similarity > 0.6) {
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
      const words = this.tokenize(exchange.content);
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
  async selectModerator(
    members: CouncilMember[],
    strategy: ModeratorStrategy
  ): Promise<CouncilMember> {
    if (members.length === 0) {
      throw new Error('No council members available for moderator selection');
    }

    switch (strategy.type) {
      case 'permanent': {
        const permanentMember = members.find(m => m.id === strategy.memberId);
        if (!permanentMember) {
          throw new Error(`Permanent moderator ${strategy.memberId} not found`);
        }
        return permanentMember;
      }

      case 'rotate':
        // Use a promise-based lock to ensure atomic rotation across concurrent async calls
        // This guarantees each call gets a unique sequential index
        // eslint-disable-next-line @typescript-eslint/return-await
        return await this.getNextRotationMember(members);

      case 'strongest':
        // Select based on model rankings
        // eslint-disable-next-line @typescript-eslint/return-await
        return await this.selectStrongestMember(members);

      default:
        return members[0];
    }
  }

  /**
   * Get next member in rotation with proper locking to prevent race conditions
   * Uses a promise chain to serialize rotation index access across concurrent calls
   */
  private async getNextRotationMember(members: CouncilMember[]): Promise<CouncilMember> {
    if (members.length === 0) {
      throw new Error('No council members available for rotation');
    }

    // Chain this operation after the previous rotation operation completes
    const previousLock = this.rotationLock;

    // Create a new promise that returns the rotation index
    const indexPromise: Promise<number> = previousLock.then(() => {
      // Atomically get and increment the rotation index
      return this.rotationIndex++;
    });

    // Update the lock to wait for this operation (but don't return the index)
    this.rotationLock = indexPromise.then(() => {});

    // Wait for our turn and get the index
    const index = await indexPromise;

    // Use modulo to wrap around to valid member index
    return members[index % members.length];
  }

  /**
   * Select the strongest member based on model rankings
   */
  private async selectStrongestMember(members: CouncilMember[]): Promise<CouncilMember> {
    let strongest = members[0];
    let highestScore = await this.getModelScore(strongest);

    for (const member of members) {
      const score = await this.getModelScore(member);
      if (score > highestScore) {
        highestScore = score;
        strongest = member;
      }
    }

    return strongest;
  }

  /**
   * Get model rankings from configuration manager (with caching)
   */
  private async getModelRankings(): Promise<ModelRankings> {
    // Return cached rankings if available
    if (this.modelRankingsCache) {
      return this.modelRankingsCache;
    }

    // If a fetch is already in progress, wait for it
    if (this.rankingsCachePromise) {
      const rankings = await this.rankingsCachePromise;
      this.modelRankingsCache = rankings;
      return rankings;
    }

    // Fetch rankings and cache them
    this.rankingsCachePromise = this.configManager.getModelRankings();
    try {
      const rankings = await this.rankingsCachePromise;
      this.modelRankingsCache = rankings;
      return rankings;
    } finally {
      this.rankingsCachePromise = null;
    }
  }

  /**
   * Get ranking score for a model
   */
  private async getModelScore(member: CouncilMember): Promise<number> {
    const rankings = await this.getModelRankings();

    // Try exact match first
    if (rankings[member.model]) {
      return rankings[member.model];
    }

    // Try partial match (e.g., "gpt-4-turbo-preview" matches "gpt-4-turbo")
    // Prefer longer matches to avoid matching "gpt-4" when "gpt-4-turbo" is available
    let bestMatch: { modelName: string; score: number } | null = null;
    for (const [modelName, score] of Object.entries(rankings)) {
      if (member.model.includes(modelName)) {
        if (!bestMatch || modelName.length > bestMatch.modelName.length) {
          bestMatch = { modelName, score };
        }
      }
    }

    if (bestMatch) {
      return bestMatch.score;
    }

    // Return default score
    return rankings['default'] || 50;
  }
}
