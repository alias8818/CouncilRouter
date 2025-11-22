# AI Council Proxy - API Documentation

## Overview

The AI Council Proxy provides a REST API for submitting requests to the AI council and retrieving consensus responses. The API supports both synchronous polling and streaming responses.

## Base URL

```
http://localhost:3000/api/v1
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

## Endpoints

### 1. Submit Request

Submit a new request to the AI council for processing.

**Endpoint:** `POST /api/v1/requests`

**Request Body:**

```json
{
  "query": "What are the key differences between TypeScript and JavaScript?",
  "sessionId": "optional-session-id-for-context",
  "streaming": false
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | The user's question or prompt |
| sessionId | string | No | Session ID for maintaining conversation context |
| streaming | boolean | No | Whether to enable streaming responses (default: false) |

**Response:**

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| requestId | string | Unique identifier for the request |
| status | string | Current status: `processing`, `completed`, or `failed` |
| createdAt | string | ISO 8601 timestamp of request creation |

**Status Codes:**

- `202 Accepted` - Request accepted and processing
- `400 Bad Request` - Invalid request body
- `401 Unauthorized` - Missing or invalid authentication
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

**Example:**

```bash
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Explain quantum computing in simple terms",
    "sessionId": "user-123-session"
  }'
```

---

### 2. Get Request Status and Response

Retrieve the status and response for a previously submitted request.

**Endpoint:** `GET /api/v1/requests/:requestId`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | The request ID returned from POST /requests |

**Response (Processing):**

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Response (Completed):**

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "consensusDecision": "Quantum computing uses quantum mechanical phenomena...",
  "confidence": "high",
  "agreementLevel": 0.92,
  "cost": 0.0234,
  "latency": 3450,
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:30:03Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| requestId | string | Unique identifier for the request |
| status | string | Current status: `processing`, `completed`, or `failed` |
| consensusDecision | string | The final consensus response (only when completed) |
| confidence | string | Confidence level: `high`, `medium`, or `low` |
| agreementLevel | number | Agreement level between council members (0-1) |
| cost | number | Total cost in USD for processing this request |
| latency | number | Total processing time in milliseconds |
| createdAt | string | ISO 8601 timestamp of request creation |
| completedAt | string | ISO 8601 timestamp of completion |

**Status Codes:**

- `200 OK` - Request found and returned
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Request ID not found
- `500 Internal Server Error` - Server error

**Example:**

```bash
curl -X GET http://localhost:3000/api/v1/requests/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### 3. Stream Response (Server-Sent Events)

Stream the consensus response as it's being synthesized.

**Endpoint:** `GET /api/v1/requests/:requestId/stream`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | The request ID returned from POST /requests |

**Response Format:** Server-Sent Events (SSE)

**Event Types:**

1. **progress** - Processing progress updates
2. **chunk** - Partial response chunks
3. **complete** - Final response with metadata
4. **error** - Error occurred during processing

**Example Events:**

```
event: progress
data: {"status": "distributing", "message": "Distributing to council members"}

event: progress
data: {"status": "deliberating", "message": "Round 1 of 2"}

event: chunk
data: {"content": "Quantum computing"}

event: chunk
data: {"content": " uses quantum mechanical"}

event: chunk
data: {"content": " phenomena..."}

event: complete
data: {"requestId": "550e8400-...", "status": "completed", "cost": 0.0234, "latency": 3450}
```

**Status Codes:**

- `200 OK` - Stream established
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Request ID not found
- `500 Internal Server Error` - Server error

**Example (JavaScript):**

```javascript
const eventSource = new EventSource(
  'http://localhost:3000/api/v1/requests/550e8400-e29b-41d4-a716-446655440000/stream',
  {
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY'
    }
  }
);

eventSource.addEventListener('chunk', (event) => {
  const data = JSON.parse(event.data);
  console.log('Chunk:', data.content);
});

