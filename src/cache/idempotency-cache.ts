/**
 * Idempotency Cache
 * Manages request deduplication using Redis
 */

import { RedisClientType } from 'redis';
import { ConsensusDecision, ErrorResponse } from '../types/core';
import {
  IIdempotencyCache,
  IdempotencyStatus,
  CachedResult
} from '../interfaces/IIdempotencyCache';

/**
 * Stored idempotency record in Redis
 */
interface IdempotencyRecord {
  requestId: string;
  status: 'completed' | 'in-progress' | 'failed';
  consensusDecision?: ConsensusDecision;
  error?: ErrorResponse;
  timestamp: string; // ISO string for JSON serialization
}

/**
 * IdempotencyCache implementation using Redis
 */
export class IdempotencyCache implements IIdempotencyCache {
  private redis: RedisClientType;
  private readonly DEFAULT_TTL = 86400; // 24 hours in seconds
  private readonly POLL_INTERVAL_MS = 100; // Poll every 100ms for in-progress requests

  constructor(redis: RedisClientType) {
    this.redis = redis;
  }

  /**
   * Check if an idempotency key exists and its status
   */
  async checkKey(key: string): Promise<IdempotencyStatus> {
    const data = await this.redis.get(this.getRedisKey(key));

    if (!data) {
      return {
        exists: false,
        status: 'not-found'
      };
    }

    const record = this.parseRecord(data);

    return {
      exists: true,
      status: record.status,
      result: {
        requestId: record.requestId,
        consensusDecision: record.consensusDecision,
        error: record.error,
        timestamp: new Date(record.timestamp),
        fromCache: true
      }
    };
  }

  /**
   * Cache a successful result
   */
  async cacheResult(
    key: string,
    requestId: string,
    result: ConsensusDecision,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    const record: IdempotencyRecord = {
      requestId,
      status: 'completed',
      consensusDecision: result,
      timestamp: new Date().toISOString()
    };

    await this.saveRecord(key, record, ttl);
  }

  /**
   * Cache an error response
   */
  async cacheError(
    key: string,
    requestId: string,
    error: ErrorResponse,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    const record: IdempotencyRecord = {
      requestId,
      status: 'failed',
      error,
      timestamp: new Date().toISOString()
    };

    await this.saveRecord(key, record, ttl);
  }

  /**
   * Wait for an in-progress request to complete
   */
  async waitForCompletion(key: string, timeoutMs: number): Promise<CachedResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.checkKey(key);

      if (status.status === 'completed' || status.status === 'failed') {
        if (!status.result) {
          throw new Error('Result not found for completed/failed status');
        }
        return status.result;
      }

      if (status.status === 'not-found') {
        throw new Error('Request no longer exists in cache');
      }

      // Wait before polling again
      await this.sleep(this.POLL_INTERVAL_MS);
    }

    throw new Error('Timeout waiting for request completion');
  }

  /**
   * Mark a key as in-progress
   */
  async markInProgress(
    key: string,
    requestId: string,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    const record: IdempotencyRecord = {
      requestId,
      status: 'in-progress',
      timestamp: new Date().toISOString()
    };

    // Use SET NX (set if not exists) to ensure atomicity
    // This prevents race conditions where two requests try to mark the same key
    const wasSet = await this.redis.set(
      this.getRedisKey(key),
      JSON.stringify(record),
      {
        NX: true, // Only set if key doesn't exist
        EX: ttl
      }
    );

    if (!wasSet) {
      throw new Error('Idempotency key already exists');
    }
  }

  /**
   * Get Redis key with prefix
   */
  private getRedisKey(key: string): string {
    return `idempotency:${key}`;
  }

  /**
   * Save record to Redis
   */
  private async saveRecord(
    key: string,
    record: IdempotencyRecord,
    ttl: number
  ): Promise<void> {
    await this.redis.set(
      this.getRedisKey(key),
      JSON.stringify(record),
      {
        EX: ttl
      }
    );
  }

  /**
   * Parse record from Redis
   */
  private parseRecord(data: string): IdempotencyRecord {
    const record = JSON.parse(data) as IdempotencyRecord;

    // Restore Date objects in nested structures
    if (record.consensusDecision) {
      record.consensusDecision.timestamp = new Date(record.consensusDecision.timestamp);
    }
    if (record.error) {
      record.error.timestamp = new Date(record.error.timestamp);
    }

    return record;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
