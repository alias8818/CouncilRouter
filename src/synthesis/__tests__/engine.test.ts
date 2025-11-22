/**
 * Synthesis Engine Tests
 */

import { SynthesisEngine } from '../engine';
import {
  DeliberationThread,
  DeliberationRound,
  Exchange,
  CouncilMember,
  SynthesisStrategy,
  ModeratorStrategy,
  TokenUsage
} from '../../types/core';

describe('SynthesisEngine', () => {
  let engine: SynthesisEngine;

  beforeEach(() => {
    engine = new SynthesisEngine();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // Helper function to create test exchanges
  const createExchange = (
    councilMemberId: string,
    content: string,
    referencesTo: string[] = []
  ): Exchange => ({
    councilMemberId,
    content,
    referencesTo,
    tokenUsage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150
    }
  });

  // Helper function to create test thread
  const createThread = (exchanges: Exchange[]): DeliberationThread => ({
    rounds: [
      {
        roundNumber: 1,
        exchanges
      }
    ],
    totalDuration: 1000
  });

  // Helper function to create test council member
  const createMember = (
    id: string,
    provider: string,
    model: string
  ): CouncilMember => ({
    id,
    provider,
    model,
    timeout: 30,
    retryPolicy: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      retryableErrors: []
    }
  });

  describe('synthesize', () => {
    describe('consensus-extraction strategy', () => {
      it('should synthesize with full agreement', async () => {
        const exchanges = [
          createExchange('member1', 'The answer is 42'),
          createExchange('member2', 'The answer is 42'),
          createExchange('member3', 'The answer is 42')
        ];
        const thread = createThread(exchanges);
        const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

        const result = await engine.synthesize(thread, strategy);

        expect(result.content).toContain('All council members agree');
        expect(result.confidence).toBe('high');
        expect(result.agreementLevel).toBeGreaterThan(0.8);
        expect(result.contributingMembers).toHaveLength(3);
        expect(result.synthesisStrategy).toEqual(strategy);
      });

      it('should synthesize with partial agreement', async () => {
        const exchanges = [
          createExchange('member1', 'The answer is 42'),
          createExchange('member2', 'The answer is 42'),
          createExchange('member3', 'The answer is 100')
        ];
        const thread = createThread(exchanges);
        const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

        const result = await engine.synthesize(thread, strategy);

        expect(result.content).toContain('Majority position');
        expect(result.content).toContain('Alternative perspectives');
        expect(result.confidence).toBe('medium');
        expect(result.contributingMembers).toHaveLength(3);
      });

      it('should handle empty thread', async () => {
        const thread: DeliberationThread = {
          rounds: [],
          totalDuration: 0
        };
        const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

        const result = await engine.synthesize(thread, strategy);

        expect(result.content).toBe('No responses available');
        expect(result.confidence).toBe('low');
        expect(result.agreementLevel).toBe(0);
        expect(result.contributingMembers).toHaveLength(0);
      });
    });

    describe('weighted-fusion strategy', () => {
      it('should apply weights correctly', async () => {
        const exchanges = [
          createExchange('member1', 'Response from member 1'),
          createExchange('member2', 'Response from member 2'),
          createExchange('member3', 'Response from member 3')
        ];
        const thread = createThread(exchanges);
        const weights = new Map([
          ['member1', 2.0],
          ['member2', 1.0],
          ['member3', 0.5]
        ]);
        const strategy: SynthesisStrategy = { type: 'weighted-fusion', weights };

        const result = await engine.synthesize(thread, strategy);

        expect(result.content).toContain('Weighted synthesis');
        expect(result.content).toContain('[Weight: 2.00] member1');
        expect(result.content).toContain('[Weight: 1.00] member2');
        expect(result.content).toContain('[Weight: 0.50] member3');
        expect(result.contributingMembers).toHaveLength(3);
      });

      it('should order by weight (highest first)', async () => {
        const exchanges = [
          createExchange('member1', 'Low weight response'),
          createExchange('member2', 'High weight response')
        ];
        const thread = createThread(exchanges);
        const weights = new Map([
          ['member1', 0.5],
          ['member2', 2.0]
        ]);
        const strategy: SynthesisStrategy = { type: 'weighted-fusion', weights };

        const result = await engine.synthesize(thread, strategy);

        const member2Index = result.content.indexOf('member2');
        const member1Index = result.content.indexOf('member1');
        expect(member2Index).toBeLessThan(member1Index);
      });
    });

    describe('meta-synthesis strategy', () => {
      it('should create meta-synthesis', async () => {
        const exchanges = [
          createExchange('member1', 'First perspective'),
          createExchange('member2', 'Second perspective'),
          createExchange('member3', 'Third perspective')
        ];
        const thread = createThread(exchanges);
        const moderatorStrategy: ModeratorStrategy = { type: 'permanent', memberId: 'member1' };
        const strategy: SynthesisStrategy = { type: 'meta-synthesis', moderatorStrategy };

        const result = await engine.synthesize(thread, strategy);

        expect(result.content).toContain('Meta-synthesis');
        expect(result.content).toContain('member1');
        expect(result.content).toContain('member2');
        expect(result.content).toContain('member3');
        expect(result.contributingMembers).toHaveLength(3);
      });
    });

    describe('multiple rounds', () => {
      it('should handle multiple deliberation rounds', async () => {
        const thread: DeliberationThread = {
          rounds: [
            {
              roundNumber: 1,
              exchanges: [
                createExchange('member1', 'Initial response 1'),
                createExchange('member2', 'Initial response 2')
              ]
            },
            {
              roundNumber: 2,
              exchanges: [
                createExchange('member1', 'Refined response 1'),
                createExchange('member2', 'Refined response 2')
              ]
            }
          ],
          totalDuration: 2000
        };
        const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

        const result = await engine.synthesize(thread, strategy);

        expect(result.contributingMembers).toHaveLength(2);
        expect(result.content).toBeTruthy();
      });
    });
  });

  describe('selectModerator', () => {
    const members = [
      createMember('member1', 'openai', 'gpt-4'),
      createMember('member2', 'anthropic', 'claude-3-opus'),
      createMember('member3', 'google', 'gemini-pro')
    ];

    it('should select permanent moderator', () => {
      const strategy: ModeratorStrategy = { type: 'permanent', memberId: 'member2' };
      
      const result = engine.selectModerator(members, strategy);
      
      expect(result.id).toBe('member2');
    });

    it('should throw error if permanent moderator not found', () => {
      const strategy: ModeratorStrategy = { type: 'permanent', memberId: 'nonexistent' };
      
      expect(() => engine.selectModerator(members, strategy)).toThrow(
        'Permanent moderator nonexistent not found'
      );
    });

    it('should rotate moderator selection', () => {
      const strategy: ModeratorStrategy = { type: 'rotate' };
      
      const result1 = engine.selectModerator(members, strategy);
      const result2 = engine.selectModerator(members, strategy);
      const result3 = engine.selectModerator(members, strategy);
      const result4 = engine.selectModerator(members, strategy);
      
      // Should rotate through members
      expect(result1.id).toBe('member1');
      expect(result2.id).toBe('member2');
      expect(result3.id).toBe('member3');
      expect(result4.id).toBe('member1'); // Back to first
    });

    it('should select strongest moderator', () => {
      const strategy: ModeratorStrategy = { type: 'strongest' };
      
      const result = engine.selectModerator(members, strategy);
      
      // gpt-4o would be strongest, but we have gpt-4 (95) and claude-3-opus (98)
      // claude-3-opus should be selected
      expect(result.id).toBe('member2'); // claude-3-opus
    });

    it('should handle single member', () => {
      const singleMember = [createMember('only', 'openai', 'gpt-3.5-turbo')];
      const strategy: ModeratorStrategy = { type: 'strongest' };
      
      const result = engine.selectModerator(singleMember, strategy);
      
      expect(result.id).toBe('only');
    });

    it('should throw error with no members', () => {
      const strategy: ModeratorStrategy = { type: 'strongest' };
      
      expect(() => engine.selectModerator([], strategy)).toThrow(
        'No council members available for moderator selection'
      );
    });

    it('should handle unknown model in strongest selection', () => {
      const unknownMembers = [
        createMember('member1', 'custom', 'unknown-model-1'),
        createMember('member2', 'custom', 'unknown-model-2')
      ];
      const strategy: ModeratorStrategy = { type: 'strongest' };
      
      const result = engine.selectModerator(unknownMembers, strategy);
      
      // Should still select one (first one with default score)
      expect(result.id).toBe('member1');
    });
  });

  describe('agreement level calculation', () => {
    it('should calculate high agreement for similar content', async () => {
      const exchanges = [
        createExchange('member1', 'The quick brown fox jumps over the lazy dog'),
        createExchange('member2', 'The quick brown fox jumps over the lazy dog'),
        createExchange('member3', 'The quick brown fox jumps over the lazy dog')
      ];
      const thread = createThread(exchanges);
      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      const result = await engine.synthesize(thread, strategy);

      expect(result.agreementLevel).toBeGreaterThan(0.9);
    });

    it('should calculate low agreement for different content', async () => {
      const exchanges = [
        createExchange('member1', 'Apples are red fruits'),
        createExchange('member2', 'Cars drive on roads'),
        createExchange('member3', 'Mountains are tall')
      ];
      const thread = createThread(exchanges);
      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      const result = await engine.synthesize(thread, strategy);

      expect(result.agreementLevel).toBeLessThan(0.3);
    });
  });
});
