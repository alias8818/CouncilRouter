# API Gateway Implementation

## Overview

The API Gateway provides a REST API for submitting requests and retrieving results. It includes authentication, rate limiting, streaming support, and idempotency handling.

## Components

### 1. REST API Endpoints

**Health Check**
```
GET /health
Response: { status: 'healthy', timestamp: ISO8601 }
```

**Submit Request**
```
POST /api/v1/requests
Headers:
  Authorization: Bearer <jwt-token> | ApiKey <api-key>
  Idempotency-Key: <optional-unique-key>
Body: {
  query: string,
  sessionId?: string,
  streaming?: boolean,
  transparency?: boolean
}
Response: {
  requestId: string,
  status: 'processing' | 'completed' | 'failed',
  createdAt: ISO8601,
  fromCache?: boolean
}
```

**Get Request Status**
```
GET /api/v1/requests/:requestId
Headers:
  Authorization: Bearer <jwt-token> | ApiKey <api-key>
Response: {
  requestId: string,
  status: 'processing' | 'completed' | 'failed',
  consensusDecision?: string,
  createdAt: ISO8601,
  completedAt?: ISO8601
}
```

**Stream Request (Server-Sent Events)**
```
GET /api/v1/requests/:requestId/stream
Headers:
  Authorization: Bearer <jwt-token> | ApiKey <api-key>
Response: SSE stream with events:
  - status: Processing status updates
  - message: Partial consensus decision text
  - done: Request completed
  - error: Error occurred
```

## Key Features

### Authentication

Supports two authentication methods:

1. **JWT Tokens**
   ```
   Authorization: Bearer <jwt-token>
   ```
   - Token must contain `userId` claim
   - Verified using `JWT_SECRET` environment variable

2. **API Keys**
   ```
   Authorization: ApiKey <api-key>
   ```
   - Keys stored as SHA-256 hashes in database
   - Supports expiration and active/inactive status
   - Minimum 32 characters in production

### Rate Limiting

- 100 requests per 15 minutes per IP address
- Disabled in test mode
- Returns 429 status when limit exceeded

### Idempotency

Prevents duplicate request processing using `Idempotency-Key` header:

- Keys are scoped per user to prevent cross-tenant leakage
- Cached results returned immediately for duplicate keys
- Concurrent requests with same key wait for first to complete
- 24-hour TTL on cached results
- Supports both successful and failed request caching

**Usage:**
```bash
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: unique-request-id-123" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is AI?"}'
```

### Input Sanitization

Protects against injection attacks:

- Removes null bytes and dangerous control characters
- Preserves legitimate whitespace (tabs, newlines)
- Validates query length (max 100KB)
- Validates UUID format for session IDs
- Trims and validates all string inputs

### Streaming Support

Server-Sent Events (SSE) for real-time updates:

- Streams partial results as synthesis progresses
- Automatic connection cleanup after 30 minutes
- Periodic cleanup of stale connections (every 5 minutes)
- Proper error handling for closed connections

### Error Handling

- Generic error messages in production (prevents information leakage)
- Detailed error messages in development
- Structured error responses with error codes
- Retryable flag indicates if request can be retried

**Error Response Format:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {},
    "retryable": true|false
  },
  "requestId": "uuid",
  "timestamp": "ISO8601"
}
```

## Configuration

### Environment Variables

Required:
- `JWT_SECRET`: Secret key for JWT verification (required in production)
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`: Provider API keys

Optional:
- `NODE_ENV`: Environment (production|development|test)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string

### Security Best Practices

1. **Always set JWT_SECRET in production**
   - Use a strong, random secret (minimum 32 characters)
   - Rotate secrets periodically
   - Never commit secrets to version control

2. **Use HTTPS in production**
   - All API communication should use TLS
   - Prevents token interception

3. **Implement API key rotation**
   - Support multiple active keys per user
   - Graceful key expiration
   - Audit log of key usage

4. **Monitor rate limits**
   - Adjust limits based on usage patterns
   - Implement per-user limits in addition to per-IP

## Usage Examples

### Submit Request with JWT

```typescript
const response = await fetch('http://localhost:3000/api/v1/requests', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'What is the capital of France?',
    sessionId: 'optional-session-id',
    streaming: false
  })
});

const result = await response.json();
console.log('Request ID:', result.requestId);
```

### Submit Request with API Key

