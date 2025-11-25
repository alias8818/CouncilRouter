# Dynamic Model Pricing - API Documentation

## Overview

The Model API provides programmatic access to discovered AI models and their pricing information across multiple providers (OpenAI, Anthropic, Google Gemini, xAI). This API enables querying available models, filtering by capabilities, and accessing historical pricing data.

## Base URL

```
http://localhost:3000/api/models
```

## Authentication

All API requests require authentication using either JWT tokens or API keys.

### API Key Authentication

Include your API key in the `Authorization` header:

```http
Authorization: Bearer YOUR_API_KEY
```

### JWT Authentication

Include your JWT token in the `Authorization` header:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Endpoints

### 1. List Models

Retrieve a list of available AI models with optional filtering.

**Endpoint:** `GET /api/models`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| provider | string | No | Filter by provider: `openai`, `anthropic`, `google`, `xai` |
| classification | string | No | Filter by classification: `chat`, `reasoning`, `coding`, `multimodal`, `embedding`, `tools`, `general` |
| usability | string | No | Filter by usability status: `available`, `preview`, `deprecated` |
| minContextWindow | number | No | Minimum context window size in tokens |
| limit | number | No | Number of results per page (default: 50, max: 100) |
| offset | number | No | Number of results to skip (default: 0) |

**Response:**

```json
{
  "data": [
    {
      "id": "gpt-4-turbo-preview",
      "provider": "openai",
      "displayName": "GPT-4 Turbo",
      "classification": ["chat", "reasoning", "coding", "tools"],
      "contextWindow": 128000,
      "usability": "available",
      "capabilities": [
        {
          "type": "chat",
          "supported": true
        },
        {
          "type": "function_calling",
          "supported": true
        },
        {
          "type": "vision",
          "supported": true
        }
      ],
      "pricing": [
        {
          "inputCostPerMillion": 10.00,
          "outputCostPerMillion": 30.00,
          "tier": "standard",
          "contextLimit": null
        },
        {
          "inputCostPerMillion": 5.00,
          "outputCostPerMillion": 15.00,
          "tier": "batch",
          "contextLimit": null
        }
      ],
      "discoveredAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-20T14:22:00Z"
    },
    {
      "id": "claude-3-opus-20240229",
      "provider": "anthropic",
      "displayName": "Claude 3 Opus",
      "classification": ["chat", "reasoning", "coding", "multimodal"],
      "contextWindow": 200000,
      "usability": "available",
      "capabilities": [
        {
          "type": "chat",
          "supported": true
        },
        {
          "type": "vision",
          "supported": true
        }
      ],
      "pricing": [
        {
          "inputCostPerMillion": 15.00,
          "outputCostPerMillion": 75.00,
          "tier": "standard",
          "contextLimit": null
        }
      ],
      "discoveredAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-20T14:22:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 127,
    "hasMore": true
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique model identifier |
| provider | string | Provider name |
| displayName | string | Human-readable model name |
| classification | array | Model classifications (chat, reasoning, coding, etc.) |
| contextWindow | number | Maximum context window in tokens |
| usability | string | Model status: `available`, `preview`, or `deprecated` |
| capabilities | array | Supported capabilities with flags |
| pricing | array | Pricing tiers with costs per million tokens |
| discoveredAt | string | ISO 8601 timestamp when model was first discovered |
| updatedAt | string | ISO 8601 timestamp of last update |

**Status Codes:**

- `200 OK` - Models retrieved successfully
- `400 Bad Request` - Invalid query parameters
- `401 Unauthorized` - Missing or invalid authentication
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

**Example Requests:**

```bash
# Get all available models
curl -X GET "http://localhost:3000/api/models" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Filter by provider
curl -X GET "http://localhost:3000/api/models?provider=openai" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Filter by classification
curl -X GET "http://localhost:3000/api/models?classification=coding" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Filter by multiple criteria
curl -X GET "http://localhost:3000/api/models?provider=anthropic&usability=available&minContextWindow=100000" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Pagination
curl -X GET "http://localhost:3000/api/models?limit=20&offset=40" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### 2. Get Model Details

