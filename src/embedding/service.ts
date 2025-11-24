/**
 * Embedding Service
 * Generates semantic embeddings and calculates similarity with caching and fallback
 */

import { IEmbeddingService } from '../interfaces/IEmbeddingService';
import { RedisClientType } from 'redis';
import crypto from 'crypto';

export class EmbeddingService implements IEmbeddingService {
  private readonly defaultModel = 'text-embedding-3-large';
  private readonly cachePrefix = 'embedding';
  private readonly cacheTTL = 3600; // 1 hour in seconds
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openai.com/v1';

  constructor(
    private redis: RedisClientType,
    apiKey: string
  ) {
    this.apiKey = apiKey;
  }

  /**
   * Generate embedding vector for text with caching
   */
  async embed(text: string, model: string = this.defaultModel): Promise<number[]> {
    // Generate cache key
    const cacheKey = this.generateCacheKey(text, model);

    // Try cache first
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        console.log(`[EmbeddingService] Cache hit for model ${model}`);
        return JSON.parse(cached);
      }
      console.log(`[EmbeddingService] Cache miss for model ${model}`);
    } catch (error) {
      console.warn(`[EmbeddingS