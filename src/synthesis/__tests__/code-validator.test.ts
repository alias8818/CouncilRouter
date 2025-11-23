/**
 * Code Validator Tests
 */

import { CodeValidator } from '../code-validator';

describe('CodeValidator', () => {
  let validator: CodeValidator;

  beforeEach(() => {
    validator = new CodeValidator();
  });

  describe('hasBalancedBrackets', () => {
    it('should return true for balanced brackets', () => {
      const code = 'function test() { return { x: 5 }; }';
      expect(validator.hasBalancedBrackets(code)).toBe(true);
    });

    it('should return false for unbalanced parentheses', () => {
      const code = 'function test() { return x;';
      expect(validator.hasBalancedBrackets(code)).toBe(false);
    });

    it('should return false for unbalanced braces', () => {
      const code = 'function test() { return x;';
      expect(validator.hasBalancedBrackets(code)).toBe(false);
    });

    it('should return false for unbalanced brackets', () => {
      const code = 'const arr = [1, 2, 3;';
      expect(validator.hasBalancedBrackets(code)).toBe(false);
    });

    it('should handle nested brackets', () => {
      const code = 'function test() { if (x > 0) { return [1, 2]; } }';
      expect(validator.hasBalancedBrackets(code)).toBe(true);
    });
  });

  describe('hasObviousSyntaxErrors', () => {
    it('should detect malformed keywords', () => {
      const code = 'functoin test() { return x; }';
      expect(validator.hasObviousSyntaxErrors(code)).toBe(true);
    });

    it('should detect invalid operators', () => {
      const code = 'const x = 5 ==== 5;';
      expect(validator.hasObviousSyntaxErrors(code)).toBe(true);
    });

    it('should return false for valid code', () => {
      const code = 'function test() { return x; }';
      expect(validator.hasObviousSyntaxErrors(code)).toBe(false);
    });
  });

  describe('hasErrorHandling', () => {
    it('should detect try-catch blocks', () => {
      const code = 'try { risky(); } catch (e) { handle(e); }';
      expect(validator.hasErrorHandling(code)).toBe(true);
    });

    it('should detect error checking conditionals', () => {
      const code = 'if (error) { handle(error); }';
      expect(validator.hasErrorHandling(code)).toBe(true);
    });

    it('should detect throw statements', () => {
      const code = 'if (invalid) { throw new Error("Invalid"); }';
      expect(validator.hasErrorHandling(code)).toBe(true);
    });

    it('should return false for code without error handling', () => {
      const code = 'function test() { return x; }';
      expect(validator.hasErrorHandling(code)).toBe(false);
    });
  });

  describe('hasDocumentation', () => {
    it('should detect single-line comments', () => {
      const code = '// This is a comment\nfunction test() { }';
      expect(validator.hasDocumentation(code)).toBe(true);
    });

    it('should detect multi-line comments', () => {
      const code = '/* This is a comment */\nfunction test() { }';
      expect(validator.hasDocumentation(code)).toBe(true);
    });

    it('should detect docstring patterns', () => {
      const code = '/**\n * @param x The input\n * @return The result\n */';
      expect(validator.hasDocumentation(code)).toBe(true);
    });

    it('should return false for code without documentation', () => {
      const code = 'function test() { return x; }';
      expect(validator.hasDocumentation(code)).toBe(false);
    });
  });

  describe('validateCode', () => {
    it('should return weight 0.3 for unbalanced brackets', () => {
      const code = 'function test() { return x;';
      const result = validator.validateCode(code);
      expect(result.hasBalancedBrackets).toBe(false);
      expect(result.weight).toBeLessThanOrEqual(0.3);
    });

    it('should return weight 0.5 for syntax errors', () => {
      const code = 'functoin test() { return x; }';
      const result = validator.validateCode(code);
      expect(result.hasSyntaxErrors).toBe(true);
      expect(result.weight).toBeLessThanOrEqual(0.5);
    });

    it('should return weight 1.2 for error handling', () => {
      const code = 'try { risky(); } catch (e) { }';
      const result = validator.validateCode(code);
      expect(result.hasErrorHandling).toBe(true);
      expect(result.weight).toBeGreaterThanOrEqual(1.2);
    });

    it('should return weight 1.1 for documentation', () => {
      const code = '// Comment\nfunction test() { }';
      const result = validator.validateCode(code);
      expect(result.hasDocumentation).toBe(true);
      expect(result.weight).toBeGreaterThanOrEqual(1.1);
    });

    it('should ensure weight is between 0.1 and 2.0', () => {
      const code = 'function test() { return x; }';
      const result = validator.validateCode(code);
      expect(result.weight).toBeGreaterThanOrEqual(0.1);
      expect(result.weight).toBeLessThanOrEqual(2.0);
    });
  });
});

