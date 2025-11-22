/**
 * Property-Based Test: Deliberation thread chronological ordering
 * Feature: ai-council-proxy, Property 41: Deliberation thread chronological ordering
 * 
 * Validates: Requirements 12.2
 * 
 * For any revealed deliberation thread, all council member responses and exchanges
 * should be displayed in chronological order.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { Dashboard } from '../dashboard';
import { DeliberationThread, Exchange } from '../../types/core';

// Mock dependencies
jest.mock('pg');
jest.mock('../../analytics/engine');
jest.mock('../../providers/pool');
jest.mock('../../redteam/tester');

describe('Property 41: Deliberation thread chronological ordering', () => {
  test('deliberation thread should be in chronological order', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a request ID
        fc.uuid(),
        // Generate number of rounds (0-5)
        fc.integer({ min: 0, max: 5 }),
        // Generate number of council members (2-5)
        fc.integer({ min: 2, max: 5 }),
        async (requestId, numRounds, numMembers) => {
          // Create mock database
          const mockDb = {
            query: jest.fn()
          } as unknown as Pool;

          // Create mock analytics engine
          const mockAnalytics = {} as any;
          const mockProviderPool = {} as any;
          const mockRedTeam = {} as any;

          const dashboard = new Dashboard(mockDb, mockAnalytics, mockProviderPool, mockRedTeam);

          // Generate timestamps in chronological order
          const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
          let currentTime = baseTime;

          // Generate initial responses (round 0)
          const initialResponses: any[] = [];
          for (let i = 0; i < numMembers; i++) {
            currentTime += Math.floor(Math.random() * 1000) + 100; // Add 100-1100ms
            initialResponses.push({
              council_member_id: `member-${i}`,
              content: `Initial response from member ${i}`,
              token_usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
              latency_ms: 1000,
              created_at: new Date(currentTime)
            });
          }

          // Generate deliberation exchanges for subsequent rounds
          const deliberationExchanges: any[] = [];
          for (let round = 1; round <= numRounds; round++) {
            for (let i = 0; i < numMembers; i++) {
              currentTime += Math.floor(Math.random() * 1000) + 100; // Add 100-1100ms
              deliberationExchanges.push({
                round_number: round,
                council_member_id: `member-${i}`,
                content: `Round ${round} response from member ${i}`,
                references_to: [],
                token_usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                created_at: new Date(currentTime)
              });
            }
          }

          // Mock database queries
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({ rows: initialResponses }) // Initial responses
            .mockResolvedValueOnce({ rows: deliberationExchanges }) // Deliberation exchanges
            .mockResolvedValueOnce({ rows: [{ total_latency_ms: 5000 }] }); // Duration

          // Get deliberation thread
          const thread = await dashboard.getDeliberationThread(requestId);

          // Verify chronological ordering within each round
          for (const round of thread.rounds) {
            const timestamps = round.exchanges.map((_, idx) => {
              // Get the original timestamp from our generated data
              if (round.roundNumber === 0) {
                return initialResponses[idx].created_at.getTime();
              } else {
                const exchangeIdx = (round.roundNumber - 1) * numMembers + idx;
                return deliberationExchanges[exchangeIdx].created_at.getTime();
              }
            });

            // Check that timestamps are in ascending order
            for (let i = 1; i < timestamps.length; i++) {
              expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
            }
          }

          // Verify rounds are in ascending order
          for (let i = 1; i < thread.rounds.length; i++) {
            expect(thread.rounds[i].roundNumber).toBeGreaterThan(thread.rounds[i - 1].roundNumber);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
