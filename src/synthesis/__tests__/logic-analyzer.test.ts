/**
 * Logic Analyzer Tests
 */

import { LogicAnalyzer } from '../logic-analyzer';

describe('LogicAnalyzer', () => {
  let analyzer: LogicAnalyzer;

  beforeEach(() => {
    analyzer = new LogicAnalyzer();
  });

  describe('extractLogicStructure', () => {
    it('should extract control flow keywords', () => {
      const code = 'if (x > 0) { return x; } else { return 0; }';
      const structure = analyzer.extractLogicStructure(code);
      expect(structure.controlFlowKeywords.length).toBeGreaterThan(0);
      expect(structure.controlFlowKeywords).toContain('if');
      expect(structure.controlFlowKeywords).toContain('else');
    });

    it('should calculate nesting depth', () => {
      const code = `
        if (x > 0) {
          if (y > 0) {
            return x + y;
          }
        }
      `;
      const structure = analyzer.extractLogicStructure(code);
      expect(structure.nestingDepth).toBeGreaterThanOrEqual(2);
    });

    it('should count loops', () => {
      const code = 'for (let i = 0; i < 10; i++) { while (true) { break; } }';
      const structure = analyzer.extractLogicStructure(code);
      expect(structure.loopCount).toBeGreaterThan(0);
    });

    it('should count conditionals', () => {
      const code = 'if (x) { } else if (y) { } switch (z) { case 1: break; }';
      const structure = analyzer.extractLogicStructure(code);
      expect(structure.conditionalCount).toBeGreaterThan(0);
    });

    it('should handle empty code', () => {
      const structure = analyzer.extractLogicStructure('');
      expect(structure.controlFlowKeywords).toEqual([]);
      expect(structure.nestingDepth).toBe(0);
      expect(structure.loopCount).toBe(0);
      expect(structure.conditionalCount).toBe(0);
    });
  });

  describe('compareLogicStructure', () => {
    it('should return high similarity for identical structures', () => {
      const code1 = 'if (x > 0) { return x; }';
      const code2 = 'if (y > 0) { return y; }';
      const struct1 = analyzer.extractLogicStructure(code1);
      const struct2 = analyzer.extractLogicStructure(code2);
      const similarity = analyzer.compareLogicStructure(struct1, struct2);
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should return low similarity for different structures', () => {
      const code1 = 'if (x > 0) { return x; }';
      const code2 = 'for (let i = 0; i < 10; i++) { console.log(i); }';
      const struct1 = analyzer.extractLogicStructure(code1);
      const struct2 = analyzer.extractLogicStructure(code2);
      const similarity = analyzer.compareLogicStructure(struct1, struct2);
      expect(similarity).toBeLessThan(0.5);
    });

    it('should compare nesting depth', () => {
      const code1 = 'if (x) { if (y) { } }';
      const code2 = 'if (x) { }';
      const struct1 = analyzer.extractLogicStructure(code1);
      const struct2 = analyzer.extractLogicStructure(code2);
      const similarity = analyzer.compareLogicStructure(struct1, struct2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('compareVariableNames', () => {
    it('should return high similarity for similar variable names', () => {
      const code1 = 'const userName = "John"; const userAge = 30;';
      const code2 = 'const userName = "Jane"; const userAge = 25;';
      const similarity = analyzer.compareVariableNames(code1, code2);
      expect(similarity).toBeGreaterThan(0.8);
    });

    it('should return low similarity for different variable names', () => {
      const code1 = 'const x = 5; const y = 10;';
      const code2 = 'const a = 5; const b = 10;';
      const similarity = analyzer.compareVariableNames(code1, code2);
      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle code without variables', () => {
      const code1 = 'function test() { return 42; }';
      const code2 = 'function test() { return 42; }';
      const similarity = analyzer.compareVariableNames(code1, code2);
      expect(similarity).toBeGreaterThanOrEqual(0);
    });

    it('should normalize variable names', () => {
      const code1 = 'const userName = "John";';
      const code2 = 'const user_name = "John";';
      const similarity = analyzer.compareVariableNames(code1, code2);
      expect(similarity).toBeGreaterThan(0.5);
    });
  });
});

