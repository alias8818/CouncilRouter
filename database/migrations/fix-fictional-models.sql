-- Fix fictional models in council presets with real, working models
-- This migration updates presets that have non-existent model names

-- Update research-council: Replace fictional models with current flagship models
UPDATE council_presets 
SET config_data = '{
  "council": {
    "members": [
      {
        "id": "gpt-4o-research",
        "provider": "openai",
        "model": "gpt-4o",
        "timeout": 90,
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
        "model": "claude-3-opus-20240229",
        "timeout": 90,
        "retryPolicy": {
          "maxAttempts": 5,
          "initialDelayMs": 2000,
          "maxDelayMs": 20000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      },
      {
        "id": "gemini-pro-research",
        "provider": "google",
        "model": "gemini-1.5-pro",
        "timeout": 90,
        "retryPolicy": {
          "maxAttempts": 5,
          "initialDelayMs": 2000,
          "maxDelayMs": 20000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      },
      {
        "id": "grok-research",
        "provider": "xai",
        "model": "grok-2",
        "timeout": 90,
        "retryPolicy": {
          "maxAttempts": 5,
          "initialDelayMs": 2000,
          "maxDelayMs": 20000,
          "backoffMultiplier": 2,
          "retryableErrors": ["RATE_LIMIT", "TIMEOUT", "SERVICE_UNAVAILABLE"]
        }
      }
    ],
    "minimumSize": 3,
    "requireMinimumForConsensus": true
  },
  "deliberation": {
    "rounds": 4,
    "preset": "research-grade"
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
    "forcedTransparency": false
  }
}'::jsonb
WHERE preset_name = 'research-council';

-- Update coding-council: Replace fictional models with current coding-optimized models
UPDATE council_presets 
SET config_data = '{
  "council": {
    "members": [
      {
        "id": "claude-sonnet-coding",
        "provider": "anthropic",
        "model": "claude-3-5-sonnet-20241022",
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
        "id": "gpt-4o-coding",
        "provider": "openai",
        "model": "gpt-4o",
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
        "model": "gemini-1.5-pro",
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
        "id": "grok-coding",
        "provider": "xai",
        "model": "grok-2",
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
      "type": "weighted-fusion",
      "weights": {
        "claude-sonnet-coding": 1.2,
        "gpt-4o-coding": 1.0,
        "gemini-pro-coding": 1.0,
        "grok-coding": 0.9
      }
    }
  },
  "performance": {
    "globalTimeout": 180,
    "enableFastFallback": false,
    "streamingEnabled": true
  },
  "transparency": {
    "enabled": true,
    "forcedTransparency": false
  }
}'::jsonb
WHERE preset_name = 'coding-council';

-- Clear Redis cache to ensure fresh config is loaded
-- Note: This needs to be done via the application or redis-cli

