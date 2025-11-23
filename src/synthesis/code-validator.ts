/**
 * Code Validation Module
 * Validates code quality and calculates weight multipliers
 */

export interface ValidationResult {
  isValid: boolean;
  hasBalancedBrackets: boolean;
  hasSyntaxErrors: boolean;
  hasObviousSyntaxErrors: boolean; // Alias for hasSyntaxErrors for compatibility
  isCriticalError: boolean; // Flags errors that should reject the response
  hasErrorHandling: boolean;
  hasDocumentation: boolean;
  weight: number; // calculated multiplier (0.0 for critical errors)
  errorMessages: string[]; // Array of error messages
}

/**
 * Code Validator
 * Validates code and returns quality metrics
 */
export class CodeValidator {
  // Patterns for error handling detection
  private readonly tryCatchPattern = /\b(try|catch|finally|except|rescue)\b/g;
  private readonly errorCheckPattern = /\b(if|when)\s*\([^)]*(?:error|err|exception|Error)\)/g;
  private readonly throwRaisePattern = /\b(throw|raise|panic)\b/g;

  // Patterns for documentation detection
  private readonly singleLineCommentPattern = /\/\/|#/g;
  private readonly multiLineCommentPattern = /\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|'''[\s\S]*?'''/g;
  private readonly docstringPattern = /@param|@return|@throws|:param|:return|:raises/g;

  // Patterns for syntax error detection
  private readonly unclosedStringPattern = /(["'`])(?:(?=(\\?))\2.)*?(?!\1)/g;
  // Match 5+ consecutive operator characters (invalid - valid operators are 1-4 chars)
  // Valid 3-char operators: ===, !==, >>>, <<=, >>=, **=, &&=, ||=, ??=
  // Valid 4-char operator: >>>= (unsigned right shift assignment)
  private readonly invalidOperatorPattern = /[=<>!+\-*/%&|^~]{5,}/g;
  private readonly malformedKeywordPattern = /\b(functoin|calss|retrun|improt)\b/g;

  /**
   * Validate code and return quality metrics
   */
  validateCode(code: string): ValidationResult {
    if (!code || code.trim().length === 0) {
      return {
        isValid: false,
        hasBalancedBrackets: false,
        hasSyntaxErrors: true,
        hasObviousSyntaxErrors: true,
        isCriticalError: true,
        hasErrorHandling: false,
        hasDocumentation: false,
        weight: 0.0, // Critical error gets zero weight
        errorMessages: ['Empty or whitespace-only code provided']
      };
    }

    const hasBalancedBrackets = this.hasBalancedBrackets(code);
    const hasSyntaxErrors = this.hasObviousSyntaxErrors(code);
    const hasErrorHandling = this.hasErrorHandling(code);
    const hasDocumentation = this.hasDocumentation(code);

    // Critical error: obvious syntax errors should reject the response
    const isCriticalError = hasSyntaxErrors;

    const errorMessages: string[] = [];
    if (!hasBalancedBrackets) {
      errorMessages.push('Unbalanced brackets detected');
    }
    if (hasSyntaxErrors) {
      errorMessages.push('Obvious syntax errors detected');
    }

    const weight = this.calculateWeight({
      hasBalancedBrackets,
      hasSyntaxErrors,
      hasErrorHandling,
      hasDocumentation,
      isCriticalError
    });

    return {
      isValid: hasBalancedBrackets && !hasSyntaxErrors,
      hasBalancedBrackets,
      hasSyntaxErrors,
      hasObviousSyntaxErrors: hasSyntaxErrors, // Alias for compatibility
      isCriticalError,
      hasErrorHandling,
      hasDocumentation,
      weight,
      errorMessages
    };
  }

  /**
   * Check if brackets are balanced
   * Security: Limits input size to prevent DoS
   */
  hasBalancedBrackets(code: string): boolean {
    if (!code) {
      return false;
    }

    // Security: Limit input size (1MB max)
    if (code.length > 1024 * 1024) {
      return false;
    }

    let parenCount = 0;
    let braceCount = 0;
    let bracketCount = 0;

    for (const char of code) {
      switch (char) {
        case '(':
          parenCount++;
          break;
        case ')':
          parenCount--;
          break;
        case '{':
          braceCount++;
          break;
        case '}':
          braceCount--;
          break;
        case '[':
          bracketCount++;
          break;
        case ']':
          bracketCount--;
          break;
      }

      // Early exit if any count goes negative (unbalanced)
      if (parenCount < 0 || braceCount < 0 || bracketCount < 0) {
        return false;
      }
    }

    // All counts must be zero for balanced brackets
    return parenCount === 0 && braceCount === 0 && bracketCount === 0;
  }

  /**
   * Detect obvious syntax errors using regex patterns
   * Security: Limits input size and uses safe regex matching
   */
  hasObviousSyntaxErrors(code: string): boolean {
    if (!code) {
      return true;
    }

    // Security: Limit input size (1MB max)
    if (code.length > 1024 * 1024) {
      return false; // Assume valid for very large inputs
    }

    try {
      // Limit regex matching to first 100KB to prevent ReDoS
      const searchText = code.length > 100000 ? code.substring(0, 100000) : code;

      // Check for malformed keywords
      this.malformedKeywordPattern.lastIndex = 0;
      if (this.malformedKeywordPattern.test(searchText)) {
        return true;
      }

      // Check for invalid operators (5+ consecutive operators)
      // Valid operators are 1-4 characters (e.g., ===, !==, >>>, >>>=, <<=, >>=, **=, &&=, ||=, ??=)
      this.invalidOperatorPattern.lastIndex = 0;
      if (this.invalidOperatorPattern.test(searchText)) {
        return true;
      }

      // Check for unclosed strings (simplified check)
      // This is a basic check - full string parsing would be more accurate
      const stringMatches = searchText.match(/["'`]/g);
      if (stringMatches) {
        const quoteCount = stringMatches.length;
        // Odd number of quotes suggests unclosed string
        if (quoteCount % 2 !== 0) {
          return true;
        }
      }
    } catch (error) {
      // On regex error, assume no syntax errors (fail safe)
      console.warn('Syntax error detection regex error:', error);
      return false;
    }

    return false;
  }

  /**
   * Detect error handling patterns
   */
  hasErrorHandling(code: string): boolean {
    if (!code) {
      return false;
    }

    // Check for try-catch blocks
    if (this.tryCatchPattern.test(code)) {
      return true;
    }

    // Check for error checking conditionals
    if (this.errorCheckPattern.test(code)) {
      return true;
    }

    // Check for throw/raise keywords
    if (this.throwRaisePattern.test(code)) {
      return true;
    }

    return false;
  }

  /**
   * Detect documentation/comments
   */
  hasDocumentation(code: string): boolean {
    if (!code) {
      return false;
    }

    // Check for single-line comments
    if (this.singleLineCommentPattern.test(code)) {
      return true;
    }

    // Check for multi-line comments
    if (this.multiLineCommentPattern.test(code)) {
      return true;
    }

    // Check for docstring patterns
    if (this.docstringPattern.test(code)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate validation weight multiplier
   */
  private calculateWeight(validation: {
    hasBalancedBrackets: boolean;
    hasSyntaxErrors: boolean;
    hasErrorHandling: boolean;
    hasDocumentation: boolean;
    isCriticalError: boolean;
  }): number {
    // Critical errors get zero weight
    if (validation.isCriticalError) {
      return 0.0;
    }

    let weight = 1.0;

    // Apply penalties
    if (!validation.hasBalancedBrackets) {
      weight *= 0.3; // Unbalanced brackets penalty
    }

    if (validation.hasSyntaxErrors) {
      weight *= 0.5; // Syntax errors penalty
    }

    // Apply bonuses
    if (validation.hasErrorHandling) {
      weight *= 1.2; // Error handling bonus
    }

    if (validation.hasDocumentation) {
      weight *= 1.1; // Documentation bonus
    }

    // Ensure weight is within bounds
    weight = Math.max(0.1, Math.min(2.0, weight));

    return weight;
  }
}

