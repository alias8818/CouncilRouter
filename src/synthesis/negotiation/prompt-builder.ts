/**
 * Negotiation Prompt Builder
 * Constructs prompts for negotiation rounds with context, examples, and dynamic templates
 */

import { INegotiationPromptBuilder } from '../../interfaces/INegotiationPromptBuilder';
import { IEmbeddingService } from '../../interfaces/IEmbeddingService';
import {
  NegotiationResponse,
  Agreement,
  NegotiationExample,
  PromptTemplate
} from '../../types/core';

export class NegotiationPromptBuilder implements INegotiationPromptBuilder {
  private readonly MAX_QUERY_LENGTH = 2000;
  private readonly MAX_EXAMPLES = 2;

  constructor(private embeddingService?: IEmbeddingService) {
    // Embedding service is optional - may be used for future enhancements
  }

  /**
   * Build negotiation prompt for a council member
   */
  buildPrompt(
    query: string,
    currentResponses: NegotiationResponse[],
    disagreements: string[],
    agreements: Agreement[],
    examples: NegotiationExample[],
    templateOverride?: PromptTemplate
  ): string {
    // Sanitize query
    const sanitizedQuery = this.sanitizeQuery(query);

    // Use custom template if provided
    if (templateOverride) {
      return this.buildFromTemplate(
        templateOverride,
        sanitizedQuery,
        currentResponses,
        disagreements,
        agreements,
        examples
      );
    }

    // Build default prompt with structured output format
    const promptParts: string[] = [];

    // Header with clear focus on SUBSTANCE, not process
    promptParts.push('=== CONSENSUS ROUND ===');
    promptParts.push('');
    promptParts.push(
      'You are helping reach consensus on the SUBSTANCE of an answer. Focus ONLY on factual accuracy and completeness.'
    );
    promptParts.push('');
    promptParts.push('CRITICAL INSTRUCTIONS:');
    promptParts.push('- DO NOT discuss HOW to present or format the answer');
    promptParts.push('- DO NOT comment on the negotiation process itself');
    promptParts.push('- DO NOT suggest "tiered structures" or "modular approaches" for organizing content');
    promptParts.push('- Focus ONLY on what the correct, factual answer should be');
    promptParts.push('- If you agree with another response\'s SUBSTANCE, adopt it exactly');
    promptParts.push('');

    // Original query
    promptParts.push('USER QUESTION:');
    promptParts.push(sanitizedQuery);
    promptParts.push('');

    // Extract and show CORE ANSWERS from current responses (not full verbose text)
    promptParts.push('CURRENT POSITIONS (core answers only):');
    currentResponses.forEach((response) => {
      // Extract just the essential answer, stripping meta-commentary
      const coreAnswer = this.extractCoreAnswer(response.content);
      promptParts.push(`[${response.councilMemberId}]: ${coreAnswer}`);
      promptParts.push('');
    });

    // Show factual disagreements only (not presentation disagreements)
    if (disagreements.length > 0) {
      const factualDisagreements = disagreements.filter(
        (d) => !d.toLowerCase().includes('format') &&
               !d.toLowerCase().includes('structure') &&
               !d.toLowerCase().includes('present')
      );
      if (factualDisagreements.length > 0) {
        promptParts.push('FACTUAL DISAGREEMENTS TO RESOLVE:');
        factualDisagreements.forEach((disagreement, index) => {
          promptParts.push(`${index + 1}. ${disagreement}`);
        });
        promptParts.push('');
      }
    }

    // Instructions for structured response
    promptParts.push('YOUR RESPONSE:');
    promptParts.push('Provide your answer in this EXACT format:');
    promptParts.push('');
    promptParts.push('CORE_ANSWER: [One clear, direct answer to the user\'s question - 1-3 sentences max]');
    promptParts.push('');
    promptParts.push('EXPLANATION: [Brief supporting explanation if needed - keep concise]');
    promptParts.push('');
    promptParts.push('AGREE_WITH: [If your core answer matches another member\'s, write their ID here, otherwise write "NONE"]');
    promptParts.push('');
    promptParts.push('Remember: Consensus is about agreeing on FACTS, not on presentation style.');

    return promptParts.join('\n');
  }

