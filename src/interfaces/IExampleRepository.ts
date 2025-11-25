/**
 * Example Repository Interface
 * Stores and retrieves successful negotiation examples for prompt guidance
 */

import { NegotiationExample } from '../types/core';

export interface IExampleRepository {
  /**
   * Store successful negotiation example
   * @param example - Negotiation example with anonymized content
   */
  storeExample(example: NegotiationExample): Promise<void>;

  /**
   * Retrieve relevant examples
   * @param query - User query for context matching
   * @param count - Number of examples to retrieve (default: 2)
   * @returns Array of relevant examples
   */
  getRelevantExamples(query: string, count?: number): Promise<NegotiationExample[]>;

  /**
   * Get examples by category
   * @param category - Example category (endorsement, refinement, compromise)
   * @param count - Number of examples
   * @returns Array of examples
   */
  getExamplesByCategory(
    category: 'endorsement' | 'refinement' | 'compromise',
    count?: number
  ): Promise<NegotiationExample[]>;
}

