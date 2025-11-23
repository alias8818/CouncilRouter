/**
 * Error Handling Tests for Code-Aware Synthesis
 * Verifies graceful error handling and fallback behavior
 */

import { CodeDetector } from '../code-detector';
import { CodeValidator } from '../code-validator';
import { CodeSimilarityCalculator } from '../code-similarity';
import { SynthesisEngine } from '../engine';
import { Exchange, DeliberationThread, SynthesisStrategy } from '../../types/core';

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
      expect(result.weight).toBeGreaterThanOrEqual(0.1);
      expect(result.weight).toBeLessThanOrEqual(2.0);
    });

    it('should handle empty code gracefully', () => {
      const result = codeValidator.validateCode('');
      expect(result.weight).toBeGreaterThanOrEqual(0.1);
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
        rounds: [{ roundNumber: 1, exchanges }],
        totalDuration: 1000
      };

      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      // Should not throw even if code detection fails
      await expect(engine.synthesize(thread, strategy)).resolves.toBeDefined();
    });
  });
});

