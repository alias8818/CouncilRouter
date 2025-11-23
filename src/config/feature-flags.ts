/**
 * Feature Flags for Council Enhancements
 * Controls which enhancements are enabled
 */

export interface FeatureFlags {
  enableIdempotency: boolean;
  enableToolUse: boolean;
  enableDevilsAdvocate: boolean;
  enableBudgetCaps: boolean;
  enablePerRequestTransparency: boolean;
}

/**
 * Default feature flags (all enabled)
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableIdempotency: true,
  enableToolUse: true,
  enableDevilsAdvocate: true,
  enableBudgetCaps: true,
  enablePerRequestTransparency: true
};

/**
 * Feature Flags Manager
 */
export class FeatureFlagsManager {
  private flags: FeatureFlags;

  constructor(flags?: Partial<FeatureFlags>) {
    this.flags = {
      ...DEFAULT_FEATURE_FLAGS,
      ...flags
    };
  }

  /**
   * Check if idempotency is enabled
   */
  isIdempotencyEnabled(): boolean {
    return this.flags.enableIdempotency;
  }

  /**
   * Check if tool use is enabled
   */
  isToolUseEnabled(): boolean {
    return this.flags.enableToolUse;
  }

  /**
   * Check if devil's advocate is enabled
   */
  isDevilsAdvocateEnabled(): boolean {
    return this.flags.enableDevilsAdvocate;
  }

  /**
   * Check if budget caps are enabled
   */
  isBudgetCapsEnabled(): boolean {
    return this.flags.enableBudgetCaps;
  }

  /**
   * Check if per-request transparency is enabled
   */
  isPerRequestTransparencyEnabled(): boolean {
    return this.flags.enablePerRequestTransparency;
  }

  /**
   * Get all flags
   */
  getAllFlags(): FeatureFlags {
    return { ...this.flags };
  }

  /**
   * Update flags
   */
  updateFlags(updates: Partial<FeatureFlags>): void {
    this.flags = {
      ...this.flags,
      ...updates
    };
  }

  /**
   * Load from environment variables
   */
  static fromEnvironment(): FeatureFlagsManager {
    const flags: Partial<FeatureFlags> = {};

    if (process.env.ENABLE_IDEMPOTENCY !== undefined) {
      flags.enableIdempotency = process.env.ENABLE_IDEMPOTENCY === 'true';
    }

    if (process.env.ENABLE_TOOL_USE !== undefined) {
      flags.enableToolUse = process.env.ENABLE_TOOL_USE === 'true';
    }

    if (process.env.ENABLE_DEVILS_ADVOCATE !== undefined) {
      flags.enableDevilsAdvocate = process.env.ENABLE_DEVILS_ADVOCATE === 'true';
    }

    if (process.env.ENABLE_BUDGET_CAPS !== undefined) {
      flags.enableBudgetCaps = process.env.ENABLE_BUDGET_CAPS === 'true';
    }

    if (process.env.ENABLE_PER_REQUEST_TRANSPARENCY !== undefined) {
      flags.enablePerRequestTransparency = process.env.ENABLE_PER_REQUEST_TRANSPARENCY === 'true';
    }

    return new FeatureFlagsManager(flags);
  }
}
