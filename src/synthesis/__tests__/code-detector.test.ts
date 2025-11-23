/**
 * Code Detector Tests
 */

import { CodeDetector } from '../code-detector';

describe('CodeDetector', () => {
  let detector: CodeDetector;

  beforeEach(() => {
    detector = new CodeDetector();
  });

  describe('detectCode', () => {
    it('should detect markdown code blocks', () => {
      const content = 'Here is some code:\n```javascript\nfunction test() {}\n```';
      expect(detector.detectCode(content)).toBe(true);
    });

    it('should detect multiple code blocks', () => {
      const content = '```python\ndef hello():\n    pass\n```\n\n```javascript\nfunction test() {}\n```';
      expect(detector.detectCode(content)).toBe(true);
    });

    it('should detect code by keywords', () => {
      const content = 'function test() { const x = 5; return x; }';
      expect(detector.detectCode(content)).toBe(true);
    });

    it('should require at least 2 keywords to reduce false positives', () => {
      const content = 'This is a function call';
      expect(detector.detectCode(content)).toBe(false);
    });

    it('should return false for plain text', () => {
      const content = 'This is just plain text without any code.';
      expect(detector.detectCode(content)).toBe(false);
    });

    it('should return false for empty content', () => {
      expect(detector.detectCode('')).toBe(false);
      expect(detector.detectCode('   ')).toBe(false);
    });

    it('should detect code with control flow keywords', () => {
      const content = 'if (x > 0) { return x; } else { return 0; }';
      expect(detector.detectCode(content)).toBe(true);
    });
  });

  describe('extractCode', () => {
    it('should extract single code block', () => {
      const content = '```javascript\nfunction test() {}\n```';
      const blocks = detector.extractCode(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe('function test() {}');
    });

    it('should extract multiple code blocks', () => {
      const content = '```python\ndef hello():\n    pass\n```\n\n```javascript\nfunction test() {}\n```';
      const blocks = detector.extractCode(content);
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toBe('def hello():\n    pass');
      expect(blocks[1]).toBe('function test() {}');
    });

    it('should handle code blocks with language tags', () => {
      const content = '```typescript\ninterface Test {}\n```';
      const blocks = detector.extractCode(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe('interface Test {}');
    });

    it('should handle code blocks without language tags', () => {
      const content = '```\nfunction test() {}\n```';
      const blocks = detector.extractCode(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe('function test() {}');
    });

    it('should return empty array for content without code blocks', () => {
      const content = 'This is just plain text.';
      const blocks = detector.extractCode(content);
      expect(blocks).toHaveLength(0);
    });

    it('should handle empty code blocks', () => {
      const content = '```\n```';
      const blocks = detector.extractCode(content);
      expect(blocks).toHaveLength(0);
    });

    it('should extract inline code patterns when no fenced blocks exist', () => {
      const content = 'Use `const x = 5` and `function test() {}`';
      const blocks = detector.extractCode(content);
      // Should extract inline code that looks like code
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should preserve code content exactly', () => {
      const code = 'function test() {\n  const x = 5;\n  return x;\n}';
      const content = `\`\`\`javascript\n${code}\n\`\`\``;
      const blocks = detector.extractCode(content);
      expect(blocks[0]).toBe(code);
    });
  });

  describe('detectLanguage', () => {
    it('should detect JavaScript', () => {
      const code = 'const x = 5; function test() {}';
      expect(detector.detectLanguage(code)).toBe('javascript');
    });

    it('should detect TypeScript', () => {
      const code = 'interface Test { value: number; }';
      expect(detector.detectLanguage(code)).toBe('typescript');
    });

    it('should detect Python', () => {
      const code = 'def hello(): pass';
      expect(detector.detectLanguage(code)).toBe('python');
    });

    it('should detect Java', () => {
      const code = 'public class Test { private int value; }';
      expect(detector.detectLanguage(code)).toBe('java');
    });

    it('should detect C#', () => {
      const code = 'namespace Test { public class TestClass {} }';
      expect(detector.detectLanguage(code)).toBe('csharp');
    });

    it('should detect Go', () => {
      const code = 'package main\nfunc test() {}';
      expect(detector.detectLanguage(code)).toBe('go');
    });

    it('should detect Rust', () => {
      const code = 'fn test() { let x = 5; }';
      expect(detector.detectLanguage(code)).toBe('rust');
    });

    it('should return undefined for unrecognized code', () => {
      const code = 'This is not code';
      expect(detector.detectLanguage(code)).toBeUndefined();
    });

    it('should return undefined for empty code', () => {
      expect(detector.detectLanguage('')).toBeUndefined();
    });
  });

  describe('extractCodeSegments', () => {
    it('should extract markdown code blocks when present', () => {
      const content = 'Here is some code:\n```javascript\nfunction test() { return 42; }\n```';
      const segments = detector.extractCodeSegments(content);
      expect(segments.length).toBeGreaterThan(0);
      expect(segments[0]).toContain('function test');
    });

    it('should extract code segments when detected via keywords but no markdown', () => {
      const content = 'Here is a function:\nfunction add(a, b) {\n  return a + b;\n}\nAnd some explanation text.';
      const segments = detector.extractCodeSegments(content);
      expect(segments.length).toBeGreaterThan(0);
      expect(segments[0]).toContain('function add');
      expect(segments[0]).not.toContain('And some explanation text');
    });

    it('should extract multiple code segments separated by text', () => {
      const content = 'First function:\nfunction one() { return 1; }\n\nSome text.\n\nSecond function:\nfunction two() { return 2; }';
      const segments = detector.extractCodeSegments(content);
      expect(segments.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array when no code is present', () => {
      const content = 'This is just regular text with no code at all.';
      const segments = detector.extractCodeSegments(content);
      expect(segments).toEqual([]);
    });

    it('should handle code with control flow keywords', () => {
      const content = 'Here is some code:\nif (x > 0) {\n  return x * 2;\n} else {\n  return 0;\n}';
      const segments = detector.extractCodeSegments(content);
      expect(segments.length).toBeGreaterThan(0);
      expect(segments[0]).toContain('if');
      expect(segments[0]).toContain('return');
    });
  });
});

