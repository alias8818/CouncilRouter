/**
 * Session Manager
 * Manages conversation sessions and context
 */

import { ISessionManager } from '../interfaces/ISessionManager';
import {
  Session,
  HistoryEntry,
  ConversationContext,
  Duration
} from '../types/core';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { randomUUID } from 'crypto';
import { encoding_for_model, Tiktoken } from '@dqbd/tiktoken';

export class SessionManager implements ISessionManager {
  private db: Pool;
  private redis: RedisClientType;
  private readonly SESSION_TTL = 2592000; // 30 days in seconds
  private readonly TOKENS_PER_MESSAGE_ESTIMATE = 100; // Rough estimate for token counting

  // Cache encoders per model to avoid repeated initialization
  private encoders: Map<string, Tiktoken> = new Map();
  private encoderAliases: Map<string, string> = new Map();
  private readonly FALLBACK_ENCODER_MODEL = 'gpt-4o';

  constructor(db: Pool, redis: RedisClientType) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Get an existing session by ID
   * First checks Redis cache, falls back to database
   */
  async getSession(sessionId: string): Promise<Session | null> {
    // Try to get from Redis cache first
    const cachedSession = await this.getSessionFromCache(sessionId);
    if (cachedSession) {
      return cachedSession;
    }

    // Fall back to database
    const dbSession = await this.getSessionFromDatabase(sessionId);
    if (dbSession) {
      // Cache it for future requests
      await this.cacheSession(dbSession);
      return dbSession;
    }

    return null;
  }

