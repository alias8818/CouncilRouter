/**
 * Unit tests for Iterative Consensus type definitions
 */

import {
  IterativeConsensusConfig,
  NegotiationResponse,
  SimilarityResult,
  ConvergenceTrend,
  Agreement,
  NegotiationExample,
  PromptTemplate,
  ConsensusDecision,
  SynthesisStrategy
} from '../core';

describe('Iterative Consensus Types', () => {
  describe('IterativeConsensusConfig', () => {
    it('should accept valid configuration', () => {
      const config: IterativeConsensusConfig = {
        maxRounds: 5,
        agreementThreshold: 0.85,
        fallbackStrategy: 'meta-synthesis',
        embeddingModel: 'text-embedding-3-large',
        earlyTerminationEnabled: true,
        earlyTerminationThreshold: 0.95,
        negotiationMode: 'parallel',
        perRoundTimeout: 30,
        humanEscalationEnabled: false,
        exampleCount: 2
      };

      expect(config.maxRounds).toBe(5);
      expect(config.agreementThreshold).toBe(0.85);
      expect(config.fallbackStrategy).toBe('meta-synthesis');
    });

    it('should accept optional fields', () => {
      const config: IterativeConsensusConfig = {
        maxRounds: 3,
        agreementThreshold: 0.8,
        fallbackStrategy: 'consensus-extraction',
        embeddingModel: 'text-embedding-3-large',
        earlyTerminationEnabled: false,
        earlyTerminationThreshold: 0.95,
        negotiationMode: 'sequential',
        perRoundTimeout: 60,
        humanEscalationEnabled: true,
        exampleCount: 3,
        randomizationSeed: 12345,
        escalationChannels: ['email', 'slack'],
        escalationRateLimit: 5,
        promptTemplates: {
          code: {
            name: 'code-template',
            template: 'Template content',
            placeholders: { query: 'User query' }
          }
        },
        tokenPriceMap: {
          'gpt-4': { input: 0.03, output: 0.06 }
        },
        customAlerts: {
          successRateThreshold: 0.75,
          averageRoundsThreshold: 4,
          deadlockRateThreshold: 0.15
        }
      };

      expect(config.randomizationSeed).toBe(12345);
      expect(config.escalationChannels).toEqual(['email', 'slack']);
    });
  });

  describe('NegotiationResponse', () => {
    it('should accept valid negotiation response', () => {
      const response: NegotiationResponse = {
        councilMemberId: 'gpt-4',
        content: 'This is my refined response',
        roundNumber: 1,
        timestamp: new Date(),
        tokenCount: 150
      };

      expect(response.councilMemberId).toBe('gpt-4');
      expect(response.roundNumber).toBe(1);
    });

    it('should accept optional agreement field', () => {
      const response: NegotiationResponse = {
        councilMemberId: 'claude-3',
        content: 'I agree with the previous response',
        roundNumber: 2,
        timestamp: new Date(),
        agreesWithMemberId: 'gpt-4',
        embedding: [0.1, 0.2, 0.3],
        tokenCount: 50
      };

      expect(response.agreesWithMemberId).toBe('gpt-4');
      expect(response.embedding).toHaveLength(3);
    });
  });

  describe('SimilarityResult', () => {
    it('should accept valid similarity result', () => {
      const result: SimilarityResult = {
        matrix: [
          [1.0, 0.85, 0.75],
          [0.85, 1.0, 0.80],
          [0.75, 0.80, 1.0]
        ],
        averageSimilarity: 0.82,
        minSimilarity: 0.75,
        maxSimilarity: 1.0,
        belowThresholdPairs: [
          { member1: 'gpt-4', member2: 'gemini', similarity: 0.75 }
        ]
      };

      expect(result.matrix).toHaveLength(3);
      expect(result.averageSimilarity).toBe(0.82);
      expect(result.belowThresholdPairs).toHaveLength(1);
    });
  });

  describe('ConvergenceTrend', () => {
    it('should accept valid convergence trend', () => {
      const trend: ConvergenceTrend = {
        direction: 'converging',
        velocity: 0.05,
        predictedRounds: 2,
        deadlockRisk: 'low',
        recommendation: 'Continue negotiation'
      };

      expect(trend.direction).toBe('converging');
      expect(trend.deadlockRisk).toBe('low');
    });
  });

  describe('Agreement', () => {
    it('should accept valid agreement', () => {
      const agreement: Agreement = {
        memberIds: ['gpt-4', 'claude-3'],
        position: 'The answer is 42',
        cohesion: 0.92
      };

      expect(agreement.memberIds).toHaveLength(2);
      expect(agreement.cohesion).toBe(0.92);
    });
  });

  describe('NegotiationExample', () => {
    it('should accept valid negotiation example', () => {
      const example: NegotiationExample = {
        id: 'example-1',
        category: 'refinement',
        queryContext: 'User asked about...',
        disagreement: 'Models disagreed on...',
        resolution: 'They agreed that...',
        roundsToConsensus: 3,
        finalSimilarity: 0.88,
        createdAt: new Date()
      };

      expect(example.category).toBe('refinement');
      expect(example.roundsToConsensus).toBe(3);
    });
  });

  describe('PromptTemplate', () => {
    it('should accept valid prompt template', () => {
      const template: PromptTemplate = {
        name: 'negotiation-template',
        template: 'Given {query}, please review {responses}',
        placeholders: {
          query: 'The user query',
          responses: 'Current council responses'
        }
      };

      expect(template.name).toBe('negotiation-template');
      expect(Object.keys(template.placeholders)).toHaveLength(2);
    });
  });

  describe('ConsensusDecision with iterativeConsensusMetadata', () => {
    it('should accept consensus decision without metadata', () => {
      const decision: ConsensusDecision = {
        content: 'Final answer',
        confidence: 'high',
        agreementLevel: 0.95,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['gpt-4', 'claude-3'],
        timestamp: new Date()
      };

      expect(decision.iterativeConsensusMetadata).toBeUndefined();
    });

    it('should accept consensus decision with iterative consensus metadata', () => {
      const decision: ConsensusDecision = {
        content: 'Final answer',
        confidence: 'high',
        agreementLevel: 0.95,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['gpt-4', 'claude-3'],
        timestamp: new Date(),
        iterativeConsensusMetadata: {
          totalRounds: 3,
          similarityProgression: [0.65, 0.78, 0.92],
          consensusAchieved: true,
          fallbackUsed: false,
          deadlockDetected: false,
          humanEscalationTriggered: false,
          qualityScore: 0.88
        }
      };

      expect(decision.iterativeConsensusMetadata?.totalRounds).toBe(3);
      expect(decision.iterativeConsensusMetadata?.consensusAchieved).toBe(true);
      expect(decision.iterativeConsensusMetadata?.similarityProgression).toHaveLength(3);
    });

    it('should accept metadata with cost savings', () => {
      const decision: ConsensusDecision = {
        content: 'Final answer',
        confidence: 'high',
        agreementLevel: 0.95,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: ['gpt-4', 'claude-3'],
        timestamp: new Date(),
        iterativeConsensusMetadata: {
          totalRounds: 2,
          similarityProgression: [0.85, 0.96],
          consensusAchieved: true,
          fallbackUsed: false,
          deadlockDetected: false,
          humanEscalationTriggered: false,
          qualityScore: 0.92,
          costSavings: {
            tokensAvoided: 5000,
            estimatedCostSaved: 0.15,
            costBreakdownByMember: {
              'gpt-4': 0.10,
              'claude-3': 0.05
            }
          }
        }
      };

      expect(decision.iterativeConsensusMetadata?.costSavings?.tokensAvoided).toBe(5000);
      expect(decision.iterativeConsensusMetadata?.costSavings?.estimatedCostSaved).toBe(0.15);
    });
  });

  describe('SynthesisStrategy with iterative-consensus', () => {
    it('should accept iterative-consensus strategy', () => {
      const config: IterativeConsensusConfig = {
        maxRounds: 5,
        agreementThreshold: 0.85,
        fallbackStrategy: 'meta-synthesis',
        embeddingModel: 'text-embedding-3-large',
        earlyTerminationEnabled: true,
        earlyTerminationThreshold: 0.95,
        negotiationMode: 'parallel',
        perRoundTimeout: 30,
        humanEscalationEnabled: false,
        exampleCount: 2
      };

      const strategy: SynthesisStrategy = {
        type: 'iterative-consensus',
        config
      };

      expect(strategy.type).toBe('iterative-consensus');
      if (strategy.type === 'iterative-consensus') {
        expect(strategy.config.maxRounds).toBe(5);
        expect(strategy.config.agreementThreshold).toBe(0.85);
      }
    });
  });
});
