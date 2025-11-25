/**
 * Provider Health Tracker
 * Centralized service for tracking provider health, failures, and disabled state
 * Ensures consistent state across Provider Pool and Orchestration Engine
 */

import { Pool } from 'pg';

// Shared singleton instance for consistent failure tracking
let sharedHealthTracker: ProviderHealthTracker | null = null;

/**
 * Get the shared singleton instance of ProviderHealthTracker
 */
export function getSharedHealthTracker(db?: Pool): ProviderHealthTracker {
  if (!sharedHealthTracker) {
    sharedHealthTracker = new ProviderHealthTracker(5, undefined, db); // Default threshold: 5
  }
  return sharedHealthTracker;
}

interface RequestRecord {
  timestamp: Date;
  success: boolean;
}

interface ProviderHealthState {
  status: 'healthy' | 'degraded' | 'disabled';
  consecutiveFailures: number;
  successCount: number;
  totalRequests: number;
  lastFailure?: Date;
  disabledReason?: string;
  // Rolling window for success rate calculation
  requestHistory: RequestRecord[];
}

/**
 * Shared Provider Health Tracker
 * Manages centralized failure counting and disabled state for providers
 */
export class ProviderHealthTracker {
  private healthState: Map<string, ProviderHealthState> = new Map();
  private readonly failureThreshold: number;
  // Rolling window: track requests from last N minutes
  private readonly rollingWindowMs: number = 15 * 60 * 1000; // 15 minutes default
  private db?: Pool;
  // Track latencies for average calculation (last 100 requests)
  private latencyHistory: Map<string, number[]> = new Map();
  private readonly maxLatencyHistory = 100;

  constructor(failureThreshold: number = 5, rollingWindowMinutes: number = 15, db?: Pool) {
    this.failureThreshold = failureThreshold;
    this.rollingWindowMs = rollingWindowMinutes * 60 * 1000;
    this.db = db;
  }

  /**
   * Initialize health tracking for a provider
   */
  initializeProvider(providerId: string): void {
    if (!this.healthState.has(providerId)) {
      this.healthState.set(providerId, {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 0,
        totalRequests: 0,
        requestHistory: []
      });
    }
  }

  /**
   * Clean up old request records outside the rolling window
   */
  private cleanupOldRecords(state: ProviderHealthState): void {
    const cutoffTime = new Date(Date.now() - this.rollingWindowMs);

    // Remove records older than the rolling window
    state.requestHistory = state.requestHistory.filter(record => record.timestamp >= cutoffTime);

    // Recalculate counts based on remaining records (always, so new entries are counted immediately)
    state.totalRequests = state.requestHistory.length;
    state.successCount = state.requestHistory.filter(r => r.success).length;
  }

  /**
   * Record a successful request for a provider
   * Fixed: Add new record before cleanup to ensure counts are accurate
   */
  async recordSuccess(providerId: string, latency?: number): Promise<void> {
    const state = this.healthState.get(providerId);
    if (!state) {
      this.initializeProvider(providerId);
      const newState = this.healthState.get(providerId)!;
      newState.requestHistory.push({ timestamp: new Date(), success: true });
      newState.totalRequests = 1;
      newState.successCount = 1;
      if (latency !== undefined) {
        this.addLatency(providerId, latency);
      }
      await this.persistHealth(providerId);
      return;
    }

    // Add new success record first
    state.requestHistory.push({ timestamp: new Date(), success: true });

    // Then clean up old records (this will recalculate counts including the new record)
    this.cleanupOldRecords(state);

    state.consecutiveFailures = 0; // Reset consecutive failure count

    // Track latency if provided
    if (latency !== undefined) {
      this.addLatency(providerId, latency);
    }

    // Update status based on current state
    const newStatus = this.getStatus(providerId);
    state.status = newStatus;
    if (newStatus === 'healthy') {
      state.disabledReason = undefined;
    }

    // Persist to database
    await this.persistHealth(providerId);
  }

  /**
   * Record a failed request for a provider
   * Returns true if provider should be disabled after this failure
   * Fixed: Add new record before cleanup to ensure counts are accurate
   */
  async recordFailure(providerId: string, error?: Error): Promise<boolean> {
    const failureTime = new Date();
    const state = this.healthState.get(providerId);
    if (!state) {
      this.initializeProvider(providerId);
      const newState = this.healthState.get(providerId)!;
      newState.requestHistory.push({ timestamp: failureTime, success: false });
      newState.totalRequests = 1;
      newState.successCount = 0;
      newState.consecutiveFailures = 1;
      newState.lastFailure = failureTime;
      newState.status = this.getStatus(providerId);
      if (newState.status === 'disabled') {
        newState.disabledReason = `${this.failureThreshold} consecutive failures`;
      }
      await this.persistHealth(providerId);
      return newState.consecutiveFailures >= this.failureThreshold;
    }

    // Add new failure record first
    state.requestHistory.push({ timestamp: failureTime, success: false });

    // Then clean up old records (this will recalculate counts including the new record)
    this.cleanupOldRecords(state);

    state.consecutiveFailures++;
    state.lastFailure = failureTime; // Track actual failure time

    // Update status based on current state
    const newStatus = this.getStatus(providerId);
    state.status = newStatus;
    if (newStatus === 'disabled') {
      state.disabledReason = error?.message || `${this.failureThreshold} consecutive failures`;
    }

    // Persist to database
    await this.persistHealth(providerId);

    return newStatus === 'disabled';
  }

