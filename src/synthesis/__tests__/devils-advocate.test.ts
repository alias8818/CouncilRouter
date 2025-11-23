/**
 * Devil's Advocate Module Tests
 * Comprehensive test suite for critique-based synthesis
 */

import { Pool } from 'pg';
import { DevilsAdvocateModule } from '../devils-advocate';
import {
  CouncilMember,
  DeliberationThread,
  DeliberationRound,
  Exchange,
  ConsensusDecision,
  RetryPolicy
} from '../../types/core';
import { IProviderPool } from '../../interfaces/IProviderPool';

// Mock Pool
class MockPool {
  async query(text: string, params?: any[]): Promise<any> {
    return { rows: [] };
  }
}

describe('DevilsAdvocateModule', () => {
  let module: DevilsAdvocateModule;
  let mockPool: MockPool;
  let mockProviderPool: IProviderPool;
  let testMembers: CouncilMember[];

  const defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: []
  };

  beforeEach(() => {
    mockPool = new MockPool();
    mockProviderPool = {
      sendRequest: jest.fn().mockResolvedValue({
        success: true,
        content: JSON.stringify({
          weaknesses: ['Weakness 1', 'Weakness 2'],
          suggestions: ['Suggestion 1'],
          severity: 'moderate'
        }),
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 500
      }),
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn(),
      markProviderDisabled: jest.fn()
    } as any;
    
    module = new DevilsAdvocateModule(
      mockPool as unknown as Pool,
      mockProviderPool
    );

    testMembers = [
      {
        id: 'member-1',
        provider: 'openai',
        model: 'gpt-4',
        timeout: 30,
        weight: 1.0,
        retryPolicy: defaultRetryPolicy
      },
      {
        id: 'member-2',
        provider: 'anthropic',
        model: 'claude-3',
        timeout: 30,
        weight: 2.0,
        retryPolicy: defaultRetryPolicy
      },
      {
        id: 'member-3',
        provider: 'google',
        model: 'gemini-pro',
        timeout: 30,
        weight: 1.5,
        retryPolicy: defaultRetryPolicy
      }
    ];
  });

  describe('selectDevilsAdvocate', () => {
    it('should select designated member when strategy type is designated', () => {
      const strategy = {
        type: 'designated' as const,
        memberId: 'member-2'
      };

      const selected = module.selectDevilsAdvocate(testMembers, strategy);

      expect(selected.id).toBe('member-2');
      expect(selected.provider).toBe('anthropic');
    });

    it('should throw error when designated member not found', () => {
      const strategy = {
        type: 'designated' as const,
        memberId: 'non-existent'
      };

      expect(() => {
        module.selectDevilsAdvocate(testMembers, strategy);
      }).toThrow('Designated member non-existent not found');
    });

    it('should select strongest member (highest weight) when strategy type is strongest', () => {
      const strategy = {
        type: 'strongest' as const
      };

      const selected = module.selectDevilsAdvocate(testMembers, strategy);

      // member-2 has weight 2.0, which is highest
      expect(selected.id).toBe('member-2');
      expect(selected.weight).toBe(2.0);
    });

    it('should select first member when all weights are equal', () => {
      const equalWeightMembers = testMembers.map(m => ({ ...m, weight: 1.0 }));
      const strategy = {
        type: 'strongest' as const
      };

      const selected = module.selectDevilsAdvocate(equalWeightMembers, strategy);

      expect(selected.id).toBe(equalWeightMembers[0].id);
    });

    it('should select member when no weights are specified', () => {
      const noWeightMembers: CouncilMember[] = testMembers.map(m => {
        const { weight, ...rest } = m;
        return rest as CouncilMember;
      });

      const strategy = {
        type: 'strongest' as const
      };

      const selected = module.selectDevilsAdvocate(noWeightMembers, strategy);

      expect(selected).toBeDefined();
      expect(noWeightMembers.some(m => m.id === selected.id)).toBe(true);
    });

    it('should rotate member selection when strategy type is rotate', () => {
      const strategy = {
        type: 'rotate' as const
      };

      // Since rotation is based on Date.now() % members.length,
      // we just verify a valid member is selected
      const selected = module.selectDevilsAdvocate(testMembers, strategy);

      expect(selected).toBeDefined();
      expect(testMembers.some(m => m.id === selected.id)).toBe(true);
    });

    it('should throw error for unknown strategy type', () => {
      const invalidStrategy = {
        type: 'unknown-strategy' as any
      };

      expect(() => {
        module.selectDevilsAdvocate(testMembers, invalidStrategy);
      }).toThrow('Unknown devil\'s advocate strategy');
    });

    it('should handle empty members array for designated strategy', () => {
      const strategy = {
        type: 'designated' as const,
        memberId: 'member-1'
      };

      expect(() => {
        module.selectDevilsAdvocate([], strategy);
      }).toThrow('Designated member member-1 not found');
    });

    it('should handle single member array', () => {
      const singleMember = [testMembers[0]];
      const strategy = {
        type: 'rotate' as const
      };

      const selected = module.selectDevilsAdvocate(singleMember, strategy);

      expect(selected.id).toBe(testMembers[0].id);
    });
  });

  describe('generateCritiquePrompt', () => {
    it('should generate critique prompt with deliberation exchanges', () => {
      const deliberationThread: DeliberationThread = {
        rounds: [
          {
            roundNumber: 1,
            exchanges: [
              {
                councilMemberId: 'member-1',
                content: 'I think the answer is X because of reason A.',
                referencesTo: ['member-2'],
                tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
              },
              {
                councilMemberId: 'member-2',
                content: 'I agree with X, and would add reason B.',
                referencesTo: ['member-1'],
                tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
              }
            ]
          }
        ],
        totalDuration: 1000
      };

      const prompt = module.generateCritiquePrompt(deliberationThread);

      expect(prompt).toContain('devil\'s advocate');
      expect(prompt).toContain('Weaknesses');
      expect(prompt).toContain('Alternative Interpretations');
      expect(prompt).toContain('Potential Errors');
      expect(prompt).toContain('member-1');
      expect(prompt).toContain('member-2');
      expect(prompt).toContain('reason A');
      expect(prompt).toContain('reason B');
    });

    it('should format exchanges with round numbers', () => {
      const deliberationThread: DeliberationThread = {
        rounds: [
          {
            roundNumber: 2,
            exchanges: [
              {
                councilMemberId: 'member-1',
                content: 'Critical analysis content',
                referencesTo: [],
                tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
              }
            ]
          }
        ],
        totalDuration: 1000
      };

      const prompt = module.generateCritiquePrompt(deliberationThread);

      expect(prompt).toContain('Exchange 1');
      expect(prompt).toContain('member-1');
      expect(prompt).toContain('Critical analysis content');
    });

    it('should handle empty exchanges', () => {
      const deliberationThread: DeliberationThread = {
        rounds: [
          {
            roundNumber: 1,
            exchanges: []
          }
        ],
        totalDuration: 1000
      };

      const prompt = module.generateCritiquePrompt(deliberationThread);

      expect(prompt).toContain('devil\'s advocate');
      expect(prompt).toBeDefined();
    });

    it('should use last round for critique', () => {
      const deliberationThread: DeliberationThread = {
        rounds: [
          {
            roundNumber: 1,
            exchanges: [
              {
                councilMemberId: 'member-1',
                content: 'Old content',
                referencesTo: [],
                tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
              }
            ]
          },
          {
            roundNumber: 2,
            exchanges: [
              {
                councilMemberId: 'member-2',
                content: 'New content',
                referencesTo: [],
                tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
              }
            ]
          }
        ],
        totalDuration: 2000
      };

      const prompt = module.generateCritiquePrompt(deliberationThread);

      expect(prompt).toContain('New content');
      expect(prompt).not.toContain('Old content');
    });
  });

  describe('critique', () => {
    it('should generate critique using LLM', async () => {
      const query = 'What is the best way to handle errors?';
      const synthesis = 'Use try-catch blocks for error handling.';
      const responses = [
        { councilMemberId: 'member1', content: 'Response 1' },
        { councilMemberId: 'member2', content: 'Response 2' }
      ];

      const critique = await module.critique(query, synthesis, responses);

      expect(critique).toBeDefined();
      expect(Array.isArray(critique.weaknesses)).toBe(true);
      expect(Array.isArray(critique.suggestions)).toBe(true);
      expect(['minor', 'moderate', 'critical']).toContain(critique.severity);
      expect(mockProviderPool.sendRequest).toHaveBeenCalled();
    });

    it('should handle provider errors gracefully', async () => {
      const failingProviderPool = {
        sendRequest: jest.fn().mockResolvedValue({
          success: false,
          error: new Error('Provider error')
        }),
        getProviderHealth: jest.fn(),
        getAllProviderHealth: jest.fn(),
        markProviderDisabled: jest.fn()
      } as any;

      const moduleWithFailingProvider = new DevilsAdvocateModule(
        mockPool as unknown as Pool,
        failingProviderPool
      );

      const critique = await moduleWithFailingProvider.critique(
        'query',
        'synthesis',
        []
      );

      expect(critique.weaknesses).toEqual([]);
      expect(critique.severity).toBe('minor');
    });
  });

  describe('rewrite', () => {
    it('should rewrite synthesis based on critique', async () => {
      const query = 'How to handle errors?';
      const originalSynthesis = 'Use try-catch.';
      const critique = {
        weaknesses: ['Missing error types'],
        suggestions: ['Add specific error handling'],
        severity: 'moderate' as const
      };

      // Mock rewrite response
      (mockProviderPool.sendRequest as jest.Mock).mockResolvedValueOnce({
        success: true,
        content: 'Use try-catch blocks with specific error types.',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 500
      });

      const rewritten = await module.rewrite(query, originalSynthesis, critique);

      expect(rewritten).toBeDefined();
      expect(rewritten).not.toBe(originalSynthesis);
      expect(mockProviderPool.sendRequest).toHaveBeenCalled();
    });

    it('should return original on provider error', async () => {
      const failingProviderPool = {
        sendRequest: jest.fn().mockResolvedValue({
          success: false,
          error: new Error('Provider error')
        }),
        getProviderHealth: jest.fn(),
        getAllProviderHealth: jest.fn(),
        markProviderDisabled: jest.fn()
      } as any;

      const moduleWithFailingProvider = new DevilsAdvocateModule(
        mockPool as unknown as Pool,
        failingProviderPool
      );

      const original = 'Original synthesis';
      const rewritten = await moduleWithFailingProvider.rewrite(
        'query',
        original,
        { weaknesses: [], suggestions: [], severity: 'minor' }
      );

      expect(rewritten).toBe(original);
    });
  });

  describe('synthesizeWithCritique', () => {
    it('should orchestrate critique and rewrite', async () => {
      const query = 'How to handle errors?';
      const synthesis = 'Use try-catch.';
      const responses = [
        { councilMemberId: 'member1', content: 'Response 1' }
      ];

      // Mock critique response
      (mockProviderPool.sendRequest as jest.Mock)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            weaknesses: ['Missing details'],
            suggestions: ['Add more details'],
            severity: 'moderate'
          }),
          tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          latency: 500
        })
        // Mock rewrite response
        .mockResolvedValueOnce({
          success: true,
          content: 'Improved synthesis with details.',
          tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          latency: 500
        });

      const improved = await module.synthesizeWithCritique(
        query,
        synthesis,
        responses
      );

      expect(improved).toBeDefined();
      expect(improved).not.toBe(synthesis);
      expect(mockProviderPool.sendRequest).toHaveBeenCalledTimes(2); // Critique + rewrite
    });

    it('should return original if critique finds no issues', async () => {
      // Mock critique with no issues
      (mockProviderPool.sendRequest as jest.Mock).mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          weaknesses: [],
          suggestions: [],
          severity: 'minor'
        }),
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 500
      });

      const synthesis = 'Original synthesis';
      const improved = await module.synthesizeWithCritique(
        'query',
        synthesis,
        []
      );

      expect(improved).toBe(synthesis);
      expect(mockProviderPool.sendRequest).toHaveBeenCalledTimes(1); // Only critique
    });
  });

  describe('adjustConfidence', () => {
    it('should reduce confidence based on critique strength', () => {
      const baseConfidence = 0.9;
      const critiqueStrength = 0.5;

      const adjusted = module.adjustConfidence(baseConfidence, critiqueStrength);

      // With critique strength 0.5, reduction is 0.5 * 0.3 = 0.15
      // So adjusted = 0.9 - 0.15 = 0.75
      expect(adjusted).toBe(0.75);
    });

    it('should not reduce confidence below 0', () => {
      const baseConfidence = 0.1;
      const critiqueStrength = 1.0; // Maximum strength

      const adjusted = module.adjustConfidence(baseConfidence, critiqueStrength);

      expect(adjusted).toBeGreaterThanOrEqual(0);
      expect(adjusted).toBe(0);
    });

    it('should not increase confidence above 1', () => {
      const baseConfidence = 1.0;
      const critiqueStrength = 0.0; // No critique

      const adjusted = module.adjustConfidence(baseConfidence, critiqueStrength);

      expect(adjusted).toBeLessThanOrEqual(1);
      expect(adjusted).toBe(1.0);
    });

    it('should handle zero critique strength (no change)', () => {
      const baseConfidence = 0.8;
      const critiqueStrength = 0.0;

      const adjusted = module.adjustConfidence(baseConfidence, critiqueStrength);

      expect(adjusted).toBe(0.8);
    });

    it('should handle maximum critique strength', () => {
      const baseConfidence = 0.5;
      const critiqueStrength = 1.0;

      const adjusted = module.adjustConfidence(baseConfidence, critiqueStrength);

      // Maximum reduction is 1.0 * 0.3 = 0.3
      // So adjusted = 0.5 - 0.3 = 0.2
      expect(adjusted).toBe(0.2);
    });

    it('should apply 30% maximum reduction', () => {
      const baseConfidence = 1.0;
      const critiqueStrength = 1.0;

      const adjusted = module.adjustConfidence(baseConfidence, critiqueStrength);

      // Maximum reduction is 30% of critique strength
      expect(adjusted).toBe(0.7);
    });

    it('should handle mid-range values', () => {
      const baseConfidence = 0.7;
      const critiqueStrength = 0.3;

      const adjusted = module.adjustConfidence(baseConfidence, critiqueStrength);

      // Reduction = 0.3 * 0.3 = 0.09
      // Adjusted = 0.7 - 0.09 = 0.61
      expect(adjusted).toBeCloseTo(0.61, 2);
    });
  });

  describe('edge cases and integration', () => {
    it('should handle members with identical weights', () => {
      const identicalWeights = testMembers.map(m => ({ ...m, weight: 1.0 }));
      const strategy = { type: 'strongest' as const };

      const selected = module.selectDevilsAdvocate(identicalWeights, strategy);

      expect(selected).toBeDefined();
      expect(selected.weight).toBe(1.0);
    });

    it('should generate valid critique prompt for minimal thread', () => {
      const minimalThread: DeliberationThread = {
        rounds: [
          {
            roundNumber: 1,
            exchanges: [
              {
                councilMemberId: 'member-1',
                content: 'Short answer.',
                referencesTo: [],
                tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
              }
            ]
          }
        ],
        totalDuration: 100
      };

      const prompt = module.generateCritiquePrompt(minimalThread);

      expect(prompt.length).toBeGreaterThan(50);
      expect(prompt).toContain('Short answer');
    });

    it('should handle complex deliberation with multiple rounds', () => {
      const complexThread: DeliberationThread = {
        rounds: [
          {
            roundNumber: 1,
            exchanges: Array.from({ length: 5 }, (_, i) => ({
              councilMemberId: `member-${(i % 3) + 1}`,
              content: `Exchange ${i} content`,
              referencesTo: [],
              tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
            }))
          },
          {
            roundNumber: 2,
            exchanges: Array.from({ length: 3 }, (_, i) => ({
              councilMemberId: `member-${(i % 3) + 1}`,
              content: `Round 2 exchange ${i}`,
              referencesTo: [],
              tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
            }))
          }
        ],
        totalDuration: 2000
      };

      const prompt = module.generateCritiquePrompt(complexThread);

      // Should only include last round
      expect(prompt).toContain('Round 2 exchange');
      expect(prompt).not.toContain('Exchange 0 content');
    });
  });
});
