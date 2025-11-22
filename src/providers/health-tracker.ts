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

interface ProviderHealthState {
  status: 'healthy' | 'degraded' | 'disabled';
  consecutiveFailures: number;
  successCount: number;
  totalRequests: number;
  lastFailure?: Date;
  disabledReason?: string;
}

/**
 * Shared Provider Health Tracker
 * Manages centralized failure counting and disabled state for providers
 */
export class ProviderHealthTracker {
  private healthState: Map<string, ProviderHealthState> = new Map();
  private readonly failureThreshold: number;

  constructor(failureThreshold: number = 5) {
    this.failureThreshold = failureThreshold;
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
        totalRequests: 0
      });
    }
  }

  /**
   * Record a successful request for a provider
   */
  recordSuccess(providerId: string): void {
    const state = this.healthState.get(providerId);
    if (!state) {
      this.initializeProvider(providerId);
      return;
    }

    state.totalRequests++;
    state.successCount++;
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
    const state = this.healthState.get(providerId);
    if (!state) {
      this.initializeProvider(providerId);
      const newState = this.healthState.get(providerId)!;
      newState.totalRequests++;
      newState.consecutiveFailures = 1;
      newState.lastFailure = new Date();
      newState.status = 'degraded';
      return newState.consecutiveFailures >= this.failureThreshold;
    }

    state.totalRequests++;
    state.consecutiveFailures++;
    state.lastFailure = new Date();

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

