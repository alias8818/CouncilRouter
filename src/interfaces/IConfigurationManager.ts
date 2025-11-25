import {
  CouncilConfig,
  DeliberationConfig,
  SynthesisConfig,
  PerformanceConfig,
  TransparencyConfig,
  DevilsAdvocateConfig,
  ConfigPreset,
  ModelRankings,
  IterativeConsensusConfig
} from '../types/core';

/**
 * Configuration Manager Interface
 * Manages system configuration
 */
export interface IConfigurationManager {
  /**
   * Get current council configuration
   */
  getCouncilConfig(): Promise<CouncilConfig>;

  /**
   * Update council configuration
   */
  updateCouncilConfig(config: CouncilConfig): Promise<void>;

  /**
   * Get deliberation configuration
   */
  getDeliberationConfig(): Promise<DeliberationConfig>;

  /**
   * Get synthesis configuration
   */
  getSynthesisConfig(): Promise<SynthesisConfig>;

  /**
   * Get performance configuration
   */
  getPerformanceConfig(): Promise<PerformanceConfig>;

  /**
   * Get transparency configuration
   */
  getTransparencyConfig(): Promise<TransparencyConfig>;

  /**
   * Update transparency configuration
   */
  updateTransparencyConfig(config: TransparencyConfig): Promise<void>;

  /**
   * Get Devil's Advocate configuration
   */
  getDevilsAdvocateConfig(): Promise<DevilsAdvocateConfig>;

  /**
   * Update Devil's Advocate configuration
   */
  updateDevilsAdvocateConfig(config: DevilsAdvocateConfig): Promise<void>;

  /**
   * Apply a configuration preset
   */
  applyPreset(preset: ConfigPreset): Promise<void>;

  /**
   * Get preset configurations (for per-request preset support)
   */
  getPresetConfigurations(preset: ConfigPreset): Promise<{
    council: CouncilConfig;
    deliberation: DeliberationConfig;
    synthesis: SynthesisConfig;
    performance: PerformanceConfig;
    transparency: TransparencyConfig;
  }>;

  /**
   * Get model rankings for moderator selection
   */
  getModelRankings(): Promise<ModelRankings>;

  /**
   * Update model rankings
   */
  updateModelRankings(rankings: ModelRankings): Promise<void>;

  /**
   * Get iterative consensus configuration
   */
  getIterativeConsensusConfig(): Promise<IterativeConsensusConfig>;

  /**
   * Update iterative consensus configuration
   */
  updateIterativeConsensusConfig(config: IterativeConsensusConfig): Promise<void>;
}
