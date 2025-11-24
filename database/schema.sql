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