/**
 * Performance Tests for Code-Aware Synthesis
 * Verifies performance targets are met
 */

import { CodeDetector } from '../code-detector';
import { CodeSimilarityCalculator } from '../code-similarity';
import { CodeValidator } from '../code-validator';
import { SynthesisEngine } from '../engine';
import { Exchange, DeliberationThread, SynthesisStrategy, UserRequest } from '../../types/core';

describe('Code-Aware Synthesis Performance Tests', () => {
  let codeDetector: CodeDetector;
  let codeSimilarityCalculator: CodeSimilarityCalculator;
  let codeValidator: CodeValidator;
  let engine: SynthesisEngine;

  beforeEach(() => {
    codeDetector = new CodeDetector();
    codeSimilarityCalculator = new CodeSimilarityCalculator();
    codeValidator = new CodeValidator();
    
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
          { id: 'member3', model: 'gemini-pro' }
        ]
      })
    } as any;

    engine = new SynthesisEngine(mockProviderPool, mockConfigManager);
  });

  describe('Code Detection Performance', () => {
    it('should detect code in <10ms', () => {
      const content = '```javascript\nfunction test() { return 42; }\n```';
      const start = Date.now();
      codeDetector.detectCode(content);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10);
    });

    it('should extract code blocks in <50ms', () => {
      const content = '```javascript\nfunction test() { return 42; }\n```\n\n```python\ndef hello(): pass\n```';
      const start = Date.now();
      codeDetector.extractCode(content);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Similarity Calculation Performance', () => {
    it('should calculate similarity in <100ms per pair', () => {
      const code1 = 'function add(a, b) { return a + b; }';
      const code2 = 'function add(x, y) { return x + y; }';
      const start = Date.now();
      codeSimilarityCalculator.calculateSimilarity(code1, code2);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should use cache for repeated calculations', () => {
      const code1 = 'function test() { return 42; }';
      const code2 = 'function test() { return 42; }';
      
      // First call
      const result1 = codeSimilarityCalculator.calculateSimilarity(code1, code2);
      
      // Second call (should return cached result)
      const result2 = codeSimilarityCalculator.calculateSimilarity(code1, code2);
      
      // Results should be identical (cache hit)
      expect(result1).toBe(result2);
      expect(result1).toBe(1.0); // Identical code should have similarity 1.0
    });
  });

  describe('Validation Performance', () => {
    it('should validate code in <50ms per block', () => {
      const code = 'function test() {\n  try {\n    return x;\n  } catch (e) {\n    handle(e);\n  }\n}';
      const start = Date.now();
      codeValidator.validateCode(code);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50);
    });
  });

  describe('End-to-End Performance', () => {
    it('should complete synthesis for 3-member council in <500ms', async () => {
      const exchanges: Exchange[] = [
        {
          councilMemberId: 'member1',
          content: '```javascript\nfunction add(a, b) { return a + b; }\n```',
          referencesTo: [],
          tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        },
        {
          councilMemberId: 'member2',
          content: '```javascript\nfunction add(x, y) { return x + y; }\n```',
          referencesTo: [],
          tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        },
        {
          councilMemberId: 'member3',
          content: '```javascript\nfunction add(num1, num2) { return num1 + num2; }\n```',
          referencesTo: [],
          tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        }
      ];

      const thread: DeliberationThread = {
        rounds: [{ roundNumber: 1, exchanges }],
        totalDuration: 1000
      };

      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };
      const request: UserRequest = {
        id: 'test-request-id',
        query: 'Generate a function to add two numbers',
        timestamp: new Date()
      };

      const start = Date.now();
      await engine.synthesize(request, thread, strategy);
      const duration = Date.now() - start;

      // Should complete within 500ms (excluding mock provider call)
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Size Limits', () => {
    it('should enforce 100KB per block limit', () => {
      const largeCode = 'x'.repeat(150 * 1024); // 150KB
      const content = `\`\`\`javascript\n${largeCode}\n\`\`\``;
      const blocks = codeDetector.extractCode(content);
      
      // Should truncate to 100KB
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].length).toBeLessThanOrEqual(100 * 1024);
    });

    it('should enforce 1MB total limit', () => {
      const largeCode1 = 'x'.repeat(600 * 1024); // 600KB
      const largeCode2 = 'y'.repeat(600 * 1024); // 600KB
      const content = `\`\`\`javascript\n${largeCode1}\n\`\`\`\n\n\`\`\`python\n${largeCode2}\n\`\`\``;
      const blocks = codeDetector.extractCode(content);
      
      // Should limit total size
      const totalSize = blocks.reduce((sum, block) => sum + block.length, 0);
      expect(totalSize).toBeLessThanOrEqual(1024 * 1024);
    });
  });
});

