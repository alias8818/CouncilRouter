# OpenRouter Migration Guide

## Overview

AI Council Proxy has migrated to **OpenRouter as the unified gateway** for accessing all AI models. This change simplifies configuration, reduces API key management overhead, and provides access to 300+ models including free-tier options.

## What Changed

### Before: Multiple Provider Adapters

**Previous Architecture:**
- Separate adapters for OpenAI, Anthropic, Google, and xAI
- Required 4+ API keys to access different models
- Complex configuration with provider-specific settings
- Inconsistent error handling across providers

**Environment Variables (Old):**
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
XAI_API_KEY=...
```

### After: Single OpenRouter Adapter

**Current Architecture:**
- Single OpenRouter adapter for all models
- One API key for 300+ models
- Unified configuration format
- Consistent error handling and retry logic
- Access to free-tier models

**Environment Variables (New):**
```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

## Benefits

### 1. Simplified Configuration
- **One API Key**: Access all providers through OpenRouter
- **Unified Format**: Consistent model ID format across providers
- **Less Complexity**: No need to manage multiple API keys

### 2. Expanded Model Access
- **300+ Models**: GPT-4, Claude, Gemini, Llama, Mistral, Qwen, DeepSeek, and more
- **Free Tier**: Zero-cost models for testing and development
- **Latest Models**: Automatic access to new model releases

### 3. Improved Reliability
- **Automatic Fallbacks**: OpenRouter handles provider outages
- **Rate Limit Management**: Built-in rate limit handling
- **Consistent Interface**: Same API for all models

### 4. Cost Optimization
- **Free Models**: Llama 3.3 70B, Mistral 7B, Gemma 3 12B, Qwen 2.5 72B, DeepSeek Chat
- **Transparent Pricing**: Clear per-token costs
- **Usage Tracking**: Detailed cost analytics

## Migration Steps

### Step 1: Get OpenRouter API Key

1. Visit https://openrouter.ai/keys
2. Sign up or log in
3. Create a new API key
4. Copy the key (format: `sk-or-v1-...`)

### Step 2: Update Environment Variables

**Edit your `.env` file:**

```bash
# REQUIRED: Add OpenRouter API key
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# OPTIONAL: Remove or comment out legacy keys
# OPENAI_API_KEY=...      # No longer used
# ANTHROPIC_API_KEY=...   # No longer used
# GOOGLE_API_KEY=...      # No longer used
# XAI_API_KEY=...         # No longer used
```

### Step 3: Update Council Configuration

**Old Configuration (Multiple Providers):**
```json
{
  "members": [
    {
      "id": "gpt4",
      "provider": "openai",
      "model": "gpt-4-turbo-preview",
      "timeout": 30000
    },
    {
      "id": "claude",
      "provider": "anthropic",
      "model": "claude-3-opus-20240229",
      "timeout": 30000
    }
  ]
}
```

**New Configuration (OpenRouter):**
```json
{
  "members": [
    {
      "id": "gpt4",
      "provider": "openrouter",
      "model": "openai/gpt-4o",
      "timeout": 30
    },
    {
      "id": "claude",
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4-5-20250929",
      "timeout": 30
    }
  ]
}
```

**Key Changes:**
- `provider`: Always set to `"openrouter"`
- `model`: Use OpenRouter model ID format (`provider/model-name`)
- `timeout`: Now in **seconds** (not milliseconds)

### Step 4: Use Built-in Presets

The system includes 6 pre-configured presets optimized for different use cases:

```typescript
// Use a preset in your API request
{
  "query": "Your question here",
  "preset": "balanced-council"  // or fast-council, free-council, etc.
}
```

**Available Presets:**

| Preset | Models | Cost | Use Case |
|--------|--------|------|----------|
| `fast-council` | GPT-4o-mini, Claude Haiku, Gemini Flash | $ | Quick queries |
| `balanced-council` | GPT-4o, Claude Sonnet, Gemini Pro, Grok-3 | $$ | General use |
| `coding-council` | Claude Sonnet, GPT-5.1, Gemini Pro, Grok-3 | $$$ | Code generation |
| `research-council` | GPT-5.1, Claude Opus, Gemini 3 Pro, Grok-4 | $$$$ | Deep analysis |
| `cost-effective-council` | GPT-4o-mini, Claude Haiku, Gemini Flash | $ | Budget-friendly |
| `free-council` | Llama 3.3, Mistral 7B, Gemma 3, Qwen 2.5, DeepSeek | FREE | Zero-cost |

### Step 5: Test the Migration

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test with free-council preset
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Test query",
    "preset": "free-council"
  }'
