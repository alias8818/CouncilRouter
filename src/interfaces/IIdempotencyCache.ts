import { ConsensusDecision, ErrorResponse } from '../types/core';

/**
 * Idempotency Cache Interface
 * Manages request deduplication using idempotency keys
 */
export interface IIdempotencyCache {
  /**
   * Check if an idempotency key exists and its status
   */
  checkKey(key: string): Promise<IdempotencyStatus>;

  /**
   * Cache a successful result
   */
  cacheResult(
    key: string,
    requestId: string,
    result: ConsensusDecision,
    ttl: number
  ): Promise<void>;

  /**
   * Cache an error response
   */
  cacheError(
    key: string,
    requestId: string,
    error: ErrorResponse,
    ttl: number
  ): Promise<void>;

  /**
   * Wait for an in-progress request to complete
   */
  waitForCompletion(key: string, timeoutMs: number): Promise<CachedResult>;

  /**
   * Mark a key as in-progress
   */
  markInProgress(key: string, requestId: string, ttl: number): Promise<void>;
}

export interface IdempotencyStatus {
  exists: boolean;
  status: 'completed' | 'in-progress' | 'failed' | 'not-found';
  result?: CachedResult;
}

export interface CachedResult {
  requestId: string;
  consensusDecision?: ConsensusDecision;
  error?: ErrorResponse;
  timestamp: Date;
  fromCache: boolean;
}
