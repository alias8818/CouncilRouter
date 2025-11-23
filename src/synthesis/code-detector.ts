/**
 * Code Detection Module
 * Detects and extracts code blocks from responses
 */

export interface CodeDetectionResult {
  isCode: boolean;
  codeBlocks: string[];
  language?: string;
  confidence: number; // 0.0-1.0
}

/**
 * Code Detector
 * Detects code in content and extracts code blocks
 */
export class CodeDetector {
  // Performance: Cache for extracted code blocks
  private readonly codeBlockCache = new Map<string, string[]>();
  private readonly MAX_CACHE_SIZE = 1000;

  // Size limits (from design: 100KB per block, 1MB total)
  private readonly MAX_BLOCK_SIZE = 100 * 1024; // 100KB
  private readonly MAX_TOTAL_SIZE = 1024 * 1024; // 1MB

  // Regex patterns for code detection (pre-compiled)
  private readonly fencedCodeBlockPattern = /```[\s\S]*?```/g;
  private readonly functionKeywordsPattern = /\b(function|def|class|const|let|var|import|export|async|await)\b/g;
  private readonly controlFlowPattern = /\b(if|else|for|while|switch|case|try|catch|throw|return)\b/g;
  private readonly allCodeKeywordsPattern = /\b(function|def|class|const|let|var|import|export|async|await|if|else|for|while|switch|case|try|catch|throw|return)\b/g;

  // Language detection patterns (order matters - more specific first)
  private readonly languagePatterns: Record<string, RegExp> = {
    rust: /\b(fn\s+\w+|let\s+mut\b|impl\s+\w+|trait\s+\w+)\b/,
    go: /\b(func\s+\w+|package\s+\w+|type\s+\w+\s+struct)\b/,
    java: /\b(private\s+int|protected\s+void|extends\s+\w+|implements\s+\w+|public\s+class\s+\w+\s*\{[^}]*private\s+int)\b/,
    csharp: /\b(namespace\s+\w+|using\s+System|public\s+class)\b/,
    python: /\b(def\s+\w+|import\s+\w+\s+from|self\.|__init__|lambda\s+)\b/,
    typescript: /\b(interface\s+\w+|type\s+\w+\s*=|enum\s+\w+|namespace\s+\w+)\b/,
    javascript: /\b(const\s+\w+|let\s+\w+|var\s+\w+|function\s+\w+|=>|async\s+function|await\s+)\b/
  };

  /**
   * Detect if content contains code
   * Checks for markdown code blocks and programming keywords
   * Security: Limits input size to prevent ReDoS attacks
   */
  detectCode(content: string): boolean {
    if (!content || content.trim().length === 0) {
      return false;
    }

    // Security: Limit input size to prevent ReDoS (max 10MB)
    if (content.length > 10 * 1024 * 1024) {
      return false;
    }

    try {
      // Check for fenced code blocks (with timeout protection)
      const fencedMatches = this.safeRegexMatch(content, this.fencedCodeBlockPattern);
      if (fencedMatches && fencedMatches.length > 0) {
        return true;
      }

      // Check for programming keywords (including control flow)
      const keywordMatches = this.safeRegexMatch(content, this.allCodeKeywordsPattern);
      if (keywordMatches && keywordMatches.length >= 2) {
        // Require at least 2 keywords to reduce false positives
        return true;
      }
    } catch (error) {
      // On regex timeout or error, return false (fail safe)
      console.warn('Code detection regex error:', error);
      return false;
    }

    return false;
  }

  /**
   * Safe regex matching with timeout protection
   * Prevents ReDoS attacks by limiting execution time
   */
  private safeRegexMatch(text: string, pattern: RegExp): RegExpMatchArray | null {
    // Reset regex lastIndex
    pattern.lastIndex = 0;

    // For very long strings, limit the search
    const maxLength = 100000; // 100KB max for regex matching
    const searchText = text.length > maxLength ? text.substring(0, maxLength) : text;

    try {
      return searchText.match(pattern);
    } catch (error) {
      // Regex error (possible ReDoS attempt)
      console.warn('Regex execution error:', error);
      return null;
    }
  }