  /**
   * Create a new session for a user
   */
  async createSession(userId: string): Promise<Session> {
    const session: Session = {
      id: randomUUID(),
      userId,
      history: [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
      contextWindowUsed: 0
    };

    // Store in database
    await this.db.query(
      `INSERT INTO sessions (id, user_id, created_at, last_activity_at, context_window_used, expired)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.id, session.userId, session.createdAt, session.lastActivityAt, session.contextWindowUsed, false]
    );

    // Cache in Redis
    await this.cacheSession(session);

    return session;
  }

  /**
   * Add an entry to session history
   * Uses database transaction to ensure atomic read-modify-write
   */
  async addToHistory(sessionId: string, entry: HistoryEntry): Promise<void> {
    const client = await this.db.connect();

    try {
      // Begin transaction
      await client.query('BEGIN');

      // Add to database
      await client.query(
        `INSERT INTO session_history (id, session_id, role, content, request_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), sessionId, entry.role, entry.content, entry.requestId || null, entry.timestamp]
      );

      // Update session last activity and context window
      const tokenEstimate = this.estimateTokens(entry.content);
      await client.query(
        `UPDATE sessions 
         SET last_activity_at = $1, context_window_used = context_window_used + $2
         WHERE id = $3`,
        [new Date(), tokenEstimate, sessionId]
      );

      // Read session with lock to prevent concurrent modifications
      const sessionResult = await client.query(
        `SELECT id, user_id, created_at, last_activity_at, context_window_used, expired
         FROM sessions
         WHERE id = $1 AND expired = false
         FOR UPDATE`,
        [sessionId]
      );

      if (sessionResult.rows.length > 0) {
        const sessionRow = sessionResult.rows[0];

        // Get history within the same transaction
        const historyResult = await client.query(
          `SELECT role, content, request_id, created_at
           FROM session_history
           WHERE session_id = $1
           ORDER BY created_at ASC`,
          [sessionId]
        );

        const history: HistoryEntry[] = historyResult.rows.map(row => ({
          role: row.role as 'user' | 'assistant',
          content: row.content,
          timestamp: row.created_at,
          requestId: row.request_id || undefined
        }));

        const session: Session = {
          id: sessionRow.id,
          userId: sessionRow.user_id,
          history,
          createdAt: sessionRow.created_at,
          lastActivityAt: sessionRow.last_activity_at,
          contextWindowUsed: sessionRow.context_window_used
        };

        // Commit transaction before caching
        await client.query('COMMIT');

        // Update cache with the consistent session data
        await this.cacheSession(session);
      } else {
        await client.query('COMMIT');
      }
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Release the client back to the pool
      client.release();
    }
  }

  /**
   * Get conversation context for a request, respecting token limits
   */
  async getContextForRequest(
    sessionId: string,
    maxTokens: number
  ): Promise<ConversationContext> {
    const session = await this.getSession(sessionId);

    if (!session || session.history.length === 0) {
      return {
        messages: [],
        totalTokens: 0,
        summarized: false
      };
    }

    // If context window is within limits, return all history
    if (session.contextWindowUsed <= maxTokens) {
      return {
        messages: session.history,
        totalTokens: session.contextWindowUsed,
        summarized: false
      };
    }

    // Need to summarize - keep most recent messages and summarize older ones
    const messages: HistoryEntry[] = [];
    let totalTokens = 0;
    let summarized = false;

    // Work backwards from most recent messages
    for (let i = session.history.length - 1; i >= 0; i--) {
      const entry = session.history[i];
      const entryTokens = this.estimateTokens(entry.content);

      if (totalTokens + entryTokens <= maxTokens) {
        messages.unshift(entry);
        totalTokens += entryTokens;
      } else {
        // Summarize remaining older messages
        const olderMessages = session.history.slice(0, i + 1);
        const summary = this.summarizeMessages(olderMessages, {
          maxTokens,
          remainingBudget: Math.max(0, maxTokens - totalTokens)
        });
        const summaryContent = `[Summary of earlier conversation: ${summary}]`;
        const summaryTokens = this.estimateTokens(summaryContent);

        // If summary would overflow the budget, drop oldest retained messages first
        while (messages.length > 0 && totalTokens + summaryTokens > maxTokens) {
          const removed = messages.shift();
          if (!removed) {
            break;
          }
          totalTokens -= this.estimateTokens(removed.content);
        }

        messages.unshift({
          role: 'assistant',
          content: summaryContent,
          timestamp: olderMessages[0].timestamp
        });
        totalTokens += summaryTokens;
        summarized = true;
        break;
      }
    }

    return {
      messages,
      totalTokens,
      summarized
    };
  }

  /**
   * Expire inactive sessions
   */
  async expireInactiveSessions(inactivityThreshold: Duration): Promise<number> {
    const thresholdDate = new Date(Date.now() - inactivityThreshold);

    const result = await this.db.query(
      `UPDATE sessions 
       SET expired = true 
       WHERE last_activity_at < $1 AND expired = false
       RETURNING id`,
      [thresholdDate]
    );

    // Remove expired sessions from cache (both metadata and history)
    for (const row of result.rows) {
      await this.redis.del(`session:${row.id}`);
      await this.redis.del(`session:${row.id}:history`);
    }

    return result.rowCount || 0;
  }

  /**
   * Get session from Redis cache
   * Reconstructs session from metadata and incremental history entries
   */
  private async getSessionFromCache(sessionId: string): Promise<Session | null> {
    const key = `session:${sessionId}`;
    const historyKey = `session:${sessionId}:history`;

    // Get session metadata
    const data = await this.redis.hGetAll(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    // Get history entries from list (incremental storage)
    const historyEntries = await this.redis.lRange(historyKey, 0, -1).catch(() => []);
    const history: HistoryEntry[] = historyEntries.map(entry => JSON.parse(entry));

    return {
      id: sessionId,
      userId: data.userId,
      history,
      createdAt: new Date(data.createdAt),
      lastActivityAt: new Date(data.lastActivityAt),
      contextWindowUsed: parseInt(data.contextWindowUsed, 10)
    };
  }

  /**
   * Get session from database
   * @param forUpdate - If true, uses SELECT FOR UPDATE to lock the row
   */
  private async getSessionFromDatabase(sessionId: string, forUpdate: boolean = false): Promise<Session | null> {
    const lockClause = forUpdate ? 'FOR UPDATE' : '';
    const sessionResult = await this.db.query(
      `SELECT id, user_id, created_at, last_activity_at, context_window_used, expired
       FROM sessions
       WHERE id = $1 AND expired = false
       ${lockClause}`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return null;
    }

    const sessionRow = sessionResult.rows[0];

    // Get history
    const historyResult = await this.db.query(
      `SELECT role, content, request_id, created_at
       FROM session_history
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    const history: HistoryEntry[] = historyResult.rows.map(row => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
      timestamp: row.created_at,
      requestId: row.request_id || undefined
    }));

    return {
      id: sessionRow.id,
      userId: sessionRow.user_id,
      history,
      createdAt: sessionRow.created_at,
      lastActivityAt: sessionRow.last_activity_at,
      contextWindowUsed: sessionRow.context_window_used
    };
  }

  /**
     * Cache session in Redis
     * Uses incremental updates: stores history entries separately to avoid O(N^2) behavior
     * WATCH/EXEC ensures existing length is read atomically with writes
     *
     * This implementation uses Redis WATCH/EXEC to prevent race conditions between lLen check
     * and rPush operations. For mocked Redis clients (e.g., unit tests) that do not support
     * WATCH/UNWATCH, we fall back to a simple pipeline execution.
     *
     * CRITICAL FIX: Length is read BEFORE WATCH to prevent race conditions where length
     * is read after WATCH but before EXEC, during which time it could change.
     */
  private async cacheSession(session: Session): Promise<void> {
    const key = `session:${session.id}`;
    const historyKey = `session:${session.id}:history`;
    const MAX_ATTEMPTS = 5;

    const buildPipeline = (existingLength: number) => {
      const pipeline = this.redis.multi();

      pipeline.hSet(key, {
        userId: session.userId,
        createdAt: session.createdAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
        contextWindowUsed: session.contextWindowUsed.toString(),
        historyLength: session.history.length.toString()
      });

      if (session.history.length > existingLength) {
        const newEntries = session.history.slice(existingLength);
        if (newEntries.length > 0) {
          pipeline.rPush(historyKey, newEntries.map(e => JSON.stringify(e)));
        }
      } else if (session.history.length < existingLength) {
        pipeline.del(historyKey);
        if (session.history.length > 0) {
          pipeline.rPush(historyKey, session.history.map(e => JSON.stringify(e)));
        }
      }

      pipeline.expire(key, this.SESSION_TTL);
      pipeline.expire(historyKey, this.SESSION_TTL);

      return pipeline;
    };

    // Fallback for mocked Redis clients (e.g., unit tests) that do not support WATCH/UNWATCH
    if (typeof this.redis.watch !== 'function') {
      const existingLength = await this.redis.lLen(historyKey).catch(() => 0);
      const pipeline = buildPipeline(existingLength);
      await pipeline.exec();
      return;
    }

    const safeUnwatch = async () => {
      if (typeof this.redis.unwatch === 'function') {
        try {
          await this.redis.unwatch();
        } catch {
          // Ignore unwatch errors to avoid masking original issue
        }
      }
    };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        // CRITICAL FIX: WATCH must be called BEFORE reading the value
        // This ensures any modifications after WATCH is set will be detected
        await this.redis.watch(historyKey);

        // Now read the existing length after WATCH is set
        // If historyKey was modified after WATCH, EXEC will fail and we retry
        const existingLength = await this.redis.lLen(historyKey).catch(() => 0);

        // Build pipeline based on the length we read after WATCH
        const pipeline = buildPipeline(existingLength);

        const result = await pipeline.exec();
        if (result !== null) {
          return;
        }
      } catch (error) {
        await safeUnwatch();
        throw error;
      }

      // Retry if transaction was aborted
      await safeUnwatch();
    }

    throw new Error('Failed to cache session after multiple attempts due to concurrent updates.');
  }

  /**
   * Get or create a tiktoken encoder for a specific model
   * Caches encoders to avoid repeated initialization overhead
   */
  private getEncoder(model?: string): Tiktoken {
    const requestedModel = model ?? this.FALLBACK_ENCODER_MODEL;
    const resolvedModel = this.encoderAliases.get(requestedModel) ?? requestedModel;

    if (!this.encoders.has(resolvedModel)) {
      try {
        // Try to get encoder for the specific or aliased model
        this.encoders.set(resolvedModel, encoding_for_model(resolvedModel as any));
      } catch {
        return this.getFallbackEncoder(requestedModel);
      }
    }

    return this.encoders.get(resolvedModel)!;
  }

  private getFallbackEncoder(originalModel: string): Tiktoken {
    try {
      if (!this.encoders.has(this.FALLBACK_ENCODER_MODEL)) {
        this.encoders.set(
          this.FALLBACK_ENCODER_MODEL,
          encoding_for_model(this.FALLBACK_ENCODER_MODEL as any)
        );
      }

      if (originalModel !== this.FALLBACK_ENCODER_MODEL) {
        this.encoderAliases.set(originalModel, this.FALLBACK_ENCODER_MODEL);
      }

      return this.encoders.get(this.FALLBACK_ENCODER_MODEL)!;
    } catch {
      throw new Error(`Failed to initialize tokenizer for model: ${originalModel}`);
    }
  }

  /**
   * Estimate token count for a message
   * Uses tiktoken for accurate token counting across different content types
   * Handles non-English text and code content correctly
   */
  private estimateTokens(content: string, model?: string): number {
    try {
      const encoder = this.getEncoder(model);
      const tokens = encoder.encode(content);
      return tokens.length;
    } catch (_error) {
      // Absolute fallback for unknown models or encoding errors
      // Use a more conservative estimate that works better for diverse content
      return Math.ceil(content.length / 3.5);
    }
  }

  /**
   * Summarize older messages
   * Extracts key information from conversation history to preserve context
   * Creates a concise summary appropriate for the available token budget
   */
  private summarizeMessages(
    messages: HistoryEntry[],
    options?: { maxTokens?: number; remainingBudget?: number }
  ): string {
    if (messages.length === 0) {
      return 'No previous conversation.';
    }

    const totalMessages = messages.length;
    const userCount = messages.filter(m => m.role === 'user').length;
    const assistantCount = messages.filter(m => m.role === 'assistant').length;

    const firstUserQuery = messages.find(m => m.role === 'user')?.content || '';
    const normalizedTopic = firstUserQuery.trim();

    if (!options) {
      // Backwards-compatible verbose summary when no token budget is provided
      const topicHint = normalizedTopic.length > 50
        ? normalizedTopic.substring(0, 50).trimEnd() + '...'
        : normalizedTopic;
      return `${totalMessages} earlier messages (${userCount} user, ${assistantCount} assistant). Topic: ${topicHint}`;
    }

    const MIN_SUMMARY_TOKENS = 4;
    let budgetTokens = MIN_SUMMARY_TOKENS;

    if (typeof options.maxTokens === 'number' && options.maxTokens > 0) {
      budgetTokens = Math.max(budgetTokens, Math.ceil(options.maxTokens * 0.3));
    }

    if (typeof options.remainingBudget === 'number') {
      const safeBudget = Math.max(MIN_SUMMARY_TOKENS, Math.ceil(options.remainingBudget));
      budgetTokens = Math.min(budgetTokens, safeBudget);
    }

    const maxChars = Math.max(MIN_SUMMARY_TOKENS * 4, budgetTokens * 4);

    const minimalSummary = `${totalMessages} msgs`;
    if (minimalSummary.length >= maxChars) {
      return minimalSummary.slice(0, Math.max(3, maxChars - 1)).trimEnd() + '...';
    }

    const prefix = `${totalMessages} msgs, ${userCount}u/${assistantCount}a`;
    const availableTopicChars = Math.max(0, maxChars - (prefix.length + 2)); // account for comma and space
    let topicHint = normalizedTopic;

    if (topicHint.length > availableTopicChars && availableTopicChars > 0) {
      const sliceLength = Math.max(1, availableTopicChars - 3);
      topicHint = topicHint.substring(0, sliceLength).trimEnd();
      if (topicHint.length < normalizedTopic.length) {
        topicHint = `${topicHint}...`;
      }
    } else if (availableTopicChars === 0) {
      topicHint = '';
    }

    let summary = prefix;
    if (topicHint) {
      summary += `, topic:${topicHint}`;
    }

    if (summary.length <= maxChars) {
      return summary;
    }

    return minimalSummary;
  }
}
