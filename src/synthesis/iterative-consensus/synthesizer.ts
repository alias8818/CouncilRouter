/**
 * Iterative Consensus Synthesizer
 * Orchestrates multi-round negotiations until consensus is achieved
 */

import { IIterativeConsensusSynthesizer } from '../../interfaces/IIterativeConsensusSynthesizer';
import { IEmbeddingService } from '../../interfaces/IEmbeddingService';
import { INegotiationPromptBuilder } from '../../interfaces/INegotiationPromptBuilder';
import { IConvergenceDetector } from '../../interfaces/IConvergenceDetector';
import { IExampleRepository } from '../../interfaces/IExampleRepository';
import { IProviderPool } from '../../interfaces/IProviderPool';
import { IConfigurationManager } from '../../interfaces/IConfigurationManager';
import { ISynthesisEngine } from '../../interfaces/ISynthesisEngine';
import { IEventLogger } from '../../interfaces/IEventLogger';
import { RequestDeduplicator } from '../../orchestration/request-deduplicator';
import {
  UserRequest,
  DeliberationThread,
  ConsensusDecision,
  IterativeConsensusConfig,
  NegotiationResponse,
  SimilarityResult,
  Exchange,
  CouncilMember,
  SynthesisStrategy,
  PromptTemplate,
  Agreement
} from '../../types/core';
import { randomUUID } from 'crypto';
import {
  updateConsensusMetrics,
  updateRoundDuration,
  updateEmbeddingFailure
} from '../../monitoring/metrics';