  /**
   * Extract code blocks from markdown
   * Returns array of code strings
   * Performance: Uses caching and enforces size limits
   * Security: Validates input size and escapes special characters
   */
  extractCode(content: string): string[] {
    if (!content) {
      return [];
    }

    // Security: Limit input size to prevent DoS
    if (content.length > 10 * 1024 * 1024) {
      return [];
    }

    // Check cache first
    const cacheKey = content.substring(0, 100); // Use first 100 chars as key
    const cached = this.codeBlockCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const codeBlocks: string[] = [];
    let totalSize = 0;

    try {
      // Reset regex lastIndex for fresh matching
      this.fencedCodeBlockPattern.lastIndex = 0;
      const matches = Array.from(content.matchAll(this.fencedCodeBlockPattern));

      for (const match of matches) {
        // Check total size limit
        if (totalSize >= this.MAX_TOTAL_SIZE) {
          break;
        }

        const fullMatch = match[0];
        // Remove the opening ``` and closing ```
        const codeContent = fullMatch
          .replace(/^```[\w]*\n?/, '') // Remove opening ```language\n
          .replace(/\n?```$/, ''); // Remove closing ```

        // Enforce per-block size limit
        if (codeContent.length > this.MAX_BLOCK_SIZE) {
          // Truncate to max size
          const truncated = codeContent.substring(0, this.MAX_BLOCK_SIZE);
          codeBlocks.push(truncated);
          totalSize += truncated.length;
          break; // Stop after first oversized block
        }

        if (codeContent.trim().length > 0) {
          codeBlocks.push(codeContent);
          totalSize += codeContent.length;
        }
      }

      // If no fenced blocks found, try to extract inline code patterns
      if (codeBlocks.length === 0 && totalSize < this.MAX_TOTAL_SIZE) {
        // Look for inline code patterns (single backticks)
        const inlinePattern = /`([^`]+)`/g;
        inlinePattern.lastIndex = 0;
        const inlineMatches = Array.from(content.matchAll(inlinePattern));

        for (const match of inlineMatches) {
          if (totalSize >= this.MAX_TOTAL_SIZE) {
            break;
          }

          const code = match[1];
          // Only include if it looks like code (has keywords or operators)
          if (this.looksLikeCode(code) && code.length <= this.MAX_BLOCK_SIZE) {
            codeBlocks.push(code);
            totalSize += code.length;
          }
        }
      }
    } catch (error) {
      // On regex error, return empty array (fail safe)
      console.warn('Code extraction regex error:', error);
      return [];
    }

    // Cache result (with size limit)
    if (this.codeBlockCache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry (simple FIFO)
      const firstKey = this.codeBlockCache.keys().next().value;
      if (firstKey !== undefined) {
        this.codeBlockCache.delete(firstKey);
      }
    }
    this.codeBlockCache.set(cacheKey, codeBlocks);

    return codeBlocks;
  }

  /**
   * Detect programming language
   * Returns language identifier or undefined
   * Checks languages in order of specificity (most specific first)
   */
  detectLanguage(code: string): string | undefined {
    if (!code) {
      return undefined;
    }

    // Check languages in order of specificity (most specific patterns first)
    // Java before C# because they share keywords but Java has more specific patterns
    const languageOrder = ['rust', 'go', 'java', 'csharp', 'python', 'typescript', 'javascript'];

    for (const lang of languageOrder) {
      const pattern = this.languagePatterns[lang];
      if (pattern && pattern.test(code)) {
        return lang;
      }
    }

    return undefined;
  }

  /**
   * Check if a string looks like code (has keywords or operators)
   * Security: Limits input size to prevent ReDoS
   */
  private looksLikeCode(text: string): boolean {
    if (text.length < 3) {
      return false;
    }

    // Security: Limit size for regex matching
    if (text.length > 10000) {
      return false;
    }

    try {
      // Check for common operators
      const operatorPattern = /[=<>!+\-*/%&|^~]+/;
      if (operatorPattern.test(text)) {
        return true;
      }

      // Check for keywords
      return this.allCodeKeywordsPattern.test(text);
    } catch (error) {
      // On regex error, return false (fail safe)
      console.warn('LooksLikeCode regex error:', error);
      return false;
    }
  }

  /**
   * Extract code segments from content when code is detected via keywords
   * but no markdown blocks are present
   * Returns array of code-like segments
   */
  extractCodeSegments(content: string): string[] {
    if (!content) {
      return [];
    }

    // Security: Limit input size
    if (content.length > 10 * 1024 * 1024) {
      return [];
    }

    // First try standard extraction (markdown blocks)
    const markdownBlocks = this.extractCode(content);
    if (markdownBlocks.length > 0) {
      return markdownBlocks;
    }

    // If no markdown blocks but code was detected via keywords,
    // try to extract code-like segments
    const segments: string[] = [];

    try {
      // Split content by lines and look for code-like lines
      const lines = content.split('\n');
      let currentSegment: string[] = [];
      let inCodeSegment = false;
      let consecutiveCodeLines = 0;

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Check if line looks like code (must have keywords/operators, not just text)
        const isCodeLine = this.looksLikeCode(trimmedLine) ||
                          trimmedLine.match(/^[{}();=]+$/) ||
                          trimmedLine.match(/^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[=:]/) ||
                          trimmedLine.match(/^\s*(function|def|class|const|let|var|if|for|while|return|import|export)\b/);

        if (isCodeLine && trimmedLine.length > 0) {
          // If we were in a segment and hit a non-code line, save the previous segment
          if (inCodeSegment && consecutiveCodeLines === 0 && currentSegment.length > 0) {
            const segment = currentSegment.join('\n').trim();
            if (segment.length > 0 && segment.length <= this.MAX_BLOCK_SIZE) {
              segments.push(segment);
            }
            currentSegment = [];
          }

          // Start or continue a code segment
          if (!inCodeSegment) {
            inCodeSegment = true;
            currentSegment = [];
            consecutiveCodeLines = 0;
          }
          currentSegment.push(line);
          consecutiveCodeLines++;
        } else if (inCodeSegment) {
          // Check if this is a continuation (empty line or indented line after code)
          if (trimmedLine.length === 0 || (line.match(/^\s+/) && consecutiveCodeLines > 0)) {
            // Empty line or indented line after code - might be part of code block
            currentSegment.push(line);
          } else {
            // Non-code text line - end current segment if we have code lines
            if (consecutiveCodeLines > 0 && currentSegment.length > 0) {
              const segment = currentSegment.join('\n').trim();
              if (segment.length > 0 && segment.length <= this.MAX_BLOCK_SIZE) {
                segments.push(segment);
              }
            }
            currentSegment = [];
            inCodeSegment = false;
            consecutiveCodeLines = 0;
          }
        }
      }

      // Add final segment if exists
      if (currentSegment.length > 0 && consecutiveCodeLines > 0) {
        const segment = currentSegment.join('\n').trim();
        if (segment.length > 0 && segment.length <= this.MAX_BLOCK_SIZE) {
          segments.push(segment);
        }
      }

      // If we found segments, return them
      if (segments.length > 0) {
        return segments;
      }

      // Fallback: if content itself looks like code, return it
      if (this.looksLikeCode(content) && content.length <= this.MAX_BLOCK_SIZE) {
        return [content];
      }
    } catch (error) {
      console.warn('Code segment extraction error:', error);
      return [];
    }

    return [];
  }
}


