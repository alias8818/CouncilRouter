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
  ModelRankings
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
    modelRankings: 'config:model_rankings'
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
    await this.redis.set(this.CACHE_KEYS.council, JSON.stringify(result.rows[0].config_data));

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
    await this.redis.set(this.CACHE_KEYS.synthesis, JSON.stringify(result.rows[0].config_data));

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
    this.validatePreset(preset);

    const presetConfigs = this.getPresetConfigurations(preset);

    // Update all configurations
    await this.updateCouncilConfig(presetConfigs.council);
    await this.updateDeliberationConfig(presetConfigs.deliberation);
    await this.updateSynthesisConfig(presetConfigs.synthesis);
    await this.updatePerformanceConfig(presetConfigs.performance);
    await this.updateTransparencyConfig(presetConfigs.transparency);
  }

  /**
   * Validate preset name
   */
  private validatePreset(preset: ConfigPreset): void {
    const validPresets: ConfigPreset[] = ['fast-council', 'balanced-council', 'research-council', 'coding-council'];
    if (!validPresets.includes(preset)) {
      throw new ConfigurationValidationError(
        `Invalid preset: ${preset}. Must be one of: ${validPresets.join(', ')}`
      );
    }
  }

  /**
   * Update deliberation configuration
   */
  private async updateDeliberationConfig(config: DeliberationConfig): Promise<void> {
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
  private async updatePerformanceConfig(config: PerformanceConfig): Promise<void> {
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
      throw new ConfigurationValidationError(
        'Global timeout must be positive'
      );
    }
  }

  /**
   * Validate synthesis configuration
   */
  private validateSynthesisConfig(config: SynthesisConfig): void {
    if (!config.strategy) {
      throw new ConfigurationValidationError(
        'Synthesis strategy is required'
      );
    }

    const validTypes = ['consensus-extraction', 'weighted-fusion', 'meta-synthesis'];
    if (!validTypes.includes(config.strategy.type)) {
      throw new ConfigurationValidationError(
        `Invalid synthesis strategy type: ${config.strategy.type}. Must be one of: ${validTypes.join(', ')}`
      );
    }

    // Validate weighted-fusion specific configuration
    if (config.strategy.type === 'weighted-fusion') {
      const strategy = config.strategy as any;
      if (!strategy.weights || !(strategy.weights instanceof Map) || strategy.weights.size === 0) {
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
          id: 'gpt-4-default',
          provider: 'openai',
          model: 'gpt-4',
          timeout: 30,
          retryPolicy: this.getDefaultRetryPolicy()
        },
        {
          id: 'claude-3-default',
          provider: 'anthropic',
          model: 'claude-3-opus-20240229',
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
    await this.redis.set(this.CACHE_KEYS.devilsAdvocate, JSON.stringify(config));

    return config;
  }

  /**
   * Update Devil's Advocate configuration
   */
  async updateDevilsAdvocateConfig(config: DevilsAdvocateConfig): Promise<void> {
    // Validate configuration
    if (typeof config.enabled !== 'boolean') {
      throw new ConfigurationValidationError('enabled must be a boolean');
    }
    if (typeof config.applyToCodeRequests !== 'boolean') {
      throw new ConfigurationValidationError('applyToCodeRequests must be a boolean');
    }
    if (typeof config.applyToTextRequests !== 'boolean') {
      throw new ConfigurationValidationError('applyToTextRequests must be a boolean');
    }
    if (!['light', 'moderate', 'thorough'].includes(config.intensityLevel)) {
      throw new ConfigurationValidationError('intensityLevel must be one of: light, moderate, thorough');
    }
    if (!config.provider || typeof config.provider !== 'string') {
      throw new ConfigurationValidationError('provider must be a non-empty string');
    }
    if (!config.model || typeof config.model !== 'string') {
      throw new ConfigurationValidationError('model must be a non-empty string');
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
   * Get preset configurations
   */
  private getPresetConfigurations(preset: ConfigPreset): {
    council: CouncilConfig;
    deliberation: DeliberationConfig;
    synthesis: SynthesisConfig;
    performance: PerformanceConfig;
    transparency: TransparencyConfig;
  } {
    switch (preset) {
      case 'fast-council':
        return {
          council: {
            members: [
              {
                id: 'gpt-3.5-fast',
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                timeout: 15,
                retryPolicy: {
                  maxAttempts: 2,
                  initialDelayMs: 500,
                  maxDelayMs: 5000,
                  backoffMultiplier: 2,
                  retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
                }
              },
              {
                id: 'claude-instant-fast',
                provider: 'anthropic',
                model: 'claude-instant-1.2',
                timeout: 15,
                retryPolicy: {
                  maxAttempts: 2,
                  initialDelayMs: 500,
                  maxDelayMs: 5000,
                  backoffMultiplier: 2,
                  retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
                }
              }
            ],
            minimumSize: 2,
            requireMinimumForConsensus: false
          },
          deliberation: {
            rounds: 0,
            preset: 'fast'
          },
          synthesis: {
            strategy: { type: 'consensus-extraction' }
          },
          performance: {
            globalTimeout: 30,
            enableFastFallback: true,
            streamingEnabled: true
          },
          transparency: {
            enabled: true,
            forcedTransparency: false
          }
        };

      case 'balanced-council':
        return {
          council: {
            members: [
              {
                id: 'gpt-4-balanced',
                provider: 'openai',
                model: 'gpt-4',
                timeout: 30,
                retryPolicy: this.getDefaultRetryPolicy()
              },
              {
                id: 'claude-3-balanced',
                provider: 'anthropic',
                model: 'claude-3-opus-20240229',
                timeout: 30,
                retryPolicy: this.getDefaultRetryPolicy()
              },
              {
                id: 'gemini-balanced',
                provider: 'google',
                model: 'gemini-pro',
                timeout: 30,
                retryPolicy: this.getDefaultRetryPolicy()
              }
            ],
            minimumSize: 2,
            requireMinimumForConsensus: false
          },
          deliberation: {
            rounds: 1,
            preset: 'balanced'
          },
          synthesis: {
            strategy: { type: 'consensus-extraction' }
          },
          performance: {
            globalTimeout: 60,
            enableFastFallback: true,
            streamingEnabled: true
          },
          transparency: {
            enabled: true,
            forcedTransparency: false
          }
        };

      case 'research-council':
        return {
          council: {
            members: [
              {
                id: 'gpt-4-research',
                provider: 'openai',
                model: 'gpt-4',
                timeout: 60,
                retryPolicy: {
                  maxAttempts: 5,
                  initialDelayMs: 2000,
                  maxDelayMs: 20000,
                  backoffMultiplier: 2,
                  retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
                }
              },
              {
                id: 'claude-3-research',
                provider: 'anthropic',
                model: 'claude-3-opus-20240229',
                timeout: 60,
                retryPolicy: {
                  maxAttempts: 5,
                  initialDelayMs: 2000,
                  maxDelayMs: 20000,
                  backoffMultiplier: 2,
                  retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
                }
              },
              {
                id: 'gemini-research',
                provider: 'google',
                model: 'gemini-pro',
                timeout: 60,
                retryPolicy: {
                  maxAttempts: 5,
                  initialDelayMs: 2000,
                  maxDelayMs: 20000,
                  backoffMultiplier: 2,
                  retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
                }
              }
            ],
            minimumSize: 3,
            requireMinimumForConsensus: true
          },
          deliberation: {
            rounds: 4,
            preset: 'research-grade'
          },
          synthesis: {
            strategy: { type: 'meta-synthesis', moderatorStrategy: { type: 'strongest' } }
          },
          performance: {
            globalTimeout: 180,
            enableFastFallback: false,
            streamingEnabled: true
          },
          transparency: {
            enabled: true,
            forcedTransparency: false
          }
        };

      case 'coding-council':
        return {
          council: {
            members: [
              {
                id: 'claude-sonnet-coding',
                provider: 'anthropic',
                model: 'claude-sonnet-4.5',
                timeout: 120,
                retryPolicy: {
                  maxAttempts: 3,
                  initialDelayMs: 1000,
                  maxDelayMs: 10000,
                  backoffMultiplier: 2,
                  retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
                }
              },
              {
                id: 'gpt-coding',
                provider: 'openai',
                model: 'gpt-5.1',
                timeout: 120,
                retryPolicy: {
                  maxAttempts: 3,
                  initialDelayMs: 1000,
                  maxDelayMs: 10000,
                  backoffMultiplier: 2,
                  retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
                }
              },
              {
                id: 'deepseek-coding',
                provider: 'openai', // Assuming DeepSeek uses OpenAI-compatible API
                model: 'deepseek-v3',
                timeout: 120,
                retryPolicy: {
                  maxAttempts: 3,
                  initialDelayMs: 1000,
                  maxDelayMs: 10000,
                  backoffMultiplier: 2,
                  retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
                }
              }
            ],
            minimumSize: 2,
            requireMinimumForConsensus: true
          },
          deliberation: {
            rounds: 3,
            preset: 'balanced'
          },
          synthesis: {
            strategy: {
              type: 'weighted-fusion',
              weights: new Map([
                ['claude-sonnet-coding', 1.0],
                ['gpt-coding', 1.0],
                ['deepseek-coding', 1.0]
              ])
            }
          },
          performance: {
            globalTimeout: 120,
            enableFastFallback: false,
            streamingEnabled: true
          },
          transparency: {
            enabled: true,
            forcedTransparency: false
          }
        };

      default:
        // This should never be reached if validatePreset is called first
        // But kept as a safety net
        throw new ConfigurationValidationError(`Unknown preset: ${preset}`);
    }
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

    if (config.strategy.type === 'weighted-fusion' && (config.strategy as any).weights) {
      const strategyWeights = (config.strategy as any).weights;
      serializedStrategy.weights =
        strategyWeights instanceof Map ? Object.fromEntries(strategyWeights) : strategyWeights;
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
        strategy.weights instanceof Map ? strategy.weights : new Map(Object.entries(strategy.weights));
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
      await this.redis.set(this.CACHE_KEYS.modelRankings, JSON.stringify(rankings));
      return rankings;
    }

    const rankings = this.buildRankingsMap(result.rows);

    // Cache it
    await this.redis.set(this.CACHE_KEYS.modelRankings, JSON.stringify(rankings));

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
      // === Legacy models ===
      'gpt-3.5-turbo': 65,
      'gpt-4': 85,
      'gpt-4-turbo': 90,
      'gpt-4o': 94,
      'claude-3-haiku': 72,
      'claude-3-sonnet': 86,
      'claude-3-opus': 93,
      'claude-3.5-sonnet': 96,
      'gemini-1.5-pro': 92,
      'gemini-1.5-flash': 80,
      'grok-1': 70,
      'grok-2': 88,

      // === Current frontier closed models ===
      'gemini-2.5-pro': 114,
      'gemini-3-pro': 113,
      'claude-sonnet-4.5': 112,
      'grok-4.1': 111,
      'grok-4': 109,
      'gpt-5.1': 110,
      'gpt-5': 108,
      'claude-opus-4.1': 109,
      'o3': 107,
      'o4-mini': 96,

      // === Strong open-weight models ===
      'deepseek-v3': 109,
      'deepseek-r1': 108,
      'qwen3-235b': 107,
      'qwen3-72b': 105,
      'llama-4-maverick': 106,
      'minimax-m2': 104,

      // === Legacy Google models (for backward compatibility) ===
      'gemini-pro': 92,
      'gemini-ultra': 97,
      'palm-2': 80,
      'claude-2': 85,

      // === Fallback ===
      'default': 50
    };

    await this.updateModelRankings(defaultRankings);
  }

  /**
   * Build rankings map from database rows
   */
  private buildRankingsMap(rows: Array<{ model_name: string; score: number }>): ModelRankings {
    const rankings: ModelRankings = {};
    for (const row of rows) {
      rankings[row.model_name] = parseFloat(row.score.toString());
    }
    return rankings;
  }
}
