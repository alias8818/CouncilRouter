/**
 * Signature Extractor Tests
 */

import { SignatureExtractor, FunctionSignature } from '../signature-extractor';

describe('SignatureExtractor', () => {
  let extractor: SignatureExtractor;

  beforeEach(() => {
    extractor = new SignatureExtractor();
  });

  describe('extractFunctionSignatures', () => {
    it('should extract JavaScript function signatures', () => {
      const code = 'function test(x, y) { return x + y; }';
      const signatures = extractor.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(1);
      expect(signatures[0].name).toBe('test');
      expect(signatures[0].parameters).toEqual(['x', 'y']);
    });

    it('should extract TypeScript function signatures with return types', () => {
      const code = 'function test(x: number, y: number): number { return x + y; }';
      const signatures = extractor.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(1);
      expect(signatures[0].name).toBe('test');
      expect(signatures[0].parameters).toEqual(['x', 'y']);
      expect(signatures[0].returnType).toBe('number');
    });

    it('should extract arrow function signatures', () => {
      const code = 'const test = (x, y) => { return x + y; }';
      const signatures = extractor.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(1);
      expect(signatures[0].name).toBe('test');
      expect(signatures[0].parameters).toEqual(['x', 'y']);
    });

    it('should extract Python function signatures', () => {
      const code = 'def test(x, y):\n    return x + y';
      const signatures = extractor.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(1);
      expect(signatures[0].name).toBe('test');
      expect(signatures[0].parameters).toEqual(['x', 'y']);
    });

    it('should extract Python function signatures with return types', () => {
      const code = 'def test(x: int, y: int) -> int:\n    return x + y';
      const signatures = extractor.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(1);
      expect(signatures[0].name).toBe('test');
      expect(signatures[0].parameters).toEqual(['x', 'y']);
      expect(signatures[0].returnType).toBe('int');
    });

    it('should extract Java method signatures', () => {
      const code = 'public int test(int x, int y) { return x + y; }';
      const signatures = extractor.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(1);
      expect(signatures[0].name).toBe('test');
      expect(signatures[0].parameters).toEqual(['x', 'y']);
      expect(signatures[0].returnType).toBe('int');
    });

    it('should extract multiple function signatures', () => {
      const code = `
        function test1(x) { return x; }
        function test2(y, z) { return y + z; }
      `;
      const signatures = extractor.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(2);
      expect(signatures[0].name).toBe('test1');
      expect(signatures[1].name).toBe('test2');
    });

    it('should handle functions with no parameters', () => {
      const code = 'function test() { return 42; }';
      const signatures = extractor.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(1);
      expect(signatures[0].parameters).toEqual([]);
    });

    it('should return empty array for code without functions', () => {
      const code = 'const x = 5;';
      const signatures = extractor.extractFunctionSignatures(code);
      expect(signatures).toHaveLength(0);
    });

    it('should handle empty code', () => {
      const signatures = extractor.extractFunctionSignatures('');
      expect(signatures).toHaveLength(0);
    });
  });

  describe('compareSignatures', () => {
    it('should return 1.0 for identical signatures', () => {
      const sig1: FunctionSignature = { name: 'test', parameters: ['x', 'y'], returnType: 'number' };
      const sig2: FunctionSignature = { name: 'test', parameters: ['x', 'y'], returnType: 'number' };
      expect(extractor.compareSignatures(sig1, sig2)).toBe(1.0);
    });

    it('should return 0.8 for signatures differing only in parameter names', () => {
      const sig1: FunctionSignature = { name: 'test', parameters: ['x', 'y'] };
      const sig2: FunctionSignature = { name: 'test', parameters: ['a', 'b'] };
      expect(extractor.compareSignatures(sig1, sig2)).toBe(0.8);
    });

    it('should return 0.0 for different function names', () => {
      const sig1: FunctionSignature = { name: 'test1', parameters: ['x'] };
      const sig2: FunctionSignature = { name: 'test2', parameters: ['x'] };
      expect(extractor.compareSignatures(sig1, sig2)).toBe(0.0);
    });

    it('should calculate similarity for different parameter counts', () => {
      const sig1: FunctionSignature = { name: 'test', parameters: ['x', 'y'] };
      const sig2: FunctionSignature = { name: 'test', parameters: ['x'] };
      const similarity = extractor.compareSignatures(sig1, sig2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it('should return 0.9 for same params but different return types', () => {
      const sig1: FunctionSignature = { name: 'test', parameters: ['x'], returnType: 'number' };
      const sig2: FunctionSignature = { name: 'test', parameters: ['x'], returnType: 'string' };
      expect(extractor.compareSignatures(sig1, sig2)).toBe(0.9);
    });

    it('should handle functions with no parameters', () => {
      const sig1: FunctionSignature = { name: 'test', parameters: [] };
      const sig2: FunctionSignature = { name: 'test', parameters: [] };
      expect(extractor.compareSignatures(sig1, sig2)).toBe(1.0);
    });

    it('should calculate overlap for partially matching parameters', () => {
      const sig1: FunctionSignature = { name: 'test', parameters: ['x', 'y', 'z'] };
      const sig2: FunctionSignature = { name: 'test', parameters: ['x', 'y'] };
      const similarity = extractor.compareSignatures(sig1, sig2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });
});

