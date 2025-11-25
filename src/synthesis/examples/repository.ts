/**
 * Example Repository
 * Stores and retrieves successful negotiation examples for prompt guidance
 */

import { Pool } from 'pg';
import { IExampleRepository } from '../../interfaces/IExampleRepository';
import { IEmbeddingService } from '../../interfaces/IEmbeddingService';
import { NegotiationExample } from '../../types/core';
import { randomUUID } from 'crypto';

export class ExampleRepository implements IExampleRepository {
  constructor(
    private db: Pool,
    private embeddingService: IEmbeddingService
  ) { }

  /**
   * Store successful negotiation example
   */
  async storeExample(example: NegotiationExample): Promise<void> {
    // Anonymize content
    const anonymized = this.anonymizeExample(example);

    // Generate embedding for query context
    const embedding = await this.embeddingService.embed(anonymized.queryContext);

    // Store in database
    const query = `
      INSERT INTO negotiation_examples (
        id, category, query_context, disagreement, resolution,
        rounds_to_consensus, final_similarity, embedding, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.db.query(query, [
      anonymized.id,
      anonymized.category,
      anonymized.queryContext,
      anonymized.disagreement,
      anonymized.resolution,
      anonymized.roundsToConsensus,
      anonymized.finalSimilarity,
      JSON.stringify(embedding),
      anonymized.createdAt
    ]);
  }

  /**
   * Retrieve relevant examples using embedding similarity
   */
  async getRelevantExamples(query: string, count: number = 2): Promise<NegotiationExample[]> {
    // Generate embedding for query
    const queryEmbedding = await this.embeddingService.embed(query);

    // Search using vector similarity (PostgreSQL pgvector extension)
    // Note: This requires pgvector extension to be installed
    const searchQuery = `
      SELECT 
        id, category, query_context, disagreement, resolution,
        rounds_to_consensus, final_similarity, created_at,
        1 - (embedding <=> $1::vector) as similarity
      FROM negotiation_examples
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;

    try {
      const result = await this.db.query(searchQuery, [
        JSON.stringify(queryEmbedding),
        count
      ]);

      return result.rows.map(row => this.mapRowToExample(row));
    } catch (error) {
      // Fallback to category-based search if vector search fails
      console.warn('[ExampleRepository] Vector search failed, using fallback:', error);
      return this.getExamplesByCategory('endorsement', count);
    }
  }

  /**
   * Get examples by category
   */
  async getExamplesByCategory(
    category: 'endorsement' | 'refinement' | 'compromise',
    count: number = 2
  ): Promise<NegotiationExample[]> {
    const query = `
      SELECT 
        id, category, query_context, disagreement, resolution,
        rounds_to_consensus, final_similarity, created_at
      FROM negotiation_examples
      WHERE category = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, [category, count]);
    return result.rows.map(row => this.mapRowToExample(row));
  }

  /**
   * Anonymize example to remove PII
   */
  private anonymizeExample(example: NegotiationExample): NegotiationExample {
    let queryContext = example.queryContext;
    let disagreement = example.disagreement;
    let resolution = example.resolution;

    // Replace common PII patterns (comprehensive list)
    const piiPatterns = [
      // Social Security Numbers
      { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
      { pattern: /\b\d{9}\b/g, replacement: (match: string) => match.length === 9 ? '[SSN]' : match },
      // Phone numbers
      { pattern: /\b\d{3}-\d{3}-\d{4}\b/g, replacement: '[PHONE]' },
      { pattern: /\b\(\d{3}\)\s?\d{3}-\d{4}\b/g, replacement: '[PHONE]' },
      { pattern: /\b\d{3}\.\d{3}\.\d{4}\b/g, replacement: '[PHONE]' },
      // Email addresses
      { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
      // Dates
      { pattern: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, replacement: '[DATE]' },
      { pattern: /\b\d{4}-\d{2}-\d{2}\b/g, replacement: '[DATE]' },
      { pattern: /\b\d{1,2}-\d{1,2}-\d{4}\b/g, replacement: '[DATE]' },
      // Names (improved patterns)
      { pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, replacement: '[NAME]' },
      { pattern: /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+ [A-Z][a-z]+\b/g, replacement: '[NAME]' },
      // Credit card numbers
      { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[CREDIT_CARD]' },
      // IP addresses
      { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP_ADDRESS]' },
      // Addresses (basic patterns)
      { pattern: /\b\d+\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/g, replacement: '[ADDRESS]' },
      { pattern: /\b\d{5}(?:-\d{4})?\b/g, replacement: '[ZIP_CODE]' },
      // URLs
      { pattern: /\bhttps?:\/\/[^\s]+\b/g, replacement: '[URL]' }
    ];

    piiPatterns.forEach(({ pattern, replacement }) => {
      queryContext = queryContext.replace(pattern, replacement as string);
      disagreement = disagreement.replace(pattern, replacement as string);
      resolution = resolution.replace(pattern, replacement as string);
    });

    return {
      ...example,
      queryContext,
      disagreement,
      resolution
    };
  }

  /**
   * Map database row to NegotiationExample
   */
  private mapRowToExample(row: any): NegotiationExample {
    return {
      id: row.id,
      category: row.category,
      queryContext: row.query_context,
      disagreement: row.disagreement,
      resolution: row.resolution,
      roundsToConsensus: row.rounds_to_consensus,
      finalSimilarity: parseFloat(row.final_similarity),
      createdAt: new Date(row.created_at)
    };
  }
}

