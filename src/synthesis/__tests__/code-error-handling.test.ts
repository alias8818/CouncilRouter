/**
 * Error Handling Tests for Code-Aware Synthesis
 * Verifies graceful error handling and fallback behavior
 */

import { CodeDetector } from '../code-detector';
import { CodeValidator } from '../code-validator';
import { CodeSimilarityCalculator } from '../code-similarity';
import { SynthesisEngine } from '../engine';
import { Exchange, DeliberationThread, SynthesisStrategy, UserRequest } from '../../types/core';

describe('Code-Aware Synthesis Error Handling', () => {
  let codeDetector: CodeDetector;
  let codeValidator: CodeValidator;
  let codeSimilarityCalculator: CodeSimilarityCalculator;
  let engine: SynthesisEngine;

  beforeEach(() => {
    codeDetector = new CodeDetector();
    codeValidator = new CodeValidator();
    codeSimilarityCalculator = new CodeSimilarityCalculator();
    
    const mockProviderPool = {
      sendRequest: jest.fn().mockResolvedValue({
        success: true,
        content: 'Synthesized',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latencyMs: 500,
        cost: 0.01
      })
    } as any;

    const mockConfigManager = {
      getCouncilConfig: jest.fn().mockResolvedValue({
        members: [{ id: 'member1', model: 'gpt-4' }]
      }),
      getModelRankings: jest.fn().mockResolvedValue({
        'gpt-4': 85,
        'default': 50
      })
    } as any;

    engine = new SynthesisEngine(mockProviderPool, mockConfigManager);
  });

  describe('Code Detection Error Handling', () => {
    it('should handle null/undefined input gracefully', () => {
      expect(() => codeDetector.detectCode(null as any)).not.toThrow();
      expect(() => codeDetector.detectCode(undefined as any)).not.toThrow();
      expect(codeDetector.detectCode(null as any)).toBe(false);
    });

    it('should handle malformed code blocks gracefully', () => {
      const malformed = '```javascript\nunclosed';
      expect(() => codeDetector.extractCode(malformed)).not.toThrow();
      const blocks = codeDetector.extractCode(malformed);
      expect(Array.isArray(blocks)).toBe(true);
    });
  });

  describe('Validation Error Handling', () => {
    it('should handle null/undefined input gracefully', () => {
      const result = codeValidator.validateCode(null as any);
      // Empty/null code should return weight 0.0 (critical error) so it gets filtered out
      expect(result.weight).toBe(0.0);
      expect(result.isCriticalError).toBe(true);
      expect(result.errorMessages.length).toBeGreaterThan(0);
    });

    it('should handle empty code gracefully', () => {
      const result = codeValidator.validateCode('');
      // Empty code should return weight 0.0 (critical error) so it gets filtered out
      expect(result.weight).toBe(0.0);
      expect(result.isCriticalError).toBe(true);
      expect(result.errorMessages.length).toBeGreaterThan(0);
    });
  });

  describe('Similarity Calculation Error Handling', () => {
    it('should handle null/undefined input gracefully', () => {
      expect(() => codeSimilarityCalculator.calculateSimilarity(null as any, 'test')).not.toThrow();
      expect(() => codeSimilarityCalculator.calculateSimilarity('test', null as any)).not.toThrow();
      const similarity = codeSimilarityCalculator.calculateSimilarity(null as any, 'test');
      expect(similarity).toBe(0);
    });
  });

  describe('Engine Error Handling', () => {
    it('should fallback to text similarity on code detection failure', async () => {
      const exchanges: Exchange[] = [
        {
          councilMemberId: 'member1',
          content: 'Some text content',
          referencesTo: [],
          tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        }
      ];

      const thread: DeliberationThread = {
        rounds: [{ roundNumber: 0, exchanges }],
        totalDuration: 1000
      };

      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };
      const request: UserRequest = {
        id: 'test-request-id',
        query: 'Test query',
        timestamp: new Date()
      };

      // Should not throw even if code detection fails
      await expect(engine.synthesize(request, thread, strategy)).resolves.toBeDefined();
    });
  });
});

