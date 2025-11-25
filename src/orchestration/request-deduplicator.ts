/**
 * Request Deduplicator
 * Prevents duplicate requests to providers within the same orchestration cycle
 */

import { CouncilMember } from '../types/core';

/**
 * Tracks in-flight requests to prevent duplicates
 */
export class RequestDeduplicator {
  // Track in-flight requests by a composite key: requestId + memberId + prompt hash
  private inFlightRequests: Map<string, Promise<any>> = new Map();

  /**
     * Execute a request with deduplication
     * If the same request is already in-flight, return the existing promise
     */
  async executeWithDeduplication<T>(
    requestId: string,
    member: CouncilMember,
    prompt: string,
    executor: () => Promise<T>
  ): Promise<T> {
    const key = this.createKey(requestId, member.id, prompt);

    // Check if this exact request is already in-flight
    const existingPromise = this.inFlightRequests.get(key);
    if (existingPromise) {
      console.log(`[Deduplicator] Reusing in-flight request for ${member.id} in request ${requestId}`);
      return existingPromise as Promise<T>;
    }

    // Execute the request and track it
    const promise = executor()
      .finally(() => {
        // Clean up after completion (success or failure)
        this.inFlightRequests.delete(key);
      });

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  /**
     * Create a unique key for request tracking
     */
  private createKey(requestId: string, memberId: string, prompt: string): string {
    // Use a simple hash of the prompt to avoid storing large strings
    const promptHash = this.simpleHash(prompt);
    return `${requestId}:${memberId}:${promptHash}`;
  }

  /**
     * Simple hash function for prompt deduplication
     */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
     * Clear all tracked requests (for cleanup)
     */
  clear(): void {
    this.inFlightRequests.clear();
  }

  /**
     * Get count of in-flight requests (for monitoring)
     */
  getInFlightCount(): number {
    return this.inFlightRequests.size;
  }
}
