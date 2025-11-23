/**
 * Property-Based Tests for Synthesis Engine
 * Feature: ai-council-proxy
 */

import * as fc from 'fast-check';
import { SynthesisEngine } from '../engine';
import {
  DeliberationThread,
  DeliberationRound,
  Exchange,
  CouncilMember,
  SynthesisStrategy,
  ModeratorStrategy,
  TokenUsage,
  UserRequest
} from '../../types/core';

describe('SynthesisEngine - Property-Based Tests', () => {
  let engine: SynthesisEngine;

  beforeEach(() => {
    const mockProviderPool = {
      sendRequest: jest.fn().mockResolvedValue({
        success: true,
        content: 'Synthesized content',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latencyMs: 500,
        cost: 0.01
      })
    } as any;

    const mockConfigManager = {
      getCouncilConfig: jest.fn().mockResolvedValue({
        members: [
          { id: 'member1', model: 'gpt-4' },
          { id: 'member2', model: 'claude-3-opus' },
          { id: 'member3', model: 'gemini-pro' },
          { id: 'member4', model: 'gpt-3.5-turbo' }
        ]
      }),
      getModelRankings: jest.fn().mockResolvedValue({
        // Legacy models
        'gpt-3.5-turbo': 65,
        'gpt-4': 85,
        'gpt-4-turbo': 90,
        'gpt-4o': 94,
        'claude-3-haiku': 72,
        'claude-3-sonnet': 86,
        'claude-3-opus': 93,
        'claude-3.5-sonnet': 96,
        'gemini-1.5-pro': 92,
        'gemini-1.5-flash': 80,
        'grok-1': 70,
        'grok-2': 88,
        // 2025 frontier models
        'gemini-2.5-pro': 114,
        'gemini-3-pro': 113,
        'claude-sonnet-4.5': 112,
        'grok-4.1': 111,
        'grok-4': 109,
        'gpt-5.1': 110,
        'gpt-5': 108,
        'claude-opus-4.1': 109,
        'o3': 107,
        'o4-mini': 96,
        // Open-weight models
        'deepseek-v3': 109,
        'deepseek-r1': 108,
        'qwen3-235b': 107,
        'qwen3-72b': 105,
        'llama-4-maverick': 106,
        'minimax-m2': 104,
        // Legacy Google models
        'gemini-pro': 92,
        'gemini-ultra': 97,
        'palm-2': 80,
        'claude-2': 85,
        // Fallback
        'default': 50
      })
    } as any;

    engine = new SynthesisEngine(mockProviderPool, mockConfigManager);
  });

  // Arbitraries for generating test data
  const tokenUsageArb = fc.record({
    promptTokens: fc.integer({ min: 1, max: 10000 }),
    completionTokens: fc.integer({ min: 1, max: 10000 }),
    totalTokens: fc.integer({ min: 2, max: 20000 })
  });

  const exchangeArb = fc.record({
    councilMemberId: fc.oneof(
      fc.constant('member1'),
      fc.constant('member2'),
      fc.constant('member3'),
      fc.constant('member4')
    ),
    content: fc.lorem({ maxCount: 50 }),
    referencesTo: fc.array(fc.string(), { maxLength: 3 }),
    tokenUsage: tokenUsageArb
  });

  const deliberationRoundArb = fc.record({
    roundNumber: fc.integer({ min: 1, max: 5 }),
    exchanges: fc.array(exchangeArb, { minLength: 1, maxLength: 10 })
  });

  const deliberationThreadArb = fc.record({
    rounds: fc.array(deliberationRoundArb, { minLength: 1, maxLength: 5 }),
    totalDuration: fc.integer({ min: 100, max: 60000 })
  });

  const consensusExtractionStrategyArb: fc.Arbitrary<SynthesisStrategy> = fc.constant({
    type: 'consensus-extraction' as const
  });

  const weightedFusionStrategyArb: fc.Arbitrary<SynthesisStrategy> = fc.record({
    type: fc.constant('weighted-fusion' as const),
    weights: fc.dictionary(
      fc.oneof(
        fc.constant('member1'),
        fc.constant('member2'),
        fc.constant('member3'),
        fc.constant('member4')
      ),
      fc.double({ min: 0.1, max: 5.0, noNaN: true })
    ).map(dict => new Map(Object.entries(dict)))
  });

  const metaSynthesisStrategyArb: fc.Arbitrary<SynthesisStrategy> = fc.record({
    type: fc.constant('meta-synthesis' as const),
    moderatorStrategy: fc.oneof(
      fc.record({ type: fc.constant('permanent' as const), memberId: fc.constant('member1') }),
      fc.record({ type: fc.constant('rotate' as const) }),
      fc.record({ type: fc.constant('strongest' as const) })
    )
  });

  const synthesisStrategyArb = fc.oneof(
    consensusExtractionStrategyArb,
    weightedFusionStrategyArb,
    metaSynthesisStrategyArb
  );

  const councilMemberArb = fc.record({
    id: fc.oneof(
      fc.constant('member1'),
      fc.constant('member2'),
      fc.constant('member3'),
      fc.constant('member4')
    ),
    provider: fc.oneof(
      fc.constant('openai'),
      fc.constant('anthropic'),
      fc.constant('google')
    ),
    model: fc.oneof(
      fc.constant('gpt-4'),
      fc.constant('gpt-4o'),
      fc.constant('claude-3-opus'),
      fc.constant('claude-3-sonnet'),
      fc.constant('gemini-pro')
    ),
    timeout: fc.integer({ min: 10, max: 120 }),
    retryPolicy: fc.record({
      maxAttempts: fc.integer({ min: 1, max: 5 }),
      initialDelayMs: fc.integer({ min: 100, max: 2000 }),
      maxDelayMs: fc.integer({ min: 5000, max: 30000 }),
      backoffMultiplier: fc.integer({ min: 2, max: 3 }),
      retryableErrors: fc.constant([])
    })
  });

  const userRequestArb = fc.record({
    id: fc.uuid(),
    query: fc.string({ minLength: 1, maxLength: 500 }),
    timestamp: fc.constant(new Date())
  });

  /**
   * Property-Based Test: Synthesis produces single output
   * Feature: ai-council-proxy, Property 2: Synthesis produces single output
   * 
   * Validates: Requirements 1.3
   */
  test('Property 2: For any set of council member responses, synthesis should produce exactly one consensus decision', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArb,
        deliberationThreadArb,
        synthesisStrategyArb,
        async (request, thread, strategy) => {
          const result = await engine.synthesize(request, thread, strategy);

          // Should produce exactly one consensus decision
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          expect(typeof result.content).toBe('string');
          expect(result.content.length).toBeGreaterThan(0);

          // Should have all required fields
          expect(result.confidence).toMatch(/^(high|medium|low)$/);
          expect(result.agreementLevel).toBeGreaterThanOrEqual(0);
          expect(result.agreementLevel).toBeLessThanOrEqual(1);
          expect(result.synthesisStrategy).toEqual(strategy);
          expect(Array.isArray(result.contributingMembers)).toBe(true);
          expect(result.timestamp).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Designated moderator usage
   * Feature: ai-council-proxy, Property 20: Designated moderator usage
   * 
   * Validates: Requirements 7.2
   */
  test('Property 20: For any meta-synthesis with designated moderator, that specific council member should perform synthesis', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(councilMemberArb, { minLength: 2, maxLength: 5 }),
        fc.oneof(
          fc.constant('member1'),
          fc.constant('member2'),
          fc.constant('member3'),
          fc.constant('member4')
        ),
        async (members, designatedMemberId) => {
          // Ensure the designated member exists in the list
          const uniqueMembers = Array.from(
            new Map(members.map((m: CouncilMember) => [m.id, m])).values()
          );

          // Only test if the designated member is in the list
          const hasMember = uniqueMembers.some((m: CouncilMember) => m.id === designatedMemberId);
          if (!hasMember) {
            return; // Skip this test case
          }

          const strategy: ModeratorStrategy = {
            type: 'permanent',
            memberId: designatedMemberId
          };

          const selectedModerator = await engine.selectModerator(uniqueMembers, strategy);

          // The selected moderator should be the designated one
          expect(selectedModerator.id).toBe(designatedMemberId);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Weighted fusion application
   * Feature: ai-council-proxy, Property 21: Weighted fusion application
   * 
   * Validates: Requirements 7.4
   */
  test('Property 21: For any weighted fusion synthesis, the synthesis prompt should include all council member contributions weighted according to configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        deliberationThreadArb,
        fc.dictionary(
          fc.oneof(
            fc.constant('member1'),
            fc.constant('member2'),
            fc.constant('member3'),
            fc.constant('member4')
          ),
          fc.double({ min: 0.1, max: 5.0, noNaN: true })
        ),
        async (thread, weightsDict) => {
          const weights = new Map(Object.entries(weightsDict));

          // Skip if no weights
          if (weights.size === 0) {
            return;
          }

          const strategy: SynthesisStrategy = {
            type: 'weighted-fusion',
            weights
          };

          const request: UserRequest = {
            id: 'test-request-id',
            query: 'Test query',
            timestamp: new Date()
          };
          const result = await engine.synthesize(request, thread, strategy);

          // Result should contain weighted synthesis indicator
          expect(result.content).toContain('Weighted synthesis');

          // For each weight in the configuration, check if it appears in the output
          weights.forEach((weight, memberId) => {
            // Check if this member contributed to the thread
            const allExchanges = thread.rounds.flatMap(r => r.exchanges);
            const memberContributed = allExchanges.some(e => e.councilMemberId === memberId);

            if (memberContributed) {
              // The weight should appear in the output
              const weightStr = `[Weight: ${weight.toFixed(2)}]`;
              expect(result.content).toContain(weightStr);
              expect(result.content).toContain(memberId);
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Strongest moderator selection
   * Feature: ai-council-proxy, Property 22: Strongest moderator selection
   * 
   * Validates: Requirements 7.6
   */
  test('Property 22: For any meta-synthesis with strongest moderator strategy, the council member with highest ranking should be selected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(councilMemberArb, { minLength: 2, maxLength: 5 }),
        async (members) => {
          // Get unique members
          const uniqueMembers = Array.from(
            new Map(members.map((m: CouncilMember) => [m.id, m])).values()
          );

          if (uniqueMembers.length < 2) {
            return; // Skip if not enough unique members
          }

          const strategy: ModeratorStrategy = {
            type: 'strongest'
          };

          const selectedModerator = await engine.selectModerator(uniqueMembers, strategy);

          // Model rankings from the engine (updated November 22, 2025)
          const MODEL_RANKINGS: Record<string, number> = {
            // Legacy models
            'gpt-3.5-turbo': 65,
            'gpt-4': 85,
            'gpt-4-turbo': 90,
            'gpt-4o': 94,
            'claude-3-haiku': 72,
            'claude-3-sonnet': 86,
            'claude-3-opus': 93,
            'claude-3.5-sonnet': 96,
            'gemini-1.5-pro': 92,
            'gemini-1.5-flash': 80,
            'grok-1': 70,
            'grok-2': 88,
            // 2025 frontier models
            'gemini-2.5-pro': 114,
            'gemini-3-pro': 113,
            'claude-sonnet-4.5': 112,
            'grok-4.1': 111,
            'grok-4': 109,
            'gpt-5.1': 110,
            'gpt-5': 108,
            'claude-opus-4.1': 109,
            'o3': 107,
            'o4-mini': 96,
            // Open-weight models
            'deepseek-v3': 109,
            'deepseek-r1': 108,
            'qwen3-235b': 107,
            'qwen3-72b': 105,
            'llama-4-maverick': 106,
            'minimax-m2': 104,
            // Legacy Google models
            'gemini-pro': 92,
            'gemini-ultra': 97,
            'palm-2': 80,
            'default': 50
          };

          const getScore = (member: CouncilMember): number => {
            if (MODEL_RANKINGS[member.model]) {
              return MODEL_RANKINGS[member.model];
            }
            // Try partial match - prefer longer matches
            let bestMatch: { modelName: string; score: number } | null = null;
            for (const [modelName, score] of Object.entries(MODEL_RANKINGS)) {
              if (member.model.includes(modelName)) {
                if (!bestMatch || modelName.length > bestMatch.modelName.length) {
                  bestMatch = { modelName, score };
                }
              }
            }
            if (bestMatch) {
              return bestMatch.score;
            }
            return MODEL_RANKINGS['default'];
          };

          // Find the expected strongest member
          let expectedStrongest = uniqueMembers[0];
          let highestScore = getScore(expectedStrongest);

          for (const member of uniqueMembers) {
            const score = getScore(member);
            if (score > highestScore) {
              highestScore = score;
              expectedStrongest = member;
            }
          }

          // The selected moderator should be the strongest
          expect(selectedModerator.id).toBe(expectedStrongest.id);
          expect(getScore(selectedModerator)).toBe(highestScore);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Synthesis strategy persistence
   * Feature: ai-council-proxy, Property 23: Synthesis strategy persistence
   * 
   * Validates: Requirements 7.7
   */
  test('Property 23: For any saved synthesis strategy, the consensus decision should record that strategy', async () => {
    await fc.assert(
      fc.asyncProperty(
        deliberationThreadArb,
        synthesisStrategyArb,
        async (thread, strategy) => {
          const request: UserRequest = {
            id: 'test-request-id',
            query: 'Test query',
            timestamp: new Date()
          };
          const result = await engine.synthesize(request, thread, strategy);

          // The consensus decision should record the synthesis strategy used
          expect(result.synthesisStrategy).toEqual(strategy);

          // Verify the strategy type is preserved
          expect(result.synthesisStrategy.type).toBe(strategy.type);

          // For weighted fusion, verify weights are preserved
          if (strategy.type === 'weighted-fusion') {
            expect(result.synthesisStrategy.type).toBe('weighted-fusion');
            if ('weights' in result.synthesisStrategy && 'weights' in strategy) {
              // Compare the weights maps
              const resultWeights = result.synthesisStrategy.weights;
              const strategyWeights = strategy.weights;

              expect(resultWeights.size).toBe(strategyWeights.size);
              strategyWeights.forEach((value, key) => {
                expect(resultWeights.get(key)).toBe(value);
              });
            }
          }

          // For meta-synthesis, verify moderator strategy is preserved
          if (strategy.type === 'meta-synthesis') {
            expect(result.synthesisStrategy.type).toBe('meta-synthesis');
            if ('moderatorStrategy' in result.synthesisStrategy && 'moderatorStrategy' in strategy) {
              expect(result.synthesisStrategy.moderatorStrategy).toEqual(strategy.moderatorStrategy);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
