/**
 * Embedding Service Interface
 * Handles semantic embedding generation and similarity calculation
 */

export interface IEmbeddingService {
  /**
   * Generate embedding vector for text
   * @param text - Input text
   * @param model - Embedding model (default: text-embedding-3-large)
   * @returns Embedding vector
   */
  embed(text: string, model?: string): Promise<number[]>;

  /**
   * Calculate cosine similarity between embeddings
   * @param embedding1 - First embedding vector
   * @param embedding2 - Second embedding vector
   * @returns Similarity score [0, 1]
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number;

  /**
   * Batch embed multiple texts
   * @param texts - Array of texts
   * @param model - Embedding model
   * @returns Array of embedding vectors
   */
  batchEmbed(texts: string[], model?: string): Promise<number[][]>;

  /**
   * Queue embedding request for asynchronous processing
   * @param text - Input text
   * @param model - Embedding model
   * @param priority - Queue priority (default: normal)
   * @returns Job ID for tracking
   */
  queueEmbed(text: string, model?: string, priority?: 'high' | 'normal' | 'low'): Promise<string>;

  /**
   * Retrieve embedding result from queue
   * @param jobId - Job ID from queueEmbed
   * @returns Embedding vector or null if not ready
   */
  getEmbeddingResult(jobId: string): Promise<number[] | null>;
}
