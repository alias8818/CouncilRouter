# CouncilRouter Bug & Issue Report

This document details potential bugs, security vulnerabilities, and implementation issues identified in the CouncilRouter codebase.

## 1. Critical Security Issues

### 1.1. Insecure API Key Validation
**File:** `src/api/gateway.ts`
**Issue:** The `validateApiKey` method accepts any non-empty string as a valid API key.
```typescript
private validateApiKey(apiKey: string): boolean {
  // In production, validate against database
  // For now, accept any non-empty key
  return apiKey.length > 0;
}
```
**Impact:** Unauthorized access to the API is trivial. Anyone can bypass authentication by sending any string as an API key.

### 1.2. Predictable User IDs
**File:** `src/api/gateway.ts`
**Issue:** The `getUserIdFromApiKey` method generates user IDs based on a substring of the API key.
```typescript
private getUserIdFromApiKey(apiKey: string): string {
  return `user-${apiKey.substring(0, 8)}`;
}
```
**Impact:** If an attacker knows or guesses an API key, they can impersonate that user. It also leaks information about the API key structure.

### 1.3. Hardcoded Secrets
**File:** `src/api/gateway.ts`
**Issue:** The `jwtSecret` defaults to a hardcoded string if the environment variable is not set.
```typescript
jwtSecret: string = process.env.JWT_SECRET || 'default-secret-change-in-production'
```
**Impact:** If the environment variable is missed in deployment, the application uses a known secret, allowing attackers to forge JWT tokens.

### 1.4. Missing Input Sanitization
**File:** `src/api/gateway.ts`
**Issue:** The `validateRequestBody` method checks for the existence of fields but does not sanitize input.
**Impact:** While SQL injection is mitigated by parameterized queries in `SessionManager`, lack of sanitization can lead to other injection attacks or data integrity issues.

## 2. Concurrency & State Management

### 2.1. Shared State Corruption (Critical)
**File:** `src/orchestration/engine.ts`
**Issue:** `this.partialResponses` is a class property shared across all requests handled by the `OrchestrationEngine`.
```typescript
private partialResponses: TrackedResponse[] = [];
```
**Impact:** If multiple requests are processed concurrently (which is expected), `partialResponses` will be overwritten and mixed between requests. This will lead to incorrect timeout handling, data leakage between users, and potential crashes. **This must be moved to a local variable within the request scope.**

### 2.2. In-Memory Storage Data Loss
**File:** `src/api/gateway.ts`
**Issue:** Requests and streaming connections are stored in in-memory `Map` objects (`this.requests`, `this.streamingConnections`).
**Impact:**
*   **Data Loss:** All active request status and history are lost if the server restarts.
*   **Scalability:** This prevents running multiple instances of the API gateway behind a load balancer, as they won't share state.
*   **Memory Leaks:** If `requests` map is not properly cleaned up (e.g., failed requests that don't trigger cleanup logic), it will grow indefinitely.

### 2.3. Race Condition in Timeout Handling
**File:** `src/orchestration/engine.ts`
**Issue:** `getPartialResults` uses a fixed 50ms sleep to "allow pending callbacks to complete".
```typescript
await new Promise(resolve => setTimeout(resolve, 50));
```
**Impact:** This is unreliable. If the event loop is busy or callbacks take longer than 50ms, valid responses will be discarded, leading to unnecessary timeouts or incomplete data.

## 3. Logic & Implementation Gaps

### 3.1. Placeholder Synthesis Logic
**File:** `src/synthesis/engine.ts`
**Issue:** The `metaSynthesis` strategy is implemented as a simple string concatenation, despite comments implying it should use an LLM.
```typescript
// In a real implementation, this would call the moderator model with all responses
// For now, we'll create a structured summary
```
**Impact:** The "Meta-Synthesis" feature does not actually perform intelligent synthesis, rendering it much less useful than intended.

### 3.2. Rudimentary Agreement Calculation
**File:** `src/synthesis/engine.ts`
**Issue:** `calculateAgreementLevel` uses Jaccard similarity on simple word sets (filtering words < 3 chars).
**Impact:** This fails to capture semantic meaning. "I agree" and "I disagree" might have high similarity due to shared words, while semantically identical sentences with different vocabulary will have low similarity.

### 3.3. Context Loss in Summarization
**File:** `src/session/manager.ts`
**Issue:** `summarizeMessages` is a stub that replaces actual conversation history with a generic string.
```typescript
return `${userMessages} user messages and ${assistantMessages} assistant responses covering earlier conversation topics`;
```
**Impact:** When the context window is exceeded, the AI loses *all* knowledge of the previous conversation, severely degrading the user experience for long sessions.

### 3.4. Inefficient Session Caching
**File:** `src/session/manager.ts`
**Issue:** `cacheSession` serializes and writes the *entire* session history to Redis on every update.
**Impact:** As conversations grow, this becomes increasingly expensive (O(N^2) behavior over time), increasing latency and Redis bandwidth usage.

## 4. Reliability & Performance

### 4.1. Skewed Health Metrics
**File:** `src/providers/pool.ts`
**Issue:** `successRate` is calculated based on the total lifetime of the process (`latency.totalRequests`).
**Impact:** A provider that was unstable in the past but is now healthy will still show a poor success rate for a long time. Conversely, a previously stable provider that starts failing will take a long time to show a drop in success rate. Metrics should use a rolling window.

### 4.2. Inaccurate Failure Timestamp
**File:** `src/providers/pool.ts`
**Issue:** `lastFailure` is set to the current time whenever health is checked if the status is not healthy.
```typescript
const lastFailure = status === 'disabled' || status === 'degraded' ? new Date() : undefined;
```
**Impact:** This provides misleading information about when the actual failure occurred.

### 4.3. Potential Deadlock/Complexity in Rotation Lock
**File:** `src/synthesis/engine.ts`
**Issue:** The `acquireRotationLock` implementation creates a chain of promises that could potentially deadlock if not handled perfectly, and is over-engineered for a simple counter increment in a single-threaded environment.

## 5. Code Quality & Best Practices

*   **Hardcoded Environment Variables:** `src/providers/pool.ts` hardcodes checks for specific environment variables (`OPENAI_API_KEY`, etc.), making it harder to add new providers dynamically.
*   **Type Safety:** `src/session/manager.ts` uses `JSON.parse` on Redis data without validation, which could lead to runtime errors if data is corrupted.
*   **Error Leaking:** `src/api/gateway.ts` exposes raw error messages to the client in some cases, which might leak internal implementation details.
