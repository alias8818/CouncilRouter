/**
 * Escalation Service
 * Handles human escalation for deadlock situations with rate limiting
 */

import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { IEscalationService } from '../interfaces/IEscalationService';
import { randomUUID } from 'crypto';

export class EscalationService implements IEscalationService {
  private readonly DEFAULT_RATE_LIMIT = 5; // Max escalations per hour
  private readonly RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds

  constructor(
    private db: Pool,
    private redis: RedisClientType,
    private rateLimit: number = this.DEFAULT_RATE_LIMIT
  ) {}

  /**
   * Queue an escalation request
   * Security: Validates and sanitizes inputs before queuing
   */
  async queueEscalation(requestId: string, reason: string): Promise<void> {
    // Security: Validate and sanitize inputs
    if (!requestId || typeof requestId !== 'string' || requestId.length > 100) {
      throw new Error('Invalid requestId: must be a non-empty string <= 100 characters');
    }

    if (!reason || typeof reason !== 'string' || reason.length > 500) {
      throw new Error('Invalid reason: must be a non-empty string <= 500 characters');
    }

    // Sanitize reason to prevent injection
    const sanitizedReason = this.sanitizeReason(reason);
    const sanitizedRequestId = requestId.replace(/[^a-zA-Z0-9-]/g, ''); // Only allow alphanumeric and hyphens

    // Check rate limit
    const shouldEscalate = await this.shouldEscalate(sanitizedRequestId);
    if (!shouldEscalate) {
      console.warn(`[EscalationService] Rate limit exceeded for request ${sanitizedRequestId}`);
      // Update metrics for rate limit hit
      try {
        const currentSize = await this.getPendingEscalations();
        const { escalationQueueSize } = await import('../monitoring/metrics');
        escalationQueueSize.set(currentSize.length);
      } catch (error) {
        console.error('[EscalationService] Failed to update metrics:', error);
      }
      // Log to database for tracking
      try {
        await this.db.query(`
          INSERT INTO escalation_queue (id, request_id, reason, status, created_at)
          VALUES (gen_random_uuid(), $1, $2, 'rate_limited', $3)
        `, [sanitizedRequestId, `Rate limited: ${sanitizedReason}`, new Date()]);
      } catch (error) {
        console.error('[EscalationService] Failed to log rate limit:', error);
      }
      return;
    }

    // Check if escalation already exists for this request
    const existingQuery = `
      SELECT id FROM escalation_queue
      WHERE request_id = $1 AND status = 'pending'
    `;
    const existing = await this.db.query(existingQuery, [sanitizedRequestId]);

    if (existing.rows.length > 0) {
      console.log(`[EscalationService] Escalation already exists for request ${sanitizedRequestId}`);
      return;
    }

    // Insert escalation (using parameterized query for SQL injection prevention)
    const query = `
      INSERT INTO escalation_queue (id, request_id, reason, status, created_at)
      VALUES ($1, $2, $3, 'pending', $4)
    `;

    await this.db.query(query, [
      randomUUID(),
      sanitizedRequestId,
      sanitizedReason,
      new Date()
    ]);

    // Increment rate limit counter
    await this.incrementRateLimit();

    // Send notifications (would be implemented based on config)
    console.log(`[EscalationService] Escalation queued for request ${sanitizedRequestId}: ${sanitizedReason}`);
  }

  /**
   * Sanitize escalation reason to prevent injection
   */
  private sanitizeReason(reason: string): string {
    // Remove control characters
    let sanitized = reason.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    // Remove SQL injection patterns
    sanitized = sanitized.replace(/['";\\]/g, '');

    // Remove script tags
    sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Limit length
    sanitized = sanitized.substring(0, 500);

    return sanitized.trim();
  }

  /**
   * Get pending escalations
   */
  async getPendingEscalations(): Promise<Array<{
    id: string;
    requestId: string;
    reason: string;
    createdAt: Date;
  }>> {
    const query = `
      SELECT id, request_id, reason, created_at
      FROM escalation_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `;

    const result = await this.db.query(query);

    return result.rows.map(row => ({
      id: row.id,
      requestId: row.request_id,
      reason: row.reason,
      createdAt: new Date(row.created_at)
    }));
  }

  /**
   * Resolve an escalation
   */
  async resolveEscalation(
    escalationId: string,
    reviewedBy: string,
    resolution: string
  ): Promise<void> {
    const query = `
      UPDATE escalation_queue
      SET status = 'resolved',
          reviewed_at = $1,
          reviewed_by = $2,
          resolution = $3
      WHERE id = $4
    `;

    await this.db.query(query, [
      new Date(),
      reviewedBy,
      resolution,
      escalationId
    ]);
  }

  /**
   * Check if escalation should be triggered (rate limiting)
   */
  async shouldEscalate(requestId: string): Promise<boolean> {
    const rateLimitKey = 'escalation:rate-limit';
    const currentCount = await this.redis.get(rateLimitKey);

    if (!currentCount) {
      // First escalation in window
      await this.redis.setEx(rateLimitKey, this.RATE_LIMIT_WINDOW, '1');
      return true;
    }

    const count = parseInt(currentCount, 10);
    if (count >= this.rateLimit) {
      return false;
    }

    return true;
  }

  /**
   * Increment rate limit counter
   */
  private async incrementRateLimit(): Promise<void> {
    const rateLimitKey = 'escalation:rate-limit';
    const current = await this.redis.get(rateLimitKey);

    if (current) {
      await this.redis.incr(rateLimitKey);
    } else {
      await this.redis.setEx(rateLimitKey, this.RATE_LIMIT_WINDOW, '1');
    }
  }
}