export class IterativeConsensusSynthesizer
implements IIterativeConsensusSynthesizer
{
  private deduplicator: RequestDeduplicator;

  constructor(
    private embeddingService: IEmbeddingService,
    private promptBuilder: INegotiationPromptBuilder,
    private convergenceDetector: IConvergenceDetector,
    private exampleRepository: IExampleRepository,
    private providerPool: IProviderPool,
    private configManager: IConfigurationManager,
    private synthesisEngine: ISynthesisEngine,
    private eventLogger?: IEventLogger
  ) {
    this.deduplicator = new RequestDeduplicator();
  }

  /**
   * Execute iterative consensus synthesis
   */
  async synthesize(
    request: UserRequest,
    thread: DeliberationThread,
    config: IterativeConsensusConfig
  ): Promise<ConsensusDecision> {
    const query = request.query;
    const similarityProgression: number[] = [];
    let totalRounds = 0;
    let consensusAchieved = false;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;
    let deadlockDetected = false;
    let humanEscalationTriggered = false;
    let costSavings:
      | { tokensAvoided: number; estimatedCostSaved: number }
      | undefined;

    // Track start time for timeout acceleration (Requirement 9.5)
    const startTime = Date.now();
    // Estimate global timeout as 1.5x the expected total time for all rounds
    const estimatedGlobalTimeoutMs =
      config.perRoundTimeout * config.maxRounds * 1000 * 1.5;
    let effectiveMaxRounds = config.maxRounds;

    // Extract Round 0 responses
    const round0 = thread.rounds.find((r) => r.roundNumber === 0);
    if (!round0 || !round0.exchanges || round0.exchanges.length === 0) {
      throw new Error(
        'Cannot synthesize consensus: no initial responses (Round 0) available'
      );
    }

    // Convert exchanges to negotiation responses
    let currentResponses: NegotiationResponse[] = round0.exchanges.map(
      (exchange) => ({
        councilMemberId: exchange.councilMemberId,
        content:
          typeof exchange.content === 'string'
            ? exchange.content
            : String(exchange.content || ''),
        roundNumber: 0,
        timestamp: new Date(),
        tokenCount: exchange.tokenUsage.totalTokens
      })
    );

    // Track original member count for proportional threshold adjustment
    const originalMemberCount = currentResponses.length;

    // Check for immediate consensus (all identical responses)
    if (this.allResponsesIdentical(currentResponses)) {
      const finalResponse = this.selectFinalResponse(currentResponses);
      return this.buildConsensusDecision(finalResponse, request, {
        totalRounds: 0,
        similarityProgression: [1.0],
        consensusAchieved: true,
        fallbackUsed: false,
        deadlockDetected: false,
        humanEscalationTriggered: false,
        qualityScore: 1.0,
        agreementThreshold: config.agreementThreshold
      });
    }

    // Calculate initial similarity
    const initialSimilarity = await this.calculateSimilarity(
      currentResponses,
      config
    );
    similarityProgression.push(initialSimilarity.averageSimilarity);

    // Log Round 0
    if (this.eventLogger) {
      try {
        await this.eventLogger.logNegotiationRound(
          request.id,
          0,
          initialSimilarity
        );
        for (const response of currentResponses) {
          await this.eventLogger.logNegotiationResponse(
            request.id,
            response,
            config.embeddingModel
          );
        }
      } catch (error) {
        console.warn('[IterativeConsensus] Failed to log Round 0:', error);
      }
    }

    // Check for immediate consensus
    // Apply proportional threshold adjustment if members failed in Round 0
    const adjustedThreshold = this.calculateAdjustedThreshold(
      config.agreementThreshold,
      originalMemberCount,
      currentResponses.length
    );

    if (this.isConsensusAchieved(initialSimilarity, adjustedThreshold)) {
      const finalResponse = this.selectFinalResponse(currentResponses);
      return this.buildConsensusDecision(finalResponse, request, {
        totalRounds: 0,
        similarityProgression,
        consensusAchieved: true,
        fallbackUsed: false,
        deadlockDetected: false,
        humanEscalationTriggered: false,
        qualityScore: this.calculateQualityScore(
          initialSimilarity.averageSimilarity,
          0
        ),
        agreementThreshold: adjustedThreshold
      });
    }

    // Enter negotiation loop
    console.error(`[IterativeConsensus] Starting negotiation loop: maxRounds=${effectiveMaxRounds}, threshold=${config.agreementThreshold}, initialSimilarity=${initialSimilarity.averageSimilarity.toFixed(3)}`);

    for (let round = 1; round <= effectiveMaxRounds; round++) {
      totalRounds = round;

      // Check for global timeout acceleration (Requirement 9.5)
      const elapsedMs = Date.now() - startTime;
      const timeRemaining = estimatedGlobalTimeoutMs - elapsedMs;
      const avgRoundTime = elapsedMs / round;

      console.error(`[IterativeConsensus] Round ${round}/${effectiveMaxRounds}: elapsed=${Math.round(elapsedMs/1000)}s, timeRemaining=${Math.round(timeRemaining/1000)}s`);

      if (timeRemaining < avgRoundTime * 2 && effectiveMaxRounds > round) {
        // Less than 2 rounds worth of time remaining - accelerate by reducing max rounds
        const roundsWeCanFit = Math.max(
          1,
          Math.floor(timeRemaining / avgRoundTime)
        );
        effectiveMaxRounds = Math.min(
          effectiveMaxRounds,
          round + roundsWeCanFit
        );
        console.warn(
          `[IterativeConsensus] Global timeout approaching - reducing maxRounds from ${config.maxRounds} to ${effectiveMaxRounds}`
        );
      }

      // Check for early termination
      if (
        config.earlyTerminationEnabled &&
        initialSimilarity.averageSimilarity >= config.earlyTerminationThreshold
      ) {
        const memberIds = currentResponses.map((r) => r.councilMemberId);
        const tokensAvoided = this.estimateTokensAvoided(
          currentResponses.length,
          config.maxRounds - round,
          config,
          memberIds
        );
        const costSavingsCalc = this.calculateCostSavings(
          tokensAvoided,
          config
        );
        costSavings = {
          tokensAvoided: tokensAvoided.total,
          estimatedCostSaved: costSavingsCalc.total
        };

        const finalResponse = this.selectFinalResponse(currentResponses);
        return this.buildConsensusDecision(finalResponse, request, {
          totalRounds: round,
          similarityProgression,
          consensusAchieved: true,
          fallbackUsed: false,
          deadlockDetected: false,
          humanEscalationTriggered: false,
          qualityScore: this.calculateQualityScore(
            initialSimilarity.averageSimilarity,
            round
          ),
          costSavings,
          agreementThreshold: config.agreementThreshold
        });
      }

      // Detect deadlock
      if (round >= 3) {
        deadlockDetected = this.detectDeadlock(similarityProgression);

        if (deadlockDetected && config.humanEscalationEnabled) {
          humanEscalationTriggered = true;
          // In a real implementation, this would trigger escalation
          console.warn(
            `[IterativeConsensus] Deadlock detected at round ${round}, escalation triggered`
          );
        }
      }

      // Execute negotiation round
      try {
        const roundStartTime = Date.now();
        currentResponses = await this.executeNegotiationRound(
          round,
          currentResponses,
          query,
          config
        );
        const roundDuration = (Date.now() - roundStartTime) / 1000;
        updateRoundDuration(round, roundDuration, config.negotiationMode);

        // Recalculate similarity
        const similarityResult = await this.calculateSimilarity(
          currentResponses,
          config
        );
        similarityProgression.push(similarityResult.averageSimilarity);

        // Log negotiation round
        if (this.eventLogger) {
          try {
            const trend = this.convergenceDetector.analyzeTrend(
              similarityProgression
            );
            await this.eventLogger.logNegotiationRound(
              request.id,
              round,
              similarityResult,
              trend.velocity,
              trend.deadlockRisk
            );
            for (const response of currentResponses) {
              await this.eventLogger.logNegotiationResponse(
                request.id,
                response,
                config.embeddingModel
              );
            }
          } catch (error) {
            console.warn(
              `[IterativeConsensus] Failed to log round ${round}:`,
              error
            );
          }
        }

        // Check for consensus with adjusted threshold
        const currentAdjustedThreshold = this.calculateAdjustedThreshold(
          config.agreementThreshold,
          originalMemberCount,
          currentResponses.length
        );

        // Log similarity progress for debugging
        const prevSimilarity = similarityProgression.length > 1
          ? similarityProgression[similarityProgression.length - 2]
          : 0;
        const similarityDelta = similarityResult.averageSimilarity - prevSimilarity;
        console.error(
          `[IterativeConsensus] Round ${round} complete: similarity=${similarityResult.averageSimilarity.toFixed(3)} ` +
          `(${similarityDelta >= 0 ? '+' : ''}${similarityDelta.toFixed(3)}), threshold=${currentAdjustedThreshold.toFixed(3)}, ` +
          `belowThreshold=${similarityResult.belowThresholdPairs.length} pairs`
        );

        if (
          this.isConsensusAchieved(similarityResult, currentAdjustedThreshold)
        ) {
          consensusAchieved = true;
          const finalResponse = this.selectFinalResponse(currentResponses);
          const decision = this.buildConsensusDecision(finalResponse, request, {
            totalRounds: round,
            similarityProgression,
            consensusAchieved: true,
            fallbackUsed: false,
            deadlockDetected,
            humanEscalationTriggered,
            qualityScore: this.calculateQualityScore(
              similarityResult.averageSimilarity,
              round
            ),
            agreementThreshold: currentAdjustedThreshold
          });

          // Log consensus metadata
          if (this.eventLogger) {
            try {
              await this.eventLogger.logConsensusMetadata(request.id, {
                totalRounds: round,
                consensusAchieved: true,
                fallbackUsed: false,
                deadlockDetected,
                humanEscalationTriggered,
                finalSimilarity: similarityResult.averageSimilarity
              });
            } catch (error) {
              console.warn(
                '[IterativeConsensus] Failed to log consensus metadata:',
                error
              );
            }
          }

          // Update metrics
          updateConsensusMetrics({
            consensusAchieved: true,
            totalRounds: round,
            fallbackUsed: false,
            deadlockDetected,
            earlyTerminated: false,
            finalSimilarity: similarityResult.averageSimilarity,
            confidence: similarityResult.averageSimilarity
          });

          return decision;
        }

        // Check for early termination mid-round (parallel mode)
        // Optimization: Check similarity incrementally as responses arrive
        if (
          config.earlyTerminationEnabled &&
          config.negotiationMode === 'parallel' &&
          similarityResult.averageSimilarity >= config.earlyTerminationThreshold
        ) {
          const memberIds = currentResponses.map((r) => r.councilMemberId);
          const tokensAvoided = this.estimateTokensAvoided(
            currentResponses.length,
            config.maxRounds - round,
            config,
            memberIds
          );
          const costSavingsCalc = this.calculateCostSavings(
            tokensAvoided,
            config
          );
          costSavings = {
            tokensAvoided: tokensAvoided.total,
            estimatedCostSaved: costSavingsCalc.total
          };

          const finalResponse = this.selectFinalResponse(currentResponses);
          return this.buildConsensusDecision(finalResponse, request, {
            totalRounds: round,
            similarityProgression,
            consensusAchieved: true,
            fallbackUsed: false,
            deadlockDetected,
            humanEscalationTriggered,
            qualityScore: this.calculateQualityScore(
              similarityResult.averageSimilarity,
              round
            ),
            costSavings,
            agreementThreshold: config.agreementThreshold
          });
        }
      } catch (error) {
        console.error(`[IterativeConsensus] Round ${round} failed: ${error}`);
        // Continue to next round or fallback
      }

      // Check if too few members remain
      if (currentResponses.length < 2) {
        fallbackUsed = true;
        fallbackReason = 'Insufficient active members';
        break;
      }
    }

    // Max rounds reached or insufficient members - invoke fallback
    if (!consensusAchieved) {
      fallbackUsed = true;
      if (!fallbackReason) {
        fallbackReason = `Maximum rounds (${config.maxRounds}) reached without consensus`;
      }

      const finalSim = similarityProgression[similarityProgression.length - 1] || 0;
      console.error(
        `[IterativeConsensus] FALLBACK INVOKED: ${fallbackReason}. ` +
        `finalSimilarity=${finalSim.toFixed(3)}, threshold=${config.agreementThreshold}, ` +
        `totalRounds=${totalRounds}, elapsedTime=${Math.round((Date.now() - startTime) / 1000)}s`
      );

      const fallbackDecision = await this.invokeFallback(
        request,
        thread,
        config,
        currentResponses
      );

      const finalSimilarity =
        similarityProgression[similarityProgression.length - 1] || 0;

      // Log consensus metadata with fallback info
      if (this.eventLogger) {
        try {
          await this.eventLogger.logConsensusMetadata(request.id, {
            totalRounds,
            consensusAchieved: false,
            fallbackUsed: true,
            fallbackReason,
            deadlockDetected,
            humanEscalationTriggered,
            finalSimilarity
          });
        } catch (error) {
          console.warn(
            '[IterativeConsensus] Failed to log fallback metadata:',
            error
          );
        }
      }

      // Merge metadata
      return {
        ...fallbackDecision,
        iterativeConsensusMetadata: {
          totalRounds,
          similarityProgression,
          consensusAchieved: false,
          fallbackUsed: true,
          fallbackReason,
          deadlockDetected,
          humanEscalationTriggered,
          qualityScore: this.calculateQualityScore(
            finalSimilarity,
            totalRounds
          )
        }
      };
    }

    // Should not reach here, but handle gracefully
    const finalResponse = this.selectFinalResponse(currentResponses);
    return this.buildConsensusDecision(finalResponse, request, {
      totalRounds,
      similarityProgression,
      consensusAchieved,
      fallbackUsed,
      fallbackReason,
      deadlockDetected,
      humanEscalationTriggered,
      qualityScore: this.calculateQualityScore(
        similarityProgression[similarityProgression.length - 1] || 0,
        totalRounds
      ),
      agreementThreshold: config.agreementThreshold
    });
  }

  /**
   * Execute a single negotiation round
   */
  async executeNegotiationRound(
    roundNumber: number,
    currentResponses: NegotiationResponse[],
    query: string,
    config: IterativeConsensusConfig
  ): Promise<NegotiationResponse[]> {
    // Get council members
    const councilConfig = await this.configManager.getCouncilConfig();
    const activeMembers = councilConfig.members.filter((member) =>
      currentResponses.some((r) => r.councilMemberId === member.id)
    );

    if (activeMembers.length === 0) {
      throw new Error('No active council members available');
    }

    // Calculate similarity for prompt building
    const similarityResult = await this.calculateSimilarity(
      currentResponses,
      config
    );

    // Identify disagreements and agreements
    const disagreements = this.promptBuilder.identifyDisagreements(
      currentResponses,
      similarityResult.matrix
    );
    const agreements = this.promptBuilder.extractAgreements(
      currentResponses,
      similarityResult.matrix,
      config.agreementThreshold
    );

    // Get relevant examples
    const examples = await this.exampleRepository.getRelevantExamples(
      query,
      config.exampleCount
    );

    // Determine template to use based on query type
    let templateOverride: PromptTemplate | undefined;
    if (config.promptTemplates) {
      // Detect if query contains code
      const hasCode =
        /```|`[^`]+`|function\s+\w+|const\s+\w+\s*=|class\s+\w+/.test(query);
      if (hasCode && config.promptTemplates.code) {
        templateOverride = config.promptTemplates.code;
      } else if (!hasCode && config.promptTemplates.text) {
        templateOverride = config.promptTemplates.text;
      } else if (config.promptTemplates.custom) {
        // Use first custom template as fallback (could be enhanced with category detection)
        const customKeys = Object.keys(config.promptTemplates.custom);
        if (customKeys.length > 0) {
          templateOverride = config.promptTemplates.custom[customKeys[0]];
        }
      }
    }

    // Build prompts for each member
    const prompts = activeMembers.map((member) => ({
      member,
      prompt: this.promptBuilder.buildPrompt(
        query,
        currentResponses,
        disagreements,
        agreements,
        examples,
        templateOverride
      ),
      // Additional data needed for sequential mode dynamic prompt updates
      query,
      previousResponses: currentResponses,
      disagreements,
      agreements,
      examples,
      templateOverride
    }));

    // Execute based on negotiation mode
    if (config.negotiationMode === 'parallel') {
      return this.executeParallelNegotiation(prompts, roundNumber, config);
    } else {
      return this.executeSequentialNegotiation(prompts, roundNumber, config);
    }
  }

  /**
   * Execute parallel negotiation (all members respond simultaneously)
   * With early similarity checking: check similarity after each response arrives
   */
  private async executeParallelNegotiation(
    prompts: Array<{ member: CouncilMember; prompt: string }>,
    roundNumber: number,
    config: IterativeConsensusConfig
  ): Promise<NegotiationResponse[]> {
    const responses: NegotiationResponse[] = [];
    const timeoutMs = config.perRoundTimeout * 1000;

    // Early termination check: if enabled and we have previous responses, check similarity incrementally
    const checkEarlyTermination =
      config.earlyTerminationEnabled && roundNumber > 0;

    // Send all prompts concurrently, but process responses as they arrive
    // Use deduplication to prevent duplicate requests
    const requestId = randomUUID(); // Generate unique ID for this negotiation round
    const promises = prompts.map(async ({ member, prompt }) => {
      try {
        const startTime = Date.now();
        const response = await this.deduplicator.executeWithDeduplication(
          requestId,
          member,
          prompt,
          async () => {
            return Promise.race([
              this.providerPool.sendRequest(member, prompt),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeoutMs)
              )
            ]);
          }
        );

        if (!response.success) {
          throw new Error(response.error?.message || 'Request failed');
        }

        const content =
          typeof response.content === 'string'
            ? response.content
            : String(response.content || '');

        return {
          councilMemberId: member.id,
          content,
          roundNumber,
          timestamp: new Date(),
          tokenCount: response.tokenUsage.totalTokens
        } as NegotiationResponse;
      } catch (error) {
        console.warn(
          `[IterativeConsensus] Member ${member.id} failed in round ${roundNumber}: ${error}`
        );
        return null;
      }
    });

    // Process responses as they complete (early similarity checking)
    if (checkEarlyTermination) {
      // Use Promise.allSettled to process responses as they arrive
      const settledResults = await Promise.allSettled(promises);

      for (const settled of settledResults) {
        if (settled.status === 'fulfilled' && settled.value) {
          responses.push(settled.value);

          // Check similarity incrementally if we have at least 2 responses
          if (responses.length >= 2 && config.earlyTerminationEnabled) {
            try {
              const currentSimilarity = await this.calculateSimilarity(
                responses,
                config
              );

              // If threshold met, we can terminate early (caller will handle this)
              // For now, we continue collecting all responses but log the opportunity
              if (
                currentSimilarity.averageSimilarity >=
                config.earlyTerminationThreshold
              ) {
                console.log(
                  `[IterativeConsensus] Early termination opportunity detected at similarity ${currentSimilarity.averageSimilarity.toFixed(3)} with ${responses.length}/${prompts.length} responses`
                );
                // Note: Actual early termination is handled by the caller after all responses
                // This optimization allows us to detect it earlier, but we still collect all responses
                // for consistency and to avoid race conditions
              }
            } catch (error) {
              // If similarity calculation fails, continue normally
              console.warn(
                `[IterativeConsensus] Failed to check early termination: ${error}`
              );
            }
          }
        }
      }
    } else {
      // Standard behavior: wait for all responses
      const results = await Promise.all(promises);

      // Filter out failed responses
      for (const result of results) {
        if (result) {
          responses.push(result);
        }
      }
    }

    return responses;
  }

  /**
   * Execute sequential negotiation (members respond one at a time in randomized order)
   * Each member sees the responses from members who answered before them in the current round
   */
  private async executeSequentialNegotiation(
    prompts: Array<{
      member: CouncilMember;
      prompt: string;
      query: string;
      previousResponses: NegotiationResponse[];
      disagreements: string[];
      agreements: Agreement[];
      examples: any[];
      templateOverride?: PromptTemplate;
    }>,
    roundNumber: number,
    config: IterativeConsensusConfig
  ): Promise<NegotiationResponse[]> {
    const responses: NegotiationResponse[] = [];
    const timeoutMs = config.perRoundTimeout * 1000;

    // Randomize order
    const randomizedPrompts = this.randomizeOrder(
      prompts,
      config.randomizationSeed
    );

    // Process sequentially with deduplication
    // Generate one unique ID per negotiation round, shared by all members
    // This ensures deduplication works correctly within the round
    const requestId = randomUUID();

    // Track responses collected in this round so far
    const currentRoundResponses = [...prompts[0].previousResponses];

    for (let i = 0; i < randomizedPrompts.length; i++) {
      const {
        member,
        query,
        disagreements,
        agreements,
        examples,
        templateOverride
      } = randomizedPrompts[i];

      try {
        // Rebuild prompt with responses collected so far in this round
        // This allows each member to see what previous members said
        const updatedPrompt = this.promptBuilder.buildPrompt(
          query,
          currentRoundResponses,
          disagreements,
          agreements,
          examples,
          templateOverride
        );

        const response = await this.deduplicator.executeWithDeduplication(
          requestId,
          member,
          updatedPrompt,
          async () => {
            return Promise.race([
              this.providerPool.sendRequest(member, updatedPrompt),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeoutMs)
              )
            ]);
          }
        );

        if (!response.success) {
          throw new Error(response.error?.message || 'Request failed');
        }

        const content =
          typeof response.content === 'string'
            ? response.content
            : String(response.content || '');

        const newResponse: NegotiationResponse = {
          councilMemberId: member.id,
          content,
          roundNumber,
          timestamp: new Date(),
          tokenCount: response.tokenUsage.totalTokens
        };

        responses.push(newResponse);

        // Add this response to the tracking array so next member can see it
        currentRoundResponses.push(newResponse);
      } catch (error) {
        console.warn(
          `[IterativeConsensus] Member ${member.id} failed in round ${roundNumber}: ${error}`
        );
        // Continue with next member
      }
    }

    return responses;
  }

  /**
   * Randomize order of members for sequential negotiation
   */
  private randomizeOrder<T>(items: T[], seed?: number): T[] {
    const shuffled = [...items];

    // Simple seeded random (for deterministic testing)
    const rng = seed !== undefined ? this.seededRandom(seed) : Math.random;

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Seeded random number generator
   */
  private seededRandom(seed: number): () => number {
    let value = seed;
    return () => {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  }

  /**
   * Calculate pairwise similarity scores
   * Uses core answer extraction for better consensus detection
   */
  async calculateSimilarity(
    responses: NegotiationResponse[],
    config: IterativeConsensusConfig
  ): Promise<SimilarityResult> {
    if (responses.length < 2) {
      return {
        matrix: [[1.0]],
        averageSimilarity: 1.0,
        minSimilarity: 1.0,
        maxSimilarity: 1.0,
        belowThresholdPairs: []
      };
    }

    // Extract core answers for comparison instead of full verbose responses
    // This improves consensus detection by focusing on substance, not presentation
    const texts = responses.map((r) => this.extractCoreAnswerForSimilarity(r.content));
    const embeddings = await this.embeddingService.batchEmbed(
      texts,
      config.embeddingModel
    );

    // Compute pairwise similarity matrix (only upper triangle for efficiency)
    // Optimization: Only compute upper triangle, then mirror for symmetry
    const n = responses.length;
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n));
    const similarities: number[] = [];

    // Initialize diagonal
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1.0;
    }

    // Compute upper triangle and mirror to lower triangle
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const similarity = this.embeddingService.cosineSimilarity(
          embeddings[i],
          embeddings[j]
        );
        matrix[i][j] = similarity;
        matrix[j][i] = similarity; // Symmetry - fill lower triangle
        similarities.push(similarity);
      }
    }

    // Calculate statistics
    const averageSimilarity =
      similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
    const minSimilarity = Math.min(...similarities);
    const maxSimilarity = Math.max(...similarities);

    // Find pairs below threshold
    const belowThresholdPairs: Array<{
      member1: string;
      member2: string;
      similarity: number;
    }> = [];
    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        if (matrix[i][j] < config.agreementThreshold) {
          belowThresholdPairs.push({
            member1: responses[i].councilMemberId,
            member2: responses[j].councilMemberId,
            similarity: matrix[i][j]
          });
        }
      }
    }

    return {
      matrix,
      averageSimilarity,
      minSimilarity,
      maxSimilarity,
      belowThresholdPairs
    };
  }

  /**
   * Check if consensus is achieved
   */
  isConsensusAchieved(
    similarityResult: SimilarityResult,
    threshold: number
  ): boolean {
    return similarityResult.belowThresholdPairs.length === 0;
  }

  /**
   * Calculate proportionally adjusted threshold based on member failures
   * Requirement 9.1: Adjust agreement threshold proportionally when members fail
   */
  private calculateAdjustedThreshold(
    originalThreshold: number,
    originalMemberCount: number,
    currentMemberCount: number
  ): number {
    if (currentMemberCount >= originalMemberCount) {
      return originalThreshold;
    }

    // Proportional adjustment: newThreshold = threshold × (activeMembers / totalMembers)
    const adjustedThreshold =
      originalThreshold * (currentMemberCount / originalMemberCount);

    console.log(
      `[IterativeConsensus] Threshold adjusted from ${originalThreshold.toFixed(3)} to ${adjustedThreshold.toFixed(3)} ` +
        `due to member failures (${currentMemberCount}/${originalMemberCount} active)`
    );

    return adjustedThreshold;
  }

  /**
   * Detect potential deadlock
   */
  detectDeadlock(history: number[]): boolean {
    return this.convergenceDetector.isDeadlocked(history);
  }

  /**
   * Select final response from converged answers
   */
  selectFinalResponse(responses: NegotiationResponse[]): string {
    if (responses.length === 0) {
      return '';
    }

    if (responses.length === 1) {
      return responses[0].content;
    }

    // Select most clearly articulated (shortest that's still comprehensive)
    // In practice, could use readability metrics
    const sorted = [...responses].sort((a, b) => {
      // Prefer responses that are not too short or too long
      const aScore = this.responseQualityScore(a.content);
      const bScore = this.responseQualityScore(b.content);
      return bScore - aScore;
    });

    return sorted[0].content;
  }

  /**
   * Calculate response quality score
   */
  private responseQualityScore(content: string): number {
    const length = content.length;
    // Prefer responses between 100-2000 characters
    if (length < 100) {
      return length / 100;
    }
    if (length > 2000) {
      return 2000 / length;
    }
    return 1.0;
  }

  /**
   * Check if all responses are identical
   */
  private allResponsesIdentical(responses: NegotiationResponse[]): boolean {
    if (responses.length <= 1) {
      return true;
    }

    const first = responses[0].content.trim();
    return responses.every((r) => r.content.trim() === first);
  }

  /**
   * Invoke fallback strategy
   */
  private async invokeFallback(
    request: UserRequest,
    thread: DeliberationThread,
    config: IterativeConsensusConfig,
    currentResponses: NegotiationResponse[]
  ): Promise<ConsensusDecision> {
    // Convert negotiation responses back to exchanges
    const exchanges: Exchange[] = currentResponses.map((r) => ({
      councilMemberId: r.councilMemberId,
      content: r.content,
      referencesTo: [],
      tokenUsage: {
        promptTokens: 0,
        completionTokens: r.tokenCount,
        totalTokens: r.tokenCount
      }
    }));

    // Create updated thread with latest responses
    const updatedThread: DeliberationThread = {
      rounds: [
        ...thread.rounds,
        {
          roundNumber: thread.rounds.length,
          exchanges
        }
      ],
      totalDuration: thread.totalDuration
    };

    // Map fallback strategy
    let fallbackStrategy: SynthesisStrategy;
    switch (config.fallbackStrategy) {
      case 'meta-synthesis':
        fallbackStrategy = {
          type: 'meta-synthesis',
          moderatorStrategy: { type: 'strongest' }
        };
        break;
      case 'weighted-fusion':
        fallbackStrategy = {
          type: 'weighted-fusion',
          weights: new Map(
            currentResponses.map((r) => [r.councilMemberId, 1.0])
          )
        };
        break;
      case 'consensus-extraction':
      default:
        fallbackStrategy = { type: 'consensus-extraction' };
    }

    // Invoke synthesis engine
    return this.synthesisEngine.synthesize(
      request,
      updatedThread,
      fallbackStrategy
    );
  }

  /**
   * Build consensus decision with metadata
   */
  private buildConsensusDecision(
    content: string,
    request: UserRequest,
    metadata: {
      totalRounds: number;
      similarityProgression: number[];
      consensusAchieved: boolean;
      fallbackUsed: boolean;
      fallbackReason?: string;
      deadlockDetected: boolean;
      humanEscalationTriggered: boolean;
      qualityScore: number;
      costSavings?: { tokensAvoided: number; estimatedCostSaved: number };
      agreementThreshold?: number; // Add threshold for confidence calculation
    }
  ): ConsensusDecision {
    const finalSimilarity =
      metadata.similarityProgression[
        metadata.similarityProgression.length - 1
      ] || 0;
    const agreementThreshold = metadata.agreementThreshold || 0.85;

    // Calculate confidence based on agreement threshold
    // High: >= threshold + 0.1 or >= 0.95
    // Medium: >= threshold or >= 0.75
    // Low: < threshold
    const highThreshold = Math.max(agreementThreshold + 0.1, 0.95);
    const mediumThreshold = Math.max(agreementThreshold, 0.75);
    const confidence: 'high' | 'medium' | 'low' =
      finalSimilarity >= highThreshold
        ? 'high'
        : finalSimilarity >= mediumThreshold
          ? 'medium'
          : 'low';

    return {
      content,
      confidence,
      agreementLevel: finalSimilarity,
      synthesisStrategy: {
        type: 'iterative-consensus',
        config: {} as IterativeConsensusConfig // Will be set by caller
      },
      contributingMembers: [],
      timestamp: new Date(),
      iterativeConsensusMetadata: {
        totalRounds: metadata.totalRounds,
        similarityProgression: metadata.similarityProgression,
        consensusAchieved: metadata.consensusAchieved,
        fallbackUsed: metadata.fallbackUsed,
        fallbackReason: metadata.fallbackReason,
        deadlockDetected: metadata.deadlockDetected,
        humanEscalationTriggered: metadata.humanEscalationTriggered,
        qualityScore: metadata.qualityScore,
        costSavings: metadata.costSavings
      }
    };
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(
    finalSimilarity: number,
    totalRounds: number
  ): number {
    // Formula: (finalSimilarity × 0.7) + (1 / totalRounds × 0.3)
    const similarityComponent = finalSimilarity * 0.7;
    const efficiencyComponent = totalRounds > 0 ? (1 / totalRounds) * 0.3 : 0.3;
    return Math.min(1.0, similarityComponent + efficiencyComponent);
  }

  /**
   * Estimate tokens avoided by early termination
   * Returns total tokens and breakdown by member
   */
  private estimateTokensAvoided(
    memberCount: number,
    roundsAvoided: number,
    config: IterativeConsensusConfig,
    memberIds?: string[]
  ): { total: number; byMember: Record<string, number> } {
    // Rough estimate: average tokens per round
    const avgTokensPerMember = 500; // Conservative estimate
    const tokensPerMember = roundsAvoided * avgTokensPerMember;
    const total = memberCount * tokensPerMember;

    // Build breakdown by member
    const byMember: Record<string, number> = {};
    if (memberIds) {
      memberIds.forEach((id) => {
        byMember[id] = tokensPerMember;
      });
    } else {
      // If member IDs not provided, distribute evenly
      for (let i = 0; i < memberCount; i++) {
        byMember[`member_${i}`] = tokensPerMember;
      }
    }

    return { total, byMember };
  }

  /**
   * Calculate cost savings
   * Returns total cost and breakdown by member
   */
  private calculateCostSavings(
    tokensAvoided: { total: number; byMember: Record<string, number> },
    config: IterativeConsensusConfig
  ): { total: number; byMember: Record<string, number> } {
    // Use token price map if available
    let pricePerToken: number;
    if (config.tokenPriceMap) {
      const defaultPrice = config.tokenPriceMap['default'] || {
        input: 0.00001,
        output: 0.00003
      };
      pricePerToken = (defaultPrice.input + defaultPrice.output) / 2;
    } else {
      // Default estimate
      pricePerToken = 0.00002; // $0.00002 per token
    }

    const total = tokensAvoided.total * pricePerToken;
    const byMember: Record<string, number> = {};

    // Calculate cost per member
    for (const [memberId, tokens] of Object.entries(tokensAvoided.byMember)) {
      byMember[memberId] = tokens * pricePerToken;
    }

    return { total, byMember };
  }

  /**
   * Extract the core factual answer from a response for similarity comparison
   * This improves consensus detection by focusing on substance, not presentation style
   */
  private extractCoreAnswerForSimilarity(content: string): string {
    // If response uses our structured format, extract CORE_ANSWER
    const coreMatch = content.match(/CORE_ANSWER:\s*(.+?)(?=\n\n|\nEXPLANATION:|\nAGREE_WITH:|$)/is);
    if (coreMatch) {
      return coreMatch[1].trim();
    }

    // Check if model explicitly agrees with another
    const agreeMatch = content.match(/AGREE_WITH:\s*(\S+)/i);
    if (agreeMatch && agreeMatch[1].toLowerCase() !== 'none') {
      // Return a marker that indicates agreement - will have high similarity with that member
      return `[AGREES:${agreeMatch[1]}] ${this.extractFirstSubstantiveSentences(content)}`;
    }

    // Otherwise, extract the substantive answer by removing meta-commentary
    return this.extractFirstSubstantiveSentences(content);
  }

  /**
   * Extract the first few substantive sentences from content
   */
  private extractFirstSubstantiveSentences(content: string): string {
    // Remove common meta-commentary patterns
    const cleaned = content
      // Remove round/deliberation references
      .replace(/\*\*Deliberation Response:.*?\*\*/gi, '')
      .replace(/^#+\s*Deliberation.*$/gim, '')
      .replace(/Round \d+.*?:/gi, '')
      .replace(/Whew,.*?evolving[^.]*\./gi, '')
      // Remove analysis of other responses
      .replace(/Council Member \d+.*?responses?:?/gi, '')
      .replace(/\*\*Analysis.*?\*\*/gi, '')
      .replace(/\*\*Critique.*?\*\*/gi, '')
      .replace(/\*\*Observations?.*?\*\*/gi, '')
      // Remove meta-discussion about format/structure
      .replace(/tiered.*?structure/gi, '')
      .replace(/modular.*?approach/gi, '')
      .replace(/how.*?architect.*?information/gi, '')
      .replace(/the debate has shifted/gi, '')
      .replace(/we.*?reached.*?consensus/gi, '')
      // Remove markdown formatting
      .replace(/\*\*/g, '')
      .replace(/^[-*]\s+/gm, '')
      .trim();

    // Split into sentences and take first 3-5 substantive ones
    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => {
        // Filter out meta-commentary sentences
        const lower = s.toLowerCase();
        return (
          s.length > 15 &&
          !lower.startsWith('let me') &&
          !lower.startsWith('i will') &&
          !lower.startsWith('i\'ll') &&
          !lower.includes('council member') &&
          !lower.includes('round ') &&
          !lower.includes('deliberation') &&
          !lower.includes('negotiate') &&
          !lower.includes('consensus') &&
          !lower.includes('agree with')
        );
      });

    // Take first 3 substantive sentences, limited to 800 chars
    const result = sentences.slice(0, 3).join(' ');
    return result.substring(0, 800);
  }
}
