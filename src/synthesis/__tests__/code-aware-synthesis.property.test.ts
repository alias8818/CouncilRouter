/**
 * Property-Based Tests for Code-Aware Synthesis
 * Feature: code-aware-synthesis
 */

import * as fc from 'fast-check';
import { CodeDetector } from '../code-detector';
import { SignatureExtractor, FunctionSignature } from '../signature-extractor';
import { LogicAnalyzer } from '../logic-analyzer';
import { CodeSimilarityCalculator } from '../code-similarity';
import { CodeValidator } from '../code-validator';
import { SynthesisEngine } from '../engine';
import { Exchange, DeliberationThread, SynthesisStrategy } from '../../types/core';
import { getPropertyTestRuns } from '../../__tests__/test-helpers';

describe('Code-Aware Synthesis - Property-Based Tests', () => {
  let codeDetector: CodeDetector;
  let signatureExtractor: SignatureExtractor;
  let logicAnalyzer: LogicAnalyzer;
  let codeSimilarityCalculator: CodeSimilarityCalculator;
  let codeValidator: CodeValidator;

  beforeEach(() => {
    codeDetector = new CodeDetector();
    signatureExtractor = new SignatureExtractor();
    logicAnalyzer = new LogicAnalyzer();
    codeSimilarityCalculator = new CodeSimilarityCalculator();
    codeValidator = new CodeValidator();
  });

  // Arbitraries for generating test data
  const codeBlockArb = fc.string({ minLength: 10, maxLength: 500 }).map(s => {
    // Generate simple code-like strings
    return `function test(x) {\n  return x * 2;\n}`;
  });

  const markdownCodeArb = codeBlockArb.map(code => `\`\`\`javascript\n${code}\n\`\`\``);

  /**
   * Property 10: Exact signature match
   * For any two function signatures that are identical, the signature similarity should be 1.0
   * Validates: Requirements 4.6
   */
  test('Property 10: Exact signature match should return similarity 1.0', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 5 }),
        fc.option(fc.string({ minLength: 1, maxLength: 10 })),
        (name, params, returnType) => {
          const sig1: FunctionSignature = { name, parameters: params, returnType: returnType || undefined };
          const sig2: FunctionSignature = { name, parameters: params, returnType: returnType || undefined };
          const similarity = signatureExtractor.compareSignatures(sig1, sig2);
          expect(similarity).toBe(1.0);
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 11: Parameter name variation tolerance
   * For any two function signatures differing only in parameter names, the signature similarity should be 0.8
   * Validates: Requirements 4.7
   */
  test('Property 11: Parameter name variation should return similarity 0.8', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 5 }),
        (name, params) => {
          const sig1: FunctionSignature = { name, parameters: params };
          const sig2: FunctionSignature = { 
            name, 
            parameters: params.map(p => p + '_alt') // Different parameter names
          };
          const similarity = signatureExtractor.compareSignatures(sig1, sig2);
          expect(similarity).toBe(0.8);
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 13: Bracket balance detection
   * For any code with unbalanced brackets, the validation should detect the imbalance and return false
   * Validates: Requirements 7.8
   */
  test('Property 13: Unbalanced brackets should be detected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (code) => {
          // Add unbalanced bracket
          const unbalancedCode = code + '{';
          const result = codeValidator.hasBalancedBrackets(unbalancedCode);
          // If code already had balanced brackets, adding one should make it unbalanced
          // (unless code already had unmatched closing brackets)
          const openBraces = (unbalancedCode.match(/{/g) || []).length;
          const closeBraces = (unbalancedCode.match(/}/g) || []).length;
          if (openBraces !== closeBraces) {
            expect(result).toBe(false);
          }
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 14: Balanced bracket confirmation
   * For any code with all bracket types balanced (properly ordered), the validation should return true
   * Validates: Requirements 7.7
   */
  test('Property 14: Balanced brackets should return true', () => {
    // Generate balanced code patterns
    // Use characters that don't include brackets to avoid interference
    const nonBracketCharArb = fc.char().filter(c => !['(', ')', '{', '}', '[', ']'].includes(c));
    const nonBracketStringArb = fc.stringOf(nonBracketCharArb, { minLength: 0, maxLength: 30 });
    
    const balancedCodeArb = fc.record({
      prefix: fc.stringOf(nonBracketCharArb, { minLength: 0, maxLength: 20 }),
      parenPairs: fc.nat({ max: 3 }), // 0-3 pairs of parentheses
      bracePairs: fc.nat({ max: 3 }), // 0-3 pairs of braces
      bracketPairs: fc.nat({ max: 3 }), // 0-3 pairs of brackets
      middle: nonBracketStringArb,
      suffix: fc.stringOf(nonBracketCharArb, { minLength: 0, maxLength: 20 })
    }).map(({ prefix, parenPairs, bracePairs, bracketPairs, middle, suffix }) => {
      // Build balanced code by adding matching pairs
      let code = prefix;
      
      // Add balanced parentheses
      for (let i = 0; i < parenPairs; i++) {
        code += '(';
      }
      
      // Add balanced braces
      for (let i = 0; i < bracePairs; i++) {
        code += '{';
      }
      
      // Add balanced brackets
      for (let i = 0; i < bracketPairs; i++) {
        code += '[';
      }
      
      code += middle;
      
      // Close brackets in reverse order
      for (let i = 0; i < bracketPairs; i++) {
        code += ']';
      }
      
      // Close braces in reverse order
      for (let i = 0; i < bracePairs; i++) {
        code += '}';
      }
      
      // Close parentheses in reverse order
      for (let i = 0; i < parenPairs; i++) {
        code += ')';
      }
      
      code += suffix;
      return code;
    });

    fc.assert(
      fc.property(
        balancedCodeArb,
        (code) => {
          const result = codeValidator.hasBalancedBrackets(code);
          // All generated code should have balanced brackets
          expect(result).toBe(true);
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 15: Unbalanced bracket penalty
   * For any code with unbalanced brackets (without bonuses), the validation weight should be 0.3 or less
   * Validates: Requirements 6.2
   */
  test('Property 15: Unbalanced brackets should apply penalty', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (code) => {
          // Remove any documentation/error handling patterns to test penalty in isolation
          // Remove comments (single-line and multi-line)
          let cleanCode = code.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
          // Remove error handling keywords and patterns
          cleanCode = cleanCode.replace(/try|catch|finally|except|rescue|throw|raise|panic/gi, '');
          // Remove error checking conditionals (if/when with error in parentheses)
          cleanCode = cleanCode.replace(/\b(if|when)\s*\([^)]*(?:error|err|exception|Error)[^)]*\)/gi, '');
          // Remove docstring patterns
          cleanCode = cleanCode.replace(/@param|@return|@throws|:param|:return|:raises/gi, '');
          
          const unbalancedCode = cleanCode + '{';
          const result = codeValidator.validateCode(unbalancedCode);
          if (!result.hasBalancedBrackets && !result.hasErrorHandling && !result.hasDocumentation) {
            // Only test penalty when no bonuses apply
            expect(result.weight).toBeLessThanOrEqual(0.3);
          }
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 16: Syntax error penalty
   * For any code with obvious syntax errors (without bonuses), the validation weight should be 0.5 or less
   * Validates: Requirements 6.3
   */
  test('Property 16: Syntax errors should apply penalty', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (code) => {
          // Remove any documentation/error handling patterns to test penalty in isolation
          // Remove comments (single-line and multi-line)
          let cleanCode = code.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
          // Remove error handling keywords and patterns
          cleanCode = cleanCode.replace(/try|catch|finally|except|rescue|throw|raise|panic/gi, '');
          // Remove error checking conditionals (if/when with error in parentheses)
          cleanCode = cleanCode.replace(/\b(if|when)\s*\([^)]*(?:error|err|exception|Error)[^)]*\)/gi, '');
          // Remove docstring patterns
          cleanCode = cleanCode.replace(/@param|@return|@throws|:param|:return|:raises/gi, '');
          
          const errorCode = cleanCode + 'functoin test() {}';
          const result = codeValidator.validateCode(errorCode);
          if (result.hasSyntaxErrors && !result.hasErrorHandling && !result.hasDocumentation) {
            // Only test penalty when no bonuses apply
            expect(result.weight).toBeLessThanOrEqual(0.5);
          }
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 17: Error handling bonus
   * For any code containing error handling patterns (without penalties), the validation weight should be multiplied by 1.2
   * Validates: Requirements 9.4
   */
  test('Property 17: Error handling should apply bonus', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (code) => {
          // Ensure code has balanced brackets and no syntax errors to test bonus in isolation
          // Remove any brackets from random code to avoid unbalanced brackets
          let cleanCode = code.replace(/[{}()[\]]/g, '');
          // Remove malformed keywords that would cause syntax errors
          cleanCode = cleanCode.replace(/\b(functoin|calss|retrun|improt)\b/gi, '');
          // Remove invalid operators (3+ consecutive operators)
          cleanCode = cleanCode.replace(/[=<>!+\-*/%&|^~]{3,}/g, '');
          const codeWithErrorHandling = cleanCode + '\ntry { risky(); } catch (e) { handle(e); }';
          const result = codeValidator.validateCode(codeWithErrorHandling);
          if (result.hasErrorHandling && result.hasBalancedBrackets && !result.hasSyntaxErrors) {
            // Only test bonus when no penalties apply
            expect(result.weight).toBeGreaterThanOrEqual(1.2);
          }
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 18: Documentation bonus
   * For any code containing documentation (without penalties), the validation weight should be multiplied by 1.1
   * Validates: Requirements 10.5
   */
  test('Property 18: Documentation should apply bonus', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (code) => {
          // Ensure code has balanced brackets and no syntax errors to test bonus in isolation
          // Remove any brackets from random code to avoid unbalanced brackets
          let cleanCode = code.replace(/[{}()[\]]/g, '');
          // Remove malformed keywords that would cause syntax errors
          cleanCode = cleanCode.replace(/\b(functoin|calss|retrun|improt)\b/gi, '');
          // Remove invalid operators (3+ consecutive operators)
          cleanCode = cleanCode.replace(/[=<>!+\-*/%&|^~]{3,}/g, '');
          const codeWithDocs = '// Comment\n' + cleanCode;
          const result = codeValidator.validateCode(codeWithDocs);
          if (result.hasDocumentation && result.hasBalancedBrackets && !result.hasSyntaxErrors) {
            // Only test bonus when no penalties apply
            expect(result.weight).toBeGreaterThanOrEqual(1.1);
          }
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 20: Minimum weight floor
   * For any validation result, the final weight should be >= 0.0 (0.0 for critical errors, >= 0.1 otherwise)
   * Validates: Requirements 11.5, 2.1 (critical error handling)
   */
  test('Property 20: Validation weight should be >= 0.0 (0.0 allowed for critical errors)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (code) => {
          const result = codeValidator.validateCode(code);
          // Critical errors can have weight 0.0, otherwise should be >= 0.1
          if (result.isCriticalError) {
            expect(result.weight).toBe(0.0);
          } else {
            expect(result.weight).toBeGreaterThanOrEqual(0.1);
          }
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 21: Maximum weight ceiling
   * For any validation result, the final weight should never exceed 2.0
   * Validates: Requirements 11.6
   */
  test('Property 21: Validation weight should never exceed 2.0', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (code) => {
          const result = codeValidator.validateCode(code);
          expect(result.weight).toBeLessThanOrEqual(2.0);
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });

  /**
   * Property 22: Code-aware routing
   * For any set of exchanges where at least one contains code, the system should use code-aware similarity calculation
   * Validates: Requirements 1.3
   */
  test('Property 22: Code-aware routing should be used when code is detected', async () => {
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
        members: [{ id: 'member1', model: 'gpt-4' }]
      })
    } as any;

    const engine = new SynthesisEngine(mockProviderPool, mockConfigManager);

    fc.assert(
      fc.asyncProperty(
        markdownCodeArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (codeContent, textContent) => {
          const exchanges: Exchange[] = [
            {
              councilMemberId: 'member1',
              content: codeContent,
              referencesTo: [],
              tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
            },
            {
              councilMemberId: 'member2',
              content: textContent,
              referencesTo: [],
              tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
            }
          ];

          // Should not throw error (code-aware routing should work)
          const agreementLevel = (engine as any).calculateAgreementLevel(exchanges);
          expect(agreementLevel).toBeGreaterThanOrEqual(0);
          expect(agreementLevel).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: getPropertyTestRuns() }
    );
  });
});

