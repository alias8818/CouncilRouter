/**
 * Embedding Service
 * Generates semantic embeddings and calculates similarity with caching and fallback
 */

import { IEmbeddingService } from '../interfaces/IEmbeddingService';
import { RedisClientType } from 'redis';
import crypto from 'crypto';
import { updateEmbeddingFailure } from '../monitoring/metrics';

export class EmbeddingService implements IEmbeddingService {
  private readonly defaultModel = 'text-embedding-3-large';
  private readonly cachePrefix = 'embedding';
  private readonly cacheTTL = 3600; // 1 hour in seconds
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openai.com/v1';
  private embeddingFailureCount = 0;
  private readonly MAX_FAILURES_BEFORE_FALLBACK = 3;

  constructor(
    private redis: RedisClientType,
    apiKey: string
  ) {
    this.apiKey = apiKey;
  }

  /**
   * Generate embedding vector for text with caching
   * @param text - Text to embed
   * @param model - Embedding model name (must be whitelisted)
   */
  async embed(
    text: string,
    model: string = this.defaultModel
  ): Promise<number[]> {
    // Validate model against whitelist
    const validModels = [
      'text-embedding-3-large',
      'text-embedding-3-small',
      'text-embedding-ada-002'
    ];
    if (!validModels.includes(model)) {
      throw new Error(
        `Invalid embedding model: ${model}. Must be one of: ${validModels.join(', ')}`
      );
    }
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
      console.warn(`[EmbeddingService] Cache read error: ${error}`);
    }

