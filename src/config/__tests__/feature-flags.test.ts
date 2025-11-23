/**
 * Feature Flags Manager Tests
 * Comprehensive test suite for feature flag management
 */

import { FeatureFlagsManager, DEFAULT_FEATURE_FLAGS, FeatureFlags } from '../feature-flags';

describe('FeatureFlagsManager', () => {
  describe('constructor', () => {
    it('should use default flags when no overrides provided', () => {
      const manager = new FeatureFlagsManager();
      const flags = manager.getAllFlags();

      expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
      expect(flags.enableIdempotency).toBe(true);
      expect(flags.enableToolUse).toBe(true);
      expect(flags.enableDevilsAdvocate).toBe(true);
      expect(flags.enableBudgetCaps).toBe(true);
      expect(flags.enablePerRequestTransparency).toBe(true);
    });

    it('should override specific flags', () => {
      const manager = new FeatureFlagsManager({
        enableIdempotency: false,
        enableToolUse: false
      });

      const flags = manager.getAllFlags();

      expect(flags.enableIdempotency).toBe(false);
      expect(flags.enableToolUse).toBe(false);
      expect(flags.enableDevilsAdvocate).toBe(true); // Default
      expect(flags.enableBudgetCaps).toBe(true); // Default
      expect(flags.enablePerRequestTransparency).toBe(true); // Default
    });

    it('should handle partial overrides', () => {
      const manager = new FeatureFlagsManager({
        enableDevilsAdvocate: false
      });

      const flags = manager.getAllFlags();

      expect(flags.enableIdempotency).toBe(true);
      expect(flags.enableToolUse).toBe(true);
      expect(flags.enableDevilsAdvocate).toBe(false);
      expect(flags.enableBudgetCaps).toBe(true);
      expect(flags.enablePerRequestTransparency).toBe(true);
    });

    it('should handle all flags disabled', () => {
      const manager = new FeatureFlagsManager({
        enableIdempotency: false,
        enableToolUse: false,
        enableDevilsAdvocate: false,
        enableBudgetCaps: false,
        enablePerRequestTransparency: false
      });

      const flags = manager.getAllFlags();

      expect(flags.enableIdempotency).toBe(false);
      expect(flags.enableToolUse).toBe(false);
      expect(flags.enableDevilsAdvocate).toBe(false);
      expect(flags.enableBudgetCaps).toBe(false);
      expect(flags.enablePerRequestTransparency).toBe(false);
    });
  });

  describe('isIdempotencyEnabled', () => {
    it('should return true when enabled', () => {
      const manager = new FeatureFlagsManager({ enableIdempotency: true });
      expect(manager.isIdempotencyEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const manager = new FeatureFlagsManager({ enableIdempotency: false });
      expect(manager.isIdempotencyEnabled()).toBe(false);
    });

    it('should return default value when not specified', () => {
      const manager = new FeatureFlagsManager();
      expect(manager.isIdempotencyEnabled()).toBe(DEFAULT_FEATURE_FLAGS.enableIdempotency);
    });
  });

  describe('isToolUseEnabled', () => {
    it('should return true when enabled', () => {
      const manager = new FeatureFlagsManager({ enableToolUse: true });
      expect(manager.isToolUseEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const manager = new FeatureFlagsManager({ enableToolUse: false });
      expect(manager.isToolUseEnabled()).toBe(false);
    });

    it('should return default value when not specified', () => {
      const manager = new FeatureFlagsManager();
      expect(manager.isToolUseEnabled()).toBe(DEFAULT_FEATURE_FLAGS.enableToolUse);
    });
  });

  describe('isDevilsAdvocateEnabled', () => {
    it('should return true when enabled', () => {
      const manager = new FeatureFlagsManager({ enableDevilsAdvocate: true });
      expect(manager.isDevilsAdvocateEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const manager = new FeatureFlagsManager({ enableDevilsAdvocate: false });
      expect(manager.isDevilsAdvocateEnabled()).toBe(false);
    });

    it('should return default value when not specified', () => {
      const manager = new FeatureFlagsManager();
      expect(manager.isDevilsAdvocateEnabled()).toBe(DEFAULT_FEATURE_FLAGS.enableDevilsAdvocate);
    });
  });

  describe('isBudgetCapsEnabled', () => {
    it('should return true when enabled', () => {
      const manager = new FeatureFlagsManager({ enableBudgetCaps: true });
      expect(manager.isBudgetCapsEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const manager = new FeatureFlagsManager({ enableBudgetCaps: false });
      expect(manager.isBudgetCapsEnabled()).toBe(false);
    });

    it('should return default value when not specified', () => {
      const manager = new FeatureFlagsManager();
      expect(manager.isBudgetCapsEnabled()).toBe(DEFAULT_FEATURE_FLAGS.enableBudgetCaps);
    });
  });

  describe('isPerRequestTransparencyEnabled', () => {
    it('should return true when enabled', () => {
      const manager = new FeatureFlagsManager({ enablePerRequestTransparency: true });
      expect(manager.isPerRequestTransparencyEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const manager = new FeatureFlagsManager({ enablePerRequestTransparency: false });
      expect(manager.isPerRequestTransparencyEnabled()).toBe(false);
    });

    it('should return default value when not specified', () => {
      const manager = new FeatureFlagsManager();
      expect(manager.isPerRequestTransparencyEnabled()).toBe(DEFAULT_FEATURE_FLAGS.enablePerRequestTransparency);
    });
  });

  describe('getAllFlags', () => {
    it('should return copy of all flags', () => {
      const manager = new FeatureFlagsManager({
        enableIdempotency: false,
        enableToolUse: true
      });

      const flags = manager.getAllFlags();

      expect(flags).toEqual({
        enableIdempotency: false,
        enableToolUse: true,
        enableDevilsAdvocate: true,
        enableBudgetCaps: true,
        enablePerRequestTransparency: true
      });
    });

    it('should return a copy, not the original object', () => {
      const manager = new FeatureFlagsManager();
      const flags1 = manager.getAllFlags();
      const flags2 = manager.getAllFlags();

      expect(flags1).not.toBe(flags2);
      expect(flags1).toEqual(flags2);
    });

    it('should not allow mutation of internal state', () => {
      const manager = new FeatureFlagsManager({ enableIdempotency: true });
      const flags = manager.getAllFlags();

      flags.enableIdempotency = false;

      expect(manager.isIdempotencyEnabled()).toBe(true);
    });
  });

  describe('updateFlags', () => {
    it('should update single flag', () => {
      const manager = new FeatureFlagsManager();

      manager.updateFlags({ enableIdempotency: false });

      expect(manager.isIdempotencyEnabled()).toBe(false);
      expect(manager.isToolUseEnabled()).toBe(true); // Unchanged
    });

    it('should update multiple flags', () => {
      const manager = new FeatureFlagsManager();

      manager.updateFlags({
        enableIdempotency: false,
        enableToolUse: false,
        enableDevilsAdvocate: false
      });

      expect(manager.isIdempotencyEnabled()).toBe(false);
      expect(manager.isToolUseEnabled()).toBe(false);
      expect(manager.isDevilsAdvocateEnabled()).toBe(false);
      expect(manager.isBudgetCapsEnabled()).toBe(true); // Unchanged
    });

    it('should allow toggling flags', () => {
      const manager = new FeatureFlagsManager({ enableIdempotency: true });

      manager.updateFlags({ enableIdempotency: false });
      expect(manager.isIdempotencyEnabled()).toBe(false);

      manager.updateFlags({ enableIdempotency: true });
      expect(manager.isIdempotencyEnabled()).toBe(true);
    });

    it('should preserve unchanged flags', () => {
      const manager = new FeatureFlagsManager({
        enableIdempotency: false,
        enableToolUse: false
      });

      manager.updateFlags({ enableDevilsAdvocate: false });

      expect(manager.isIdempotencyEnabled()).toBe(false);
      expect(manager.isToolUseEnabled()).toBe(false);
      expect(manager.isDevilsAdvocateEnabled()).toBe(false);
    });
  });

  describe('fromEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use defaults when no environment variables set', () => {
      delete process.env.ENABLE_IDEMPOTENCY;
      delete process.env.ENABLE_TOOL_USE;
      delete process.env.ENABLE_DEVILS_ADVOCATE;
      delete process.env.ENABLE_BUDGET_CAPS;
      delete process.env.ENABLE_PER_REQUEST_TRANSPARENCY;

      const manager = FeatureFlagsManager.fromEnvironment();
      const flags = manager.getAllFlags();

      expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
    });

    it('should parse ENABLE_IDEMPOTENCY=true', () => {
      process.env.ENABLE_IDEMPOTENCY = 'true';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isIdempotencyEnabled()).toBe(true);
    });

    it('should parse ENABLE_IDEMPOTENCY=false', () => {
      process.env.ENABLE_IDEMPOTENCY = 'false';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isIdempotencyEnabled()).toBe(false);
    });

    it('should parse ENABLE_TOOL_USE', () => {
      process.env.ENABLE_TOOL_USE = 'false';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isToolUseEnabled()).toBe(false);
    });

    it('should parse ENABLE_DEVILS_ADVOCATE', () => {
      process.env.ENABLE_DEVILS_ADVOCATE = 'false';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isDevilsAdvocateEnabled()).toBe(false);
    });

    it('should parse ENABLE_BUDGET_CAPS', () => {
      process.env.ENABLE_BUDGET_CAPS = 'false';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isBudgetCapsEnabled()).toBe(false);
    });

    it('should parse ENABLE_PER_REQUEST_TRANSPARENCY', () => {
      process.env.ENABLE_PER_REQUEST_TRANSPARENCY = 'false';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isPerRequestTransparencyEnabled()).toBe(false);
    });

    it('should parse multiple environment variables', () => {
      process.env.ENABLE_IDEMPOTENCY = 'false';
      process.env.ENABLE_TOOL_USE = 'false';
      process.env.ENABLE_DEVILS_ADVOCATE = 'true';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isIdempotencyEnabled()).toBe(false);
      expect(manager.isToolUseEnabled()).toBe(false);
      expect(manager.isDevilsAdvocateEnabled()).toBe(true);
      expect(manager.isBudgetCapsEnabled()).toBe(true); // Default
    });

    it('should handle invalid values as false', () => {
      process.env.ENABLE_IDEMPOTENCY = 'invalid';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isIdempotencyEnabled()).toBe(false);
    });

    it('should handle empty string as false', () => {
      process.env.ENABLE_IDEMPOTENCY = '';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isIdempotencyEnabled()).toBe(false);
    });

    it('should handle "1" as false (strict string comparison)', () => {
      process.env.ENABLE_IDEMPOTENCY = '1';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isIdempotencyEnabled()).toBe(false);
    });

    it('should handle case sensitivity (True != true)', () => {
      process.env.ENABLE_IDEMPOTENCY = 'True';

      const manager = FeatureFlagsManager.fromEnvironment();

      expect(manager.isIdempotencyEnabled()).toBe(false);
    });

    it('should handle mixed configuration', () => {
      process.env.ENABLE_IDEMPOTENCY = 'true';
      process.env.ENABLE_TOOL_USE = 'false';
      // ENABLE_DEVILS_ADVOCATE not set (should use default)
      process.env.ENABLE_BUDGET_CAPS = 'true';
      process.env.ENABLE_PER_REQUEST_TRANSPARENCY = 'false';

      const manager = FeatureFlagsManager.fromEnvironment();
      const flags = manager.getAllFlags();

      expect(flags.enableIdempotency).toBe(true);
      expect(flags.enableToolUse).toBe(false);
      expect(flags.enableDevilsAdvocate).toBe(DEFAULT_FEATURE_FLAGS.enableDevilsAdvocate);
      expect(flags.enableBudgetCaps).toBe(true);
      expect(flags.enablePerRequestTransparency).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should support feature rollout pattern', () => {
      // Start with all disabled
      const manager = new FeatureFlagsManager({
        enableIdempotency: false,
        enableToolUse: false,
        enableDevilsAdvocate: false,
        enableBudgetCaps: false,
        enablePerRequestTransparency: false
      });

      // Gradually enable features
      manager.updateFlags({ enableIdempotency: true });
      expect(manager.isIdempotencyEnabled()).toBe(true);
      expect(manager.isToolUseEnabled()).toBe(false);

      manager.updateFlags({ enableToolUse: true });
      expect(manager.isToolUseEnabled()).toBe(true);
    });

    it('should support feature deprecation pattern', () => {
      // Start with all enabled
      const manager = new FeatureFlagsManager();

      // Gradually disable features
      manager.updateFlags({ enableDevilsAdvocate: false });
      expect(manager.isDevilsAdvocateEnabled()).toBe(false);
      expect(manager.isIdempotencyEnabled()).toBe(true);
    });

    it('should support dynamic configuration updates', () => {
      const manager = new FeatureFlagsManager();

      const initialFlags = manager.getAllFlags();
      expect(initialFlags.enableIdempotency).toBe(true);

      manager.updateFlags({ enableIdempotency: false });
      expect(manager.isIdempotencyEnabled()).toBe(false);

      const updatedFlags = manager.getAllFlags();
      expect(updatedFlags.enableIdempotency).toBe(false);
    });
  });
});
