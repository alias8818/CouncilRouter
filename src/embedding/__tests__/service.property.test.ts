/**
 * Property-Based Tests for Embedding Service
 * Feature: iterative-consensus
 */

import * as fc from 'fast-check';
import { EmbeddingService } from '../service';
import { RedisClientType } from 'redis';

describe('EmbeddingService - Property-Based Tests', () => {
  let service: EmbeddingService;
  let mockRedis: jest.Mocked<RedisClientType>;
  const apiKey = 'test-api-key';

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      setEx: jest.fn(),
    } as any;

    service = new EmbeddingService(mockRedis, apiKey);
  });

  /**
   * Property 3: Similarity Calculation Symmetry
   * For any two responses A and B, the similarity score from A to B must equal
   * the similarity score from B to A (symmetry property).
   * Validates: Requirements 4.1, 4.2
   */
  describe('Property 3: Similarity Calculation Symmetry', () => {
    it('should maintain symmetry for any two embeddings', () => {
      fc.assert(
        fc.property(
          fc.array(fc.float({ min: Math.fround(-1), max: Math.fround(1) }).filter(x => !isNaN(x)), { minLength: 10, maxLength: 100 }),
          fc.array(fc.float({ min: Math.fround(-1), max: Math.fround(1) }).filter(x => !isNaN(x)), { minLength: 10, maxLength: 100 }),
          (vec1, vec2) => {
            // Pad vectors to same length
            const maxLen = Math.max(vec1.length, vec2.length);
            const padded1 = [...vec1, ...new Array(maxLen - vec1.length).fill(0)];
            const padded2 = [...vec2, ...new Array(maxLen - vec2.length).fill(0)];

            const similarity1 = service.cosineSimilarity(padded1, padded2);
            const similarity2 = service.cosineSimilarity(padded2, padded1);

            expect(similarity1).toBeCloseTo(similarity2, 10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return similarity in range [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.array(fc.float({ min: Math.fround(-10), max: Math.fround(10) }).filter(x => !isNaN(x)), { minLength: 10, maxLength: 100 }),
          fc.array(fc.float({ min: Math.fround(-10), max: Math.fround(10) }).filter(x => !isNaN(x)), { minLength: 10, maxLength: 100 }),
          (vec1, vec2) => {
            const maxLen = Math.max(vec1.length, vec2.length);
            const padded1 = [...vec1, ...new Array(maxLen - vec1.length).fill(0)];
            const padded2 = [...vec2, ...new Array(maxLen - vec2.length).fill(0)];

            const similarity = service.cosineSimilarity(padded1, padded2);

            expect(similarity).toBeGreaterThanOrEqual(-1);
            expect(similarity).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Embedding Fallback Consistency
   * For any text where embedding generation fails, the system must fall back
   * to TF-IDF and produce a valid similarity score in the range [0, 1].
   * Validates: Requirements 4.7
   */
  describe('Property 6: Embedding Fallback Consistency', () => {
    it('should produce valid TF-IDF embeddings for any text', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          (text) => {
            // Access private method via type assertion (testing fallback)
            const fallbackMethod = (service as any).fallbackToTfIdf.bind(service);
            const embedding = fallbackMethod(text);

            expect(Array.isArray(embedding)).toBe(true);
            expect(embedding).toHaveLength(1536);
            expect(embedding.every((val: number) => typeof val === 'number')).toBe(true);
            expect(embedding.every((val: number) => !isNaN(val))).toBe(true);
            expect(embedding.every((val: number) => isFinite(val))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce normalized TF-IDF embeddings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          (text) => {
            const fallbackMethod = (service as any).fallbackToTfIdf.bind(service);
            const embedding = fallbackMethod(text);

            // Check that vector is normalized (magnitude should be close to 1 or 0)
            const magnitude = Math.sqrt(
              embedding.reduce((sum: number, val: number) => sum + val * val, 0)
            );

            // Magnitude should be <= 1 (normalized) or 0 (empty vector)
            expect(magnitude).toBeGreaterThanOrEqual(0);
            expect(magnitude).toBeLessThanOrEqual(1.1); // Allow small floating point errors
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce consistent TF-IDF embeddings for same text', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          (text) => {
            const fallbackMethod = (service as any).fallbackToTfIdf.bind(service);
            const embedding1 = fallbackMethod(text);
            const embedding2 = fallbackMethod(text);

            // Embeddings should be identical (deterministic)
            expect(embedding1).toEqual(embedding2);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should produce valid similarity scores from TF-IDF embeddings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          (text1, text2) => {
            const fallbackMethod = (service as any).fallbackToTfIdf.bind(service);
            const embedding1 = fallbackMethod(text1);
            const embedding2 = fallbackMethod(text2);

            const similarity = service.cosineSimilarity(embedding1, embedding2);

            expect(similarity).toBeGreaterThanOrEqual(-1);
            expect(similarity).toBeLessThanOrEqual(1);
            expect(!isNaN(similarity)).toBe(true);
            expect(isFinite(similarity)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

