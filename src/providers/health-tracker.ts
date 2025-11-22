/**
 * Provider Health Tracker
 * Centralized service for tracking provider health, failures, and disabled state
 * Ensures consistent state across Provider Pool and Orchestration Engine
 */

// Shared singleton instance for consistent failure tracking
let sharedHealthTracker: ProviderHealthTracker | null = null;

/**
 * Get the shared singleton instance of ProviderHealthTracker
 */
export function getSharedHealthTracker(): ProviderHealthTracker {
  if (!sharedHealthTracker) {
    sharedHealthTracker = new ProviderHealthTracker(5); // Default threshold: 5
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

  constructor(failureThreshold: number = 5, rollingWindowMinutes: number = 15) {
    this.failureThreshold = failureThreshold;
    this.rollingWindowMs = rollingWindowMinutes * 60 * 1000;
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
    const initialLength = state.requestHistory.length;
    
    // Remove records older than the rolling window
    state.requestHistory = state.requestHistory.filter(record => record.timestamp >= cutoffTime);
    
    // Recalculate counts based on remaining records
    const remainingRecords = state.requestHistory.length;
    if (remainingRecords < initialLength) {
      // Recalculate success count from remaining records
      state.successCount = state.requestHistory.filter(r => r.success).length;
      state.totalRequests = remainingRecords;
    }
  }

  /**
   * Record a successful request for a provider
   */
  recordSuccess(providerId: string): void {
    const state = this.healthState.get(providerId);
    if (!state) {
      this.initializeProvider(providerId);
      const newState = this.healthState.get(providerId)!;
      newState.requestHistory.push({ timestamp: new Date(), success: true });
      newState.totalRequests = 1;
      newState.successCount = 1;
      return;
    }

    // Clean up old records first
    this.cleanupOldRecords(state);

    // Add new success record
    state.requestHistory.push({ timestamp: new Date(), success: true });
    state.totalRequests = state.requestHistory.length;
    state.successCount = state.requestHistory.filter(r => r.success).length;
    state.consecutiveFailures = 0; // Reset consecutive failure count

    // Update status based on current state
    if (state.status === 'disabled') {
      // Provider was disabled but now has a success - re-enable
      state.status = 'healthy';
      state.disabledReason = undefined;
    } else if (state.status === 'degraded') {
      state.status = 'healthy';
    }
  }

  /**
   * Record a failed request for a provider
   * Returns true if provider should be disabled after this failure
   */
  recordFailure(providerId: string): boolean {
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
      newState.status = 'degraded';
      return newState.consecutiveFailures >= this.failureThreshold;
    }

    // Clean up old records first
    this.cleanupOldRecords(state);

    // Add new failure record
    state.requestHistory.push({ timestamp: failureTime, success: false });
    state.totalRequests = state.requestHistory.length;
    state.successCount = state.requestHistory.filter(r => r.success).length;
    state.consecutiveFailures++;
    state.lastFailure = failureTime; // Track actual failure time

    // Check if we should disable this provider
    if (state.consecutiveFailures >= this.failureThreshold) {
      state.status = 'disabled';
      state.disabledReason = `${this.failureThreshold} consecutive failures`;
      return true;
    } else {
      state.status = 'degraded';
      return false;
    }
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
}

