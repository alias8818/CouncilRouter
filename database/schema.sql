-- AI Council Proxy Database Schema
-- PostgreSQL

-- ============================================================================
-- Requests table
-- ============================================================================
CREATE TABLE requests (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255),
  session_id UUID,
  query TEXT NOT NULL,
  status VARCHAR(50) NOT NULL,
  consensus_decision TEXT,
  agreement_level DECIMAL(3,2),
  total_cost DECIMAL(10,4),
  total_latency_ms INTEGER,
  created_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  config_snapshot JSONB NOT NULL
);

CREATE INDEX idx_requests_user_id ON requests(user_id);
CREATE INDEX idx_requests_session_id ON requests(session_id);
CREATE INDEX idx_requests_created_at ON requests(created_at);

-- ============================================================================
-- Council responses table
-- ============================================================================
CREATE TABLE council_responses (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  council_member_id VARCHAR(255) NOT NULL,
  round_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_usage JSONB NOT NULL,
  latency_ms INTEGER NOT NULL,
  cost DECIMAL(10,4),
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_council_responses_request_id ON council_responses(request_id);

-- ============================================================================
-- Deliberation exchanges table
-- ============================================================================
CREATE TABLE deliberation_exchanges (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  round_number INTEGER NOT NULL,
  council_member_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  references_to TEXT[], -- array of response IDs
  token_usage JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_deliberation_exchanges_request_id ON deliberation_exchanges(request_id);

-- ============================================================================
-- Sessions table
-- ============================================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP NOT NULL,
  context_window_used INTEGER NOT NULL,
  expired BOOLEAN DEFAULT FALSE
);

-- ============================================================================
-- Session history table
-- ============================================================================
CREATE TABLE session_history (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  request_id UUID,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_session_history_session_id ON session_history(session_id);

-- ============================================================================
-- Configuration table
-- ============================================================================
CREATE TABLE configurations (
  id UUID PRIMARY KEY,
  config_type VARCHAR(100) NOT NULL,
  config_data JSONB NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL,
  active BOOLEAN DEFAULT TRUE
);

-- ============================================================================
-- Model rankings table
-- ============================================================================
CREATE TABLE model_rankings (
  model_name VARCHAR(255) PRIMARY KEY,
  score DECIMAL(5,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_model_rankings_score ON model_rankings(score DESC);

-- ============================================================================
-- Provider health table
-- ============================================================================
CREATE TABLE provider_health (
  provider_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL,
  success_rate DECIMAL(5,4),
  avg_latency_ms INTEGER,
  last_failure_at TIMESTAMP,
  disabled_reason TEXT,
  updated_at TIMESTAMP NOT NULL
);

-- ============================================================================
-- Cost tracking table
-- ============================================================================
CREATE TABLE cost_records (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  provider VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  cost DECIMAL(10,4) NOT NULL,
  pricing_version VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_cost_records_request_id ON cost_records(request_id);
CREATE INDEX idx_cost_records_created_at ON cost_records(created_at);

-- ============================================================================
-- Red team prompts table (secure storage)
-- ============================================================================
CREATE TABLE red_team_prompts (
  id UUID PRIMARY KEY,
  test_name VARCHAR(255) NOT NULL,
  prompt TEXT NOT NULL,
  attack_category VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_red_team_prompts_category ON red_team_prompts(attack_category);

-- ============================================================================
-- Red team tests table
-- ============================================================================
CREATE TABLE red_team_tests (
  id UUID PRIMARY KEY,
  test_name VARCHAR(255) NOT NULL,
  prompt TEXT NOT NULL,
  attack_category VARCHAR(100) NOT NULL,
  council_member_id VARCHAR(255) NOT NULL,
  response TEXT NOT NULL,
  compromised BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_red_team_tests_member ON red_team_tests(council_member_id);
CREATE INDEX idx_red_team_tests_category ON red_team_tests(attack_category);
CREATE INDEX idx_red_team_tests_created_at ON red_team_tests(created_at);

-- ============================================================================
-- Tool usage table (Council Enhancements)
-- ============================================================================
CREATE TABLE tool_usage (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  council_member_id VARCHAR(255) NOT NULL,
  round_number INTEGER NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  parameters JSONB NOT NULL,
  result JSONB NOT NULL,
  success BOOLEAN NOT NULL,
  latency_ms INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_tool_usage_request_id ON tool_usage(request_id);
CREATE INDEX idx_tool_usage_council_member ON tool_usage(council_member_id);

-- ============================================================================
-- Budget caps table (Council Enhancements)
-- ============================================================================
CREATE TABLE budget_caps (
  id UUID PRIMARY KEY,
  provider_id VARCHAR(255) NOT NULL,
  model_id VARCHAR(255),
  daily_limit DECIMAL(10,2),
  weekly_limit DECIMAL(10,2),
  monthly_limit DECIMAL(10,2),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_id, model_id)
);

-- ============================================================================
-- Budget spending table (Council Enhancements)
-- ============================================================================
CREATE TABLE budget_spending (
  id UUID PRIMARY KEY,
  provider_id VARCHAR(255) NOT NULL,
  model_id VARCHAR(255),
  period_type VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly'
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  current_spending DECIMAL(10,2) NOT NULL DEFAULT 0,
  disabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_id, model_id, period_type, period_start)
);

CREATE INDEX idx_budget_spending_provider ON budget_spending(provider_id, model_id, period_type);
CREATE INDEX idx_budget_spending_period ON budget_spending(period_start, period_end);

-- ============================================================================
-- Devil's Advocate logs table (Synthesis Context Injection)
-- ============================================================================
CREATE TABLE devils_advocate_logs (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  critique_content JSONB NOT NULL, -- Full critique object: {weaknesses, suggestions, severity}
  original_length INTEGER NOT NULL,
  improved_length INTEGER NOT NULL,
  time_taken_ms INTEGER NOT NULL,
  improved BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_devils_advocate_logs_request_id ON devils_advocate_logs(request_id);
CREATE INDEX idx_devils_advocate_logs_created_at ON devils_advocate_logs(created_at);

-- ============================================================================
-- API Keys table (for API authentication)
-- ============================================================================
-- Enable pgcrypto extension for gen_random_uuid() function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of the API key
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_active ON api_keys(active);

-- Seed demo API key for UI (development/testing only)
-- Key: demo-api-key-for-testing-purposes-only-12345678901234567890
-- Hash: 52346957575b04c715942a324887efde06f034ca62893fa6a76064d7f65f8e43
INSERT INTO api_keys (user_id, key_hash, active)
VALUES ('demo-user', '52346957575b04c715942a324887efde06f034ca62893fa6a76064d7f65f8e43', true)
ON CONFLICT (key_hash) DO NOTHING;

-- ============================================================================
-- Iterative Consensus tables
-- ============================================================================

-- Negotiation rounds table
CREATE TABLE negotiation_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id),
  round_number INTEGER NOT NULL,
  average_similarity DECIMAL(5,4) NOT NULL,
  min_similarity DECIMAL(5,4) NOT NULL,
  max_similarity DECIMAL(5,4) NOT NULL,
  below_threshold_count INTEGER NOT NULL,
  convergence_velocity DECIMAL(6,4),
  deadlock_risk VARCHAR(10), -- 'low', 'medium', 'high'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_request_round UNIQUE(request_id, round_number)
);

CREATE INDEX idx_negotiation_rounds_request ON negotiation_rounds(request_id);
CREATE INDEX idx_negotiation_rounds_similarity ON negotiation_rounds(average_similarity);

-- Negotiation responses table
CREATE TABLE negotiation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id),
  round_number INTEGER NOT NULL,
  council_member_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  agrees_with_member_id VARCHAR(255),
  token_count INTEGER NOT NULL,
  embedding_model VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_member_round UNIQUE(request_id, round_number, council_member_id)
);

CREATE INDEX idx_negotiation_responses_request ON negotiation_responses(request_id);
CREATE INDEX idx_negotiation_responses_round ON negotiation_responses(request_id, round_number);

-- Negotiation examples table (requires pgvector extension for vector similarity)
-- Note: pgvector extension must be installed separately: CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE negotiation_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL, -- 'endorsement', 'refinement', 'compromise'
  query_context TEXT NOT NULL,
  disagreement TEXT NOT NULL,
  resolution TEXT NOT NULL,
  rounds_to_consensus INTEGER NOT NULL,
  final_similarity DECIMAL(5,4) NOT NULL,
  embedding JSONB, -- Store as JSONB for now (can be converted to VECTOR type if pgvector is available)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_negotiation_examples_category ON negotiation_examples(category);
CREATE INDEX idx_negotiation_examples_category_created ON negotiation_examples(category, created_at DESC);

-- Consensus metadata table
CREATE TABLE consensus_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) UNIQUE,
  total_rounds INTEGER NOT NULL,
  consensus_achieved BOOLEAN NOT NULL,
  fallback_used BOOLEAN NOT NULL,
  fallback_reason TEXT,
  tokens_avoided INTEGER,
  estimated_cost_saved DECIMAL(10,4),
  deadlock_detected BOOLEAN NOT NULL,
  human_escalation_triggered BOOLEAN NOT NULL,
  final_similarity DECIMAL(5,4) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_consensus_metadata_request ON consensus_metadata(request_id);
CREATE INDEX idx_consensus_metadata_consensus ON consensus_metadata(consensus_achieved);
CREATE INDEX idx_consensus_metadata_fallback ON consensus_metadata(fallback_used);

-- Escalation queue table
CREATE TABLE escalation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id),
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'reviewed', 'resolved'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(255),
  resolution TEXT
);

