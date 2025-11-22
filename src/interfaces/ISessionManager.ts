import {
  Session,
  HistoryEntry,
  ConversationContext,
  Duration
} from '../types/core';

/**
 * Session Manager Interface
 * Manages conversation sessions and context
 */
export interface ISessionManager {
  /**
   * Get an existing session by ID
   */
  getSession(sessionId: string): Promise<Session | null>;
  
  /**
   * Create a new session for a user
   */
  createSession(userId: string): Promise<Session>;
  
  /**
   * Add an entry to session history
   */
  addToHistory(
    sessionId: string,
    entry: HistoryEntry
  ): Promise<void>;
  
  /**
   * Get conversation context for a request, respecting token limits
   */
  getContextForRequest(
    sessionId: string,
    maxTokens: number
  ): Promise<ConversationContext>;
  
  /**
   * Expire inactive sessions
   */
  expireInactiveSessions(
    inactivityThreshold: Duration
  ): Promise<number>;
}
