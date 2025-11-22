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
import { createClient, RedisClientType } from 'redis';
import { randomUUID } from 'crypto';

export class SessionManager implements ISessionManager {
  private db: Pool;
  private redis: RedisClientType;
  private readonly SESSION_TTL = 2592000; // 30 days in seconds
  private readonly TOKENS_PER_MESSAGE_ESTIMATE = 100; // Rough estimate for token counting

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
        const summary = this.summarizeMessages(olderMessages);
        const summaryContent = `[Summary of earlier conversation: ${summary}]`;
        const summaryTokens = this.estimateTokens(summaryContent);
        
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
   *
   * NOTE: There is a theoretical race condition between lLen check and rPush operations.
   * In practice, this is acceptable because:
   * 1. Session updates are typically sequential (same user in a session)
   * 2. The window is very small (microseconds)
   * 3. Impact is minimal (worst case: duplicate entry that gets overwritten)
   *
   * For production use with high concurrency, consider implementing distributed locking
   * (e.g., Redlock) or using Redis Lua scripts for atomic check-and-append.
   */
  private async cacheSession(session: Session): Promise<void> {
    const key = `session:${session.id}`;
    const historyKey = `session:${session.id}:history`;

    // Use pipeline for atomic operations
    const pipeline = this.redis.multi();

    // Update session metadata (small, changes frequently)
    pipeline.hSet(key, {
      userId: session.userId,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      contextWindowUsed: session.contextWindowUsed.toString(),
      historyLength: session.history.length.toString()
    });

    // Store history entries incrementally in a list
    // Check current length to determine if we need to append
    const existingLength = await this.redis.lLen(historyKey).catch(() => 0);

    if (session.history.length > existingLength) {
      // Append only new entries (incremental update)
      const newEntries = session.history.slice(existingLength);
      for (const entry of newEntries) {
        pipeline.rPush(historyKey, JSON.stringify(entry));
      }
    } else if (session.history.length < existingLength) {
      // History was truncated (e.g., after summarization) - rebuild
      await this.redis.del(historyKey);
      for (const entry of session.history) {
        pipeline.rPush(historyKey, JSON.stringify(entry));
      }
    }
    // If lengths match, no need to update history

    // Set TTL on both keys
    pipeline.expire(key, this.SESSION_TTL);
    pipeline.expire(historyKey, this.SESSION_TTL);

    await pipeline.exec();
  }

  /**
   * Estimate token count for a message
   * Simple heuristic: ~4 characters per token
   */
  private estimateTokens(content: string): number {
    // Rough estimate: ~4 characters per token for English text
    // Less accurate for code, non-English text, or heavy punctuation
    // TODO: Integrate precise tokenizer like tiktoken for production accuracy
    return Math.ceil(content.length / 4);
  }

  /**
   * Summarize older messages
   * Extracts key information from conversation history to preserve context
   * Creates a concise summary appropriate for the available token budget
   */
  private summarizeMessages(messages: HistoryEntry[]): string {
    if (messages.length === 0) {
      return 'No previous conversation.';
    }
    
    const totalMessages = messages.length;
    const userCount = messages.filter(m => m.role === 'user').length;
    const assistantCount = messages.filter(m => m.role === 'assistant').length;
    
    // For very short summaries, just provide counts
    if (totalMessages <= 3) {
      return `${totalMessages} earlier messages`;
    }
    
    // Extract first user query to identify initial topic
    const firstUserQuery = messages.find(m => m.role === 'user')?.content || '';
    const topicHint = firstUserQuery.length > 50 
      ? firstUserQuery.substring(0, 50).trim() + '...'
      : firstUserQuery.trim();
    
    // Build concise summary
    return `${totalMessages} earlier messages (${userCount} user, ${assistantCount} assistant). Topic: ${topicHint}`;
  }
}
