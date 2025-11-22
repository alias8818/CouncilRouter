# Redis Cache Schema

## Session Cache

```
Key: session:{sessionId}
Type: Hash
Fields:
  - userId: string
  - history: JSON string (HistoryEntry[])
  - lastActivityAt: timestamp
  - contextWindowUsed: number
TTL: 30 days (2592000 seconds)
```

## Configuration Cache

```
Key: config:council
Type: String (JSON)
Value: CouncilConfig object
TTL: No expiry (invalidate on update)

Key: config:deliberation
Type: String (JSON)
Value: DeliberationConfig object
TTL: No expiry (invalidate on update)

Key: config:synthesis
Type: String (JSON)
Value: SynthesisConfig object
TTL: No expiry (invalidate on update)

Key: config:performance
Type: String (JSON)
Value: PerformanceConfig object
TTL: No expiry (invalidate on update)
```

## Provider Health Cache

```
Key: provider:health:{providerId}
Type: Hash
Fields:
  - status: string ('healthy' | 'degraded' | 'disabled')
  - successRate: number
  - avgLatency: number
  - lastFailure: timestamp (optional)
TTL: 5 minutes (300 seconds)
```

## Request Status Cache

```
Key: request:status:{requestId}
Type: Hash
Fields:
  - status: string
  - progress: number (0-100)
TTL: 1 hour (3600 seconds)
```

## Usage Examples

### Session Cache
```typescript
// Store session
await redis.hSet(`session:${sessionId}`, {
  userId: session.userId,
  history: JSON.stringify(session.history),
  lastActivityAt: session.lastActivityAt.toISOString(),
  contextWindowUsed: session.contextWindowUsed.toString()
});
await redis.expire(`session:${sessionId}`, 2592000);

// Retrieve session
const sessionData = await redis.hGetAll(`session:${sessionId}`);
```

### Configuration Cache
```typescript
// Store config
await redis.set('config:council', JSON.stringify(councilConfig));

// Retrieve config
const configStr = await redis.get('config:council');
const config = JSON.parse(configStr);

// Invalidate on update
await redis.del('config:council');
```

### Provider Health Cache
```typescript
// Store health
await redis.hSet(`provider:health:${providerId}`, {
  status: 'healthy',
  successRate: '0.99',
  avgLatency: '250'
});
await redis.expire(`provider:health:${providerId}`, 300);

// Retrieve health
const health = await redis.hGetAll(`provider:health:${providerId}`);
```
