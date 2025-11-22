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
   */
  async addToHistory(sessionId: string, entry: HistoryEntry): Promise<void> {
    // Add to database
    await this.db.query(
      `INSERT INTO session_history (id, session_id, role, content, request_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), sessionId, entry.role, entry.content, entry.requestId || null, entry.timestamp]
    );

    // Update session last activity and context window
    const tokenEstimate = this.estimateTokens(entry.content);
    await this.db.query(
      `UPDATE sessions 
       SET last_activity_at = $1, context_window_used = context_window_used + $2
       WHERE id = $3`,
      [new Date(), tokenEstimate, sessionId]
    );

    // Update cache
    const session = await this.getSessionFromDatabase(sessionId);
    if (session) {
      await this.cacheSession(session);
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
        const summaryTokens = this.estimateTokens(summary);
        
        messages.unshift({
          role: 'assistant',
          content: `[Summary of earlier conversation: ${summary}]`,
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

    // Remove expired sessions from cache
    for (const row of result.rows) {
      await this.redis.del(`session:${row.id}`);
    }

    return result.rowCount || 0;
  }

  /**
   * Get session from Redis cache
   */
  private async getSessionFromCache(sessionId: string): Promise<Session | null> {
    const key = `session:${sessionId}`;
    const data = await this.redis.hGetAll(key);
    
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      id: sessionId,
      userId: data.userId,
      history: JSON.parse(data.history),
      createdAt: new Date(data.createdAt),
      lastActivityAt: new Date(data.lastActivityAt),
      contextWindowUsed: parseInt(data.contextWindowUsed, 10)
    };
  }

  /**
   * Get session from database
   */
  private async getSessionFromDatabase(sessionId: string): Promise<Session | null> {
    const sessionResult = await this.db.query(
      `SELECT id, user_id, created_at, last_activity_at, context_window_used, expired
       FROM sessions
       WHERE id = $1 AND expired = false`,
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
   */
  private async cacheSession(session: Session): Promise<void> {
    const key = `session:${session.id}`;
    
    await this.redis.hSet(key, {
      userId: session.userId,
      history: JSON.stringify(session.history),
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      contextWindowUsed: session.contextWindowUsed.toString()
    });

    await this.redis.expire(key, this.SESSION_TTL);
  }

  /**
   * Estimate token count for a message
   * Simple heuristic: ~4 characters per token
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Summarize older messages
   * Simple implementation: extract key points
   */
  private summarizeMessages(messages: HistoryEntry[]): string {
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;
    
    return `${userMessages} user messages and ${assistantMessages} assistant responses covering earlier conversation topics`;
  }
}
