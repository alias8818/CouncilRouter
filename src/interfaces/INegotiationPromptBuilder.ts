/**
 * Negotiation Prompt Builder Interface
 * Constructs prompts for negotiation rounds with context, examples, and dynamic templates
 */

import {
  NegotiationResponse,
  Agreement,
  NegotiationExample,
  PromptTemplate
} from '../types/core';

export interface INegotiationPromptBuilder {
  /**
   * Build negotiation prompt for a council member
   * @param query - Original user query
   * @param currentResponses - All current responses with attribution
   * @param disagreements - Identified points of disagreement
   * @param agreements - Existing agreements between members
   * @param examples - Historical examples of successful negotiations
   * @param templateOverride - Optional custom template for domain-specific negotiations
   * @returns Formatted negotiation prompt
   */
  buildPrompt(
    query: string,
    currentResponses: NegotiationResponse[],
    disagreements: string[],
    agreements: Agreement[],
    examples: NegotiationExample[],
    templateOverride?: PromptTemplate
  ): string;

  /**
   * Identify disagreements between responses
   * @param responses - Council member responses
   * @param similarityMatrix - Pairwise similarity scores
   * @returns List of disagreement descriptions
   */
  identifyDisagreements(
    responses: NegotiationResponse[],
    similarityMatrix: number[][]
  ): string[];

  /**
   * Extract agreements from responses
   * @param responses - Council member responses
   * @param similarityMatrix - Pairwise similarity scores
   * @param threshold - Similarity threshold for agreement
   * @returns List of agreements
   */
  extractAgreements(
    responses: NegotiationResponse[],
    similarityMatrix: number[][],
    threshold: number
  ): Agreement[];
}

