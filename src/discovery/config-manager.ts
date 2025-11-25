/**
 * Scraping Configuration Manager
 * Manages scraping configurations with versioning and database storage
 */

import { Pool } from 'pg';
import { ProviderType, ScrapingConfig } from '../types/core';

export interface StoredScrapingConfig {
    id: number;
    provider: ProviderType;
    config: ScrapingConfig;
    active: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}

export class ScrapingConfigManager {
  constructor(private db: Pool) { }

  /**
     * Validate a scraping configuration
     */
  async validateConfig(config: ScrapingConfig): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate URL format
    try {
      new URL(config.url);
    } catch (error) {
      errors.push(`Invalid URL format: ${config.url}`);
    }

    // Validate selectors exist
    if (!config.selectors) {
      errors.push('Selectors object is required');
    } else {
      if (!config.selectors.table || config.selectors.table.trim() === '') {
        errors.push('Table selector is required and cannot be empty');
      }

      if (typeof config.selectors.modelNameColumn !== 'number') {
        errors.push('Model name column index must be a number');
      } else if (config.selectors.modelNameColumn < 0) {
        errors.push('Model name column index must be non-negative');
      }

      if (typeof config.selectors.inputCostColumn !== 'number') {
        errors.push('Input cost column index must be a number');
      } else if (config.selectors.inputCostColumn < 0) {
        errors.push('Input cost column index must be non-negative');
      }

      if (typeof config.selectors.outputCostColumn !== 'number') {
        errors.push('Output cost column index must be a number');
      } else if (config.selectors.outputCostColumn < 0) {
        errors.push('Output cost column index must be non-negative');
      }
    }

    // Validate fallback selectors if present
    if (config.fallbackSelectors) {
      if (!Array.isArray(config.fallbackSelectors)) {
        errors.push('Fallback selectors must be an array');
      } else {
        config.fallbackSelectors.forEach((fallback, index) => {
          if (!fallback.table || fallback.table.trim() === '') {
            errors.push(`Fallback selector ${index}: table selector is required`);
          }
          if (typeof fallback.modelNameColumn !== 'number' || fallback.modelNameColumn < 0) {
            errors.push(`Fallback selector ${index}: invalid model name column`);
          }
          if (typeof fallback.inputCostColumn !== 'number' || fallback.inputCostColumn < 0) {
            errors.push(`Fallback selector ${index}: invalid input cost column`);
          }
          if (typeof fallback.outputCostColumn !== 'number' || fallback.outputCostColumn < 0) {
            errors.push(`Fallback selector ${index}: invalid output cost column`);
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
     * Store a new scraping configuration for a provider
     * Creates a new version and deactivates previous versions
     * Validates configuration before storing
     */
  async storeConfig(
    provider: ProviderType,
    config: ScrapingConfig
  ): Promise<StoredScrapingConfig> {
    // Validate configuration first
    const validation = await this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get the current version number
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(version), 0) as max_version 
                 FROM scraping_config_versions 
                 WHERE provider = $1`,
        [provider]
      );
      const nextVersion = versionResult.rows[0].max_version + 1;

      // Deactivate previous versions
      await client.query(
        `UPDATE scraping_config_versions 
                 SET active = false 
                 WHERE provider = $1 AND active = true`,
        [provider]
      );

      // Insert new configuration version
      const insertResult = await client.query(
        `INSERT INTO scraping_config_versions 
                 (provider, config, version, active, created_at, updated_at)
                 VALUES ($1, $2, $3, true, NOW(), NOW())
                 RETURNING id, provider, config, version, active, created_at, updated_at`,
        [provider, JSON.stringify(config), nextVersion]
      );

      // Also update the main scraping_config table for backward compatibility
      await client.query(
        `INSERT INTO scraping_config (provider, config, active, created_at, updated_at)
                 VALUES ($1, $2, true, NOW(), NOW())
                 ON CONFLICT (provider) DO UPDATE SET
                   config = EXCLUDED.config,
                   active = EXCLUDED.active,
                   updated_at = NOW()`,
        [provider, JSON.stringify(config)]
      );

      await client.query('COMMIT');

      const row = insertResult.rows[0];
      return {
        id: row.id,
        provider: row.provider,
        config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
        active: row.active,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
     * Get the active configuration for a provider
     */
  async getActiveConfig(provider: ProviderType): Promise<StoredScrapingConfig | null> {
    const result = await this.db.query(
      `SELECT id, provider, config, version, active, created_at, updated_at
             FROM scraping_config_versions
             WHERE provider = $1 AND active = true
             ORDER BY version DESC
             LIMIT 1`,
      [provider]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      provider: row.provider,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      active: row.active,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
     * Get all configurations for a provider (including inactive versions)
     */
  async getAllConfigs(provider: ProviderType): Promise<StoredScrapingConfig[]> {
    const result = await this.db.query(
      `SELECT id, provider, config, version, active, created_at, updated_at
             FROM scraping_config_versions
             WHERE provider = $1
             ORDER BY version DESC`,
      [provider]
    );

    return result.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      active: row.active,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
     * Get a specific version of a configuration
     */
  async getConfigVersion(
    provider: ProviderType,
    version: number
  ): Promise<StoredScrapingConfig | null> {
    const result = await this.db.query(
      `SELECT id, provider, config, version, active, created_at, updated_at
             FROM scraping_config_versions
             WHERE provider = $1 AND version = $2`,
      [provider, version]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      provider: row.provider,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      active: row.active,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
     * Activate a specific version of a configuration
     */
  async activateVersion(provider: ProviderType, version: number): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Deactivate all versions for this provider
      await client.query(
        `UPDATE scraping_config_versions 
                 SET active = false 
                 WHERE provider = $1`,
        [provider]
      );

      // Activate the specified version
      const result = await client.query(
        `UPDATE scraping_config_versions 
                 SET active = true, updated_at = NOW()
                 WHERE provider = $1 AND version = $2
                 RETURNING config`,
        [provider, version]
      );

      if (result.rows.length === 0) {
        throw new Error(`Configuration version ${version} not found for provider ${provider}`);
      }

      // Update the main scraping_config table
      await client.query(
        `UPDATE scraping_config 
                 SET config = $1, active = true, updated_at = NOW()
                 WHERE provider = $2`,
        [result.rows[0].config, provider]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
     * Delete a configuration version (soft delete by marking as inactive)
     */
  async deleteVersion(provider: ProviderType, version: number): Promise<void> {
    await this.db.query(
      `UPDATE scraping_config_versions 
             SET active = false, updated_at = NOW()
             WHERE provider = $1 AND version = $2`,
      [provider, version]
    );
  }

  /**
     * Get all active configurations for all providers
     */
  async getAllActiveConfigs(): Promise<Map<ProviderType, ScrapingConfig>> {
    const result = await this.db.query(
      `SELECT provider, config
             FROM scraping_config_versions
             WHERE active = true
             ORDER BY provider`
    );

    const configs = new Map<ProviderType, ScrapingConfig>();
    for (const row of result.rows) {
      const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      configs.set(row.provider, config);
    }

    return configs;
  }
}