```

## OpenRouter Model IDs

### Format

OpenRouter uses the format: `provider/model-name`

**Examples:**
- `openai/gpt-4o`
- `anthropic/claude-sonnet-4-5-20250929`
- `google/gemini-2.5-pro`
- `x-ai/grok-3`
- `meta-llama/llama-3.3-70b-instruct:free`

### Free-Tier Models

Add `:free` suffix to access zero-cost models:

```json
{
  "id": "llama-free",
  "provider": "openrouter",
  "model": "meta-llama/llama-3.3-70b-instruct:free",
  "timeout": 30
}
```

**Available Free Models:**
- `meta-llama/llama-3.3-70b-instruct:free` - Llama 3.3 70B
- `mistralai/mistral-7b-instruct:free` - Mistral 7B
- `google/gemma-3-12b-it:free` - Gemma 3 12B
- `qwen/qwen-2.5-72b-instruct:free` - Qwen 2.5 72B
- `deepseek/deepseek-chat-v3-0324:free` - DeepSeek Chat

### Finding Model IDs

Browse all available models at: https://openrouter.ai/models

## Breaking Changes

### 1. Provider Field

**Before:**
```json
"provider": "openai"  // or "anthropic", "google", "xai"
```

**After:**
```json
"provider": "openrouter"  // Always use "openrouter"
```

### 2. Model Field

**Before:**
```json
"model": "gpt-4-turbo-preview"  // Provider-specific format
```

**After:**
```json
"model": "openai/gpt-4o"  // OpenRouter format: provider/model-name
```

### 3. Timeout Units

**Before:**
```json
"timeout": 30000  // Milliseconds
```

**After:**
```json
"timeout": 30  // Seconds
```

### 4. Environment Variables

**Before:**
```bash
OPENAI_API_KEY=required
ANTHROPIC_API_KEY=required
GOOGLE_API_KEY=required
```

**After:**
```bash
OPENROUTER_API_KEY=required  # Single key for all providers
```

## Backward Compatibility

### Legacy Adapters

The old provider adapters (OpenAI, Anthropic, Google, xAI) are **deprecated** but still present in the codebase for backward compatibility. They are not initialized by default.

**Status:**
- ✅ OpenRouter adapter: **Active** (default)
- ⚠️ OpenAI adapter: **Deprecated** (not initialized)
- ⚠️ Anthropic adapter: **Deprecated** (not initialized)
- ⚠️ Google adapter: **Deprecated** (not initialized)
- ⚠️ Grok/xAI adapter: **Deprecated** (not initialized)

### Migration Timeline

- **Current**: OpenRouter is the default and recommended approach
- **Future**: Legacy adapters will be removed in a future major version
- **Action Required**: Migrate to OpenRouter configuration

## Troubleshooting

### Issue: "Provider openrouter not configured"

**Cause**: Missing `OPENROUTER_API_KEY` environment variable

**Solution:**
```bash
# Add to .env file
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Restart the application
docker-compose restart app
```

### Issue: "Invalid model ID format"

**Cause**: Using old model ID format without provider prefix

**Solution:**
```json
// Wrong
"model": "gpt-4o"

// Correct
"model": "openai/gpt-4o"
```

### Issue: "Rate limit exceeded"

**Cause**: OpenRouter has different rate limits than direct provider APIs

**Solution:**
- Use retry policy with exponential backoff (already configured)
- Consider upgrading your OpenRouter plan
- Use free-tier models for testing

### Issue: "Model not found"

**Cause**: Model ID doesn't exist or is misspelled

**Solution:**
- Check available models at https://openrouter.ai/models
- Verify model ID format: `provider/model-name`
- Check for typos in model name

## Cost Comparison

### Direct Provider APIs vs OpenRouter

| Scenario | Direct APIs | OpenRouter | Savings |
|----------|-------------|------------|---------|
| **API Keys** | 4+ keys | 1 key | -75% complexity |
| **Free Tier** | Limited | 5+ models | Unlimited free usage |
| **Setup Time** | 30+ min | 5 min | -83% time |
| **Maintenance** | High | Low | -60% effort |

### Pricing Examples

**OpenRouter Pricing** (per 1M tokens):

| Model | Input | Output | Total (1M in + 1M out) |
|-------|-------|--------|------------------------|
| GPT-4o | $2.50 | $10.00 | $12.50 |
| Claude Sonnet | $3.00 | $15.00 | $18.00 |
| Gemini Pro | $1.25 | $5.00 | $6.25 |
| Llama 3.3 70B (free) | $0.00 | $0.00 | $0.00 |

**Note**: OpenRouter adds a small markup (typically 10-20%) over direct API pricing, but provides unified access and free-tier models.

## Support

### Documentation
- [OpenRouter Documentation](https://openrouter.ai/docs)
- [AI Council Proxy Docs](./INDEX.md)
- [Configuration Guide](./CONFIGURATION_GUIDE.md)

### Getting Help
- OpenRouter Support: https://openrouter.ai/support
- GitHub Issues: https://github.com/your-org/ai-council-proxy/issues

## FAQ

**Q: Can I still use my existing OpenAI/Anthropic API keys?**  
A: No, the system now requires an OpenRouter API key. Legacy adapters are deprecated.

**Q: Are free-tier models production-ready?**  
A: Free-tier models are suitable for testing and low-stakes use cases. For production, use paid models.

**Q: How do I get access to GPT-5.1?**  
A: Use model ID `openai/gpt-5.1` with OpenRouter. Requires OpenAI API access through OpenRouter.

**Q: Can I mix free and paid models in the same council?**  
A: Yes! You can configure any combination of free and paid models.

**Q: What happens if OpenRouter is down?**  
A: The system will retry with exponential backoff. Consider implementing a fallback strategy for critical applications.

**Q: How do I monitor OpenRouter usage?**  
A: Use the Admin Dashboard at http://localhost:3001 to view real-time usage and costs.

---

**Last Updated**: 2025-01-XX  
**Version**: 2.0.0
