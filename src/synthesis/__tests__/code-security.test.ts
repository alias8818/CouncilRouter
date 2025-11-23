/**
 * Security Tests for Code-Aware Synthesis
 * Verifies security measures are in place
 */

import { CodeDetector } from '../code-detector';
import { CodeValidator } from '../code-validator';
import { CodeSimilarityCalculator } from '../code-similarity';

describe('Code-Aware Synthesis Security Tests', () => {
  let codeDetector: CodeDetector;
  let codeValidator: CodeValidator;
  let codeSimilarityCalculator: CodeSimilarityCalculator;

  beforeEach(() => {
    codeDetector = new CodeDetector();
    codeValidator = new CodeValidator();
    codeSimilarityCalculator = new CodeSimilarityCalculator();
  });

  describe('Input Size Limits', () => {
    it('should reject inputs larger than 10MB', () => {
      const largeInput = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const result = codeDetector.detectCode(largeInput);
      expect(result).toBe(false);
    });

    it('should limit code block extraction to 1MB total', () => {
      const largeCode1 = 'x'.repeat(600 * 1024); // 600KB
      const largeCode2 = 'y'.repeat(600 * 1024); // 600KB
      const content = `\`\`\`javascript\n${largeCode1}\n\`\`\`\n\n\`\`\`python\n${largeCode2}\n\`\`\``;
      const blocks = codeDetector.extractCode(content);
      
      const totalSize = blocks.reduce((sum, block) => sum + block.length, 0);
      expect(totalSize).toBeLessThanOrEqual(1024 * 1024);
    });

    it('should limit individual code blocks to 100KB', () => {
      const largeCode = 'x'.repeat(150 * 1024); // 150KB
      const content = `\`\`\`javascript\n${largeCode}\n\`\`\``;
      const blocks = codeDetector.extractCode(content);
      
      if (blocks.length > 0) {
        expect(blocks[0].length).toBeLessThanOrEqual(100 * 1024);
      }
    });
  });

  describe('ReDoS Protection', () => {
    it('should handle potentially malicious regex patterns safely', () => {
      // Pattern that could cause ReDoS: many nested parentheses
      const maliciousPattern = '('.repeat(10000) + ')'.repeat(10000);
      const content = `\`\`\`javascript\nfunction test() { ${maliciousPattern} }\n\`\`\``;
      
      // Should not hang or throw unhandled error
      expect(() => {
        codeDetector.extractCode(content);
      }).not.toThrow();
    });

    it('should limit regex matching to 100KB of input', () => {
      const largeInput = 'a'.repeat(200 * 1024); // 200KB
      const content = `\`\`\`javascript\n${largeInput}\n\`\`\``;
      
      // Should complete without hanging
      const start = Date.now();
      codeDetector.extractCode(content);
      const duration = Date.now() - start;
      
      // Should complete quickly (not hang on regex)
      expect(duration).toBeLessThan(1000); // 1 second max
    });
  });

  describe('No Code Execution', () => {
    it('should not execute code during detection', () => {
      // Attempt to inject code execution
      const maliciousCode = '```javascript\nrequire("child_process").exec("rm -rf /")\n```';
      
      // Should only extract, not execute
      const blocks = codeDetector.extractCode(maliciousCode);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0]).toContain('require');
      // Code should be extracted as string, not executed
    });

    it('should not execute code during validation', () => {
      const maliciousCode = 'eval("malicious code")';
      
      // Should validate without executing
      const result = codeValidator.validateCode(maliciousCode);
      expect(result).toBeDefined();
      expect(typeof result.weight).toBe('number');
    });

    it('should not execute code during similarity calculation', () => {
      const code1 = 'function test() { return eval("x"); }';
      const code2 = 'function test() { return eval("y"); }';
      
      // Should calculate similarity without executing
      const similarity = codeSimilarityCalculator.calculateSimilarity(code1, code2);
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('Special Character Handling', () => {
    it('should handle unicode characters safely', () => {
      const unicodeCode = '```javascript\nconst 测试 = "中文";\n```';
      const blocks = codeDetector.extractCode(unicodeCode);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should handle null bytes safely', () => {
      const codeWithNull = '```javascript\nconst x = "test\\0";\n```';
      const blocks = codeDetector.extractCode(codeWithNull);
      // Should not crash
      expect(blocks).toBeDefined();
    });

    it('should handle control characters safely', () => {
      const codeWithControl = '```javascript\nconst x = "test\\x01\\x02";\n```';
      const blocks = codeDetector.extractCode(codeWithControl);
      // Should not crash
      expect(blocks).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle regex errors gracefully', () => {
      // Create input that might cause regex issues
      const problematicInput = 'a'.repeat(100000) + '\\';
      
      // Should not throw unhandled error
      expect(() => {
        codeDetector.detectCode(problematicInput);
      }).not.toThrow();
    });

    it('should return safe defaults on validation errors', () => {
      const invalidCode = null as any;
      const result = codeValidator.validateCode(invalidCode);
      
      // Should return safe default (minimum weight)
      expect(result.weight).toBeGreaterThanOrEqual(0.1);
      expect(result.weight).toBeLessThanOrEqual(2.0);
    });
  });
});