eventSource.addEventListener('complete', (event) => {
  const data = JSON.parse(event.data);
  console.log('Complete:', data);
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Error:', event);
  eventSource.close();
});
```

**Example (curl):**

```bash
curl -N -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/v1/requests/550e8400-e29b-41d4-a716-446655440000/stream
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "retryable": false
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Common Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `INVALID_REQUEST` | Request body validation failed | No |
| `UNAUTHORIZED` | Authentication failed | No |
| `NOT_FOUND` | Resource not found | No |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Yes |
| `TIMEOUT` | Request processing timeout | Yes |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable | Yes |
| `INTERNAL_ERROR` | Internal server error | Yes |
| `ALL_PROVIDERS_FAILED` | All council members failed | Yes |
| `MINIMUM_QUORUM_NOT_MET` | Not enough council members responded | Yes |

---

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Default Limit:** 100 requests per minute per API key
- **Burst Limit:** 20 requests per second

When rate limited, you'll receive a `429 Too Many Requests` response with headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1642248600
Retry-After: 30
```

---

## Pagination

For endpoints that return lists (future dashboard endpoints), pagination follows this pattern:

**Query Parameters:**

- `limit` - Number of items per page (default: 20, max: 100)
- `offset` - Number of items to skip (default: 0)

**Response:**

```json
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 150,
    "hasMore": true
  }
}
```

---

## Webhooks (Future Feature)

Webhook support for request completion notifications is planned for a future release.

---

## SDK Examples

### Node.js / TypeScript

```typescript
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api/v1';
const API_KEY = 'YOUR_API_KEY';

async function submitRequest(query: string, sessionId?: string) {
  const response = await axios.post(
    `${API_BASE}/requests`,
    { query, sessionId },
    {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}

async function getResponse(requestId: string) {
  const response = await axios.get(
    `${API_BASE}/requests/${requestId}`,
    {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    }
  );
  return response.data;
}

// Usage
const { requestId } = await submitRequest('What is machine learning?');
console.log('Request ID:', requestId);

// Poll for completion
let result;
do {
  await new Promise(resolve => setTimeout(resolve, 1000));
  result = await getResponse(requestId);
} while (result.status === 'processing');

console.log('Response:', result.consensusDecision);
```

### Python

```python
import requests
import time

API_BASE = 'http://localhost:3000/api/v1'
API_KEY = 'YOUR_API_KEY'

def submit_request(query, session_id=None):
    response = requests.post(
        f'{API_BASE}/requests',
        json={'query': query, 'sessionId': session_id},
        headers={'Authorization': f'Bearer {API_KEY}'}
    )
    response.raise_for_status()
    return response.json()

def get_response(request_id):
    response = requests.get(
        f'{API_BASE}/requests/{request_id}',
        headers={'Authorization': f'Bearer {API_KEY}'}
    )
    response.raise_for_status()
    return response.json()

# Usage
result = submit_request('What is machine learning?')
request_id = result['requestId']
print(f'Request ID: {request_id}')

# Poll for completion
while True:
    time.sleep(1)
    result = get_response(request_id)
    if result['status'] != 'processing':
        break

print(f"Response: {result['consensusDecision']}")
```

---

## Best Practices

1. **Use Session IDs** - Maintain conversation context by including session IDs
2. **Handle Retries** - Implement exponential backoff for retryable errors
3. **Use Streaming** - For better UX, use streaming for long-running requests
4. **Monitor Costs** - Track the `cost` field to monitor API spending
5. **Check Agreement Level** - Low agreement levels may indicate controversial topics
6. **Respect Rate Limits** - Implement client-side rate limiting
7. **Handle Timeouts** - Set appropriate client timeouts (recommend 60s+)
8. **Store Request IDs** - Keep request IDs for debugging and audit trails

---

## Support

For API support, please contact:
- Email: support@example.com
- Documentation: https://docs.example.com
- Status Page: https://status.example.com