```typescript
const response = await fetch('http://localhost:3000/api/v1/requests', {
  method: 'POST',
  headers: {
    'Authorization': `ApiKey ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'Explain quantum computing'
  })
});
```

### Submit Idempotent Request

```typescript
const idempotencyKey = 'unique-request-' + Date.now();

const response = await fetch('http://localhost:3000/api/v1/requests', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Idempotency-Key': idempotencyKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'What is AI?'
  })
});

// Subsequent requests with same key return cached result
const cachedResponse = await fetch('http://localhost:3000/api/v1/requests', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Idempotency-Key': idempotencyKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'What is AI?'
  })
});

const result = await cachedResponse.json();
console.log('From cache:', result.fromCache); // true
```

### Stream Response

```typescript
const eventSource = new EventSource(
  `http://localhost:3000/api/v1/requests/${requestId}/stream`,
  {
    headers: {
      'Authorization': `Bearer ${jwtToken}`
    }
  }
);

eventSource.addEventListener('status', (event) => {
  console.log('Status:', event.data);
});

eventSource.addEventListener('message', (event) => {
  console.log('Partial result:', event.data);
});

eventSource.addEventListener('done', (event) => {
  console.log('Complete:', event.data);
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Error:', event.data);
  eventSource.close();
});
```

### Get Request Status

```typescript
const response = await fetch(
  `http://localhost:3000/api/v1/requests/${requestId}`,
  {
    headers: {
      'Authorization': `Bearer ${jwtToken}`
    }
  }
);

const result = await response.json();
console.log('Status:', result.status);
console.log('Decision:', result.consensusDecision);
```

## Testing

### Unit Tests

Test authentication, validation, and error handling:

```typescript
describe('API Gateway', () => {
  test('should reject requests without authentication', async () => {
    const response = await request(app)
      .post('/api/v1/requests')
      .send({ query: 'test' });
    
    expect(response.status).toBe(401);
  });
  
  test('should validate request body', async () => {
    const response = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ invalid: 'body' });
    
    expect(response.status).toBe(400);
  });
});
```

### Integration Tests

Test end-to-end request flow:

```typescript
describe('Request Flow', () => {
  test('should process request and return result', async () => {
    const submitResponse = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ query: 'test query' });
    
    expect(submitResponse.status).toBe(202);
    const { requestId } = submitResponse.body;
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const statusResponse = await request(app)
      .get(`/api/v1/requests/${requestId}`)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.status).toBe('completed');
  });
});
```

## Troubleshooting

### Common Issues

**401 Unauthorized**
- Check JWT_SECRET is set correctly
- Verify token is not expired
- Ensure Authorization header format is correct

**400 Bad Request**
- Validate request body structure
- Check query length (max 100KB)
- Verify sessionId is valid UUID format

**429 Too Many Requests**
- Rate limit exceeded
- Wait before retrying
- Consider implementing exponential backoff

**500 Internal Server Error**
- Check server logs for details
- Verify database and Redis connections
- Ensure provider API keys are valid

### Debug Mode

Enable detailed error messages in development:

```bash
NODE_ENV=development npm start
```

This provides full error stack traces and detailed error messages in API responses.

## Performance Considerations

### Connection Pooling

- Database connection pool (default: 10 connections)
- Redis connection reuse
- HTTP keep-alive for provider requests

### Caching

- Request status cached in Redis (1 hour TTL)
- Idempotency results cached (24 hour TTL)
- Configuration cached to reduce database queries

### Async Processing

- Requests processed asynchronously
- Immediate response with request ID
- Client polls or streams for results

### Resource Cleanup

- Automatic cleanup of stale streaming connections
- Request data expires after 24 hours
- Periodic garbage collection of expired cache entries

## Security Considerations

### Input Validation

- All inputs sanitized before processing
- SQL injection prevention via parameterized queries
- XSS prevention via output encoding
- CSRF protection via token validation

### Authentication

- JWT tokens with expiration
- API keys with SHA-256 hashing
- Support for key rotation
- Audit logging of authentication attempts

### Rate Limiting

- Per-IP rate limiting
- Per-user rate limiting (future enhancement)
- Configurable limits
- Graceful degradation under load

### Data Protection

- Sensitive data encrypted at rest
- TLS for all network communication
- API keys never logged or exposed
- User data isolated per tenant

## Future Enhancements

- WebSocket support for bidirectional streaming
- GraphQL API endpoint
- API versioning (v2, v3)
- Per-user rate limiting
- API key management endpoints
- Request replay for debugging
- Webhook notifications for completed requests
