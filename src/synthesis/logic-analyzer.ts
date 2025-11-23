/**
 * Logic Structure Analysis Module
 * Extracts and compares logic structures from code
 */

export interface LogicStructure {
  controlFlowKeywords: string[]; // if, for, while, etc.
  nestingDepth: number;
  loopCount: number;
  conditionalCount: number;
}

/**
 * Logic Analyzer
 * Extracts logic structure from code and compares structures
 */
export class LogicAnalyzer {
  // Control flow keywords
  private readonly controlFlowKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch', 'finally'];

  // Loop keywords
  private readonly loopKeywords = ['for', 'while', 'do'];

  // Conditional keywords
  private readonly conditionalKeywords = ['if', 'else', 'switch', 'case', 'try', 'catch'];

  /**
   * Extract logic structure from code
   */
  extractLogicStructure(code: string): LogicStructure {
    if (!code) {
      return {
        controlFlowKeywords: [],
        nestingDepth: 0,
        loopCount: 0,
        conditionalCount: 0
      };
    }

    const controlFlowKeywords: string[] = [];
    let nestingDepth = 0;
    let maxNestingDepth = 0;
    let loopCount = 0;
    let conditionalCount = 0;

    // Track nesting by counting braces
    const lines = code.split('\n');
    for (const line of lines) {
      // Count opening and closing braces to determine nesting
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;

      nestingDepth += openBraces - closeBraces;
      maxNestingDepth = Math.max(maxNestingDepth, nestingDepth);

      // Detect control flow keywords
      for (const keyword of this.controlFlowKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        const matches = line.match(regex);
        if (matches) {
          controlFlowKeywords.push(...matches);
        }
      }

      // Count loops
      for (const keyword of this.loopKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        const matches = line.match(regex);
        if (matches) {
          loopCount += matches.length;
        }
      }

      // Count conditionals
      for (const keyword of this.conditionalKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        const matches = line.match(regex);
        if (matches) {
          conditionalCount += matches.length;
        }
      }
    }

    return {
      controlFlowKeywords,
      nestingDepth: maxNestingDepth,
      loopCount,
      conditionalCount
    };
  }

  /**
   * Compare two logic structures
   * Returns similarity score (0.0-1.0)
   */
  compareLogicStructure(struct1: LogicStructure, struct2: LogicStructure): number {
    let similarity = 0.0;
    let weights = 0.0;

    // Compare control flow patterns (weight: 0.4)
    const controlFlowSimilarity = this.compareControlFlowPatterns(
      struct1.controlFlowKeywords,
      struct2.controlFlowKeywords
    );
    similarity += controlFlowSimilarity * 0.4;
    weights += 0.4;

    // Compare nesting depth (weight: 0.3)
    const nestingSimilarity = this.compareNestingDepth(struct1.nestingDepth, struct2.nestingDepth);
    similarity += nestingSimilarity * 0.3;
    weights += 0.3;

    // Compare loop counts (weight: 0.15)
    const loopSimilarity = this.compareCounts(struct1.loopCount, struct2.loopCount);
    similarity += loopSimilarity * 0.15;
    weights += 0.15;

    // Compare conditional counts (weight: 0.15)
    const conditionalSimilarity = this.compareCounts(struct1.conditionalCount, struct2.conditionalCount);
    similarity += conditionalSimilarity * 0.15;
    weights += 0.15;

    return weights > 0 ? similarity / weights : 0.0;
  }

  /**
   * Compare control flow patterns
   */
  private compareControlFlowPatterns(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 && keywords2.length === 0) {
      return 1.0;
    }

    if (keywords1.length === 0 || keywords2.length === 0) {
      return 0.0;
    }

    // Count occurrences of each keyword
    const count1 = this.countKeywords(keywords1);
    const count2 = this.countKeywords(keywords2);

    // Calculate similarity based on keyword overlap
    const allKeywords = new Set([...Object.keys(count1), ...Object.keys(count2)]);
    let matches = 0;
    let total = 0;

    for (const keyword of allKeywords) {
      const c1 = count1[keyword] || 0;
      const c2 = count2[keyword] || 0;
      const max = Math.max(c1, c2);
      const min = Math.min(c1, c2);

      total += max;
      matches += min;
    }

    return total > 0 ? matches / total : 0.0;
  }

  /**
   * Count keyword occurrences
   */
  private countKeywords(keywords: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const keyword of keywords) {
      counts[keyword] = (counts[keyword] || 0) + 1;
    }
    return counts;
  }

  /**
   * Compare nesting depth
   */
  private compareNestingDepth(depth1: number, depth2: number): number {
    if (depth1 === depth2) {
      return 1.0;
    }

    const max = Math.max(depth1, depth2);
    const min = Math.min(depth1, depth2);

    if (max === 0) {
      return 1.0;
    }

    // Similarity decreases as difference increases
    return min / max;
  }

  /**
   * Compare counts (loops, conditionals)
   */
  private compareCounts(count1: number, count2: number): number {
    if (count1 === count2) {
      return 1.0;
    }

    const max = Math.max(count1, count2);
    const min = Math.min(count1, count2);

    if (max === 0) {
      return 1.0;
    }

    return min / max;
  }

  /**
   * Extract and compare variable names
   * Returns similarity score (0.0-1.0)
   */
  compareVariableNames(code1: string, code2: string): number {
    const vars1 = this.extractVariableNames(code1);
    const vars2 = this.extractVariableNames(code2);

    if (vars1.length === 0 && vars2.length === 0) {
      return 1.0;
    }

    if (vars1.length === 0 || vars2.length === 0) {
      return 0.0;
    }

    // Normalize variable names
    const normalized1 = vars1.map(v => this.normalizeVariableName(v));
    const normalized2 = vars2.map(v => this.normalizeVariableName(v));

    // Calculate similarity using set intersection
    const set1 = new Set(normalized1);
    const set2 = new Set(normalized2);

    let matches = 0;
    set1.forEach(v => {
      if (set2.has(v)) {
        matches++;
      }
    });

    const total = Math.max(set1.size, set2.size);
    return total > 0 ? matches / total : 0.0;
  }

  /**
   * Extract variable names from code
   */
  private extractVariableNames(code: string): string[] {
    const variables: string[] = [];

    // Pattern for variable declarations: const/let/var name = ...
    const declarationPattern = /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = declarationPattern.exec(code)) !== null) {
      variables.push(match[1]);
    }

    // Pattern for assignments: name = ...
    const assignmentPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
    while ((match = assignmentPattern.exec(code)) !== null) {
      const varName = match[1];
      // Skip keywords
      if (!this.isKeyword(varName)) {
        variables.push(varName);
      }
    }

    return variables;
  }

  /**
   * Normalize variable name (camelCase, snake_case)
   */
  private normalizeVariableName(name: string): string {
    // Convert to lowercase for comparison
    let normalized = name.toLowerCase();

    // Remove common prefixes/suffixes
    normalized = normalized.replace(/^(is|has|can|should|get|set|_)/, '');
    normalized = normalized.replace(/(_|$)/g, '');

    return normalized;
  }

  /**
   * Check if a string is a JavaScript keyword
   */
  private isKeyword(word: string): boolean {
    const keywords = [
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'function', 'const', 'let', 'var', 'class', 'interface', 'type',
      'try', 'catch', 'finally', 'throw', 'async', 'await', 'import', 'export'
    ];
    return keywords.includes(word.toLowerCase());
  }
}

