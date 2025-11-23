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

// Mock Pool
class MockPool {
  async query(text: string, params?: any[]): Promise<any> {
    return { rows: [] };
  }
}

describe('DevilsAdvocateModule', () => {
  let module: DevilsAdvocateModule;
  let mockPool: MockPool;
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
    module = new DevilsAdvocateModule(mockPool as unknown as Pool);

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
        requestId: 'req-1',
        rounds: [
          {
            roundNumber: 1,
            exchanges: [
              {
                id: 'ex-1',
                requestId: 'req-1',
                roundNumber: 1,
                councilMemberId: 'member-1',
                content: 'I think the answer is X because of reason A.',
                timestamp: new Date(),
                targetMemberId: 'member-2'
              },
              {
                id: 'ex-2',
                requestId: 'req-1',
                roundNumber: 1,
                councilMemberId: 'member-2',
                content: 'I agree with X, and would add reason B.',
                timestamp: new Date(),
                targetMemberId: 'member-1'
              }
            ],
            consensusReached: false,
            timestamp: new Date()
          }
        ],
        finalDecision: null
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
        requestId: 'req-1',
        rounds: [
          {
            roundNumber: 2,
            exchanges: [
              {
                id: 'ex-1',
                requestId: 'req-1',
                roundNumber: 2,
                councilMemberId: 'member-1',
                content: 'Critical analysis content',
                timestamp: new Date()
              }
            ],
            consensusReached: true,
            timestamp: new Date()
          }
        ],
        finalDecision: null
      };

      const prompt = module.generateCritiquePrompt(deliberationThread);

      expect(prompt).toContain('Exchange 1');
      expect(prompt).toContain('member-1');
      expect(prompt).toContain('Critical analysis content');
    });

    it('should handle empty exchanges', () => {
      const deliberationThread: DeliberationThread = {
        requestId: 'req-1',
        rounds: [
          {
            roundNumber: 1,
            exchanges: [],
            consensusReached: false,
            timestamp: new Date()
          }
        ],
        finalDecision: null
      };

      const prompt = module.generateCritiquePrompt(deliberationThread);

      expect(prompt).toContain('devil\'s advocate');
      expect(prompt).toBeDefined();
    });

    it('should use last round for critique', () => {
      const deliberationThread: DeliberationThread = {
        requestId: 'req-1',
        rounds: [
          {
            roundNumber: 1,
            exchanges: [
              {
                id: 'ex-old',
                requestId: 'req-1',
                roundNumber: 1,
                councilMemberId: 'member-1',
                content: 'Old content',
                timestamp: new Date()
              }
            ],
            consensusReached: false,
            timestamp: new Date()
          },
          {
            roundNumber: 2,
            exchanges: [
              {
                id: 'ex-new',
                requestId: 'req-1',
                roundNumber: 2,
                councilMemberId: 'member-2',
                content: 'New content',
                timestamp: new Date()
              }
            ],
            consensusReached: true,
            timestamp: new Date()
          }
        ],
        finalDecision: null
      };

      const prompt = module.generateCritiquePrompt(deliberationThread);

      expect(prompt).toContain('New content');
      expect(prompt).not.toContain('Old content');
    });
  });

  describe('synthesizeWithCritique', () => {
    it('should synthesize decision incorporating critique', async () => {
      const thread: DeliberationThread = {
        requestId: 'req-1',
        rounds: [],
        finalDecision: null
      };

      const critique = 'The consensus overlooks potential edge case X.';
      const synthesizer = testMembers[0];

      const decision = await module.synthesizeWithCritique(thread, critique, synthesizer);

      expect(decision).toBeDefined();
      expect(decision.content).toContain(critique);
      expect(decision.contributingMembers).toContain(synthesizer.id);
      expect(decision.confidence).toBe('medium');
      expect(decision.agreementLevel).toBe(0.7);
    });

    it('should include synthesizer in contributing members', async () => {
      const thread: DeliberationThread = {
        requestId: 'req-1',
        rounds: [],
        finalDecision: null
      };

      const synthesizer = testMembers[1];
      const decision = await module.synthesizeWithCritique(
        thread,
        'Critique content',
        synthesizer
      );

      expect(decision.contributingMembers).toEqual([synthesizer.id]);
    });

    it('should set timestamp', async () => {
      const thread: DeliberationThread = {
        requestId: 'req-1',
        rounds: [],
        finalDecision: null
      };

      const before = new Date();
      const decision = await module.synthesizeWithCritique(
        thread,
        'Critique',
        testMembers[0]
      );
      const after = new Date();

      expect(decision.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(decision.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
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
        requestId: 'req-1',
        rounds: [
          {
            roundNumber: 1,
            exchanges: [
              {
                id: 'ex-1',
                requestId: 'req-1',
                roundNumber: 1,
                councilMemberId: 'member-1',
                content: 'Short answer.',
                timestamp: new Date()
              }
            ],
            consensusReached: true,
            timestamp: new Date()
          }
        ],
        finalDecision: null
      };

      const prompt = module.generateCritiquePrompt(minimalThread);

      expect(prompt.length).toBeGreaterThan(50);
      expect(prompt).toContain('Short answer');
    });

    it('should handle complex deliberation with multiple rounds', () => {
      const complexThread: DeliberationThread = {
        requestId: 'req-1',
        rounds: [
          {
            roundNumber: 1,
            exchanges: Array.from({ length: 5 }, (_, i) => ({
              id: `ex-${i}`,
              requestId: 'req-1',
              roundNumber: 1,
              councilMemberId: `member-${(i % 3) + 1}`,
              content: `Exchange ${i} content`,
              timestamp: new Date()
            })),
            consensusReached: false,
            timestamp: new Date()
          },
          {
            roundNumber: 2,
            exchanges: Array.from({ length: 3 }, (_, i) => ({
              id: `ex-r2-${i}`,
              requestId: 'req-1',
              roundNumber: 2,
              councilMemberId: `member-${(i % 3) + 1}`,
              content: `Round 2 exchange ${i}`,
              timestamp: new Date()
            })),
            consensusReached: true,
            timestamp: new Date()
          }
        ],
        finalDecision: null
      };

      const prompt = module.generateCritiquePrompt(complexThread);

      // Should only include last round
      expect(prompt).toContain('Round 2 exchange');
      expect(prompt).not.toContain('Exchange 0 content');
    });
  });
});
