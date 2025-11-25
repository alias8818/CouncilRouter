-- ============================================================================
-- Dynamic Model and Pricing Retrieval System
-- Migration: 001_dynamic_model_pricing
-- ============================================================================

-- ============================================================================
-- Models table
-- Stores discovered models from provider APIs
-- ============================================================================
CREATE TABLE models (
  id VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  display_name VARCHAR(255),
  classification TEXT[], -- Array of classifications: 'chat', 'reasoning', 'coding', etc.
  context_window INTEGER,
  usability VARCHAR(20) NOT NULL, -- 'available', 'preview', 'deprecated'
  capabilities JSONB, -- Array of capability objects
  discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMP,
  UNIQUE(id, provider)
);

CREATE INDEX idx_models_provider ON models(provider);
CREATE INDEX idx_models_usability ON models(usability);
CREATE INDEX idx_models_classification ON models USING GIN(classification);
CREATE INDEX idx_models_updated_at ON models(updated_at);

-- ============================================================================
-- Model pricing table (current pricing)
-- Stores current pricing information for each model
-- ============================================================================
CREATE TABLE model_pricing (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(255) NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  input_cost_per_million DECIMAL(10, 4) NOT NULL,
  output_cost_per_million DECIMAL(10, 4) NOT NULL,
  tier VARCHAR(50) NOT NULL DEFAULT 'standard',
  context_limit INTEGER,
  effective_date TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(model_id, tier)
);

CREATE INDEX idx_pricing_model ON model_pricing(model_id);
CREATE INDEX idx_pricing_tier ON model_pricing(tier);

-- ============================================================================
-- Pricing history table
-- Maintains historical pricing records for trend analysis
-- ============================================================================
CREATE TABLE pricing_history (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(255) NOT NULL,
  input_cost_per_million DECIMAL(10, 4) NOT NULL,
  output_cost_per_million DECIMAL(10, 4) NOT NULL,
  tier VARCHAR(50) NOT NULL,
  effective_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pricing_history_model ON pricing_history(model_id);
CREATE INDEX idx_pricing_history_dates ON pricing_history(effective_date, end_date);
CREATE INDEX idx_pricing_history_created ON pricing_history(created_at);

-- ============================================================================
-- Sync status table
-- Tracks synchronization status for each provider
-- ============================================================================
CREATE TABLE sync_status (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL UNIQUE,
  last_sync TIMESTAMP,
  next_sync TIMESTAMP,
  status VARCHAR(20) NOT NULL, -- 'idle', 'running', 'failed'
  models_discovered INTEGER DEFAULT 0,
  models_updated INTEGER DEFAULT 0,
  models_deprecated INTEGER DEFAULT 0,
  pricing_updated INTEGER DEFAULT 0,
  errors JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_status_provider ON sync_status(provider);
CREATE INDEX idx_sync_status_status ON sync_status(status);
CREATE INDEX idx_sync_status_last_sync ON sync_status(last_sync);

-- ============================================================================
-- Scraping configuration table
-- Stores provider-specific scraping rules and selectors
-- ============================================================================
CREATE TABLE scraping_config (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL UNIQUE,
  config JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scraping_config_provider ON scraping_config(provider);
CREATE INDEX idx_scraping_config_active ON scraping_config(active);

-- ============================================================================
-- Seed initial scraping configurations
-- ============================================================================
INSERT INTO scraping_config (provider, config, active) VALUES
('openai', '{
  "url": "https://openai.com/api/pricing/",
  "selectors": {
    "table": "table.pricing-table",
    "modelNameColumn": 0,
    "inputCostColumn": 1,
    "outputCostColumn": 2
  },
  "fallbackSelectors": []
}', true),
('anthropic', '{
  "url": "https://www.anthropic.com/pricing",
  "selectors": {
    "table": "table.pricing-table",
    "modelNameColumn": 0,
    "inputCostColumn": 1,
    "outputCostColumn": 2
  },
  "fallbackSelectors": []
}', true),
('google', '{
  "url": "https://ai.google.dev/gemini-api/docs/pricing",
  "selectors": {
    "table": "table.pricing-table",
    "modelNameColumn": 0,
    "inputCostColumn": 1,
    "outputCostColumn": 2
  },
  "fallbackSelectors": []
}', true),
('xai', '{
  "url": "https://docs.x.ai/docs/models",
  "selectors": {
    "table": "table.pricing-table",
    "modelNameColumn": 0,
    "inputCostColumn": 1,
    "outputCostColumn": 2
  },
  "fallbackSelectors": []
}', true)
ON CONFLICT (provider) DO NOTHING;

-- ============================================================================
-- Initialize sync status for all providers
-- ============================================================================
INSERT INTO sync_status (provider, status) VALUES
('openai', 'idle'),
('anthropic', 'idle'),
('google', 'idle'),
('xai', 'idle')
ON CONFLICT (provider) DO NOTHING;