  /**
   * Extract the core factual answer from a response, stripping meta-commentary
   */
  extractCoreAnswer(content: string): string {
    // If response already has our structured format, extract CORE_ANSWER
    const coreMatch = content.match(/CORE_ANSWER:\s*(.+?)(?=\n\n|\nEXPLANATION:|\nAGREE_WITH:|$)/is);
    if (coreMatch) {
      return coreMatch[1].trim().substring(0, 500);
    }

    // Otherwise, try to extract the substantive answer
    // Remove common meta-commentary patterns
    const cleaned = content
      // Remove round/deliberation references
      .replace(/\*\*Deliberation Response:.*?\*\*/gi, '')
      .replace(/Round \d+.*?:/gi, '')
      .replace(/Whew,.*?evolving[^.]*\./gi, '')
      // Remove analysis of other responses
      .replace(/Council Member \d+.*?:/gi, '')
      .replace(/\[.*?\]:\s*/g, '')
      // Remove meta-discussion about format/structure
      .replace(/tiered.*?structure/gi, '')
      .replace(/modular.*?approach/gi, '')
      .replace(/how.*?architect.*?information/gi, '')
      .replace(/the debate has shifted/gi, '')
      // Remove markdown headers that are about process
      .replace(/^#+\s*(Analysis|Critique|Observations|Response).*$/gim, '')
      .replace(/\*\*Analysis.*?\*\*/gi, '')
      .trim();

    // Take first substantive paragraph (skip empty or short lines)
    const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim().length > 20);
    if (paragraphs.length > 0) {
      // Return first substantive paragraph, limited to 500 chars
      return paragraphs[0].trim().substring(0, 500);
    }

    // Fallback: return first 500 chars of cleaned content
    return cleaned.substring(0, 500);
  }

