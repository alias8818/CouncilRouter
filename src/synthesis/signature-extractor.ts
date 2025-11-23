/**
 * Function Signature Extraction Module
 * Extracts and compares function signatures from code
 */

export interface FunctionSignature {
  name: string;
  parameters: string[];
  returnType?: string;
}

/**
 * Signature Extractor
 * Extracts function signatures from code and compares them
 */
export class SignatureExtractor {
  // Regex patterns for function signature extraction
  private readonly signaturePatterns: Record<string, RegExp> = {
    javascript: /(?:function|const|let|var)\s+(\w+)\s*=?\s*(?:async\s*)?\(([^)]*)\)/g,
    typescript: /(?:function|const|let|var)\s+(\w+)\s*=?\s*(?:async\s*)?\(([^)]*)\)(?:\s*:\s*(\w+))?/g,
    python: /def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\w+))?/g,
    java: /(?:public|private|protected)?\s*(?:static)?\s*(\w+)\s+(\w+)\s*\(([^)]*)\)/g,
    csharp: /(?:public|private|protected)?\s*(?:static)?\s*(?:async)?\s*(\w+)\s+(\w+)\s*\(([^)]*)\)/g
  };

  /**
   * Extract function signatures from code
   */
  extractFunctionSignatures(code: string): FunctionSignature[] {
    if (!code) {
      return [];
    }

    const signatures: FunctionSignature[] = [];

    // Try each language pattern in order (more specific first)
    // Order matters: TypeScript before JavaScript, Java/C# before others
    const languageOrder = ['typescript', 'java', 'csharp', 'python', 'javascript'];

    for (const lang of languageOrder) {
      const pattern = this.signaturePatterns[lang];
      if (!pattern) {continue;}

      // Reset regex lastIndex to ensure fresh matching
      pattern.lastIndex = 0;
      const matches = Array.from(code.matchAll(pattern));

      for (const match of matches) {
        try {
          let name: string;
          let parameters: string[];
          let returnType: string | undefined;

          if (lang === 'java' || lang === 'csharp') {
            // Java/C# format: returnType methodName(params)
            returnType = match[1];
            name = match[2];
            parameters = this.parseParameters(match[3] || '', lang);
          } else {
            // JavaScript/TypeScript/Python format: name(params): returnType?
            name = match[1];
            parameters = this.parseParameters(match[2] || '', lang);
            returnType = match[3];
          }

          if (name) {
            // Filter out invalid return types
            if (returnType && ['function', 'def', 'class', 'interface'].includes(returnType)) {
              returnType = undefined;
            }

            // Find existing signature with same name
            const existingIndex = signatures.findIndex(s => s.name === name);

            if (existingIndex === -1) {
              // New signature - only add if it has parameters or is meaningful
              if (parameters.length > 0 || !returnType) {
                signatures.push({
                  name,
                  parameters,
                  returnType
                });
              }
            } else {
              // Prefer signature with better characteristics
              const existing = signatures[existingIndex];
              const typeKeywords = ['number', 'string', 'boolean', 'int', 'float', 'double', 'void', 'any', 'object', 'Array'];
              const existingHasTypes = existing.parameters.some(p => typeKeywords.includes(p));
              const currentHasTypes = parameters.some(p => typeKeywords.includes(p));

              // Prefer: non-empty params > empty params, no types > has types, has return type > no return type
              const shouldReplace =
                (parameters.length > 0 && existing.parameters.length === 0) ||
                (parameters.length === existing.parameters.length && !currentHasTypes && existingHasTypes) ||
                (parameters.length === existing.parameters.length && returnType && !existing.returnType);

              if (shouldReplace) {
                signatures[existingIndex] = {
                  name,
                  parameters,
                  returnType: returnType || existing.returnType
                };
              }
            }
          }
        } catch (_error) {
          // Skip malformed signatures
          continue;
        }
      }
    }

    return signatures;
  }

  /**
   * Parse parameter string into array of parameter names
   */
  private parseParameters(paramString: string, language?: string): string[] {
    if (!paramString || paramString.trim().length === 0) {
      return [];
    }

    // Split by comma and extract parameter names
    return paramString
      .split(',')
      .map(param => {
        const cleaned = param.trim();

        if (language === 'java' || language === 'csharp') {
          // Java/C# format: "int x" or "String name" -> extract "x" or "name"
          // Pattern: type name (name comes after type)
          const javaMatch = cleaned.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*$/);
          if (javaMatch) {
            const name = javaMatch[1];
            // Filter out type keywords
            if (name !== 'int' && name !== 'String' && name !== 'string' &&
                name !== 'boolean' && name !== 'double' && name !== 'float' &&
                name !== 'void' && name !== 'long' && name !== 'short' &&
                name !== 'byte' && name !== 'char') {
              return name;
            }
          }
          return '';
        } else {
          // JavaScript/TypeScript/Python format: "x: number", "x = 5", "x", etc.
          // Always extract the first identifier as the parameter name
          // This handles: "x", "x: number", "x = 5", "x: int", etc.
          const nameMatch = cleaned.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
          if (nameMatch) {
            const name = nameMatch[1];
            // Filter out common type keywords that might be mistaken for parameter names
            const typeKeywords = ['number', 'string', 'boolean', 'int', 'float', 'double', 'void', 'any', 'object', 'Array'];
            if (!typeKeywords.includes(name)) {
              return name;
            }
          }
          return '';
        }
      })
      .filter(name => name.length > 0);
  }

  /**
   * Compare two function signatures
   * Returns similarity score (0.0-1.0)
   */
  compareSignatures(sig1: FunctionSignature, sig2: FunctionSignature): number {
    // Exact match
    if (this.signaturesEqual(sig1, sig2)) {
      return 1.0;
    }

    // Check function name match
    if (sig1.name !== sig2.name) {
      return 0.0; // Different function names = different functions
    }

    // Same name, check parameters
    const paramCount1 = sig1.parameters.length;
    const paramCount2 = sig2.parameters.length;

    if (paramCount1 === paramCount2) {
      // Same parameter count - check if names differ only
      const paramNamesMatch = this.arraysEqual(sig1.parameters, sig2.parameters);

      if (paramNamesMatch) {
        // Check return type
        if (sig1.returnType === sig2.returnType) {
          return 1.0; // Exact match
        }
        return 0.9; // Same params, different return type
      } else {
        // Same count, different names
        return 0.8; // Parameter name variation tolerance
      }
    } else {
      // Different parameter counts - calculate overlap
      const overlap = this.calculateParameterOverlap(sig1.parameters, sig2.parameters);
      const maxParams = Math.max(paramCount1, paramCount2);
      return overlap / maxParams;
    }
  }

  /**
   * Check if two signatures are exactly equal
   */
  private signaturesEqual(sig1: FunctionSignature, sig2: FunctionSignature): boolean {
    return (
      sig1.name === sig2.name &&
      this.arraysEqual(sig1.parameters, sig2.parameters) &&
      sig1.returnType === sig2.returnType
    );
  }

  /**
   * Check if two arrays are equal (order matters)
   */
  private arraysEqual(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) {
      return false;
    }
    return arr1.every((val, idx) => val === arr2[idx]);
  }

  /**
   * Calculate parameter overlap between two parameter lists
   */
  private calculateParameterOverlap(params1: string[], params2: string[]): number {
    const set1 = new Set(params1);
    const set2 = new Set(params2);

    let overlap = 0;
    set1.forEach(param => {
      if (set2.has(param)) {
        overlap++;
      }
    });

    return overlap;
  }

  /**
   * Normalize signature (whitespace, formatting)
   */
  normalizeSignature(sig: FunctionSignature): FunctionSignature {
    return {
      name: sig.name.trim(),
      parameters: sig.parameters.map(p => p.trim()).filter(p => p.length > 0),
      returnType: sig.returnType?.trim()
    };
  }
}

