/**
 * Property-Based Test: Red-team prompt secure storage
 * Feature: ai-council-proxy, Property 44: Red-team prompt secure storage
 * 
 * Validates: Requirements 13.1
 * 
 * Property: For any configured red-team prompts, the prompts should be stored 
 * in a separate secure configuration location.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { RedTeamTester } from '../tester';
import { RedTeamPrompt } from '../../types/core';

// Mock dependencies
jest.mock('pg');
jest.mock('../../providers/pool');
jest.mock('../../config/manager');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid')
}));

describe('Property 44: Red-team prompt secure storage', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockProviderPool: any;
  let mockConfigManager: any;
  let redTeamTester: RedTeamTester;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      query: jest.fn()
    } as any;

    // Create mock provider pool
    mockProviderPool = {
      sendRequest: jest.fn()
    };

    // Create mock config manager
    mockConfigManager = {
      getCouncilConfig: jest.fn()
    };

    redTeamTester = new RedTeamTester(mockDb, mockProviderPool, mockConfigManager);
  });

  test('stored prompts should be retrievable from secure storage', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary red-team prompts
        fc.array(
          fc.record({
            id: fc.uuid(),
            testName: fc.string({ minLength: 1, maxLength: 100 }),
            prompt: fc.string({ minLength: 10, maxLength: 500 }),
            attackCategory: fc.constantFrom('prompt-injection', 'jailbreak', 'data-extraction', 'privilege-escalation'),
            createdAt: fc.date()
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (prompts: RedTeamPrompt[]) => {
          // Reset mock before each test
          mockDb.query.mockClear();
          
          // Mock database to store and retrieve prompts
          const storedPrompts: RedTeamPrompt[] = [];

          mockDb.query.mockImplementation((query: string, params?: any[]) => {
            if (query.includes('INSERT INTO red_team_prompts')) {
              // Store the prompt
              const [id, testName, prompt, attackCategory, createdAt] = params!;
              storedPrompts.push({
                id,
                testName,
                prompt,
                attackCategory,
                createdAt
              });
              return Promise.resolve({ rows: [], rowCount: 1 } as any);
            } else if (query.includes('SELECT') && query.includes('FROM red_team_prompts')) {
              // Retrieve stored prompts
              return Promise.resolve({
                rows: storedPrompts.map(p => ({
                  id: p.id,
                  test_name: p.testName,
                  prompt: p.prompt,
                  attack_category: p.attackCategory,
                  created_at: p.createdAt
                }))
              } as any);
            }
            return Promise.resolve({ rows: [] } as any);
          });

          // Store all prompts
          for (const prompt of prompts) {
            await redTeamTester.storePrompt(prompt);
          }

          // Retrieve prompts
          const retrievedPrompts = await redTeamTester.getPrompts();

          // Property: All stored prompts should be retrievable
          expect(retrievedPrompts).toHaveLength(prompts.length);

          // Property: Retrieved prompts should match stored prompts
          for (let i = 0; i < prompts.length; i++) {
            const stored = prompts[i];
            const retrieved = retrievedPrompts.find(p => p.id === stored.id);
            
            expect(retrieved).toBeDefined();
            expect(retrieved!.testName).toBe(stored.testName);
            expect(retrieved!.prompt).toBe(stored.prompt);
            expect(retrieved!.attackCategory).toBe(stored.attackCategory);
          }

          // Property: Prompts should be stored in separate table (red_team_prompts)
          // Count only the INSERT calls (not SELECT calls)
          const allCalls = mockDb.query.mock.calls;
          const insertCalls = allCalls.filter(
            call => typeof call[0] === 'string' && 
                    call[0].includes('INSERT INTO red_team_prompts') &&
                    !call[0].includes('SELECT')
          );
          expect(insertCalls).toHaveLength(prompts.length);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('prompt storage should preserve all fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          testName: fc.string({ minLength: 1, maxLength: 100 }),
          prompt: fc.string({ minLength: 10, maxLength: 500 }),
          attackCategory: fc.constantFrom('prompt-injection', 'jailbreak', 'data-extraction', 'privilege-escalation'),
          createdAt: fc.date()
        }),
        async (prompt: RedTeamPrompt) => {
          // Reset mock before each test
          mockDb.query.mockClear();
          
          let storedPrompt: RedTeamPrompt | null = null;

          mockDb.query.mockImplementation((query: string, params?: any[]) => {
            if (query.includes('INSERT INTO red_team_prompts')) {
              const [id, testName, promptText, attackCategory, createdAt] = params!;
              storedPrompt = {
                id,
                testName,
                prompt: promptText,
                attackCategory,
                createdAt
              };
              return Promise.resolve({ rows: [], rowCount: 1 } as any);
            } else if (query.includes('SELECT') && query.includes('FROM red_team_prompts')) {
              if (storedPrompt) {
                return Promise.resolve({
                  rows: [{
                    id: storedPrompt.id,
                    test_name: storedPrompt.testName,
                    prompt: storedPrompt.prompt,
                    attack_category: storedPrompt.attackCategory,
                    created_at: storedPrompt.createdAt
                  }]
                } as any);
              }
            }
            return Promise.resolve({ rows: [] } as any);
          });

          await redTeamTester.storePrompt(prompt);
          const retrieved = await redTeamTester.getPrompts();

          // Property: Round-trip consistency - stored prompt should match retrieved prompt
          expect(retrieved).toHaveLength(1);
          expect(retrieved[0].id).toBe(prompt.id);
          expect(retrieved[0].testName).toBe(prompt.testName);
          expect(retrieved[0].prompt).toBe(prompt.prompt);
          expect(retrieved[0].attackCategory).toBe(prompt.attackCategory);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
