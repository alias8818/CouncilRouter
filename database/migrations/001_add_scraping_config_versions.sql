-- Migration: Add scraping configuration versioning table
-- This table stores multiple versions of scraping configurations per provider

CREATE TABLE IF NOT EXISTS scraping_config_versions (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  version INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, version)
);

CREATE INDEX idx_scraping_config_versions_provider ON scraping_config_versions(provider);
CREATE INDEX idx_scraping_config_versions_active ON scraping_config_versions(provider, active);
CREATE INDEX idx_scraping_config_versions_version ON scraping_config_versions(provider, version DESC);

-- Migrate existing data from scraping_config to scraping_config_versions
INSERT INTO scraping_config_versions (provider, config, version, active, created_at, updated_at)
SELECT provider, config, 1 as version, active, created_at, updated_at
FROM scraping_config
ON CONFLICT (provider, version) DO NOTHING;