    // Generate embedding via API
    try {
      const embedding = await this.callEmbeddingAPI(text, model);

      // Cache the result
      try {
        await this.redis.setEx(
          cacheKey,
          this.cacheTTL,
          JSON.stringify(embedding)
        );
      } catch (error) {
        console.warn(`[EmbeddingService] Cache write error: ${error}`);
      }

      this.embeddingFailureCount = 0; // Reset failure count on success
      return embedding;
    } catch (error) {
      console.error(`[EmbeddingService] Embedding API failed: ${error}`);
      this.embeddingFailureCount++;

      // Fall back to TF-IDF if too many failures
      if (this.embeddingFailureCount >= this.MAX_FAILURES_BEFORE_FALLBACK) {
        console.warn(
          `[EmbeddingService] Falling back to TF-IDF after ${this.embeddingFailureCount} failures`
        );
        updateEmbeddingFailure(true);
        // Reset counter after fallback to allow future attempts
        this.embeddingFailureCount = 0;
        return this.fallbackToTfIdf(text);
      }

      // Track failure but don't fallback yet
      updateEmbeddingFailure(false);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      mag1 += embedding1[i] * embedding1[i];
      mag2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Calculate similarity between two texts, using structural code similarity for code responses
   * Requirement 4.3: Use structural code similarity metrics for code responses
   */
  async calculateTextSimilarity(
    text1: string,
    text2: string,
    model?: string
  ): Promise<number> {
    // Normalize both texts to ignore formatting differences (Requirement 4.6)
    const normalized1 = this.normalizeResponse(text1);
    const normalized2 = this.normalizeResponse(text2);

    // Detect if texts contain code
    const isCode1 = this.isCodeResponse(normalized1);
    const isCode2 = this.isCodeResponse(normalized2);

    if (isCode1 && isCode2) {
      // Both are code - use structural similarity
      return this.calculateCodeSimilarity(normalized1, normalized2, model);
    }

    // Regular text similarity using embeddings
    const embedding1 = await this.embed(normalized1, model);
    const embedding2 = await this.embed(normalized2, model);
    return this.cosineSimilarity(embedding1, embedding2);
  }

  /**
   * Normalize response to ignore formatting differences
   * Requirement 4.6: Normalize responses that don't affect semantic meaning
   */
  private normalizeResponse(text: string): string {
    let normalized = text;

    // Remove excessive whitespace (but preserve single spaces and newlines)
    normalized = normalized.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
    normalized = normalized.replace(/\n\s*\n\s*\n+/g, '\n\n'); // Multiple blank lines to double newline

    // Normalize markdown formatting
    // Convert different heading styles to consistent format
    normalized = normalized.replace(/^#+\s+/gm, ''); // Remove heading markers for comparison

    // Normalize list markers
    normalized = normalized.replace(/^\s*[-*+]\s+/gm, '- '); // Normalize bullet points
    normalized = normalized.replace(/^\s*\d+\.\s+/gm, '1. '); // Normalize numbered lists

    // Normalize code block markers (preserve content, normalize markers)
    normalized = normalized.replace(/```(\w+)?\n/g, '```\n'); // Remove language specifiers for comparison

    // Normalize quotes
    normalized = normalized.replace(/[""]/g, '"'); // Smart quotes to regular quotes
    normalized = normalized.replace(/['']/g, "'"); // Smart apostrophes to regular apostrophes

    // Trim leading/trailing whitespace from each line
    normalized = normalized
      .split('\n')
      .map((line) => line.trim())
      .join('\n');

    // Trim overall
    normalized = normalized.trim();

    return normalized;
  }

  /**
   * Detect if response contains code
   */
  private isCodeResponse(text: string): boolean {
    // Check for code indicators:
    // - Code blocks (```)
    // - Function declarations
    // - Class declarations
    // - Common programming keywords in context
    const codePatterns = [
      /```[\s\S]*?```/, // Code blocks
      /`[^`]+`/, // Inline code
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /class\s+\w+/,
      /def\s+\w+\s*\(/, // Python
      /public\s+class\s+\w+/, // Java
      /import\s+[\w.]+/,
      /from\s+\w+\s+import/
    ];

    return codePatterns.some((pattern) => pattern.test(text));
  }

  /**
   * Calculate structural similarity for code responses
   * Combines structural analysis with semantic embedding of comments/descriptions
   */
  private async calculateCodeSimilarity(
    code1: string,
    code2: string,
    model?: string
  ): Promise<number> {
    // Extract structural features
    const structure1 = this.extractCodeStructure(code1);
    const structure2 = this.extractCodeStructure(code2);

    // Calculate structural similarity (0-1)
    const structuralSimilarity = this.compareCodeStructures(
      structure1,
      structure2
    );

    // Extract comments and descriptions for semantic comparison
    const comments1 = this.extractComments(code1);
    const comments2 = this.extractComments(code2);

    let semanticSimilarity = 0.5; // Default if no comments
    if (comments1.length > 0 && comments2.length > 0) {
      try {
        const commentText1 = comments1.join(' ');
        const commentText2 = comments2.join(' ');
        const embedding1 = await this.embed(commentText1, model);
        const embedding2 = await this.embed(commentText2, model);
        semanticSimilarity = this.cosineSimilarity(embedding1, embedding2);
      } catch (error) {
        console.warn(
          '[EmbeddingService] Failed to compute semantic similarity for comments:',
          error
        );
      }
    }

    // Combine structural (70%) and semantic (30%) similarity
    const combinedSimilarity =
      structuralSimilarity * 0.7 + semanticSimilarity * 0.3;
    return combinedSimilarity;
  }

  /**
   * Extract structural features from code
   */
  private extractCodeStructure(code: string): {
    functions: string[];
    classes: string[];
    imports: string[];
    variables: string[];
  } {
    const structure = {
      functions: [] as string[],
      classes: [] as string[],
      imports: [] as string[],
      variables: [] as string[]
    };

    // Extract function names
    const functionMatches = code.matchAll(/(?:function|def)\s+(\w+)/g);
    for (const match of functionMatches) {
      structure.functions.push(match[1]);
    }

    // Extract class names
    const classMatches = code.matchAll(/class\s+(\w+)/g);
    for (const match of classMatches) {
      structure.classes.push(match[1]);
    }

    // Extract imports
    const importMatches = code.matchAll(/(?:import|from)\s+([\w.]+)/g);
    for (const match of importMatches) {
      structure.imports.push(match[1]);
    }

    // Extract variable declarations
    const varMatches = code.matchAll(/(?:const|let|var)\s+(\w+)/g);
    for (const match of varMatches) {
      structure.variables.push(match[1]);
    }

    return structure;
  }

  /**
   * Compare code structures for similarity
   */
  private compareCodeStructures(
    struct1: ReturnType<typeof this.extractCodeStructure>,
    struct2: ReturnType<typeof this.extractCodeStructure>
  ): number {
    const functionSim = this.jaccardSimilarity(
      struct1.functions,
      struct2.functions
    );
    const classSim = this.jaccardSimilarity(struct1.classes, struct2.classes);
    const importSim = this.jaccardSimilarity(struct1.imports, struct2.imports);
    const variableSim = this.jaccardSimilarity(
      struct1.variables,
      struct2.variables
    );

    // Weighted average (functions and classes are more important)
    const similarity =
      functionSim * 0.4 +
      classSim * 0.3 +
      importSim * 0.15 +
      variableSim * 0.15;

    return similarity;
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  private jaccardSimilarity(set1: string[], set2: string[]): number {
    if (set1.length === 0 && set2.length === 0) {
      return 1.0;
    }

    const s1 = new Set(set1);
    const s2 = new Set(set2);

    const intersection = new Set([...s1].filter((x) => s2.has(x)));
    const union = new Set([...s1, ...s2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Extract comments from code
   */
  private extractComments(code: string): string[] {
    const comments: string[] = [];

    // Single-line comments (// or #)
    const singleLineMatches = code.matchAll(/(?:\/\/|#)\s*(.+)$/gm);
    for (const match of singleLineMatches) {
      comments.push(match[1].trim());
    }

    // Multi-line comments (/* */ or """ """)
    const multiLineMatches = code.matchAll(/\/\*[\s\S]*?\*\/|"""[\s\S]*?"""/g);
    for (const match of multiLineMatches) {
      const comment = match[0]
        .replace(/^\/\*|\*\/$/g, '')
        .replace(/^"""|"""$/g, '')
        .trim();
      comments.push(comment);
    }

    return comments;
  }

  /**
   * Batch embed multiple texts efficiently
   * @param texts - Array of texts to embed
   * @param model - Embedding model name (must be whitelisted)
   */
  async batchEmbed(
    texts: string[],
    model: string = this.defaultModel
  ): Promise<number[][]> {
    // Validate model against whitelist
    const validModels = [
      'text-embedding-3-large',
      'text-embedding-3-small',
      'text-embedding-ada-002'
    ];
    if (!validModels.includes(model)) {
      throw new Error(
        `Invalid embedding model: ${model}. Must be one of: ${validModels.join(', ')}`
      );
    }
    // Check cache for all texts first
    const cacheKeys = texts.map((text) => this.generateCacheKey(text, model));
    const cachedResults: (number[] | null)[] = [];
    let uncachedIndices: number[] = [];
    let uncachedTexts: string[] = [];

    try {
      for (let i = 0; i < cacheKeys.length; i++) {
        const cached = await this.redis.get(cacheKeys[i]);
        if (cached) {
          cachedResults[i] = JSON.parse(cached);
        } else {
          cachedResults[i] = null;
          uncachedIndices.push(i);
          uncachedTexts.push(texts[i]);
        }
      }
    } catch (error) {
      console.warn(`[EmbeddingService] Batch cache read error: ${error}`);
      // If cache fails, embed all texts
      uncachedIndices = Array.from({ length: texts.length }, (_, i) => i);
      uncachedTexts = texts;
    }

    // If all cached, return early
    if (uncachedTexts.length === 0) {
      return cachedResults as number[][];
    }

    // Batch embed uncached texts
    try {
      const embeddings = await this.callBatchEmbeddingAPI(uncachedTexts, model);

      // Cache the results
      try {
        for (let i = 0; i < uncachedIndices.length; i++) {
          const idx = uncachedIndices[i];
          const cacheKey = cacheKeys[idx];
          await this.redis.setEx(
            cacheKey,
            this.cacheTTL,
            JSON.stringify(embeddings[i])
          );
          cachedResults[idx] = embeddings[i];
        }
      } catch (error) {
        console.warn(`[EmbeddingService] Batch cache write error: ${error}`);
      }

      this.embeddingFailureCount = 0; // Reset failure count on success
      return cachedResults as number[][];
    } catch (error) {
      console.error(`[EmbeddingService] Batch embedding API failed: ${error}`);
      this.embeddingFailureCount++;

      // Fall back to TF-IDF if too many failures
      if (this.embeddingFailureCount >= this.MAX_FAILURES_BEFORE_FALLBACK) {
        console.warn(
          `[EmbeddingService] Falling back to TF-IDF for batch after ${this.embeddingFailureCount} failures`
        );
        return uncachedTexts.map((text) => this.fallbackToTfIdf(text));
      }

      throw error;
    }
  }

  /**
   * Queue embedding request for asynchronous processing
   * Note: This is a simplified implementation - in production, use a proper job queue
   */
  async queueEmbed(
    text: string,
    model: string = this.defaultModel,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<string> {
    // Generate job ID
    const jobId = crypto.randomUUID();

    // Store job metadata in Redis
    const jobKey = `embedding:job:${jobId}`;
    const jobData = {
      text,
      model,
      priority,
      status: 'queued',
      createdAt: new Date().toISOString()
    };

    try {
      await this.redis.setEx(jobKey, 3600, JSON.stringify(jobData));

      // Process immediately (simplified - in production, use a worker)
      this.processEmbeddingJob(jobId, text, model).catch((error) => {
        console.error(
          `[EmbeddingService] Job ${jobId} processing failed: ${error}`
        );
      });

      return jobId;
    } catch (error) {
      console.error(`[EmbeddingService] Failed to queue embedding: ${error}`);
      throw error;
    }
  }

  /**
   * Retrieve embedding result from queue
   */
  async getEmbeddingResult(jobId: string): Promise<number[] | null> {
    const jobKey = `embedding:job:${jobId}`;
    const resultKey = `embedding:result:${jobId}`;

    try {
      const result = await this.redis.get(resultKey);
      if (result) {
        return JSON.parse(result);
      }

      // Check if job is still processing
      const jobData = await this.redis.get(jobKey);
      if (jobData) {
        const job = JSON.parse(jobData);
        if (job.status === 'processing' || job.status === 'queued') {
          return null; // Still processing
        }
      }

      return null;
    } catch (error) {
      console.error(
        `[EmbeddingService] Failed to get embedding result: ${error}`
      );
      return null;
    }
  }

  /**
   * Call OpenAI embedding API
   */
  private async callEmbeddingAPI(
    text: string,
    model: string
  ): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        input: text,
        model: model
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('Invalid embedding API response');
    }

    return data.data[0].embedding;
  }

  /**
   * Call OpenAI batch embedding API
   */
  private async callBatchEmbeddingAPI(
    texts: string[],
    model: string
  ): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        input: texts,
        model: model
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Batch embedding API error: ${response.status} ${errorText}`
      );
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid batch embedding API response');
    }

    return data.data.map((item: { embedding: number[] }) => item.embedding);
  }

  /**
   * Fallback to TF-IDF when embedding API fails
   */
  private fallbackToTfIdf(text: string): number[] {
    console.log('[EmbeddingService] Using TF-IDF fallback');

    // Tokenize text
    const terms = this.tokenize(text);

    // Create a simple TF vector (normalized term frequencies)
    const tf = new Map<string, number>();
    terms.forEach((term) => {
      tf.set(term, (tf.get(term) || 0) + 1);
    });

    // Normalize
    if (terms.length > 0) {
      tf.forEach((count, term) => tf.set(term, count / terms.length));
    }

    // Convert to fixed-size vector (use hash of term to index)
    // For simplicity, use a 1536-dimensional vector (same as text-embedding-3-large)
    const vector = new Array(1536).fill(0);
    const vectorSize = vector.length;

    tf.forEach((value, term) => {
      // Hash term to index
      const hash = this.simpleHash(term);
      const index = Math.abs(hash) % vectorSize;
      vector[index] += value;
    });

    // Normalize vector
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  /**
   * Tokenize text into terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter((term) => term.length > 0);
  }

  /**
   * Simple hash function for term to index mapping
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Generate cache key for embedding
   */
  private generateCacheKey(text: string, model: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${model}:${text}`)
      .digest('hex');
    return `${this.cachePrefix}:${model}:${hash}`;
  }

  /**
   * Process embedding job asynchronously
   */
  private async processEmbeddingJob(
    jobId: string,
    text: string,
    model: string
  ): Promise<void> {
    const jobKey = `embedding:job:${jobId}`;
    const resultKey = `embedding:result:${jobId}`;

    try {
      // Update job status
      const jobData = {
        text,
        model,
        status: 'processing',
        createdAt: new Date().toISOString()
      };
      await this.redis.setEx(jobKey, 3600, JSON.stringify(jobData));

      // Generate embedding
      const embedding = await this.embed(text, model);

      // Store result
      await this.redis.setEx(resultKey, 3600, JSON.stringify(embedding));

      // Update job status
      jobData.status = 'completed';
      await this.redis.setEx(jobKey, 3600, JSON.stringify(jobData));
    } catch (error) {
      console.error(`[EmbeddingService] Job ${jobId} failed: ${error}`);

      // Update job status
      const jobData = {
        text,
        model,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        createdAt: new Date().toISOString()
      };
      await this.redis.setEx(jobKey, 3600, JSON.stringify(jobData));
    }
  }
}
