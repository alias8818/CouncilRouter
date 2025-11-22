import {
  CouncilConfig,
  DeliberationConfig,
  SynthesisConfig,
  PerformanceConfig,
  TransparencyConfig,
  ConfigPreset
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
   * Apply a configuration preset
   */
  applyPreset(preset: ConfigPreset): Promise<void>;
}
