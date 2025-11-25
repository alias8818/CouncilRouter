/**
 * Embedding Service Unit Tests
 */

import { EmbeddingService } from "../service";
import { RedisClientType } from "redis";

describe("EmbeddingService", () => {
  let service: EmbeddingService;
  let mockRedis: jest.Mocked<RedisClientType>;
  const apiKey = "test-api-key";

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      setEx: jest.fn(),
    } as any;

    service = new EmbeddingService(mockRedis, apiKey);

    // Reset all mocks including fetch
    jest.clearAllMocks();
  });

  describe("embed", () => {
    it("should return cached embedding if available", async () => {
      const cachedEmbedding = [0.1, 0.2, 0.3];
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedEmbedding));

      const result = await service.embed("test text");

      expect(result).toEqual(cachedEmbedding);
      expect(mockRedis.get).toHaveBeenCalledWith(
        expect.stringContaining("embedding:text-embedding-3-large:"),
      );
    });

    it("should call API and cache result when not cached", async () => {
      mockRedis.get.mockResolvedValue(null);

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              embedding: [0.1, 0.2, 0.3],
            },
          ],
        }),
      });

      mockRedis.setEx.mockResolvedValue("OK");

      const result = await service.embed("test text");

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockRedis.setEx).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should fall back to TF-IDF after multiple failures", async () => {
      mockRedis.get.mockResolvedValue(null);

      // Mock fetch to fail consistently
      global.fetch = jest.fn().mockRejectedValue(new Error("API error"));

      // Call embed 3 times to reach failure threshold
      // The 3rd call should trigger fallback and return TF-IDF result
      for (let i = 0; i < 2; i++) {
        try {
          await service.embed("test text");
        } catch (error) {
          // Expected to fail first 2 times
        }
      }

      // The 3rd call should fall back to TF-IDF and succeed
      const result = await service.embed("test text");
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0); // TF-IDF vector size varies
    });
  });

  describe("cosineSimilarity", () => {
    it("should calculate cosine similarity correctly", () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0, 0];

      const similarity = service.cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it("should return 0 for orthogonal vectors", () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];

      const similarity = service.cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it("should throw error for different dimension vectors", () => {
      const vec1 = [1, 0];
      const vec2 = [1, 0, 0];

      expect(() => service.cosineSimilarity(vec1, vec2)).toThrow();
    });

    it("should return 0 for zero vectors", () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 0, 0];

      const similarity = service.cosineSimilarity(vec1, vec2);
      expect(similarity).toBe(0);
    });
  });

  describe("batchEmbed", () => {
    it("should return cached embeddings when all are cached", async () => {
      const cached1 = [0.1, 0.2, 0.3];
      const cached2 = [0.4, 0.5, 0.6];

      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(cached1))
        .mockResolvedValueOnce(JSON.stringify(cached2));

      const result = await service.batchEmbed(["text1", "text2"]);

      expect(result).toEqual([cached1, cached2]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should batch embed uncached texts", async () => {
      mockRedis.get.mockResolvedValue(null);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.4, 0.5, 0.6] },
          ],
        }),
      });

      mockRedis.setEx.mockResolvedValue("OK");

      const result = await service.batchEmbed(["text1", "text2"]);

      expect(result).toHaveLength(2);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("queueEmbed", () => {
    it("should queue embedding job and return job ID", async () => {
      mockRedis.setEx.mockResolvedValue("OK");
      mockRedis.get.mockResolvedValue(null);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      });

      const jobId = await service.queueEmbed("test text");

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
    });
  });

  describe("getEmbeddingResult", () => {
    it("should return embedding when job is complete", async () => {
      const embedding = [0.1, 0.2, 0.3];
      mockRedis.get.mockResolvedValue(JSON.stringify(embedding));

      const result = await service.getEmbeddingResult("job-id");

      expect(result).toEqual(embedding);
    });

    it("should return null when job is still processing", async () => {
      const jobData = {
        status: "processing",
        text: "test",
        model: "text-embedding-3-large",
      };
      mockRedis.get
        .mockResolvedValueOnce(null) // result key
        .mockResolvedValueOnce(JSON.stringify(jobData)); // job key

      const result = await service.getEmbeddingResult("job-id");

      expect(result).toBeNull();
    });
  });
});
