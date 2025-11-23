/**
 * Code Similarity Calculator
 * Calculates overall code similarity based on functional equivalence
 */

import { SignatureExtractor, FunctionSignature } from './signature-extractor';
import { LogicAnalyzer, LogicStructure } from './logic-analyzer';

export interface CodeSimilarityResult {
  signatureSimilarity: number; // 0.0-1.0
  logicSimilarity: number; // 0.0-1.0
  variableSimilarity: number; // 0.0-1.0
  overallSimilarity: number; // weighted average
}

/**
 * Code Similarity Calculator
 * Calculates similarity between two code snippets
 */
export class CodeSimilarityCalculator {
  private signatureExtractor: SignatureExtractor;
  private logicAnalyzer: LogicAnalyzer;

  // Performance: Cache for similarity calculations
  private readonly similarityCache = new Map<string, number>();
  private readonly MAX_CACHE_SIZE = 500;

  // Performance: Early termination threshold
  private readonly EARLY_TERMINATION_THRESHOLD = 0.95; // Stop if similarity is very high

  constructor() {
    this.signatureExtractor = new SignatureExtractor();
    this.logicAnalyzer = new LogicAnalyzer();
  }

  /**
   * Calculate overall code similarity
   * Weights: signature 70%, logic 20%, variables 10%
   * Performance: Uses caching and early termination
   */
  calculateSimilarity(code1: string, code2: string): number {
    if (!code1 || !code2) {
      return 0.0;
    }

    // Check cache (use hash of both codes as key)
    const cacheKey = `${code1.substring(0, 50)}|${code2.substring(0, 50)}`;
    const cached = this.similarityCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    if (code1.trim() === code2.trim()) {
      this.cacheResult(cacheKey, 1.0);
      return 1.0;
    }

    // Extract signatures
    const signatures1 = this.signatureExtractor.extractFunctionSignatures(code1);
    const signatures2 = this.signatureExtractor.extractFunctionSignatures(code2);

    // Calculate signature similarity
    const signatureSimilarity = this.calculateSignatureSimilarity(signatures1, signatures2);

    // Early termination: if signature similarity is very high, we can skip other calculations
    if (signatureSimilarity >= this.EARLY_TERMINATION_THRESHOLD) {
      const result = Math.max(0.0, Math.min(1.0, signatureSimilarity * 0.7 + 0.3)); // Assume max for other components
      this.cacheResult(cacheKey, result);
      return result;
    }

    // Extract logic structures
    const logic1 = this.logicAnalyzer.extractLogicStructure(code1);
    const logic2 = this.logicAnalyzer.extractLogicStructure(code2);

    // Calculate logic similarity
    const logicSimilarity = this.logicAnalyzer.compareLogicStructure(logic1, logic2);

    // Early termination: if combined similarity is very high
    const partialSimilarity = signatureSimilarity * 0.7 + logicSimilarity * 0.2;
    if (partialSimilarity >= this.EARLY_TERMINATION_THRESHOLD) {
      const result = Math.max(0.0, Math.min(1.0, partialSimilarity + 0.1)); // Assume max for variables
      this.cacheResult(cacheKey, result);
      return result;
    }

    // Calculate variable similarity
    const variableSimilarity = this.logicAnalyzer.compareVariableNames(code1, code2);

    // Weighted average: signature 70%, logic 20%, variables 10%
    const overallSimilarity =
      signatureSimilarity * 0.7 +
      logicSimilarity * 0.2 +
      variableSimilarity * 0.1;

    const result = Math.max(0.0, Math.min(1.0, overallSimilarity));
    this.cacheResult(cacheKey, result);
    return result;
  }

  /**
   * Cache similarity result with size limit
   */
  private cacheResult(key: string, value: number): void {
    if (this.similarityCache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry (simple FIFO)
      const firstKey = this.similarityCache.keys().next().value;
      if (firstKey !== undefined) {
        this.similarityCache.delete(firstKey);
      }
    }
    this.similarityCache.set(key, value);
  }

  /**
   * Calculate signature similarity between two sets of signatures
   */
  private calculateSignatureSimilarity(
    signatures1: FunctionSignature[],
    signatures2: FunctionSignature[]
  ): number {
    if (signatures1.length === 0 && signatures2.length === 0) {
      // No signatures found - use logic similarity only
      return 0.5; // Neutral score
    }

    if (signatures1.length === 0 || signatures2.length === 0) {
      return 0.0;
    }

    // Find best matches for each signature
    const used2 = new Set<number>();
    let totalSimilarity = 0.0;
    let matches = 0;

    for (const sig1 of signatures1) {
      let bestMatch = -1;
      let bestSimilarity = 0.0;

      for (let i = 0; i < signatures2.length; i++) {
        if (used2.has(i)) {continue;}

        const similarity = this.signatureExtractor.compareSignatures(sig1, signatures2[i]);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = i;
        }
      }

      if (bestMatch >= 0) {
        totalSimilarity += bestSimilarity;
        used2.add(bestMatch);
        matches++;
      }
    }

    // Average similarity, penalize unmatched signatures
    const avgSimilarity = matches > 0 ? totalSimilarity / matches : 0.0;
    const matchRatio = matches / Math.max(signatures1.length, signatures2.length);

    return avgSimilarity * matchRatio;
  }

  /**
   * Extract function signatures from code
   */
  extractFunctionSignatures(code: string): FunctionSignature[] {
    return this.signatureExtractor.extractFunctionSignatures(code);
  }

  /**
   * Compare two function signatures
   */
  compareSignatures(sig1: FunctionSignature, sig2: FunctionSignature): number {
    return this.signatureExtractor.compareSignatures(sig1, sig2);
  }

  /**
   * Extract logic structure from code
   */
  extractLogicStructure(code: string): LogicStructure {
    return this.logicAnalyzer.extractLogicStructure(code);
  }

  /**
   * Compare two logic structures
   */
  compareLogicStructure(struct1: LogicStructure, struct2: LogicStructure): number {
    return this.logicAnalyzer.compareLogicStructure(struct1, struct2);
  }

  /**
   * Compare variable names
   */
  compareVariableNames(code1: string, code2: string): number {
    return this.logicAnalyzer.compareVariableNames(code1, code2);
  }
}