  /**
   * Identify disagreements between responses
   */
  identifyDisagreements(
    responses: NegotiationResponse[],
    similarityMatrix: number[][]
  ): string[] {
    const disagreements: string[] = [];
    const threshold = 0.7; // Default threshold for disagreement

    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        const similarity = similarityMatrix[i][j];

        if (similarity < threshold) {
          const response1 = responses[i];
          const response2 = responses[j];

          // Extract key differences
          const diff = this.extractDifferences(
            response1.content,
            response2.content
          );
          if (diff) {
            disagreements.push(
              `Members ${response1.councilMemberId} and ${response2.councilMemberId} disagree: ${diff}`
            );
          }
        }
      }
    }

    return disagreements;
  }

  /**
   * Extract agreements from responses
   */
  extractAgreements(
    responses: NegotiationResponse[],
    similarityMatrix: number[][],
    threshold: number
  ): Agreement[] {
    const agreements: Agreement[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        const similarity = similarityMatrix[i][j];
        const pairKey = `${i}-${j}`;
        const reversePairKey = `${j}-${i}`;

        if (
          similarity >= threshold &&
          !processed.has(pairKey) &&
          !processed.has(reversePairKey)
        ) {
          const response1 = responses[i];
          const response2 = responses[j];

          // Find all members that agree (similarity >= threshold)
          const agreeingMembers = [
            response1.councilMemberId,
            response2.councilMemberId
          ];

          // Check for transitive agreements
          for (let k = 0; k < responses.length; k++) {
            if (k === i || k === j) {
              continue;
            }

            const sim1 = similarityMatrix[i][k];
            const sim2 = similarityMatrix[j][k];

            if (sim1 >= threshold && sim2 >= threshold) {
              agreeingMembers.push(responses[k].councilMemberId);
            }
          }

          // Remove duplicates
          const uniqueMembers = Array.from(new Set(agreeingMembers));

          // Calculate cohesion (average similarity among agreeing members)
          let totalSimilarity = 0;
          let pairCount = 0;

          for (let m = 0; m < uniqueMembers.length; m++) {
            for (let n = m + 1; n < uniqueMembers.length; n++) {
              const idx1 = responses.findIndex(
                (r) => r.councilMemberId === uniqueMembers[m]
              );
              const idx2 = responses.findIndex(
                (r) => r.councilMemberId === uniqueMembers[n]
              );

              if (idx1 >= 0 && idx2 >= 0) {
                totalSimilarity += similarityMatrix[idx1][idx2];
                pairCount++;
              }
            }
          }

          const cohesion = pairCount > 0 ? totalSimilarity / pairCount : 0;

          // Determine agreed position (use most similar response as representative)
          const representativeResponse = response1;
          const position = representativeResponse.content.substring(0, 200); // Truncate for display

          agreements.push({
            memberIds: uniqueMembers,
            position,
            cohesion
          });

          // Mark all pairs as processed
          for (let m = 0; m < uniqueMembers.length; m++) {
            for (let n = m + 1; n < uniqueMembers.length; n++) {
              processed.add(`${m}-${n}`);
            }
          }
        }
      }
    }

    return agreements;
  }

  /**
   * Sanitize query for security
   */
  private sanitizeQuery(query: string): string {
    // Limit length
    let sanitized = query.substring(0, this.MAX_QUERY_LENGTH);

    // Remove code blocks that could be prompt injection
    sanitized = sanitized.replace(/```[\s\S]*?```/g, '[code block removed]');
    sanitized = sanitized.replace(/`[^`]+`/g, '[code removed]');

    // Remove special characters that could manipulate prompts
    sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control characters

    // Security: Remove common prompt injection patterns
    // Remove attempts to override system instructions
    sanitized = sanitized.replace(
      /ignore\s+(previous|all)\s+(instructions|prompts?)/gi,
      ''
    );
    sanitized = sanitized.replace(/forget\s+(everything|all)/gi, '');
    sanitized = sanitized.replace(/system\s*:\s*/gi, '');

    // Remove attempts to access system information
    sanitized = sanitized.replace(
      /show\s+(me\s+)?(your|the)\s+(prompt|instructions|system)/gi,
      ''
    );

    // Remove attempts to break out of context
    sanitized = sanitized.replace(/\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g, '');

    // Remove XML-like tags that might be used for injection
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Normalize excessive whitespace but preserve single spaces
    sanitized = sanitized.replace(/\s+/g, ' ');

    // Only trim if the result would still have content
    if (sanitized.trim().length > 0) {
      sanitized = sanitized.trim();
    }

    return sanitized;
  }

  /**
   * Extract key differences between two responses
   */
  private extractDifferences(
    content1: string,
    content2: string
  ): string | null {
    // Simple difference extraction - look for key phrases
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));

    // Find words unique to each response
    const unique1 = Array.from(words1).filter(
      (w) => !words2.has(w) && w.length > 3
    );
    const unique2 = Array.from(words2).filter(
      (w) => !words1.has(w) && w.length > 3
    );

    if (unique1.length === 0 && unique2.length === 0) {
      return null;
    }

    const differences: string[] = [];
    if (unique1.length > 0) {
      differences.push(
        `Response 1 emphasizes: ${unique1.slice(0, 3).join(', ')}`
      );
    }
    if (unique2.length > 0) {
      differences.push(
        `Response 2 emphasizes: ${unique2.slice(0, 3).join(', ')}`
      );
    }

    return differences.join('; ');
  }

  /**
   * Build prompt from custom template
   */
  private buildFromTemplate(
    template: PromptTemplate,
    query: string,
    responses: NegotiationResponse[],
    disagreements: string[],
    agreements: Agreement[],
    examples: NegotiationExample[]
  ): string {
    let prompt = template.template;

    // Replace placeholders
    const placeholders: Record<string, string> = {
      query: query,
      responses: responses
        .map((r) => `Member ${r.councilMemberId}: ${r.content}`)
        .join('\n\n'),
      disagreements: disagreements.join('\n'),
      agreements: agreements
        .map((a) => `${a.memberIds.join(', ')}: ${a.position}`)
        .join('\n'),
      examples: examples
        .slice(0, this.MAX_EXAMPLES)
        .map((e) => `${e.category}: ${e.disagreement} -> ${e.resolution}`)
        .join('\n')
    };

    // Replace all placeholders
    Object.entries(placeholders).forEach(([key, value]) => {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });

    return prompt;
  }
}
