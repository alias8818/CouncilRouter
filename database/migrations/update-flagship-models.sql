-- Update council presets with correct flagship models
-- Flagship models (newest as of Nov 2025):
--   OpenAI: gpt-5.1 (uses /responses endpoint)
--   Anthropic: claude-opus-4-5-20251101
--   Google: gemini-3-pro-preview (API model ID)
--   xAI: grok-4-1-fast-reasoning (API model ID)

-- ============================================================================
-- RESEARCH COUNCIL - Flagship models for deep analysis
-- ============================================================================
UPDATE council_presets 
SET config_data = '{
  "council": {
    "members": [
      {
        "id": "gpt-5-research",
        "provider": "openai",
        "model": "gpt-5.1",
        "timeout": 120,
        "retryPolicy": {
          "maxAttempts": 5,
          "initialDelayMs": 2000,
          "maxDelayMs": 20000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      },
      {
        "id": "claude-opus-research",
        "provider": "anthropic",
        "model": "claude-opus-4-5-20251101",
        "timeout": 120,
        "retryPolicy": {
          "maxAttempts": 5,
          "initialDelayMs": 2000,
          "maxDelayMs": 20000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      },
      {
        "id": "gemini-3-research",
        "provider": "google",
        "model": "gemini-3-pro-preview",
        "timeout": 120,
        "retryPolicy": {
          "maxAttempts": 5,
          "initialDelayMs": 2000,
          "maxDelayMs": 20000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      },
      {
        "id": "grok-4-research",
        "provider": "xai",
        "model": "grok-4-1-fast-reasoning",
        "timeout": 120,
        "retryPolicy": {
          "maxAttempts": 5,
          "initialDelayMs": 2000,
          "maxDelayMs": 20000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      }
    ],
    "minimumSize": 2,
    "requireMinimumForConsensus": true
  },
  "deliberation": {
    "rounds": 4,
    "preset": "research"
  },
  "synthesis": {
    "strategy": {
      "type": "meta-synthesis",
      "moderatorStrategy": { "type": "strongest" }
    }
  },
  "performance": {
    "globalTimeout": 300,
    "enableFastFallback": false,
    "streamingEnabled": true
  },
  "transparency": {
    "enabled": true,
    "forcedTransparency": true,
    "includeDeliberationDetails": true,
    "includeTokenUsage": true,
    "includeCostEstimate": true
  }
}'::jsonb
WHERE preset_name = 'research-council';

-- ============================================================================
-- BALANCED COUNCIL - Good balance of quality and speed (mid-tier flagships)
-- ============================================================================
UPDATE council_presets 
SET config_data = '{
  "council": {
    "members": [
      {
        "id": "gpt-4o-balanced",
        "provider": "openai",
        "model": "gpt-4o",
        "timeout": 30,
        "retryPolicy": {
          "maxAttempts": 3,
          "initialDelayMs": 1000,
          "maxDelayMs": 10000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      },
      {
        "id": "claude-sonnet-balanced",
        "provider": "anthropic",
        "model": "claude-sonnet-4-5-20250929",
        "timeout": 30,
        "retryPolicy": {
          "maxAttempts": 3,
          "initialDelayMs": 1000,
          "maxDelayMs": 10000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      },
      {
        "id": "gemini-pro-balanced",
        "provider": "google",
        "model": "gemini-2.5-pro",
        "timeout": 30,
        "retryPolicy": {
          "maxAttempts": 3,
          "initialDelayMs": 1000,
          "maxDelayMs": 10000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      },
      {
        "id": "grok-3-balanced",
        "provider": "xai",
        "model": "grok-3",
        "timeout": 30,
        "retryPolicy": {
          "maxAttempts": 3,
          "initialDelayMs": 1000,
          "maxDelayMs": 10000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      }
    ],
    "minimumSize": 2,
    "requireMinimumForConsensus": true
  },
  "deliberation": {
    "rounds": 1,
    "preset": "balanced"
  },
  "synthesis": {
    "strategy": {
      "type": "consensus-extraction"
    }
  },
  "performance": {
    "globalTimeout": 60,
    "enableFastFallback": true,
    "streamingEnabled": true
  },
  "transparency": {
    "enabled": true,
    "forcedTransparency": true,
    "includeDeliberationDetails": true,
    "includeTokenUsage": true,
    "includeCostEstimate": true
  }
}'::jsonb
WHERE preset_name = 'balanced-council';

-- ============================================================================
-- CODING COUNCIL - Best models for code (Claude leads, GPT-5.1 for reasoning)
-- ============================================================================
UPDATE council_presets 
SET config_data = '{
  "council": {
    "members": [
      {
        "id": "claude-sonnet-coding",
        "provider": "anthropic",
        "model": "claude-sonnet-4-5-20250929",
        "timeout": 120,
        "retryPolicy": {
          "maxAttempts": 3,
          "initialDelayMs": 1000,
          "maxDelayMs": 10000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      },
      {
        "id": "gpt-5-coding",
        "provider": "openai",
        "model": "gpt-5.1",
        "timeout": 120,
        "retryPolicy": {
          "maxAttempts": 3,
          "initialDelayMs": 1000,
          "maxDelayMs": 10000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      },
      {
        "id": "gemini-pro-coding",
        "provider": "google",
        "model": "gemini-2.5-pro",
        "timeout": 120,
        "retryPolicy": {
          "maxAttempts": 3,
          "initialDelayMs": 1000,
          "maxDelayMs": 10000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      },
      {
        "id": "grok-3-coding",
        "provider": "xai",
        "model": "grok-3",
        "timeout": 120,
        "retryPolicy": {
          "maxAttempts": 3,
          "initialDelayMs": 1000,
          "maxDelayMs": 10000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      }
    ],
    "minimumSize": 2,
    "requireMinimumForConsensus": true
  },
  "deliberation": {
    "rounds": 3,
    "preset": "balanced"
  },
  "synthesis": {
    "strategy": {
      "type": "meta-synthesis",
      "moderatorStrategy": { "type": "strongest" }
    }
  },
  "performance": {
    "globalTimeout": 180,
    "enableFastFallback": true,
    "streamingEnabled": true
  },
  "transparency": {
    "enabled": true,
    "forcedTransparency": true,
    "includeDeliberationDetails": true,
    "includeTokenUsage": true,
    "includeCostEstimate": true
  }
}'::jsonb
WHERE preset_name = 'coding-council';

-- ============================================================================
-- FAST COUNCIL - Quick mini models for simple queries
-- ============================================================================
UPDATE council_presets 
SET config_data = '{
  "council": {
    "members": [
      {
        "id": "gpt-4o-mini-fast",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "timeout": 15,
        "retryPolicy": {
          "maxAttempts": 2,
          "initialDelayMs": 500,
          "maxDelayMs": 5000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      },
      {
        "id": "claude-haiku-fast",
        "provider": "anthropic",
        "model": "claude-haiku-4-5-20251001",
        "timeout": 15,
        "retryPolicy": {
          "maxAttempts": 2,
          "initialDelayMs": 500,
          "maxDelayMs": 5000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      },
      {
        "id": "gemini-flash-fast",
        "provider": "google",
        "model": "gemini-2.0-flash",
        "timeout": 15,
        "retryPolicy": {
          "maxAttempts": 2,
          "initialDelayMs": 500,
          "maxDelayMs": 5000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      }
    ],
    "minimumSize": 2,
    "requireMinimumForConsensus": false
  },
  "deliberation": {
    "rounds": 0,
    "preset": "fast"
  },
  "synthesis": {
    "strategy": {
      "type": "consensus-extraction"
    }
  },
  "performance": {
    "globalTimeout": 30,
    "enableFastFallback": true,
    "streamingEnabled": true
  },
  "transparency": {
    "enabled": true,
    "forcedTransparency": true,
    "includeDeliberationDetails": true,
    "includeTokenUsage": true,
    "includeCostEstimate": true
  }
}'::jsonb
WHERE preset_name = 'fast-council';

-- ============================================================================
-- COST-EFFECTIVE COUNCIL - Budget-friendly mini models
-- ============================================================================
UPDATE council_presets 
SET config_data = '{
  "council": {
    "members": [
      {
        "id": "gpt-4o-mini-budget",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "timeout": 20,
        "retryPolicy": {
          "maxAttempts": 2,
          "initialDelayMs": 500,
          "maxDelayMs": 5000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      },
      {
        "id": "claude-haiku-budget",
        "provider": "anthropic",
        "model": "claude-haiku-4-5-20251001",
        "timeout": 20,
        "retryPolicy": {
          "maxAttempts": 2,
          "initialDelayMs": 500,
          "maxDelayMs": 5000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      },
      {
        "id": "gemini-flash-budget",
        "provider": "google",
        "model": "gemini-2.0-flash",
        "timeout": 20,
        "retryPolicy": {
          "maxAttempts": 2,
          "initialDelayMs": 500,
          "maxDelayMs": 5000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT"]
        }
      }
    ],
    "minimumSize": 2,
    "requireMinimumForConsensus": false
  },
  "deliberation": {
    "rounds": 0,
    "preset": "fast"
  },
  "synthesis": {
    "strategy": {
      "type": "consensus-extraction"
    }
  },
  "performance": {
    "globalTimeout": 45,
    "enableFastFallback": true,
    "streamingEnabled": true
  },
  "transparency": {
    "enabled": true,
    "forcedTransparency": true,
    "includeDeliberationDetails": true,
    "includeTokenUsage": true,
    "includeCostEstimate": true
  }
}'::jsonb
WHERE preset_name = 'cost-effective-council';

-- Verify updates
SELECT preset_name, 
       jsonb_path_query_array(config_data, '$.council.members[*].model') as models
FROM council_presets
ORDER BY preset_name;

