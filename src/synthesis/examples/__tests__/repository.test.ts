/**
 * Example Repository Unit Tests
 */

import { ExampleRepository } from '../repository';
import { IEmbeddingService } from '../../../interfaces/IEmbeddingService';
import { NegotiationExample } from '../../../types/core';
import { Pool } from 'pg';

describe('ExampleRepository', () => {
  let repository: ExampleRepository;
  let mockDb: jest.Mocked<Pool>;
  let mockEmbeddingService: jest.Mocked<IEmbeddingService>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    } as any;

    mockEmbeddingService = {
      embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as any;

    repository = new ExampleRepository(mockDb, mockEmbeddingService);
  });

  describe('storeExample', () => {
    it('should store example with anonymization', async () => {
      const example: NegotiationExample = {
        id: 'test-id',
        category: 'endorsement',
        queryContext: 'Contact john.doe@example.com',
        disagreement: 'Different views',
        resolution: 'Agreed on solution',
        roundsToConsensus: 1,
        finalSimilarity: 0.95,
        createdAt: new Date()
      };

      mockDb.query.mockResolvedValue({ rows: [] } as any);

      await repository.storeExample(example);

      expect(mockDb.query).toHaveBeenCalled();
      const callArgs = mockDb.query.mock.calls[0][1];
      expect(callArgs[2]).not.toContain('@example.com'); // Should be anonymized
      expect(callArgs[2]).toContain('[EMAIL]');
    });
  });

  describe('getRelevantExamples', () => {
    it('should retrieve examples using embedding similarity', async () => {
      const mockRows = [
        {
          id: 'ex1',
          category: 'endorsement',
          query_context: 'test context',
          disagreement: 'test disagreement',
          resolution: 'test resolution',
          rounds_to_consensus: 1,
          final_similarity: '0.95',
          created_at: new Date()
        }
      ];

      mockDb.query.mockResolvedValue({ rows: mockRows } as any);
      mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);

      const examples = await repository.getRelevantExamples('test query', 2);

      expect(examples).toHaveLength(1);
      expect(examples[0].category).toBe('endorsement');
      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('test query');
    });

    it('should fallback to category search on vector search failure', async () => {
      mockDb.query
        .mockRejectedValueOnce(new Error('Vector search failed'))
        .mockResolvedValueOnce({ rows: [] } as any);

      await repository.getRelevantExamples('test query');

      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('getExamplesByCategory', () => {
    it('should retrieve examples by category', async () => {
      const mockRows = [
        {
          id: 'ex1',
          category: 'endorsement',
          query_context: 'test',
          disagreement: 'test',
          resolution: 'test',
          rounds_to_consensus: 1,
          final_similarity: '0.95',
          created_at: new Date()
        }
      ];

      mockDb.query.mockResolvedValue({ rows: mockRows } as any);

      const examples = await repository.getExamplesByCategory('endorsement', 2);

      expect(examples).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE category = $1'),
        ['endorsement', 2]
      );
    });
  });
});