CREATE INDEX idx_escalation_queue_request ON escalation_queue(request_id);
CREATE INDEX idx_escalation_queue_status ON escalation_queue(status);
CREATE INDEX idx_escalation_queue_created ON escalation_queue(created_at);

-- ============================================================================
-- Dynamic Model and Pricing Retrieval tables
-- ============================================================================

-- Models table
CREATE TABLE models (
  id VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  display_name VARCHAR(255),
  classification TEXT[], -- Array of classifications
  context_window INTEGER,
  usability VARCHAR(20) NOT NULL, -- 'available', 'preview', 'deprecated'
  capabilities JSONB, -- Array of capability objects
  discovered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deprecated_at TIMESTAMP,
  UNIQUE(id, provider)
);

CREATE INDEX idx_models_provider ON models(provider);
CREATE INDEX idx_models_usability ON models(usability);
CREATE INDEX idx_models_classification ON models USING GIN(classification);

-- Pricing table (current pricing)
CREATE TABLE model_pricing (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(255) NOT NULL REFERENCES models(id),
  input_cost_per_million DECIMAL(10, 4) NOT NULL,
  output_cost_per_million DECIMAL(10, 4) NOT NULL,
  tier VARCHAR(50) NOT NULL DEFAULT 'standard',
  context_limit INTEGER,
  effective_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(model_id, tier)
);