  /**
   * Get the current failure count for a provider
   */
  getFailureCount(providerId: string): number {
    const state = this.healthState.get(providerId);
    return state?.consecutiveFailures || 0;
  }

  /**
   * Check if a provider is disabled
   */
  isDisabled(providerId: string): boolean {
    const state = this.healthState.get(providerId);
    return state?.status === 'disabled';
  }

  /**
   * Get the disabled reason for a provider
   */
  getDisabledReason(providerId: string): string | undefined {
    const state = this.healthState.get(providerId);
    return state?.disabledReason;
  }

  /**
   * Mark a provider as disabled with a reason
   */
  markDisabled(providerId: string, reason: string): void {
    const state = this.healthState.get(providerId);
    if (!state) {
      this.initializeProvider(providerId);
    }
    const currentState = this.healthState.get(providerId)!;
    currentState.status = 'disabled';
    currentState.disabledReason = reason;
    // Set consecutive failures to threshold to maintain consistency
    currentState.consecutiveFailures = this.failureThreshold;
  }

  /**
   * Enable a provider (clear disabled state)
   */
  enableProvider(providerId: string): void {
    const state = this.healthState.get(providerId);
    if (!state) {
      this.initializeProvider(providerId);
      return;
    }

    state.status = 'healthy';
    state.disabledReason = undefined;
    state.consecutiveFailures = 0;
  }

  /**
   * Get health status for a provider
   */
  getHealthStatus(providerId: string): 'healthy' | 'degraded' | 'disabled' {
    const state = this.healthState.get(providerId);
    return state?.status || 'healthy';
  }

  /**
   * Get the last failure timestamp for a provider
   */
  getLastFailure(providerId: string): Date | undefined {
    const state = this.healthState.get(providerId);
    return state?.lastFailure;
  }

  /**
   * Calculate success rate based on rolling window
   */
  getSuccessRate(providerId: string): number {
    const state = this.healthState.get(providerId);
    if (!state || state.requestHistory.length === 0) {
      return 0;
    }

    // Clean up old records
    this.cleanupOldRecords(state);

    if (state.requestHistory.length === 0) {
      return 0;
    }

    return state.successCount / state.requestHistory.length;
  }

  /**
   * Reset failure count for a provider (used when member succeeds)
   */
  resetFailureCount(providerId: string): void {
    const state = this.healthState.get(providerId);
    if (state) {
      state.consecutiveFailures = 0;
      if (state.status === 'disabled') {
        state.status = 'healthy';
        state.disabledReason = undefined;
      } else if (state.status === 'degraded') {
        state.status = 'healthy';
      }
    }
  }

  /**
   * Get all tracked providers
   */
  getTrackedProviders(): string[] {
    return Array.from(this.healthState.keys());
  }

  /**
   * Add latency to history for average calculation
   */
  private addLatency(providerId: string, latency: number): void {
    if (!this.latencyHistory.has(providerId)) {
      this.latencyHistory.set(providerId, []);
    }
    const latencies = this.latencyHistory.get(providerId)!;
    latencies.push(latency);
    if (latencies.length > this.maxLatencyHistory) {
      latencies.shift();
    }
  }

  /**
   * Calculate average latency for a provider
   */
  private getAverageLatency(providerId: string): number {
    const latencies = this.latencyHistory.get(providerId);
    if (!latencies || latencies.length === 0) {
      return 0;
    }
    const sum = latencies.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / latencies.length);
  }

  /**
   * Get status based on success rate and consecutive failures
   */
  getStatus(providerId: string): 'healthy' | 'degraded' | 'disabled' {
    const state = this.healthState.get(providerId);
    if (!state) {
      return 'healthy';
    }

    // Disabled if consecutive failures >= threshold
    if (state.consecutiveFailures >= this.failureThreshold) {
      return 'disabled';
    }

    // Degraded if success rate < 80%
    const successRate = this.getSuccessRate(providerId);
    if (successRate < 0.8) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Persist health state to database
   */
  private async persistHealth(providerId: string): Promise<void> {
    if (!this.db) {
      return; // No database connection, skip persistence
    }

    try {
      const state = this.healthState.get(providerId);
      if (!state) {
        return;
      }

      const successRate = this.getSuccessRate(providerId);
      const avgLatency = this.getAverageLatency(providerId);
      const status = this.getStatus(providerId);

      await this.db.query(`
        INSERT INTO provider_health (
          provider_id, status, success_rate, avg_latency_ms,
          last_failure_at, disabled_reason, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (provider_id) DO UPDATE SET
          status = EXCLUDED.status,
          success_rate = EXCLUDED.success_rate,
          avg_latency_ms = EXCLUDED.avg_latency_ms,
          last_failure_at = EXCLUDED.last_failure_at,
          disabled_reason = EXCLUDED.disabled_reason,
          updated_at = EXCLUDED.updated_at
      `, [
        providerId,
        status,
        successRate,
        avgLatency,
        state.lastFailure || null,
        state.disabledReason || null
      ]);
    } catch (error) {
      // Log error but don't fail request
      console.error(`Failed to persist health for ${providerId}:`, error);
    }
  }
}

