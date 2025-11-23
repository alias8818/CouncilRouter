/**
 * Code Similarity Calculator Tests
 */

import { CodeSimilarityCalculator } from '../code-similarity';

describe('CodeSimilarityCalculator', () => {
  let calculator: CodeSimilarityCalculator;

  beforeEach(() => {
    calculator = new CodeSimilarityCalculator();
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical code', () => {
      const code = 'function test(x) { return x * 2; }';
      const similarity = calculator.calculateSimilarity(code, code);
      expect(similarity).toBe(1.0);
    });

    it('should return high similarity for functionally equivalent code', () => {
      const code1 = 'function test(x) { return x * 2; }';
      const code2 = 'function test(y) { return y * 2; }';
      const similarity = calculator.calculateSimilarity(code1, code2);
      expect(similarity).toBeGreaterThan(0.8);
    });

    it('should return low similarity for different logic', () => {
      const code1 = 'function multiply(x) { return x * 2; }';
      const code2 = 'function add(x) { return x + 10; }';
      const similarity = calculator.calculateSimilarity(code1, code2);
      // Different function names should result in lower similarity
      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle empty code', () => {
      const similarity = calculator.calculateSimilarity('', '');
      expect(similarity).toBe(0.0);
    });

    it('should weight signature similarity at 70%', () => {
      // Same signature, different logic should still have high similarity
      const code1 = 'function test(x, y) { return x + y; }';
      const code2 = 'function test(a, b) { return a - b; }';
      const similarity = calculator.calculateSimilarity(code1, code2);
      // Should be high due to signature match (70% weight)
      expect(similarity).toBeGreaterThan(0.6);
    });
  });

  describe('extractFunctionSignatures', () => {
    it('should extract function signatures', () => {
      const code = 'function test(x, y) { return x + y; }';
      const signatures = calculator.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(1);
      expect(signatures[0].name).toBe('test');
    });
  });

  describe('compareSignatures', () => {
    it('should compare function signatures', () => {
      const sig1 = { name: 'test', parameters: ['x'], returnType: 'number' };
      const sig2 = { name: 'test', parameters: ['x'], returnType: 'number' };
      const similarity = calculator.compareSignatures(sig1, sig2);
      expect(similarity).toBe(1.0);
    });
  });
});