CREATE INDEX idx_pricing_model ON model_pricing(model_id);

-- Pricing history table
CREATE TABLE pricing_history (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(255) NOT NULL,
  input_cost_per_million DECIMAL(10, 4) NOT NULL,
  output_cost_per_million DECIMAL(10, 4) NOT NULL,
  tier VARCHAR(50) NOT NULL,
  effective_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_history_model ON pricing_history(model_id);
CREATE INDEX idx_pricing_history_dates ON pricing_history(effective_date, end_date);

-- Sync status table
CREATE TABLE sync_status (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  last_sync TIMESTAMP,
  next_sync TIMESTAMP,
  status VARCHAR(20) NOT NULL, -- 'idle', 'running', 'failed'
  models_discovered INTEGER DEFAULT 0,
  models_updated INTEGER DEFAULT 0,
  models_deprecated INTEGER DEFAULT 0,
  pricing_updated INTEGER DEFAULT 0,
  errors JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider)
);

-- Scraping configuration table
CREATE TABLE scraping_config (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL UNIQUE,
  config JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Council Presets table (GUI-configurable presets - single source of truth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS council_presets (
  preset_name VARCHAR(100) PRIMARY KEY,
  config_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed presets (exact JSON from manager.ts hardcodes)
INSERT INTO council_presets (preset_name, config_data) VALUES
('fast-council', '{"council":{"members":[{"id":"gpt-4o-mini-fast","provider":"openai","model":"gpt-4o-mini","timeout":15,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"claude-haiku-fast","provider":"anthropic","model":"claude-haiku-4-5-20251001","timeout":15,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"gemini-flash-fast","provider":"google","model":"gemini-2.0-flash","timeout":15,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}}],"minimumSize":2,"requireMinimumForConsensus":false},"deliberation":{"rounds":0,"preset":"fast"},"synthesis":{"strategy":{"type":"consensus-extraction"}},"performance":{"globalTimeout":30,"enableFastFallback":true,"streamingEnabled":true},"transparency":{"enabled":true,"forcedTransparency":false}}'::jsonb),
('balanced-council', '{"council":{"members":[{"id":"gpt-4o-balanced","provider":"openai","model":"gpt-4o","timeout":30,"retryPolicy":{"maxAttempts":3,"initialDelayMs":1000,"maxDelayMs":10000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT","SERVICE_UNAVAILABLE"]}},{"id":"claude-sonnet-balanced","provider":"anthropic","model":"claude-sonnet-4-5-20250929","timeout":30,"retryPolicy":{"maxAttempts":3,"initialDelayMs":1000,"maxDelayMs":10000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT","SERVICE_UNAVAILABLE"]}},{"id":"gemini-pro-balanced","provider":"google","model":"gemini-2.5-pro","timeout":30,"retryPolicy":{"maxAttempts":3,"initialDelayMs":1000,"maxDelayMs":10000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT","SERVICE_UNAVAILABLE"]}},{"id":"grok-3-balanced","provider":"xai","model":"grok-3","timeout":30,"retryPolicy":{"maxAttempts":3,"initialDelayMs":1000,"maxDelayMs":10000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT","SERVICE_UNAVAILABLE"]}}],"minimumSize":2,"requireMinimumForConsensus":true},"deliberation":{"rounds":1,"preset":"balanced"},"synthesis":{"strategy":{"type":"consensus-extraction"}},"performance":{"globalTimeout":60,"enableFastFallback":true,"streamingEnabled":true},"transparency":{"enabled":true,"forcedTransparency":true}}'::jsonb),
('research-council', '{"council":{"members":[{"id":"gpt-5-research","provider":"openai","model":"gpt-5.1","timeout":120,"retryPolicy":{"maxAttempts":5,"initialDelayMs":2000,"maxDelayMs":20000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT","SERVICE_UNAVAILABLE"]}},{"id":"claude-opus-research","provider":"anthropic","model":"claude-opus-4-5-20251101","timeout":120,"retryPolicy":{"maxAttempts":5,"initialDelayMs":2000,"maxDelayMs":20000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT","SERVICE_UNAVAILABLE"]}},{"id":"gemini-3-research","provider":"google","model":"gemini-3-pro-preview","timeout":120,"retryPolicy":{"maxAttempts":5,"initialDelayMs":2000,"maxDelayMs":20000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT","SERVICE_UNAVAILABLE"]}},{"id":"grok-4-research","provider":"xai","model":"grok-4-1-fast-reasoning","timeout":120,"retryPolicy":{"maxAttempts":5,"initialDelayMs":2000,"maxDelayMs":20000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT","SERVICE_UNAVAILABLE"]}}],"minimumSize":2,"requireMinimumForConsensus":true},"deliberation":{"rounds":4,"preset":"research-grade"},"synthesis":{"strategy":{"type":"meta-synthesis","moderatorStrategy":{"type":"strongest"}}},"performance":{"globalTimeout":300,"enableFastFallback":false,"streamingEnabled":true},"transparency":{"enabled":true,"forcedTransparency":true}}'::jsonb),
('coding-council', '{"council":{"members":[{"id":"claude-sonnet-coding","provider":"anthropic","model":"claude-sonnet-4-5-20250929","timeout":120,"retryPolicy":{"maxAttempts":3,"initialDelayMs":1000,"maxDelayMs":10000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"gpt-5-coding","provider":"openai","model":"gpt-5.1","timeout":120,"retryPolicy":{"maxAttempts":3,"initialDelayMs":1000,"maxDelayMs":10000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"gemini-pro-coding","provider":"google","model":"gemini-2.5-pro","timeout":120,"retryPolicy":{"maxAttempts":3,"initialDelayMs":1000,"maxDelayMs":10000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"grok-3-coding","provider":"xai","model":"grok-3","timeout":120,"retryPolicy":{"maxAttempts":3,"initialDelayMs":1000,"maxDelayMs":10000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}}],"minimumSize":2,"requireMinimumForConsensus":true},"deliberation":{"rounds":3,"preset":"balanced"},"synthesis":{"strategy":{"type":"meta-synthesis","moderatorStrategy":{"type":"strongest"}}},"performance":{"globalTimeout":180,"enableFastFallback":false,"streamingEnabled":true},"transparency":{"enabled":true,"forcedTransparency":true}}'::jsonb),
('cost-effective-council', '{"council":{"members":[{"id":"gpt-4o-mini-budget","provider":"openai","model":"gpt-4o-mini","timeout":20,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"claude-haiku-budget","provider":"anthropic","model":"claude-haiku-4-5-20251001","timeout":20,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"gemini-flash-budget","provider":"google","model":"gemini-2.0-flash","timeout":20,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}}],"minimumSize":2,"requireMinimumForConsensus":false},"deliberation":{"rounds":0,"preset":"fast"},"synthesis":{"strategy":{"type":"consensus-extraction"}},"performance":{"globalTimeout":45,"enableFastFallback":true,"streamingEnabled":true},"transparency":{"enabled":true,"forcedTransparency":true}}'::jsonb),
('free-council', '{"council":{"members":[{"id":"free-llama-1","provider":"openrouter","model":"meta-llama/llama-3.3-70b-instruct:free","timeout":30,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"free-mistral-1","provider":"openrouter","model":"mistralai/mistral-7b-instruct:free","timeout":30,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"free-gemma-1","provider":"openrouter","model":"google/gemma-3-12b-it:free","timeout":30,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"free-qwen-1","provider":"openrouter","model":"qwen/qwen-2.5-72b-instruct:free","timeout":30,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}},{"id":"free-deepseek-1","provider":"openrouter","model":"deepseek/deepseek-chat-v3-0324:free","timeout":30,"retryPolicy":{"maxAttempts":2,"initialDelayMs":500,"maxDelayMs":5000,"backoffMultiplier":2,"retryableErrors":["RATE_LIMIT","TIMEOUT"]}}],"minimumSize":3,"requireMinimumForConsensus":false},"deliberation":{"rounds":1,"preset":"balanced"},"synthesis":{"strategy":{"type":"consensus-extraction"}},"performance":{"globalTimeout":60,"enableFastFallback":true,"streamingEnabled":true},"transparency":{"enabled":true,"forcedTransparency":true}}'::jsonb)
ON CONFLICT (preset_name) DO UPDATE SET config_data = EXCLUDED.config_data;