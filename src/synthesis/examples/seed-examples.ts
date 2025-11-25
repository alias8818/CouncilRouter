/**
 * Seed script for negotiation examples
 * Populates the database with initial high-quality examples
 */

import { Pool } from 'pg';
import { EmbeddingService } from '../../embedding/service';
import { createClient } from 'redis';

const examples = [
  // Endorsement examples
  {
    category: 'endorsement',
    queryContext: 'User asks for best practices in error handling',
    disagreement: 'Member A suggests try-catch everywhere, Member B suggests error boundaries',
    resolution: 'I agree with Member B. Error boundaries provide better UX and prevent app crashes.',
    roundsToConsensus: 1,
    finalSimilarity: 0.92
  },
  {
    category: 'endorsement',
    queryContext: 'User asks about database selection for a web app',
    disagreement: 'Member A recommends PostgreSQL, Member B recommends MongoDB',
    resolution: 'I endorse Member A\'s PostgreSQL recommendation. The app needs ACID compliance.',
    roundsToConsensus: 1,
    finalSimilarity: 0.88
  },
  {
    category: 'endorsement',
    queryContext: 'User asks about authentication methods',
    disagreement: 'Member A suggests JWT, Member B suggests sessions',
    resolution: 'I support Member B. Session-based auth is more secure for this use case.',
    roundsToConsensus: 2,
    finalSimilarity: 0.85
  },

  // Refinement examples
  {
    category: 'refinement',
    queryContext: 'User asks how to optimize React performance',
    disagreement: 'Member A suggests React.memo, Member B suggests useMemo',
    resolution: 'Both approaches are valid. Use React.memo for component memoization and useMemo for expensive calculations within components.',
    roundsToConsensus: 2,
    finalSimilarity: 0.91
  },
  {
    category: 'refinement',
    queryContext: 'User asks about API design patterns',
    disagreement: 'Member A prefers REST, Member B prefers GraphQL',
    resolution: 'The choice depends on use case. REST for simple CRUD, GraphQL for complex data requirements with multiple relationships.',
    roundsToConsensus: 3,
    finalSimilarity: 0.87
  },
  {
    category: 'refinement',
    queryContext: 'User asks about testing strategies',
    disagreement: 'Member A emphasizes unit tests, Member B emphasizes integration tests',
    resolution: 'A balanced approach is best: unit tests for business logic (70%), integration tests for critical paths (20%), E2E for user flows (10%).',
    roundsToConsensus: 2,
    finalSimilarity: 0.89
  },
  {
    category: 'refinement',
    queryContext: 'User asks about state management in React',
    disagreement: 'Member A recommends Redux, Member B recommends Context API',
    resolution: 'For small apps, Context API is sufficient. For large apps with complex state, Redux or Zustand provides better developer experience.',
    roundsToConsensus: 2,
    finalSimilarity: 0.86
  },

  // Compromise examples
  {
    category: 'compromise',
    queryContext: 'User asks about code formatting rules',
    disagreement: 'Member A wants 2-space indentation, Member B wants 4-space',
    resolution: 'Let\'s use 2 spaces for better readability in nested code, but ensure consistent usage with Prettier.',
    roundsToConsensus: 2,
    finalSimilarity: 0.84
  },
  {
    category: 'compromise',
    queryContext: 'User asks about deployment frequency',
    disagreement: 'Member A suggests daily deployments, Member B suggests weekly',
    resolution: 'Let\'s deploy twice weekly to balance velocity with stability, with daily deployments for critical fixes.',
    roundsToConsensus: 3,
    finalSimilarity: 0.82
  },
  {
    category: 'compromise',
    queryContext: 'User asks about documentation standards',
    disagreement: 'Member A wants JSDoc for all functions, Member B wants minimal comments',
    resolution: 'Document public APIs and complex logic with JSDoc. Keep implementation details self-documenting through clear naming.',
    roundsToConsensus: 2,
    finalSimilarity: 0.86
  },
  {
    category: 'compromise',
    queryContext: 'User asks about code review requirements',
    disagreement: 'Member A requires 2 approvals, Member B requires 1',
    resolution: 'Require 1 approval for routine changes, 2 approvals for architectural changes or security-sensitive code.',
    roundsToConsensus: 2,
    finalSimilarity: 0.88
  },
  {
    category: 'compromise',
    queryContext: 'User asks about test coverage targets',
    disagreement: 'Member A wants 90% coverage, Member B wants 70%',
    resolution: 'Aim for 80% coverage with focus on critical paths. Don\'t sacrifice test quality for coverage metrics.',
    roundsToConsensus: 2,
    finalSimilarity: 0.85
  }
];

async function seedExamples() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'council_router',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres'
  });

  const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  await redis.connect();

  const embeddingService = new EmbeddingService(
    redis as any,
    process.env.OPENAI_API_KEY || ''
  );

  console.log('Seeding negotiation examples...');

  for (const example of examples) {
    try {
      // Generate embedding for query context
      const embedding = await embeddingService.embed(example.queryContext);

      // Insert into database
      await pool.query(
        `INSERT INTO negotiation_examples
         (category, query_context, disagreement, resolution, rounds_to_consensus, final_similarity, embedding, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          example.category,
          example.queryContext,
          example.disagreement,
          example.resolution,
          example.roundsToConsensus,
          example.finalSimilarity,
          JSON.stringify(embedding) // Store as JSONB for now
        ]
      );

      console.log(`✓ Seeded ${example.category} example: ${example.queryContext.substring(0, 50)}...`);
    } catch (error) {
      console.error(`✗ Failed to seed example: ${error}`);
    }
  }

  console.log(`\nSeeded ${examples.length} negotiation examples successfully!`);

  await pool.end();
  await redis.quit();
}

// Run if called directly
if (require.main === module) {
  seedExamples().catch(console.error);
}

export { seedExamples };
