/**
 * Seed initial negotiation examples
 * Creates 10-15 high-quality examples across categories
 */

import { Pool } from 'pg';
import { IEmbeddingService } from '../../interfaces/IEmbeddingService';
import { NegotiationExample } from '../../types/core';
import { ExampleRepository } from './repository';
import { randomUUID } from 'crypto';

const INITIAL_EXAMPLES: Omit<NegotiationExample, 'id' | 'createdAt'>[] = [
  // Endorsement examples
  {
    category: 'endorsement',
    queryContext: 'What is the capital of France?',
    disagreement: 'Member 1 said "Paris" while Member 2 said "The capital is Paris, located in northern France"',
    resolution: 'Member 1 endorsed Member 2\'s more detailed response, recognizing it provides additional context',
    roundsToConsensus: 1,
    finalSimilarity: 0.98
  },
  {
    category: 'endorsement',
    queryContext: 'Explain quantum computing in simple terms',
    disagreement: 'Member 1 provided a technical definition while Member 2 used analogies',
    resolution: 'Member 2 endorsed Member 1\'s technical accuracy, combining both approaches',
    roundsToConsensus: 1,
    finalSimilarity: 0.95
  },
  {
    category: 'endorsement',
    queryContext: 'What is the difference between REST and GraphQL?',
    disagreement: 'Different emphasis on use cases vs technical details',
    resolution: 'Members agreed on a comprehensive answer covering both aspects',
    roundsToConsensus: 1,
    finalSimilarity: 0.97
  },
  {
    category: 'endorsement',
    queryContext: 'How does machine learning work?',
    disagreement: 'One focused on algorithms, another on data',
    resolution: 'Consensus reached on unified explanation covering both',
    roundsToConsensus: 1,
    finalSimilarity: 0.96
  },

  // Refinement examples
  {
    category: 'refinement',
    queryContext: 'Write a function to calculate Fibonacci numbers',
    disagreement: 'Different approaches: recursive vs iterative, error handling differences',
    resolution: 'Refined to include both approaches with performance comparison and proper error handling',
    roundsToConsensus: 2,
    finalSimilarity: 0.92
  },
  {
    category: 'refinement',
    queryContext: 'Explain the water cycle',
    disagreement: 'Different levels of detail and scientific terminology',
    resolution: 'Refined to balance accessibility with scientific accuracy',
    roundsToConsensus: 2,
    finalSimilarity: 0.91
  },
  {
    category: 'refinement',
    queryContext: 'What are the benefits of cloud computing?',
    disagreement: 'Different emphasis on cost vs scalability vs security',
    resolution: 'Refined to comprehensive answer covering all major benefits',
    roundsToConsensus: 2,
    finalSimilarity: 0.93
  },
  {
    category: 'refinement',
    queryContext: 'How do neural networks learn?',
    disagreement: 'Different explanations of backpropagation and gradient descent',
    resolution: 'Refined to clear explanation with both intuitive and technical aspects',
    roundsToConsensus: 2,
    finalSimilarity: 0.90
  },
  {
    category: 'refinement',
    queryContext: 'What is the difference between SQL and NoSQL databases?',
    disagreement: 'Different focus on use cases vs technical architecture',
    resolution: 'Refined to cover both technical differences and practical applications',
    roundsToConsensus: 2,
    finalSimilarity: 0.94
  },

  // Compromise examples
  {
    category: 'compromise',
    queryContext: 'Should companies prioritize profit or social responsibility?',
    disagreement: 'Strong disagreement on prioritization',
    resolution: 'Compromised on balanced approach recognizing both are important and can be integrated',
    roundsToConsensus: 3,
    finalSimilarity: 0.88
  },
  {
    category: 'compromise',
    queryContext: 'What is the best programming language for beginners?',
    disagreement: 'Different recommendations: Python vs JavaScript vs Java',
    resolution: 'Compromised on answer explaining multiple good options with pros/cons',
    roundsToConsensus: 3,
    finalSimilarity: 0.87
  },
  {
    category: 'compromise',
    queryContext: 'Is remote work better than office work?',
    disagreement: 'Polarized views on productivity and collaboration',
    resolution: 'Compromised on hybrid approach recognizing benefits of both',
    roundsToConsensus: 3,
    finalSimilarity: 0.89
  },
  {
    category: 'compromise',
    queryContext: 'What is the best way to learn programming?',
    disagreement: 'Different learning paths: tutorials vs projects vs courses',
    resolution: 'Compromised on multi-faceted approach combining different methods',
    roundsToConsensus: 3,
    finalSimilarity: 0.86
  },
  {
    category: 'compromise',
    queryContext: 'Should AI development be regulated?',
    disagreement: 'Different views on regulation vs innovation',
    resolution: 'Compromised on balanced regulatory framework that protects without stifling innovation',
    roundsToConsensus: 4,
    finalSimilarity: 0.85
  }
];

/**
 * Seed initial examples into database
 */
export async function seedExamples(
  db: Pool,
  embeddingService: IEmbeddingService
): Promise<void> {
  const repository = new ExampleRepository(db, embeddingService);

  // Check if examples already exist
  const checkQuery = 'SELECT COUNT(*) FROM negotiation_examples';
  const countResult = await db.query(checkQuery);
  const existingCount = parseInt(countResult.rows[0].count, 10);

  if (existingCount > 0) {
    console.log(`[ExampleRepository] ${existingCount} examples already exist, skipping seed`);
    return;
  }

  console.log(`[ExampleRepository] Seeding ${INITIAL_EXAMPLES.length} initial examples`);

  for (const exampleData of INITIAL_EXAMPLES) {
    const example: NegotiationExample = {
      id: randomUUID(),
      ...exampleData,
      createdAt: new Date()
    };

    try {
      await repository.storeExample(example);
      console.log(`[ExampleRepository] Seeded example: ${example.category} - ${example.queryContext.substring(0, 50)}...`);
    } catch (error) {
      console.error(`[ExampleRepository] Failed to seed example: ${error}`);
    }
  }

  console.log('[ExampleRepository] Seed completed');
}

