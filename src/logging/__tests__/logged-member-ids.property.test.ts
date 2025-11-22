/**
 * Property-Based Test: Logged Responses Have Correct Member IDs
 * Feature: bug-fixes-critical, Property 6: Logged responses have correct member IDs
 * 
 * Validates: Requirements 2.2
 * 
 * For any response logged after a global timeout, the response should be
 * associated with the correct Council Member ID.
 */

import * as fc from 'fast-check';
import { EventLogger } from '../logger';
import { Pool } from 'pg';
import { InitialResponse } from '../../types/core';

// ============================================================================
// Mock Database Pool
// ============================================================================

class MockPool {
  private queries: Array<{ query: string; values: any[] }> = [];
  
  getQueries(): Array<{ query: string; values: any[] }> {
    return this.queries;
  }
  
  clearQueries(): void {
    this.queries = [];
  }
  
  async query(query: string, values?: any[]): Promise<any> {
    this.queries.push({ query, values: values || [] });
    return { rows: [], rowCount: 1 };
  }
}

// ============================================================================
// Arbitraries for Property-Based Testing
// ============================================================================

const tokenUsageArbitrary = fc.record({
  promptTokens: fc.integer({ min: 0, max: 10000 }),
  completionTokens: fc.integer({ min: 0, max: 10000 })
}).map(({ promptTokens, completionTokens }) => ({
  promptTokens,
  completionTokens,
  totalTokens: promptTokens + completionTokens
}));

const initialResponseArbitrary = fc.record({
  councilMemberId: fc.string({ minLength: 3, maxLength: 20 }).filter(s => !/^\d+$/.test(s)).map(s => `member-${s}`),
  content: fc.string({ minLength: 1, maxLength: 500 }),
  tokenUsage: tokenUsageArbitrary,
  latency: fc.integer({ min: 0, max: 10000 }),
  timestamp: fc.date()
});

const requestIdArbitrary = fc.uuid();

// ============================================================================
// Property Test: Logged Responses Have Correct Member IDs
// ============================================================================

describe('Property Test: Logged Responses Have Correct Member IDs', () => {
  /**
   * Feature: bug-fixes-critical, Property 6: Logged responses have correct member IDs
   * 
   * For any response logged after a global timeout, the response should be
   * associated with the correct Council Member ID.
   * 
   * Validates: Requirements 2.2
   */
  test('should log responses with actual member IDs not placeholders', async () => {
    await fc.assert(
      fc.asyncProperty(
        requestIdArbitrary,
        initialResponseArbitrary,
        async (requestId, response) => {
          // Setup
          const mockPool = new MockPool();
          const logger = new EventLogger(mockPool as unknown as Pool);
          
          // Clear previous queries
          mockPool.clearQueries();
          
          // Execute: Log the council response
          await logger.logCouncilResponse(requestId, response);
          
          // Get the logged queries
          const queries = mockPool.getQueries();
          
          // Property assertions:
          // Should have logged exactly one query
          expect(queries.length).toBe(1);
          
          const loggedQuery = queries[0];
          
          // The query should be an INSERT into council_responses
          expect(loggedQuery.query).toContain('INSERT INTO council_responses');
          
          // The values should include the actual member ID
          const values = loggedQuery.values;
          const loggedMemberId = values[2]; // council_member_id is the 3rd parameter
          
          // Should match the actual member ID from the response
          expect(loggedMemberId).toBe(response.councilMemberId);
          
          // Should not be a placeholder pattern like "member-0", "member-1", etc.
          const isPlaceholder = /^member-\d+$/.test(loggedMemberId);
          expect(isPlaceholder).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Test that multiple responses maintain distinct member IDs
   */
  test('should preserve distinct member IDs when logging multiple responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        requestIdArbitrary,
        fc.array(initialResponseArbitrary, { minLength: 2, maxLength: 5 }),
        async (requestId, responses) => {
          // Ensure unique member IDs
          const uniqueResponses = responses.filter((r, i, arr) => 
            arr.findIndex(x => x.councilMemberId === r.councilMemberId) === i
          );
          
          if (uniqueResponses.length < 2) {
            return; // Skip if we don't have enough unique responses
          }
          
          // Setup
          const mockPool = new MockPool();
          const logger = new EventLogger(mockPool as unknown as Pool);
          
          // Clear previous queries
          mockPool.clearQueries();
          
          // Execute: Log all responses
          for (const response of uniqueResponses) {
            await logger.logCouncilResponse(requestId, response);
          }
          
          // Get the logged queries
          const queries = mockPool.getQueries();
          
          // Property assertions:
          // Should have logged one query per response
          expect(queries.length).toBe(uniqueResponses.length);
          
          // Extract logged member IDs
          const loggedMemberIds = queries.map(q => q.values[2]);
          const expectedMemberIds = uniqueResponses.map(r => r.councilMemberId);
          
          // All logged member IDs should match the expected member IDs
          expect(loggedMemberIds.sort()).toEqual(expectedMemberIds.sort());
          
          // No logged member ID should be a placeholder
          for (const memberId of loggedMemberIds) {
            const isPlaceholder = /^member-\d+$/.test(memberId);
            expect(isPlaceholder).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