Retrieve detailed information about a specific model.

**Endpoint:** `GET /api/models/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | The model ID (e.g., `gpt-4-turbo-preview`) |

**Response:**

```json
{
  "id": "gpt-4-turbo-preview",
  "provider": "openai",
  "displayName": "GPT-4 Turbo",
  "classification": ["chat", "reasoning", "coding", "tools"],
  "contextWindow": 128000,
  "usability": "available",
  "capabilities": [
    {
      "type": "chat",
      "supported": true
    },
    {
      "type": "completion",
      "supported": true
    },
    {
      "type": "function_calling",
      "supported": true
    },
    {
      "type": "vision",
      "supported": true
    },
    {
      "type": "tools",
      "supported": true
    }
  ],
  "pricing": [
    {
      "inputCostPerMillion": 10.00,
      "outputCostPerMillion": 30.00,
      "tier": "standard",
      "contextLimit": null,
      "effectiveDate": "2024-01-15T00:00:00Z"
    },
    {
      "inputCostPerMillion": 5.00,
      "outputCostPerMillion": 15.00,
      "tier": "batch",
      "contextLimit": null,
      "effectiveDate": "2024-01-15T00:00:00Z"
    },
    {
      "inputCostPerMillion": 2.50,
      "outputCostPerMillion": 7.50,
      "tier": "cached",
      "contextLimit": null,
      "effectiveDate": "2024-01-15T00:00:00Z"
    }
  ],
  "metadata": {
    "ownedBy": "openai",
    "created": 1704067200,
    "version": "gpt-4-0125-preview"
  },
  "discoveredAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-20T14:22:00Z",
  "deprecatedAt": null
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique model identifier |
| provider | string | Provider name |
| displayName | string | Human-readable model name |
| classification | array | Model classifications |
| contextWindow | number | Maximum context window in tokens |
| usability | string | Model status |
| capabilities | array | Detailed capability information |
| pricing | array | All pricing tiers with effective dates |
| metadata | object | Additional provider-specific metadata |
| discoveredAt | string | When model was first discovered |
| updatedAt | string | Last update timestamp |
| deprecatedAt | string | Deprecation timestamp (null if active) |

**Status Codes:**

- `200 OK` - Model found and returned
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Model ID not found
- `500 Internal Server Error` - Server error

**Example Requests:**

```bash
# Get specific model
curl -X GET "http://localhost:3000/api/models/gpt-4-turbo-preview" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Get Anthropic model
curl -X GET "http://localhost:3000/api/models/claude-3-opus-20240229" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### 3. Get Model Pricing History

Retrieve historical pricing data for a specific model.

**Endpoint:** `GET /api/models/:id/pricing-history`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | The model ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| startDate | string | No | Start date (ISO 8601 format) |
| endDate | string | No | End date (ISO 8601 format) |
| tier | string | No | Filter by pricing tier: `standard`, `batch`, `cached` |

**Response:**

```json
{
  "modelId": "gpt-4-turbo-preview",
  "history": [
    {
      "inputCostPerMillion": 10.00,
      "outputCostPerMillion": 30.00,
      "tier": "standard",
      "effectiveDate": "2024-01-15T00:00:00Z",
      "endDate": null
    },
    {
      "inputCostPerMillion": 12.00,
      "outputCostPerMillion": 36.00,
      "tier": "standard",
      "effectiveDate": "2023-11-06T00:00:00Z",
      "endDate": "2024-01-14T23:59:59Z"
    },
    {
      "inputCostPerMillion": 15.00,
      "outputCostPerMillion": 45.00,
      "tier": "standard",
      "effectiveDate": "2023-03-14T00:00:00Z",
      "endDate": "2023-11-05T23:59:59Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 3,
    "hasMore": false
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| modelId | string | Model identifier |
| history | array | Historical pricing records |
| history[].inputCostPerMillion | number | Input cost per million tokens |
| history[].outputCostPerMillion | number | Output cost per million tokens |
| history[].tier | string | Pricing tier |
| history[].effectiveDate | string | When this pricing became effective |
| history[].endDate | string | When this pricing ended (null if current) |

**Status Codes:**

- `200 OK` - History retrieved successfully
- `400 Bad Request` - Invalid date parameters
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Model ID not found
- `500 Internal Server Error` - Server error

**Example Requests:**

```bash
# Get all pricing history
curl -X GET "http://localhost:3000/api/models/gpt-4-turbo-preview/pricing-history" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Get pricing history for date range
curl -X GET "http://localhost:3000/api/models/gpt-4-turbo-preview/pricing-history?startDate=2023-01-01&endDate=2023-12-31" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Get pricing history for specific tier
curl -X GET "http://localhost:3000/api/models/gpt-4-turbo-preview/pricing-history?tier=batch" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Model Classifications

Models are automatically classified based on their capabilities:

| Classification | Description | Example Models |
|----------------|-------------|----------------|
| chat | Conversational models | GPT-4, Claude 3, Gemini Pro |
| reasoning | Advanced reasoning capabilities | GPT-4, Claude 3 Opus |
| coding | Code generation and analysis | GPT-4, Claude 3, Codex |
| multimodal | Vision and image understanding | GPT-4 Vision, Claude 3, Gemini Pro Vision |
| embedding | Text embedding models | text-embedding-3-large, text-embedding-ada-002 |
| tools | Function calling and tool use | GPT-4, Claude 3 |
| general | General purpose models | GPT-3.5, Gemini Pro |

---

## Pricing Tiers

Different pricing tiers are available for some models:

| Tier | Description | Typical Discount |
|------|-------------|------------------|
| standard | Standard API pricing | Baseline |
| batch | Batch API pricing (24-hour turnaround) | 50% off |
| cached | Prompt caching discount | 50-90% off |

---

## Model Capabilities

Each model reports its supported capabilities:

| Capability | Description |
|------------|-------------|
| chat | Chat completion API |
| completion | Text completion API |
| embedding | Text embedding generation |
| vision | Image understanding |
| function_calling | Function/tool calling |
| tools | Tool use and execution |

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_PARAMETER` | Invalid query parameter | 400 |
| `MODEL_NOT_FOUND` | Model ID not found | 404 |
| `UNAUTHORIZED` | Authentication failed | 401 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `INTERNAL_ERROR` | Internal server error | 500 |

---

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Default Limit:** 100 requests per 15 minutes per API key
- **Burst Limit:** 20 requests per second

When rate limited, you'll receive a `429 Too Many Requests` response with headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1642248600
Retry-After: 30
```

---

## SDK Examples

### Node.js / TypeScript

```typescript
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api/models';
const API_KEY = 'YOUR_API_KEY';

// Get all models
async function getAllModels() {
  const response = await axios.get(API_BASE, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  return response.data;
}

// Get models by provider
async function getModelsByProvider(provider: string) {
  const response = await axios.get(`${API_BASE}?provider=${provider}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  return response.data;
}

// Get specific model
async function getModel(modelId: string) {
  const response = await axios.get(`${API_BASE}/${modelId}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  return response.data;
}

// Get pricing history
async function getPricingHistory(modelId: string, startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  
  const response = await axios.get(
    `${API_BASE}/${modelId}/pricing-history?${params}`,
    { headers: { 'Authorization': `Bearer ${API_KEY}` } }
  );
  return response.data;
}

// Usage
const models = await getAllModels();
console.log(`Found ${models.pagination.total} models`);

const openaiModels = await getModelsByProvider('openai');
console.log(`OpenAI models: ${openaiModels.data.length}`);

const gpt4 = await getModel('gpt-4-turbo-preview');
console.log(`GPT-4 context window: ${gpt4.contextWindow} tokens`);

const history = await getPricingHistory('gpt-4-turbo-preview', '2023-01-01', '2024-01-01');
console.log(`Price changes: ${history.history.length}`);
```

### Python

```python
import requests
from datetime import datetime

API_BASE = 'http://localhost:3000/api/models'
API_KEY = 'YOUR_API_KEY'

headers = {'Authorization': f'Bearer {API_KEY}'}

# Get all models
def get_all_models():
    response = requests.get(API_BASE, headers=headers)
    response.raise_for_status()
    return response.json()

# Get models by provider
def get_models_by_provider(provider):
    response = requests.get(
        f'{API_BASE}?provider={provider}',
        headers=headers
    )
    response.raise_for_status()
    return response.json()

# Get specific model
def get_model(model_id):
    response = requests.get(f'{API_BASE}/{model_id}', headers=headers)
    response.raise_for_status()
    return response.json()

# Get pricing history
def get_pricing_history(model_id, start_date=None, end_date=None):
    params = {}
    if start_date:
        params['startDate'] = start_date
    if end_date:
        params['endDate'] = end_date
    
    response = requests.get(
        f'{API_BASE}/{model_id}/pricing-history',
        headers=headers,
        params=params
    )
    response.raise_for_status()
    return response.json()

# Usage
models = get_all_models()
print(f"Found {models['pagination']['total']} models")

openai_models = get_models_by_provider('openai')
print(f"OpenAI models: {len(openai_models['data'])}")

gpt4 = get_model('gpt-4-turbo-preview')
print(f"GPT-4 context window: {gpt4['contextWindow']} tokens")

history = get_pricing_history('gpt-4-turbo-preview', '2023-01-01', '2024-01-01')
print(f"Price changes: {len(history['history'])}")
```

---

## Best Practices

1. **Cache Model Data** - Model information changes infrequently, cache locally
2. **Use Filters** - Filter by provider/classification to reduce response size
3. **Monitor Pricing Changes** - Subscribe to pricing history for cost tracking
4. **Handle Deprecation** - Check `usability` field and handle deprecated models
5. **Respect Rate Limits** - Implement client-side rate limiting
6. **Use Pagination** - For large result sets, use pagination parameters
7. **Check Context Windows** - Verify model context window before use
8. **Validate Capabilities** - Check capabilities array before using features
9. **Handle Errors Gracefully** - Implement retry logic for transient errors
10. **Track Pricing Tiers** - Use appropriate tier (batch, cached) for cost optimization

---

## Integration with AI Council Proxy

The Model API integrates with the AI Council Proxy's core components:

### Provider Pool Integration

The Provider Pool queries the Model Registry to discover available models:

```typescript
// Query available models for a provider
const models = await modelRegistry.getModels({
  provider: 'openai',
  usability: 'available'
});

// Use models in council configuration
const councilMembers = models.data.map(model => ({
  id: model.id,
  provider: model.provider,
  model: model.id,
  contextWindow: model.contextWindow
}));
```

### Cost Calculator Integration

The Cost Calculator uses dynamic pricing from the Model Registry:

```typescript
// Get current pricing for a model
const model = await modelRegistry.getModel('gpt-4-turbo-preview');
const standardPricing = model.pricing.find(p => p.tier === 'standard');

// Calculate cost
const cost = (
  (inputTokens / 1000000) * standardPricing.inputCostPerMillion +
  (outputTokens / 1000000) * standardPricing.outputCostPerMillion
);
```

### Historical Cost Analysis

Use pricing history for accurate historical cost calculations:

```typescript
// Get pricing for a specific date
const history = await modelRegistry.getPricingHistory(
  'gpt-4-turbo-preview',
  '2023-12-01',
  '2023-12-31'
);

// Use historical pricing for cost reports
const pricingOnDate = history.history.find(h => 
  new Date(h.effectiveDate) <= targetDate &&
  (!h.endDate || new Date(h.endDate) >= targetDate)
);
```

---

## Support

For API support:
- Documentation: https://docs.example.com/model-api
- Support: support@example.com
- API Status: https://status.example.com
