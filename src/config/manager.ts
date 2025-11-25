/**
 * Configuration Manager
 * Manages system configuration with database persistence and Redis caching
 */

import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';
import {
  CouncilConfig,
  DeliberationConfig,
  SynthesisConfig,
  PerformanceConfig,
  TransparencyConfig,
  DevilsAdvocateConfig,
  ConfigPreset,
  RetryPolicy,
  ModelRankings,
  IterativeConsensusConfig
} from '../types/core';

/**
 * Configuration validation error
 */
export class ConfigurationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationValidationError';
  }
}

/**
 * Configuration Manager implementation
 */
export class ConfigurationManager implements IConfigurationManager {
  private db: Pool;
  private redis: RedisClientType;
  private readonly CACHE_KEYS = {
    council: 'config:council',
    deliberation: 'config:deliberation',
    synthesis: 'config:synthesis',
    performance: 'config:performance',
    transparency: 'config:transparency',
    devilsAdvocate: 'config:devils_advocate',
    modelRankings: 'config:model_rankings',
    iterativeConsensus: 'config:iterative_consensus'
  };

  constructor(db: Pool, redis: RedisClientType) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Get current council configuration
   */
  async getCouncilConfig(): Promise<CouncilConfig> {
    // Try cache first
    const cached = await this.redis.get(this.CACHE_KEYS.council);
    if (cached) {
      return this.deserializeCouncilConfig(JSON.parse(cached));
    }

    // Fetch from database
    const result = await this.db.query(
      `SELECT config_data FROM configurations
       WHERE config_type = 'council' AND active = true
       ORDER BY version DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Return default configuration
      return this.getDefaultCouncilConfig();
    }

    const config = this.deserializeCouncilConfig(result.rows[0].config_data);

    // Cache it
    await this.redis.set(
      this.CACHE_KEYS.council,
      JSON.stringify(result.rows[0].config_data)
    );

    return config;
  }

  /**
   * Update council configuration
   */
  async updateCouncilConfig(config: CouncilConfig): Promise<void> {
    // Validate configuration
    this.validateCouncilConfig(config);

    // Get current version
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'council'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    // Deactivate old configurations
    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'council' AND active = true`
    );

    // Insert new configuration
    const serializedConfig = this.serializeCouncilConfig(config);
    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'council', $1, $2, NOW(), true)`,
      [serializedConfig, newVersion]
    );

    // Invalidate cache
    await this.redis.del(this.CACHE_KEYS.council);
  }

  /**
   * Get deliberation configuration
   */
  async getDeliberationConfig(): Promise<DeliberationConfig> {
    // Try cache first
    const cached = await this.redis.get(this.CACHE_KEYS.deliberation);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const result = await this.db.query(
      `SELECT config_data FROM configurations
       WHERE config_type = 'deliberation' AND active = true
       ORDER BY version DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Return default configuration
      return this.getDefaultDeliberationConfig();
    }

    const config = result.rows[0].config_data;

    // Cache it
    await this.redis.set(this.CACHE_KEYS.deliberation, JSON.stringify(config));

    return config;
  }

  /**
   * Get synthesis configuration
   */
  async getSynthesisConfig(): Promise<SynthesisConfig> {
    // Try cache first
    const cached = await this.redis.get(this.CACHE_KEYS.synthesis);
    if (cached) {
      return this.deserializeSynthesisConfig(JSON.parse(cached));
    }

    // Fetch from database
    const result = await this.db.query(
      `SELECT config_data FROM configurations
       WHERE config_type = 'synthesis' AND active = true
       ORDER BY version DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Return default configuration
      return this.getDefaultSynthesisConfig();
    }

    const config = this.deserializeSynthesisConfig(result.rows[0].config_data);

    // Cache it
    await this.redis.set(
      this.CACHE_KEYS.synthesis,
      JSON.stringify(result.rows[0].config_data)
    );

    return config;
  }

  /**
   * Get performance configuration
   */
  async getPerformanceConfig(): Promise<PerformanceConfig> {
    // Try cache first
    const cached = await this.redis.get(this.CACHE_KEYS.performance);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const result = await this.db.query(
      `SELECT config_data FROM configurations
       WHERE config_type = 'performance' AND active = true
       ORDER BY version DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Return default configuration
      return this.getDefaultPerformanceConfig();
    }

    const config = result.rows[0].config_data;

    // Cache it
    await this.redis.set(this.CACHE_KEYS.performance, JSON.stringify(config));

    return config;
  }

  /**
   * Get transparency configuration
   */
  async getTransparencyConfig(): Promise<TransparencyConfig> {
    // Try cache first
    const cached = await this.redis.get(this.CACHE_KEYS.transparency);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const result = await this.db.query(
      `SELECT config_data FROM configurations
       WHERE config_type = 'transparency' AND active = true
       ORDER BY version DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Return default configuration
      return this.getDefaultTransparencyConfig();
    }

    const config = result.rows[0].config_data;

    // Cache it
    await this.redis.set(this.CACHE_KEYS.transparency, JSON.stringify(config));

    return config;
  }

  /**
   * Update transparency configuration
   */
  async updateTransparencyConfig(config: TransparencyConfig): Promise<void> {
    // Get current version
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'transparency'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    // Deactivate old configurations
    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'transparency' AND active = true`
    );

    // Insert new configuration
    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'transparency', $1, $2, NOW(), true)`,
      [JSON.stringify(config), newVersion]
    );

    // Invalidate cache
    await this.redis.del(this.CACHE_KEYS.transparency);
  }

  /**
   * Apply a configuration preset
   */
  async applyPreset(preset: ConfigPreset): Promise<void> {
    // Validate preset name before calling getPresetConfigurations
    await this.validatePreset(preset);

    const presetConfigs = await this.getPresetConfigurations(preset);

    // Update all configurations
    await this.updateCouncilConfig(presetConfigs.council);
    await this.updateDeliberationConfig(presetConfigs.deliberation);
    await this.updateSynthesisConfig(presetConfigs.synthesis);
    await this.updatePerformanceConfig(presetConfigs.performance);
    await this.updateTransparencyConfig(presetConfigs.transparency);
  }

  /**
   * Validate preset name (dynamic query from DB)
   */
  private async validatePreset(preset: ConfigPreset): Promise<void> {
    const result = await this.db.query(
      'SELECT array_agg(preset_name) as presets FROM council_presets'
    );
    const valid = (result.rows[0]?.presets as string[]) || [];
    if (!valid.includes(preset)) {
      throw new ConfigurationValidationError(
        `Invalid preset: ${preset}. Available presets: ${valid.join(', ')}`
      );
    }
  }

  /**
   * Update deliberation configuration
   */
  private async updateDeliberationConfig(
    config: DeliberationConfig
  ): Promise<void> {
    // Validate configuration
    this.validateDeliberationConfig(config);

    // Get current version
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'deliberation'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    // Deactivate old configurations
    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'deliberation' AND active = true`
    );

    // Insert new configuration
    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'deliberation', $1, $2, NOW(), true)`,
      [JSON.stringify(config), newVersion]
    );

    // Invalidate cache
    await this.redis.del(this.CACHE_KEYS.deliberation);
  }

  /**
   * Update synthesis configuration
   */
  private async updateSynthesisConfig(config: SynthesisConfig): Promise<void> {
    // Validate configuration
    this.validateSynthesisConfig(config);

    // Get current version
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'synthesis'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    // Deactivate old configurations
    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'synthesis' AND active = true`
    );

    // Insert new configuration
    const serializedConfig = this.serializeSynthesisConfig(config);
    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'synthesis', $1, $2, NOW(), true)`,
      [serializedConfig, newVersion]
    );

    // Invalidate cache
    await this.redis.del(this.CACHE_KEYS.synthesis);
  }

  /**
   * Update performance configuration
   */
  private async updatePerformanceConfig(
    config: PerformanceConfig
  ): Promise<void> {
    // Validate configuration
    this.validatePerformanceConfig(config);

    // Get current version
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'performance'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    // Deactivate old configurations
    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'performance' AND active = true`
    );

    // Insert new configuration
    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'performance', $1, $2, NOW(), true)`,
      [JSON.stringify(config), newVersion]
    );

    // Invalidate cache
    await this.redis.del(this.CACHE_KEYS.performance);
  }

  /**
   * Validate council configuration
   */
  private validateCouncilConfig(config: CouncilConfig): void {
    if (!config.members || config.members.length < 2) {
      throw new ConfigurationValidationError(
        'Council must have at least 2 members'
      );
    }

    // Validate each member
    for (const member of config.members) {
      if (!member.id || !member.provider || !member.model) {
        throw new ConfigurationValidationError(
          'Each council member must have id, provider, and model'
        );
      }

      if (member.timeout <= 0) {
        throw new ConfigurationValidationError(
          `Invalid timeout for member ${member.id}: must be positive`
        );
      }

      this.validateRetryPolicy(member.retryPolicy);
    }

    if (config.minimumSize < 1) {
      throw new ConfigurationValidationError(
        'Minimum council size must be at least 1'
      );
    }

    if (config.minimumSize > config.members.length) {
      throw new ConfigurationValidationError(
        'Minimum council size cannot exceed total number of members'
      );
    }
  }

  /**
   * Validate retry policy
   */
  private validateRetryPolicy(policy: RetryPolicy): void {
    if (policy.maxAttempts <= 0) {
      throw new ConfigurationValidationError(
        'Retry maxAttempts must be positive'
      );
    }

    if (policy.initialDelayMs <= 0) {
      throw new ConfigurationValidationError(
        'Retry initialDelayMs must be positive'
      );
    }

    if (policy.maxDelayMs < policy.initialDelayMs) {
      throw new ConfigurationValidationError(
        'Retry maxDelayMs must be >= initialDelayMs'
      );
    }

    if (policy.backoffMultiplier <= 0) {
      throw new ConfigurationValidationError(
        'Retry backoffMultiplier must be positive'
      );
    }
  }

  /**
   * Validate deliberation configuration
   */
  private validateDeliberationConfig(config: DeliberationConfig): void {
    if (config.rounds < 0 || config.rounds > 5) {
      throw new ConfigurationValidationError(
        'Deliberation rounds must be between 0 and 5'
      );
    }

    const validPresets = ['fast', 'balanced', 'thorough', 'research-grade'];
    if (!validPresets.includes(config.preset)) {
      throw new ConfigurationValidationError(
        `Invalid preset: ${config.preset}. Must be one of: ${validPresets.join(', ')}`
      );
    }
  }

  /**
   * Validate performance configuration
   */
  private validatePerformanceConfig(config: PerformanceConfig): void {
    if (config.globalTimeout <= 0) {
      throw new ConfigurationValidationError('Global timeout must be positive');
    }
  }

  /**
   * Validate synthesis configuration
   */
  private validateSynthesisConfig(config: SynthesisConfig): void {
    if (!config.strategy) {
      throw new ConfigurationValidationError('Synthesis strategy is required');
    }

    const validTypes = [
      'consensus-extraction',
      'weighted-fusion',
      'meta-synthesis'
    ];
    if (!validTypes.includes(config.strategy.type)) {
      throw new ConfigurationValidationError(
        `Invalid synthesis strategy type: ${config.strategy.type}. Must be one of: ${validTypes.join(', ')}`
      );
    }

    // Validate weighted-fusion specific configuration
    if (config.strategy.type === 'weighted-fusion') {
      const strategy = config.strategy as any;
      if (
        !strategy.weights ||
        !(strategy.weights instanceof Map) ||
        strategy.weights.size === 0
      ) {
        throw new ConfigurationValidationError(
          'Weighted fusion strategy requires non-empty weights map'
        );
      }

      // Validate all weights are positive numbers
      for (const [memberId, weight] of strategy.weights.entries()) {
        if (typeof weight !== 'number' || weight <= 0 || isNaN(weight)) {
          throw new ConfigurationValidationError(
            `Invalid weight for member ${memberId}: must be a positive number`
          );
        }
      }
    }

    // Validate meta-synthesis specific configuration
    if (config.strategy.type === 'meta-synthesis') {
      const strategy = config.strategy as any;
      if (!strategy.moderatorStrategy) {
        throw new ConfigurationValidationError(
          'Meta-synthesis strategy requires moderatorStrategy'
        );
      }

      const validModeratorTypes = ['permanent', 'rotate', 'strongest'];
      if (!validModeratorTypes.includes(strategy.moderatorStrategy.type)) {
        throw new ConfigurationValidationError(
          `Invalid moderator strategy type: ${strategy.moderatorStrategy.type}. Must be one of: ${validModeratorTypes.join(', ')}`
        );
      }

      // Validate permanent moderator has member ID
      if (strategy.moderatorStrategy.type === 'permanent') {
        if (!strategy.moderatorStrategy.memberId) {
          throw new ConfigurationValidationError(
            'Permanent moderator strategy requires memberId'
          );
        }
      }
    }
  }

  /**
   * Get default council configuration
   */
  private getDefaultCouncilConfig(): CouncilConfig {
    return {
      members: [
        {
          id: 'gpt-4o-default',
          provider: 'openai',
          model: 'gpt-4o',
          timeout: 30,
          retryPolicy: this.getDefaultRetryPolicy()
        },
        {
          id: 'claude-sonnet-default',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          timeout: 30,
          retryPolicy: this.getDefaultRetryPolicy()
        },
        {
          id: 'gemini-pro-default',
          provider: 'google',
          model: 'gemini-1.5-pro',
          timeout: 30,
          retryPolicy: this.getDefaultRetryPolicy()
        },
        {
          id: 'xai-grok-default',
          provider: 'xai',
          model: 'grok-2',
          timeout: 30,
          retryPolicy: this.getDefaultRetryPolicy()
        }
      ],
      minimumSize: 2,
      requireMinimumForConsensus: false
    };
  }

  /**
   * Get default deliberation configuration
   */
  private getDefaultDeliberationConfig(): DeliberationConfig {
    return {
      rounds: 1,
      preset: 'balanced'
    };
  }

  /**
   * Get default synthesis configuration
   */
  private getDefaultSynthesisConfig(): SynthesisConfig {
    return {
      strategy: { type: 'consensus-extraction' }
    };
  }

  /**
   * Get default performance configuration
   */
  private getDefaultPerformanceConfig(): PerformanceConfig {
    return {
      globalTimeout: 60,
      enableFastFallback: true,
      streamingEnabled: true
    };
  }

  /**
   * Get default transparency configuration
   */
  private getDefaultTransparencyConfig(): TransparencyConfig {
    return {
      enabled: true,
      forcedTransparency: false
    };
  }

  /**
   * Get Devil's Advocate configuration
   */
  async getDevilsAdvocateConfig(): Promise<DevilsAdvocateConfig> {
    // Try cache first
    const cached = await this.redis.get(this.CACHE_KEYS.devilsAdvocate);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const result = await this.db.query(
      `SELECT config_data FROM configurations
       WHERE config_type = 'devils_advocate' AND active = true
       ORDER BY version DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Return default configuration
      return this.getDefaultDevilsAdvocateConfig();
    }

    const config = result.rows[0].config_data;

    // Cache it
    await this.redis.set(
      this.CACHE_KEYS.devilsAdvocate,
      JSON.stringify(config)
    );

    return config;
  }

  /**
   * Update Devil's Advocate configuration
   */
  async updateDevilsAdvocateConfig(
    config: DevilsAdvocateConfig
  ): Promise<void> {
    // Validate configuration
    if (typeof config.enabled !== 'boolean') {
      throw new ConfigurationValidationError('enabled must be a boolean');
    }
    if (typeof config.applyToCodeRequests !== 'boolean') {
      throw new ConfigurationValidationError(
        'applyToCodeRequests must be a boolean'
      );
    }
    if (typeof config.applyToTextRequests !== 'boolean') {
      throw new ConfigurationValidationError(
        'applyToTextRequests must be a boolean'
      );
    }
    if (!['light', 'moderate', 'thorough'].includes(config.intensityLevel)) {
      throw new ConfigurationValidationError(
        'intensityLevel must be one of: light, moderate, thorough'
      );
    }
    if (!config.provider || typeof config.provider !== 'string') {
      throw new ConfigurationValidationError(
        'provider must be a non-empty string'
      );
    }
    if (!config.model || typeof config.model !== 'string') {
      throw new ConfigurationValidationError(
        'model must be a non-empty string'
      );
    }

    // Get current version
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'devils_advocate'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    // Deactivate old configurations
    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'devils_advocate' AND active = true`
    );

    // Insert new configuration
    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'devils_advocate', $1, $2, NOW(), true)`,
      [JSON.stringify(config), newVersion]
    );

    // Invalidate cache
    await this.redis.del(this.CACHE_KEYS.devilsAdvocate);
  }

  /**
   * Get default Devil's Advocate configuration
   */
  private getDefaultDevilsAdvocateConfig(): DevilsAdvocateConfig {
    return {
      enabled: false,
      applyToCodeRequests: true,
      applyToTextRequests: false,
      intensityLevel: 'moderate',
      provider: 'openai',
      model: 'gpt-4'
    };
  }

  /**
   * Get default retry policy
   */
  private getDefaultRetryPolicy(): RetryPolicy {
    return {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
    };
  }

  /**
   * Get preset configurations (DB-driven, cached)
   */
  async getPresetConfigurations(preset: ConfigPreset): Promise<{
    council: CouncilConfig;
    deliberation: DeliberationConfig;
    synthesis: SynthesisConfig;
    performance: PerformanceConfig;
    transparency: TransparencyConfig;
  }> {
    // Check cache first
    const cached = await this.redis.get(`preset:${preset}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as {
          council: CouncilConfig;
          deliberation: DeliberationConfig;
          synthesis: SynthesisConfig;
          performance: PerformanceConfig;
          transparency: TransparencyConfig;
        };
        // Validate cached data has required structure
        if (parsed.council && parsed.deliberation && parsed.performance && parsed.synthesis) {
          return parsed;
        }
        // If cached data is invalid, clear cache and fetch from DB
        console.warn(`Invalid cached preset data for '${preset}', clearing cache and fetching from DB`);
        await this.redis.del(`preset:${preset}`);
      } catch (parseError) {
        // If cache parse fails, clear cache and fetch from DB
        console.warn(`Failed to parse cached preset '${preset}', clearing cache:`, parseError);
        await this.redis.del(`preset:${preset}`);
      }
    }

    // Query database
    const result = await this.db.query(
      'SELECT config_data FROM council_presets WHERE preset_name = $1',
      [preset]
    );

    if (result.rows.length === 0) {
      throw new ConfigurationValidationError(
        `Preset '${preset}' not found in DB`
      );
    }

    const configs = result.rows[0].config_data as {
      council: CouncilConfig;
      deliberation: DeliberationConfig;
      synthesis: SynthesisConfig;
      performance: PerformanceConfig;
      transparency: TransparencyConfig;
    };

    // Validate council config exists and has required structure
    if (!configs.council || typeof configs.council !== 'object') {
      throw new ConfigurationValidationError(
        `Preset '${preset}' has invalid or missing council config`
      );
    }
    if (!configs.council.members || !Array.isArray(configs.council.members)) {
      throw new ConfigurationValidationError(
        `Preset '${preset}' has invalid council.members (must be an array)`
      );
    }
    if (configs.council.members.length === 0) {
      throw new ConfigurationValidationError(
        `Preset '${preset}' has no council members`
      );
    }

    // Validate deliberation config
    if (!configs.deliberation || typeof configs.deliberation !== 'object') {
      throw new ConfigurationValidationError(
        `Preset '${preset}' has invalid or missing deliberation config`
      );
    }

    // Validate synthesis config
    if (!configs.synthesis || typeof configs.synthesis !== 'object') {
      throw new ConfigurationValidationError(
        `Preset '${preset}' has invalid or missing synthesis config`
      );
    }

    // Validate and normalize performance config
    if (!configs.performance || typeof configs.performance !== 'object') {
      throw new ConfigurationValidationError(
        `Preset '${preset}' has invalid performance config`
      );
    }
    // Ensure globalTimeout is a number
    if (typeof configs.performance.globalTimeout !== 'number') {
      configs.performance.globalTimeout = Number(configs.performance.globalTimeout) || 60;
    }
    if (configs.performance.globalTimeout <= 0) {
      throw new ConfigurationValidationError(
        `Preset '${preset}' has invalid globalTimeout: ${configs.performance.globalTimeout}`
      );
    }

    // Deserialize synthesis config (handle Maps for weighted-fusion)
    if (configs.synthesis?.strategy?.type === 'weighted-fusion') {
      const strategy = configs.synthesis.strategy as any;
      if (strategy.weights && !(strategy.weights instanceof Map)) {
        strategy.weights = new Map(Object.entries(strategy.weights));
      }
    }

    // Cache for 5 minutes
    await this.redis.setEx(`preset:${preset}`, 300, JSON.stringify(configs));

    return configs;
  }


  /**
   * Serialize council config (convert Maps to objects for JSON storage)
   */
  private serializeCouncilConfig(config: CouncilConfig): any {
    return {
      members: config.members,
      minimumSize: config.minimumSize,
      requireMinimumForConsensus: config.requireMinimumForConsensus
    };
  }

  /**
   * Deserialize council config
   */
  private deserializeCouncilConfig(data: any): CouncilConfig {
    return {
      members: data.members,
      minimumSize: data.minimumSize,
      requireMinimumForConsensus: data.requireMinimumForConsensus
    };
  }

  /**
   * Serialize synthesis config (convert Maps to objects for JSON storage)
   */
  private serializeSynthesisConfig(config: SynthesisConfig): any {
    const serializedStrategy: any = {
      ...config.strategy
    };

    if (
      config.strategy.type === 'weighted-fusion' &&
      (config.strategy as any).weights
    ) {
      const strategyWeights = (config.strategy as any).weights;
      serializedStrategy.weights =
        strategyWeights instanceof Map
          ? Object.fromEntries(strategyWeights)
          : strategyWeights;
    }

    const serialized: any = {
      strategy: serializedStrategy
    };

    if (config.moderatorStrategy) {
      serialized.moderatorStrategy = config.moderatorStrategy;
    }

    if (config.weights) {
      serialized.weights = Object.fromEntries(config.weights);
    }

    return serialized;
  }

  /**
   * Deserialize synthesis config (convert objects to Maps)
   */
  private deserializeSynthesisConfig(data: any): SynthesisConfig {
    const strategy: any = data.strategy ? { ...data.strategy } : undefined;
    if (strategy?.type === 'weighted-fusion' && strategy.weights) {
      const weightsMap =
        strategy.weights instanceof Map
          ? strategy.weights
          : new Map(Object.entries(strategy.weights));
      // Validate that weights map is not empty
      if (weightsMap.size === 0) {
        throw new ConfigurationValidationError(
          'Weighted fusion strategy requires non-empty weights map'
        );
      }
      strategy.weights = weightsMap;
    }

    const config: SynthesisConfig = {
      strategy
    };

    if (data.moderatorStrategy) {
      config.moderatorStrategy = data.moderatorStrategy;
    }

    if (data.weights) {
      config.weights = new Map(Object.entries(data.weights));
    }

    return config;
  }

  /**
   * Get model rankings for moderator selection
   */
  async getModelRankings(): Promise<ModelRankings> {
    // Try cache first
    const cached = await this.redis.get(this.CACHE_KEYS.modelRankings);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const result = await this.db.query(
      'SELECT model_name, score FROM model_rankings ORDER BY score DESC'
    );

    if (result.rows.length === 0) {
      // Initialize default rankings if none exist
      await this.initializeDefaultModelRankings();
      // Fetch again after initialization
      const initResult = await this.db.query(
        'SELECT model_name, score FROM model_rankings ORDER BY score DESC'
      );
      const rankings = this.buildRankingsMap(initResult.rows);
      await this.redis.set(
        this.CACHE_KEYS.modelRankings,
        JSON.stringify(rankings)
      );
      return rankings;
    }

    const rankings = this.buildRankingsMap(result.rows);

    // Cache it
    await this.redis.set(
      this.CACHE_KEYS.modelRankings,
      JSON.stringify(rankings)
    );

    return rankings;
  }

  /**
   * Update model rankings
   */
  async updateModelRankings(rankings: ModelRankings): Promise<void> {
    // Validate rankings
    for (const [modelName, score] of Object.entries(rankings)) {
      if (typeof score !== 'number' || score < 0 || isNaN(score)) {
        throw new ConfigurationValidationError(
          `Invalid score for model ${modelName}: must be a non-negative number`
        );
      }
    }

    // Use a transaction to update all rankings atomically
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Delete existing rankings
      await client.query('DELETE FROM model_rankings');

      // Insert new rankings
      for (const [modelName, score] of Object.entries(rankings)) {
        await client.query(
          `INSERT INTO model_rankings (model_name, score, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (model_name) DO UPDATE SET score = $2, updated_at = NOW()`,
          [modelName, score]
        );
      }

      await client.query('COMMIT');

      // Invalidate cache
      await this.redis.del(this.CACHE_KEYS.modelRankings);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Initialize default model rankings
   * These are fallback values used when no rankings exist in the database.
   * Rankings should be updated via updateModelRankings() based on actual model performance.
   */
  private async initializeDefaultModelRankings(): Promise<void> {
    const defaultRankings: ModelRankings = {
      // === Current frontier models (November 2025) ===
      // Flagship models - highest tier
      'gpt-5.1': 125,          // Newest OpenAI flagship
      'claude-opus-4.5': 122,  // Newest Anthropic flagship (alias)
      'gemini-3.0': 122,       // Newest Google flagship
      'grok-4.1': 120,         // Newest xAI flagship

      // OpenAI GPT-5 series
      'gpt-5': 120,
      'gpt-5-pro': 122,
      'gpt-5-mini': 108,
      'gpt-5-nano': 95,
      'gpt-4.1': 112,

      // OpenAI reasoning models
      o3: 118,
      'o3-pro': 120,
      'o3-mini': 105,
      'o4-mini': 107,

      // Anthropic Claude 4 series
      'claude-opus-4-5-20251101': 122,  // Newest Anthropic flagship
      'claude-sonnet-4-5-20251001': 118,
      'claude-sonnet-4.5': 118,
      'claude-opus-4-1-20250522': 116,
      'claude-opus-4.1': 116,
      'claude-sonnet-4': 114,
      'claude-haiku-4.5': 104,
      'claude-haiku-4-5-20251015': 104,

      // Google Gemini 3 series
      'gemini-3-pro-preview': 120,
      'gemini-3-pro': 120,
      'gemini-3-pro-image-preview': 118,

      // Google Gemini 2.5 series
      'gemini-2.5-pro': 114,
      'gemini-2.5-flash': 106,
      'gemini-2.5-flash-lite': 98,

      // xAI Grok 4 series
      'grok-4-0709': 118,
      'grok-4': 118,
      'grok-4-fast-reasoning': 112,
      'grok-4-fast-non-reasoning': 110,
      'grok-code-fast-1': 109,

      // xAI Grok 3 series
      'grok-3': 108,
      'grok-3-mini': 98,

      // === Previous generation models (still widely used) ===
      // OpenAI GPT-4o series
      'gpt-4o': 105,
      'gpt-4o-2024-11-20': 105,
      'gpt-4o-mini': 96,
      'gpt-4o-mini-2024-07-18': 96,

      // OpenAI reasoning models (previous gen)
      o1: 110,
      'o1-2024-12-17': 110,
      'o1-preview': 108,
      'o1-mini': 100,

      // Anthropic Claude 4 series (latest) - already defined above
      'claude-sonnet-4-5-20250929': 115,
      'claude-haiku-4-5-20251001': 100,
      'claude-opus-4-1-20250805': 118,
      'claude-opus-4-20250514': 116,
      'claude-sonnet-4-20250514': 112,

      // Anthropic Claude 3.5 series
      'claude-3-5-sonnet-20241022': 106,
      'claude-3-5-sonnet-latest': 106,
      'claude-3.5-sonnet': 106,
      'claude-3-5-haiku-20241022': 94,
      'claude-3-5-haiku-latest': 94,

      // Anthropic Claude 3 series
      'claude-3-opus-20240229': 102,
      'claude-3-opus-latest': 102,
      'claude-3-sonnet-20240229': 92,
      'claude-3-haiku-20240307': 82,

      // Google Gemini 2.0 series
      'gemini-2.0-flash': 100,
      'gemini-2.0-flash-001': 100,
      'gemini-2.0-flash-lite': 92,
      'gemini-2.0-pro-exp': 104,

      // Google Gemini 1.5 series
      'gemini-1.5-pro': 98,
      'gemini-1.5-pro-002': 98,
      'gemini-1.5-flash': 90,
      'gemini-1.5-flash-002': 90,
      'gemini-1.5-flash-8b': 82,

      // xAI Grok 2 series
      'grok-2': 95,
      'grok-2-1212': 95,
      'grok-2-latest': 95,
      'grok-2-vision-1212': 94,

      // === Legacy models (for backward compatibility) ===
      'gpt-4-turbo': 90,
      'gpt-4': 85,
      'gpt-3.5-turbo': 65,
      'gemini-pro': 88,
      'gemini-1.0-pro': 85,
      'claude-2.1': 78,
      'claude-2': 75,
      'claude-instant-1.2': 68,
      'grok-1': 70,

      // === Strong open-weight models ===
      'deepseek-v3': 109,
      'deepseek-r1': 108,
      'qwen3-235b': 107,
      'qwen3-72b': 105,
      'llama-4-maverick': 106,
      'minimax-m2': 104,

      // === Fallback ===
      default: 50
    };

    await this.updateModelRankings(defaultRankings);
  }

  /**
   * Build rankings map from database rows
   */
  private buildRankingsMap(
    rows: Array<{ model_name: string; score: number }>
  ): ModelRankings {
    const rankings: ModelRankings = {};
    for (const row of rows) {
      rankings[row.model_name] = parseFloat(row.score.toString());
    }
    return rankings;
  }

  /**
   * Get iterative consensus configuration
   */
  async getIterativeConsensusConfig(): Promise<IterativeConsensusConfig> {
    // Try cache first
    const cached = await this.redis.get(this.CACHE_KEYS.iterativeConsensus);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const result = await this.db.query(
      `SELECT config_data FROM configurations
       WHERE config_type = 'iterative_consensus' AND active = true
       ORDER BY version DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Return default configuration
      return this.getDefaultIterativeConsensusConfig();
    }

    const config = result.rows[0].config_data;

    // Cache it
    await this.redis.set(
      this.CACHE_KEYS.iterativeConsensus,
      JSON.stringify(config)
    );

    return config;
  }

  /**
   * Update iterative consensus configuration
   */
  async updateIterativeConsensusConfig(
    config: IterativeConsensusConfig
  ): Promise<void> {
    // Validate configuration
    this.validateIterativeConsensusConfig(config);

    // Get current version
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'iterative_consensus'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    // Deactivate old configurations
    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'iterative_consensus' AND active = true`
    );

    // Insert new configuration
    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'iterative_consensus', $1, $2, NOW(), true)`,
      [JSON.stringify(config), newVersion]
    );

    // Invalidate cache
    await this.redis.del(this.CACHE_KEYS.iterativeConsensus);
  }

  /**
   * Get default iterative consensus configuration
   */
  private getDefaultIterativeConsensusConfig(): IterativeConsensusConfig {
    return {
      maxRounds: 3,
      agreementThreshold: 0.8,
      fallbackStrategy: 'meta-synthesis',
      embeddingModel: 'text-embedding-3-large',
      earlyTerminationEnabled: true,
      earlyTerminationThreshold: 0.95,
      negotiationMode: 'parallel',
      perRoundTimeout: 30,
      humanEscalationEnabled: false,
      exampleCount: 2
    };
  }

  /**
   * Validate iterative consensus configuration
   */
  private validateIterativeConsensusConfig(
    config: IterativeConsensusConfig
  ): void {
    // Validate maxRounds [1-10]
    if (
      !Number.isInteger(config.maxRounds) ||
      config.maxRounds < 1 ||
      config.maxRounds > 10
    ) {
      throw new ConfigurationValidationError(
        `Invalid maxRounds: ${config.maxRounds}. Must be an integer between 1 and 10.`
      );
    }

    // Validate agreementThreshold [0.7-1.0]
    if (
      typeof config.agreementThreshold !== 'number' ||
      config.agreementThreshold < 0.7 ||
      config.agreementThreshold > 1.0
    ) {
      throw new ConfigurationValidationError(
        `Invalid agreementThreshold: ${config.agreementThreshold}. Must be between 0.7 and 1.0.`
      );
    }

    // Validate fallbackStrategy
    const validFallbacks = [
      'meta-synthesis',
      'consensus-extraction',
      'weighted-fusion'
    ];
    if (!validFallbacks.includes(config.fallbackStrategy)) {
      throw new ConfigurationValidationError(
        `Invalid fallbackStrategy: ${config.fallbackStrategy}. Must be one of: ${validFallbacks.join(', ')}`
      );
    }

    // Validate embeddingModel (whitelist)
    const validModels = [
      'text-embedding-3-large',
      'text-embedding-3-small',
      'text-embedding-ada-002'
    ];
    if (!validModels.includes(config.embeddingModel)) {
      throw new ConfigurationValidationError(
        `Invalid embeddingModel: ${config.embeddingModel}. Must be one of: ${validModels.join(', ')}`
      );
    }

    // Validate earlyTerminationThreshold [0.7-1.0]
    if (config.earlyTerminationEnabled) {
      if (
        typeof config.earlyTerminationThreshold !== 'number' ||
        config.earlyTerminationThreshold < 0.7 ||
        config.earlyTerminationThreshold > 1.0
      ) {
        throw new ConfigurationValidationError(
          `Invalid earlyTerminationThreshold: ${config.earlyTerminationThreshold}. Must be between 0.7 and 1.0.`
        );
      }
    }

    // Validate negotiationMode
    if (
      config.negotiationMode !== 'parallel' &&
      config.negotiationMode !== 'sequential'
    ) {
      throw new ConfigurationValidationError(
        `Invalid negotiationMode: ${config.negotiationMode}. Must be 'parallel' or 'sequential'.`
      );
    }

    // Validate perRoundTimeout
    if (
      typeof config.perRoundTimeout !== 'number' ||
      config.perRoundTimeout <= 0
    ) {
      throw new ConfigurationValidationError(
        `Invalid perRoundTimeout: ${config.perRoundTimeout}. Must be a positive number.`
      );
    }

    // Validate exampleCount
    if (
      !Number.isInteger(config.exampleCount) ||
      config.exampleCount < 0 ||
      config.exampleCount > 10
    ) {
      throw new ConfigurationValidationError(
        `Invalid exampleCount: ${config.exampleCount}. Must be an integer between 0 and 10.`
      );
    }
  }

  /**
   * Get preset configurations for iterative consensus
   */
  getIterativeConsensusPresets(): Record<string, IterativeConsensusConfig> {
    return {
      'strict-consensus': {
        maxRounds: 5,
        agreementThreshold: 0.9,
        fallbackStrategy: 'meta-synthesis',
        embeddingModel: 'text-embedding-3-large',
        earlyTerminationEnabled: true,
        earlyTerminationThreshold: 0.95,
        negotiationMode: 'parallel',
        perRoundTimeout: 30,
        humanEscalationEnabled: true,
        exampleCount: 3
      },
      'balanced-consensus': {
        maxRounds: 3,
        agreementThreshold: 0.8,
        fallbackStrategy: 'consensus-extraction',
        embeddingModel: 'text-embedding-3-large',
        earlyTerminationEnabled: true,
        earlyTerminationThreshold: 0.95,
        negotiationMode: 'parallel',
        perRoundTimeout: 30,
        humanEscalationEnabled: false,
        exampleCount: 2
      },
      'fast-consensus': {
        maxRounds: 2,
        agreementThreshold: 0.75,
        fallbackStrategy: 'weighted-fusion',
        embeddingModel: 'text-embedding-3-small',
        earlyTerminationEnabled: true,
        earlyTerminationThreshold: 0.9,
        negotiationMode: 'parallel',
        perRoundTimeout: 20,
        humanEscalationEnabled: false,
        exampleCount: 1
      }
    };
  }
}
