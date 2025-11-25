/**
 * Orchestration Engine
 * Coordinates the entire request lifecycle including distribution, collection, and timeout handling
 */

import { IOrchestrationEngine } from '../interfaces/IOrchestrationEngine';
import { IProviderPool } from '../interfaces/IProviderPool';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';
import { ISynthesisEngine } from '../interfaces/ISynthesisEngine';
import { logger } from '../utils/logger';
import {
  ProviderHealthTracker,
  getSharedHealthTracker
} from '../providers/health-tracker';
import { RequestDeduplicator } from './request-deduplicator';
import { CostCalculator } from '../cost/calculator';
import {
  UserRequest,
  CouncilMember,
  InitialResponse,
  DeliberationThread,
  ConsensusDecision,
  ProviderResponse,
  DeliberationRound,
  Exchange,
  RequestMetrics,
  ProcessRequestResult,
  CouncilConfig,
  DeliberationConfig,
  PerformanceConfig,
  SynthesisConfig,
  ConfigPreset
} from '../types/core';

/**
 * Result of a council member request with metadata
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface CouncilMemberResult {
  member: CouncilMember;
  response: ProviderResponse;
  startTime: number;
  endTime: number;
}

/**
 * Tracked response with member ID for timeout handling
 */
interface TrackedResponse {
  memberId: string;
  response: ProviderResponse;
  initialResponse: InitialResponse;
}

/**
 * Orchestration Engine implementation
 */
export class OrchestrationEngine implements IOrchestrationEngine {
  private providerPool: IProviderPool;
  private configManager: IConfigurationManager;
  private synthesisEngine: ISynthesisEngine;

  private healthTracker: ProviderHealthTracker;
  private deduplicator: RequestDeduplicator;
  private costCalculator: CostCalculator;

  // Track partial responses per request (keyed by request ID) to avoid shared state corruption
  private partialResponsesByRequest: Map<string, TrackedResponse[]> = new Map();

  // Store deliberation threads by request ID for API retrieval
  private deliberationThreadsByRequest: Map<string, DeliberationThread> =
    new Map();

  constructor(
    providerPool: IProviderPool,
    configManager: IConfigurationManager,
    synthesisEngine: ISynthesisEngine,
    healthTracker?: ProviderHealthTracker
  ) {
    this.providerPool = providerPool;
    this.configManager = configManager;
    this.synthesisEngine = synthesisEngine;
    // Use shared tracker for consistent failure tracking across components
    this.healthTracker = healthTracker || getSharedHealthTracker();
    this.deduplicator = new RequestDeduplicator();
    this.costCalculator = new CostCalculator();
  }

  /**
   * Process a user request through the entire council deliberation cycle
   */
  async processRequest(request: UserRequest): Promise<ProcessRequestResult> {
    const reqId = request.id;
    const orchestrationStartTime = Date.now();

    logger.info('Orchestration started', { requestId: reqId, component: 'Orchestration' });

    // Initialize metrics tracking
    const metrics: RequestMetrics = {
      memberCosts: new Map(),
      memberLatencies: new Map(),
      memberTokens: new Map()
    };

    // Get configurations - use per-request preset if specified, otherwise use system config
    let councilConfig: CouncilConfig;
    let deliberationConfig: DeliberationConfig;
    let performanceConfig: PerformanceConfig;
    let synthesisConfig: SynthesisConfig;

    if (request.preset) {
      // Use preset-specific configuration for this request
      const presetConfigs = await this.getPresetConfigurations(request.preset);

      // Validate preset configs are present
      if (!presetConfigs.council) {
        throw new Error(
          `Preset '${request.preset}' configuration is missing council config. ` +
          'Please check the preset configuration in the database.'
        );
      }
      if (!presetConfigs.deliberation) {
        throw new Error(
          `Preset '${request.preset}' configuration is missing deliberation config. ` +
          'Please check the preset configuration in the database.'
        );
      }
      if (!presetConfigs.performance) {
        throw new Error(
          `Preset '${request.preset}' configuration is missing performance config. ` +
          'Please check the preset configuration in the database.'
        );
      }
      if (!presetConfigs.synthesis) {
        throw new Error(
          `Preset '${request.preset}' configuration is missing synthesis config. ` +
          'Please check the preset configuration in the database.'
        );
      }

      councilConfig = presetConfigs.council;
      deliberationConfig = presetConfigs.deliberation;
      performanceConfig = presetConfigs.performance;
      synthesisConfig = presetConfigs.synthesis;
    } else {
      // Use system-wide configuration
      councilConfig = await this.configManager.getCouncilConfig();
      deliberationConfig = await this.configManager.getDeliberationConfig();
      performanceConfig = await this.configManager.getPerformanceConfig();
      synthesisConfig = await this.configManager.getSynthesisConfig();
    }

    // Filter out disabled members
    const activeMembers = await this.filterActiveMembers(councilConfig.members);

    // Log council configuration
    logger.info(`Council: ${activeMembers.length} members, ${deliberationConfig.rounds} deliberation rounds`, {
      requestId: reqId,
      component: 'Orchestration'
    });
    activeMembers.forEach(m => {
      logger.debug(`  • ${m.id}: ${m.provider}/${m.model}`, { requestId: reqId, memberId: m.id });
    });
    logger.info(`Strategy: ${synthesisConfig.strategy.type}, timeout: ${performanceConfig.globalTimeout}s`, {
      requestId: reqId,
      component: 'Orchestration'
    });

    // Check minimum quorum
    if (
      councilConfig.requireMinimumForConsensus &&
      activeMembers.length < councilConfig.minimumSize
    ) {
      throw new Error(
        `Insufficient council members: ${activeMembers.length} available, ` +
          `${councilConfig.minimumSize} required`
      );
    }

    // Set up global timeout
    // Validate globalTimeout value to prevent NaN
    if (
      typeof performanceConfig.globalTimeout !== 'number' ||
      isNaN(performanceConfig.globalTimeout) ||
      performanceConfig.globalTimeout <= 0
    ) {
      throw new Error(
        `Invalid globalTimeout value: ${performanceConfig.globalTimeout}`
      );
    }
    const globalTimeoutMs = performanceConfig.globalTimeout * 1000;
    const globalTimeoutPromise = this.createGlobalTimeout(globalTimeoutMs);

    try {
      // Initialize partial responses tracking for this request
      this.partialResponsesByRequest.set(request.id, []);

      // Distribute request to council with global timeout
      logger.deliberationRoundStart(reqId, 0, activeMembers.length);
      const distributionStartTime = Date.now();

      const distributionPromise = this.distributeToCouncil(
        request,
        activeMembers,
        metrics
      );

      // Use Promise.race with proper timeout handling
      const raceResult = await Promise.race([
        distributionPromise.then((responses) => ({
          type: 'success' as const,
          responses
        })),
        globalTimeoutPromise.then(() => ({ type: 'timeout' as const }))
      ]);

      if (raceResult.type === 'timeout') {
        // Global timeout occurred - wait for distribution to settle and collect partial results
        // Use Promise.allSettled to ensure all callbacks complete
        await Promise.allSettled([distributionPromise]);
        // Get partial responses for this request
        const partialResponses =
          this.partialResponsesByRequest.get(request.id) || [];
        // Clean up tracking
        this.partialResponsesByRequest.delete(request.id);
        const consensusDecision = await this.handleTimeout(
          request,
          partialResponses
        );
        return { consensusDecision, metrics };
      }

      // Clean up tracking
      this.partialResponsesByRequest.delete(request.id);

      // raceResult.responses is already InitialResponse[] from distributeToCouncil
      const initialResponses = raceResult.responses;

      const distributionDuration = Date.now() - distributionStartTime;
      const successCount = initialResponses.filter(r => r.content && r.content.length > 0).length;
      const failCount = initialResponses.length - successCount;
      logger.deliberationRoundEnd(reqId, 0, distributionDuration);
      logger.info(`Initial responses: ${successCount} success, ${failCount} failed`, { requestId: reqId, component: 'Orchestration' });

      // Log each member's response
      initialResponses.forEach(r => {
        const contentLen = typeof r.content === 'string' ? r.content.length : 0;
        if (contentLen > 0) {
          logger.memberResponse(reqId, r.councilMemberId, true, 0, contentLen);
          logger.contentPreview(reqId, r.councilMemberId,
            typeof r.content === 'string' ? r.content : JSON.stringify(r.content));
        } else {
          logger.memberError(reqId, r.councilMemberId, 'Empty or missing response');
        }
      });

      // Conduct deliberation if configured
      // Pass activeMembers for per-request preset support
      const deliberationThread = await this.conductDeliberation(
        initialResponses,
        deliberationConfig.rounds,
        metrics,
        activeMembers,
        reqId  // Pass request ID for logging
      );

      // Store deliberation thread for API retrieval
      this.deliberationThreadsByRequest.set(request.id, deliberationThread);

      // Synthesize consensus decision
      logger.synthesisStart(reqId, synthesisConfig.strategy.type, deliberationThread.rounds[0]?.exchanges?.length || 0);
      const synthesisStartTime = Date.now();

      const consensusDecision = await this.synthesisEngine.synthesize(
        request,
        deliberationThread,
        synthesisConfig.strategy
      );

      const synthesisDuration = Date.now() - synthesisStartTime;
      logger.synthesisComplete(reqId, synthesisConfig.strategy.type, synthesisDuration,
        consensusDecision.confidence, consensusDecision.content.length);

      // Note: deliberationThreadsByRequest entry will be cleaned up by the API gateway
      // after it stores the thread in Redis (see gateway.ts processRequestAsync)

      return { consensusDecision, metrics };
    } catch (error) {
      // Clean up tracking on error
      this.partialResponsesByRequest.delete(request.id);
      // If all members failed, throw error
      throw new Error(`Request processing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Distribute a request to all configured council members in parallel
   * @internal metrics parameter is for internal tracking only
   */
  async distributeToCouncil(
    request: UserRequest,
    councilMembers: CouncilMember[],
    metrics?: RequestMetrics
  ): Promise<InitialResponse[]> {
    // Get or initialize partial responses tracking for this request
    const partialResponses =
      this.partialResponsesByRequest.get(request.id) || [];
    this.partialResponsesByRequest.set(request.id, partialResponses);

    // Create promises for all council member requests
    const requestPromises = councilMembers.map((member) =>
      this.sendRequestToMember(request, member).then((result) => {
        // Track this response for potential global timeout handling
        if (result.response.success) {
          const tracked = this.partialResponsesByRequest.get(request.id);
          if (tracked) {
            tracked.push({
              memberId: result.memberId,
              response: result.response,
              initialResponse: result.initialResponse
            });
          }
        }
        return result;
      })
    );

    // Wait for all requests to complete (or timeout individually)
    const results = await Promise.allSettled(requestPromises);

    // Process results and track failures
    const initialResponses: InitialResponse[] = [];
    const failureDetails: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const member = councilMembers[i];

      if (result.status === 'fulfilled' && result.value.response.success) {
        // Successful response
        const initialResponse = result.value.initialResponse;

        // Track metrics for this member (if metrics tracking enabled)
        if (metrics) {
          try {
            const costCalculation = await this.costCalculator.calculateCost(
              member,
              initialResponse.tokenUsage
            );
            metrics.memberCosts.set(member.id, costCalculation.cost);
            metrics.memberLatencies.set(member.id, initialResponse.latency);
            metrics.memberTokens.set(member.id, {
              prompt: initialResponse.tokenUsage.promptTokens,
              completion: initialResponse.tokenUsage.completionTokens
            });
          } catch (error) {
            // Log error but don't fail request
            console.error(`Failed to calculate cost for ${member.id}:`, error);
            metrics.memberCosts.set(member.id, 0);
            metrics.memberLatencies.set(member.id, initialResponse.latency);
            metrics.memberTokens.set(member.id, {
              prompt: initialResponse.tokenUsage.promptTokens,
              completion: initialResponse.tokenUsage.completionTokens
            });
          }
        }

        initialResponses.push(initialResponse);
        this.resetFailureCount(member);
      } else {
        // Failed response - track failure and collect error details
        let errorMessage = `Member ${member.id} (${member.provider}/${member.model}) failed`;

        if (result.status === 'fulfilled') {
          // Response was received but marked as failed
          const error = result.value.response.error;
          if (error) {
            errorMessage += `: ${error.message}`;
            console.error(`Council member ${member.id} failed:`, error.message);
          }
        } else {
          // Promise was rejected
          const error = result.reason;
          errorMessage += `: ${error?.message || String(error)}`;
          console.error(`Council member ${member.id} promise rejected:`, error);
        }

        failureDetails.push(errorMessage);
        this.trackFailure(member);
      }
    }

    // Check if we have at least one successful response
    if (initialResponses.length === 0) {
      const errorMsg = `All council members failed to respond. Details:\n${failureDetails.join('\n')}`;
      console.error('All council members failed:', errorMsg);
      throw new Error(errorMsg);
    }

    return initialResponses;
  }

  /**
   * Conduct deliberation rounds with peer response sharing
   * @param councilMembers Optional council members for per-request preset support
   * @param requestId Optional request ID for logging
   */
  async conductDeliberation(
    initialResponses: InitialResponse[],
    rounds: number,
    metrics: RequestMetrics,
    councilMembers?: CouncilMember[],
    requestId?: string
  ): Promise<DeliberationThread> {
    const startTime = Date.now();
    const deliberationRounds: DeliberationRound[] = [];
    const reqId = requestId || 'unknown';

    // Round 0: Initial responses - already logged in processRequest
    deliberationRounds.push({
      roundNumber: 0,
      exchanges: initialResponses.map((response, idx) => {

        // Ensure content is always a string
        let content = response.content;
        if (typeof content !== 'string') {
          if (content && typeof content === 'object') {
            if (Array.isArray(content)) {
              // Handle arrays properly - extract strings from each item
              const contentArray = content as any[];
              content = contentArray
                .map((item: any) => {
                  if (typeof item === 'string') {
                    return item;
                  }
                  if (item && typeof item === 'object') {
                    return (
                      item.text ||
                      item.content ||
                      item.message ||
                      JSON.stringify(item)
                    );
                  }
                  return String(item || '');
                })
                .filter(
                  (item: string) => item && !item.includes('[object Object]')
                )
                .join(' ');
            } else {
              content =
                (content as any).text ||
                (content as any).content ||
                (content as any).message ||
                JSON.stringify(content);
            }
          } else {
            content = String(content || '');
          }
        }
        // Final safety check
        if (
          content &&
          typeof content === 'string' &&
          content.includes('[object Object]')
        ) {
          console.warn(
            `[Orchestration] Found [object Object] in initial response for ${response.councilMemberId}`
          );
          content = 'Content extraction failed';
        }
        const exchange = {
          councilMemberId: response.councilMemberId,
          content: content,
          referencesTo: [],
          tokenUsage: response.tokenUsage
        };

        return exchange;
      })
    });

    // If no deliberation rounds configured, return immediately
    if (rounds === 0) {
      return {
        rounds: deliberationRounds,
        totalDuration: Date.now() - startTime
      };
    }

    // Get council members for deliberation
    // Use provided councilMembers if available (for per-request presets), otherwise fetch from config
    let members: CouncilMember[];
    if (councilMembers && councilMembers.length > 0) {
      members = councilMembers;
    } else {
      const councilConfig = await this.configManager.getCouncilConfig();
      members = councilConfig.members;
    }
    const memberMap = new Map(members.map((m) => [m.id, m]));

    // Conduct deliberation rounds
    let previousRoundResponses = initialResponses;

    for (let roundNum = 1; roundNum <= rounds; roundNum++) {
      const roundStartTime = Date.now();
      logger.deliberationRoundStart(reqId, roundNum, previousRoundResponses.length);

      const roundExchanges = await this.conductDeliberationRound(
        roundNum,
        previousRoundResponses,
        memberMap,
        metrics,
        reqId
      );

      const roundDuration = Date.now() - roundStartTime;
      logger.deliberationRoundEnd(reqId, roundNum, roundDuration);

      // Log responses from this round
      roundExchanges.forEach(ex => {
        const contentLen = typeof ex.content === 'string' ? ex.content.length : 0;
        logger.memberResponse(reqId, ex.councilMemberId, true, 0, contentLen);
        logger.contentPreview(reqId, ex.councilMemberId,
          typeof ex.content === 'string' ? ex.content : JSON.stringify(ex.content));
      });

      deliberationRounds.push({
        roundNumber: roundNum,
        exchanges: roundExchanges
      });

      // Update previous responses for next round
      previousRoundResponses = roundExchanges.map((exchange) => {
        // Ensure content is always a string (defensive check)
        let content = exchange.content;
        if (typeof content !== 'string') {
          if (content && typeof content === 'object') {
            if (Array.isArray(content)) {
              // Handle arrays properly - extract strings from each item
              const contentArray = content as any[];
              content = contentArray
                .map((item: any) => {
                  if (typeof item === 'string') {
                    return item;
                  }
                  if (item && typeof item === 'object') {
                    return (
                      item.text ||
                      item.content ||
                      item.message ||
                      JSON.stringify(item)
                    );
                  }
                  return String(item || '');
                })
                .filter(
                  (item: string) => item && !item.includes('[object Object]')
                )
                .join(' ');
            } else {
              content =
                (content as any).text ||
                (content as any).content ||
                (content as any).message ||
                JSON.stringify(content);
            }
          } else {
            content = String(content || '');
          }
        }
        // Final check - if it still contains [object Object], try to extract properly
        if (
          content &&
          typeof content === 'string' &&
          content.includes('[object Object]')
        ) {
          console.warn(
            `[Orchestration] Found [object Object] in content for ${exchange.councilMemberId}, attempting recovery`
          );
          // Try to recover from the original exchange content
          const original = exchange.content;
          if (
            original &&
            typeof original === 'object' &&
            Array.isArray(original)
          ) {
            const originalArray = original as any[];
            content = originalArray
              .map((item: any) => {
                if (typeof item === 'string') {
                  return item;
                }
                return (
                  item?.text ||
                  item?.content ||
                  item?.message ||
                  JSON.stringify(item)
                );
              })
              .filter(
                (item: string) => item && !item.includes('[object Object]')
              )
              .join(' ');
          }
        }
        return {
          councilMemberId: exchange.councilMemberId,
          content: content,
          tokenUsage: exchange.tokenUsage,
          latency: 0,
          timestamp: new Date()
        };
      });
    }

    const endTime = Date.now();

    return {
      rounds: deliberationRounds,
      totalDuration: endTime - startTime
    };
  }

  /**
   * Conduct a single deliberation round
   */
  private async conductDeliberationRound(
    roundNumber: number,
    previousResponses: InitialResponse[],
    memberMap: Map<string, CouncilMember>,
    metrics?: RequestMetrics,
    requestId?: string
  ): Promise<Exchange[]> {
    const reqId = requestId || 'unknown';

    // Create deliberation prompts for each council member
    const deliberationPromises = previousResponses.map(async (response) => {
      const member = memberMap.get(response.councilMemberId);
      if (!member) {
        throw new Error(`Council member ${response.councilMemberId} not found`);
      }

      // Get peer responses (all responses except this member's own)
      const peerResponses = previousResponses.filter(
        (r) => r.councilMemberId !== response.councilMemberId
      );

      // Generate deliberation prompt
      const deliberationPrompt = this.generateDeliberationPrompt(
        response,
        peerResponses,
        roundNumber
      );

      // Send deliberation request to council member
      logger.memberRequest(reqId, response.councilMemberId, member.provider, member.model);
      const _startTime = Date.now();
      const providerResponse = await this.providerPool.sendRequest(
        member,
        deliberationPrompt,
        undefined // No conversation context for deliberation
      );
      const _endTime = Date.now();
      const deliberationLatency = _endTime - _startTime;

      // Track deliberation costs and tokens (add to existing metrics, if tracking enabled)
      if (metrics && providerResponse.success) {
        try {
          const costCalculation = await this.costCalculator.calculateCost(
            member,
            providerResponse.tokenUsage
          );
          const existingCost =
            metrics.memberCosts.get(response.councilMemberId) || 0;
          metrics.memberCosts.set(
            response.councilMemberId,
            existingCost + costCalculation.cost
          );

          const existingTokens = metrics.memberTokens.get(
            response.councilMemberId
          ) || { prompt: 0, completion: 0 };
          metrics.memberTokens.set(response.councilMemberId, {
            prompt:
              existingTokens.prompt + providerResponse.tokenUsage.promptTokens,
            completion:
              existingTokens.completion +
              providerResponse.tokenUsage.completionTokens
          });
        } catch (error) {
          console.error(
            `Failed to calculate deliberation cost for ${response.councilMemberId}:`,
            error
          );
        }
      }

      if (!providerResponse.success) {
        // If deliberation fails, use original response
        logger.memberError(reqId, response.councilMemberId, providerResponse.error?.message || 'Unknown error');
        return {
          councilMemberId: response.councilMemberId,
          content: response.content,
          referencesTo: peerResponses.map((r) => r.councilMemberId),
          tokenUsage: response.tokenUsage
        };
      }

      // Ensure content is always a string
      let content = providerResponse.content;

      if (typeof content !== 'string') {
        console.error(
          `[Orchestration] ERROR: Round ${roundNumber} - Deliberation response for ${response.councilMemberId} has non-string content:`,
          {
            type: typeof content,
            isArray: Array.isArray(content),
            content: content
          }
        );
      } else if (content.includes('[object Object]')) {
        console.error(
          `[Orchestration] ERROR: Round ${roundNumber} - Deliberation response for ${response.councilMemberId} has corrupted content string:`,
          {
            content: content,
            contentLength: content.length
          }
        );
      }

      if (typeof content !== 'string') {
        if (content && typeof content === 'object') {
          if (Array.isArray(content)) {
            // Handle arrays properly - extract strings from each item
            const contentArray = content as any[];
            content = contentArray
              .map((item: any) => {
                if (typeof item === 'string') {
                  return item;
                }
                if (item && typeof item === 'object') {
                  return (
                    item.text ||
                    item.content ||
                    item.message ||
                    JSON.stringify(item)
                  );
                }
                return String(item || '');
              })
              .filter(
                (item: string) => item && !item.includes('[object Object]')
              )
              .join(' ');
          } else {
            content =
              (content as any).text ||
              (content as any).content ||
              (content as any).message ||
              JSON.stringify(content);
          }
        } else {
          content = String(content || '');
        }
      }
      // Final safety check
      if (
        content &&
        typeof content === 'string' &&
        content.includes('[object Object]')
      ) {
        console.warn(
          `[Orchestration] Found [object Object] in deliberation response for ${response.councilMemberId}`
        );
        content = 'Content extraction failed';
      }

      const exchange = {
        councilMemberId: response.councilMemberId,
        content: content,
        referencesTo: peerResponses.map((r) => r.councilMemberId),
        tokenUsage: providerResponse.tokenUsage
      };

      return exchange;
    });

    // Wait for all deliberation responses
    const exchanges = await Promise.all(deliberationPromises);

    return exchanges;
  }

  /**
   * Generate a deliberation prompt for peer review
   * Focuses on SUBSTANTIVE agreement, not presentation or meta-commentary
   */
  private generateDeliberationPrompt(
    ownResponse: InitialResponse,
    peerResponses: InitialResponse[],
    roundNumber: number
  ): string {
    // Extract core answers to show, not full verbose responses
    const extractCore = (content: string): string => {
      // Try to get first substantive paragraph, removing meta-commentary
      const cleaned = content
        .replace(/\*\*Deliberation Response.*?\*\*/gi, '')
        .replace(/^#+\s*(Analysis|Critique|Round).*$/gim, '')
        .replace(/Points of (agreement|disagreement)/gi, '')
        .trim();
      const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim().length > 20);
      return paragraphs.length > 0 ? paragraphs[0].substring(0, 500) : cleaned.substring(0, 500);
    };

    let prompt = `=== DELIBERATION ROUND ${roundNumber} ===\n\n`;

    prompt += 'CRITICAL INSTRUCTIONS:\n';
    prompt += '- Focus ONLY on the FACTUAL CONTENT of responses\n';
    prompt += '- Do NOT discuss how to present, format, or structure information\n';
    prompt += '- Do NOT analyze "strengths and weaknesses" of presentation styles\n';
    prompt += '- Do NOT suggest "tiered structures" or "modular approaches"\n';
    prompt += '- If you AGREE with the substance, simply state your agreement and provide the same answer\n';
    prompt += '- Keep your response concise and direct\n\n';

    prompt += `YOUR PREVIOUS ANSWER:\n${extractCore(ownResponse.content)}\n\n`;

    prompt += 'OTHER COUNCIL MEMBERS\' ANSWERS:\n\n';

    peerResponses.forEach((peer, index) => {
      prompt += `[${peer.councilMemberId}]: ${extractCore(peer.content)}\n\n`;
    });

    prompt += 'YOUR TASK:\n';
    prompt += 'If you agree with the other answers on the FACTS, say so briefly and provide your final answer.\n';
    prompt += 'If you disagree on FACTS (not presentation), explain why concisely.\n';
    prompt += 'Do NOT provide lengthy analysis or discuss how to organize information.\n\n';
    prompt += 'Your response (keep it brief and factual):';

    return prompt;
  }

  /**
   * Handle timeout by synthesizing partial responses
   *
   * Uses the partialResponses parameter passed from getPartialResults, which ensures
   * we use the complete set of responses that were successfully collected before the timeout.
   * This fixes the bug where this.partialResponses may be incomplete if the global timeout
   * occurs before all successful response callbacks have executed.
   */
  async handleTimeout(
    request: UserRequest,
    partialResponses: ProviderResponse[] | TrackedResponse[]
  ): Promise<ConsensusDecision> {
    // Use the partial responses passed as parameter (collected from getPartialResults)
    // This ensures we use the complete set of responses that were successfully collected
    // before the timeout, rather than relying on this.partialResponses which may be incomplete
    // if the timeout occurred before all callbacks executed

    // Fixed: Validate that partial responses are TrackedResponse[] with runtime check
    const isTrackedResponse = (obj: any): obj is TrackedResponse => {
      return (
        obj &&
        typeof obj === 'object' &&
        'memberId' in obj &&
        'response' in obj &&
        'initialResponse' in obj
      );
    };

    if (
      !Array.isArray(partialResponses) ||
      !partialResponses.every(isTrackedResponse)
    ) {
      throw new Error('Invalid partial responses: expected TrackedResponse[]');
    }

    const trackedResponses = partialResponses;

    if (trackedResponses.length === 0) {
      throw new Error('Global timeout reached with no successful responses');
    }

    // Convert to deliberation thread with actual member IDs
    const deliberationThread: DeliberationThread = {
      rounds: [
        {
          roundNumber: 0,
          exchanges: trackedResponses.map((tracked) => {
            // Ensure content is always a string
            let content = tracked.response.content;
            if (typeof content !== 'string') {
              if (content && typeof content === 'object') {
                content =
                  (content as any).text ||
                  (content as any).content ||
                  (content as any).message ||
                  JSON.stringify(content);
              } else {
                content = String(content || '');
              }
            }
            return {
              councilMemberId: tracked.memberId, // Use actual member ID
              content: content,
              referencesTo: [],
              tokenUsage: tracked.response.tokenUsage
            };
          })
        }
      ],
      totalDuration: 0
    };

    // Store deliberation thread for API retrieval
    this.deliberationThreadsByRequest.set(request.id, deliberationThread);

    // Get synthesis config
    const synthesisConfig = await this.configManager.getSynthesisConfig();

    // Synthesize with partial responses
    const consensusDecision = await this.synthesisEngine.synthesize(
      request,
      deliberationThread,
      synthesisConfig.strategy
    );

    // Note: deliberationThreadsByRequest entry will be cleaned up by the API gateway
    // after it stores the thread in Redis (see gateway.ts processRequestAsync)

    // Mark as low confidence due to timeout
    return {
      ...consensusDecision,
      confidence: 'low'
    };
  }

  /**
   * Send request to a single council member with timeout handling
   * CRITICAL FIX: Properly clears timeout to prevent resource leaks
   * CRITICAL FIX: Uses deduplication to prevent duplicate requests
   */
  private async sendRequestToMember(
    request: UserRequest,
    member: CouncilMember
  ): Promise<{
    response: ProviderResponse;
    initialResponse: InitialResponse;
    memberId: string;
  }> {
    const startTime = Date.now();

    // Create timeout promise for this specific member with cleanup
    // Validate timeout value to prevent NaN
    if (
      typeof member.timeout !== 'number' ||
      isNaN(member.timeout) ||
      member.timeout <= 0
    ) {
      throw new Error(
        `Invalid timeout value for member ${member.id}: ${member.timeout}`
      );
    }
    const timeoutMs = member.timeout * 1000;
    let timeoutId: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<ProviderResponse>((resolve) => {
      timeoutId = setTimeout(() => {
        timeoutId = null; // Mark as fired
        resolve({
          content: '',
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latency: timeoutMs,
          success: false,
          error: new Error(
            `Request to ${member.id} timed out after ${member.timeout}s`
          )
        });
      }, timeoutMs);
    });

    // Use deduplicator to prevent duplicate requests to the same member with the same prompt
    const response = await this.deduplicator.executeWithDeduplication(
      request.id,
      member,
      request.query,
      async () => {
        // Race between actual request and timeout
        const result = await Promise.race([
          this.providerPool.sendRequest(member, request.query, request.context),
          timeoutPromise
        ]);

        // CRITICAL FIX: Clear timeout if request completed first to prevent resource leak
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        return result;
      }
    );

    const endTime = Date.now();
    const latency = endTime - startTime;

    // Ensure content is always a string before creating InitialResponse
    let content = response.content;

    // Debug logging
    if (typeof content !== 'string') {
      console.warn(
        `[Orchestration] InitialResponse for ${member.id} has non-string content:`,
        {
          type: typeof content,
          isArray: Array.isArray(content),
          content: content,
          responseKeys: response ? Object.keys(response) : []
        }
      );
    } else if (content.includes('[object Object]')) {
      console.error(
        `[Orchestration] InitialResponse for ${member.id} has corrupted content string:`,
        {
          content: content,
          contentLength: content.length
        }
      );
    }

    if (typeof content !== 'string') {
      if (content && typeof content === 'object') {
        content =
          (content as any).text ||
          (content as any).content ||
          (content as any).message ||
          JSON.stringify(content);
      } else {
        content = String(content || '');
      }
    }

    // Convert to InitialResponse format
    const initialResponse: InitialResponse = {
      councilMemberId: member.id,
      content: content,
      tokenUsage: response.tokenUsage,
      latency,
      timestamp: new Date()
    };

    return { response, initialResponse, memberId: member.id };
  }

  /**
   * Filter out disabled members based on provider health
   */
  private async filterActiveMembers(
    members: CouncilMember[]
  ): Promise<CouncilMember[]> {
    const activeMembers: CouncilMember[] = [];

    for (const member of members) {
      const health = this.providerPool.getProviderHealth(member.provider);

      if (health.status !== 'disabled') {
        activeMembers.push(member);
      }
    }

    return activeMembers;
  }

  /**
   * Check if provider should be disabled after failure
   * Note: Failure is already recorded by ProviderPool.updateHealthTracking(),
   * so we only need to check if disabling is needed and handle it.
   */
  private trackFailure(member: CouncilMember): void {
    // Failure was already recorded by ProviderPool.updateHealthTracking()
    // Check if the provider should now be disabled (threshold was reached)
    if (this.healthTracker.isDisabled(member.provider)) {
      const failureCount = this.healthTracker.getFailureCount(member.provider);
      const disabledReason = this.healthTracker.getDisabledReason(
        member.provider
      );
      this.providerPool.markProviderDisabled(
        member.provider,
        disabledReason ||
          `Provider ${member.provider} failed ${failureCount} consecutive times`
      );
    }
  }

  /**
   * Reset failure count for a council member
   * Uses shared ProviderHealthTracker for consistent state
   */
  private resetFailureCount(member: CouncilMember): void {
    // Reset failure count in shared tracker (by provider)
    this.healthTracker.resetFailureCount(member.provider);
  }

  /**
   * Get deliberation thread for a request (for API retrieval)
   */
  getDeliberationThread(requestId: string): DeliberationThread | null {
    return this.deliberationThreadsByRequest.get(requestId) || null;
  }

  /**
   * Clean up deliberation thread from memory after it's been persisted
   * This prevents memory leaks when threads are stored in Redis
   */
  cleanupDeliberationThread(requestId: string): void {
    this.deliberationThreadsByRequest.delete(requestId);
  }

  /**
   * Create a global timeout promise
   */
  private createGlobalTimeout(timeoutMs: number): Promise<'GLOBAL_TIMEOUT'> {
    // Validate timeout value to prevent NaN
    if (typeof timeoutMs !== 'number' || isNaN(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`Invalid timeout value for global timeout: ${timeoutMs}`);
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve('GLOBAL_TIMEOUT');
      }, timeoutMs);
    });
  }

  /**
   * Get preset configurations for per-request preset support
   * Delegates to ConfigurationManager (DB-driven)
   */
  private async getPresetConfigurations(preset: ConfigPreset): Promise<{
    council: CouncilConfig;
    deliberation: DeliberationConfig;
    performance: PerformanceConfig;
    synthesis: SynthesisConfig;
  }> {
    // Delegate to configManager (DB-driven, cached)
    const configs = await this.configManager.getPresetConfigurations(preset);
    return {
      council: configs.council,
      deliberation: configs.deliberation,
      performance: configs.performance,
      synthesis: configs.synthesis
    };
  }

  /**
   * Process a request with streaming - yields chunks as they arrive from each member
   * This is used for real-time response display
   */
  async *processRequestStreaming(request: UserRequest): AsyncGenerator<StreamEvent> {
    const reqId = request.id;
    logger.info('Streaming orchestration started', { requestId: reqId, component: 'Orchestration' });

    // Get council configuration
    let councilConfig: CouncilConfig;
    if (request.preset) {
      const presetConfigs = await this.getPresetConfigurations(request.preset);
      councilConfig = presetConfigs.council;
    } else {
      councilConfig = await this.configManager.getCouncilConfig();
    }

    const activeMembers = councilConfig.members.filter(m =>
      !this.healthTracker.isDisabled(m.provider)
    );

    if (activeMembers.length === 0) {
      yield {
        type: 'error',
        error: 'No active council members available',
        timestamp: new Date()
      };
      return;
    }

    // Signal streaming start
    yield {
      type: 'start',
      memberCount: activeMembers.length,
      members: activeMembers.map(m => ({ id: m.id, model: m.model })),
      timestamp: new Date()
    };

    // Process each member sequentially (streaming doesn't work well with parallel generators)
    const fullResponses: Map<string, string> = new Map();

    for (const member of activeMembers) {
      let fullContent = '';

      try {
        const stream = this.streamMemberResponse(request, member);

        for await (const chunk of stream) {
          if (chunk.content) {
            fullContent += chunk.content;
            yield {
              type: 'chunk',
              memberId: member.id,
              content: chunk.content,
              timestamp: new Date()
            };
          }

          if (chunk.done) {
            fullResponses.set(member.id, fullContent);
            yield {
              type: 'member_complete',
              memberId: member.id,
              contentLength: fullContent.length,
              timestamp: new Date()
            };
          }
        }
      } catch (error) {
        yield {
          type: 'member_error',
          memberId: member.id,
          error: (error as Error).message,
          timestamp: new Date()
        };
      }
    }

    // Signal completion
    yield {
      type: 'complete',
      responseCount: fullResponses.size,
      timestamp: new Date()
    };
  }

  /**
   * Stream response from a single council member
   * @internal
   */
  private async *streamMemberResponse(
    request: UserRequest,
    member: CouncilMember
  ): AsyncGenerator<{ content: string; done: boolean }> {
    try {
      const adapter = this.providerPool.getAdapter(member.provider);

      // Check if adapter supports streaming
      if ('sendStreamingRequest' in adapter && typeof adapter.sendStreamingRequest === 'function') {
        // Use streaming adapter
        yield* adapter.sendStreamingRequest(member, request.query, request.context);
      } else {
        // Fall back to non-streaming - yield single chunk with full response
        const response = await adapter.sendRequest(member, request.query, request.context);
        yield { content: response.content, done: false };
        yield { content: '', done: true };
      }
    } catch (error) {
      logger.error(`Error streaming from ${member.id}`, { component: 'streaming-member', memberId: member.id }, error);
      throw error;
    }
  }

}

/**
 * Event types for streaming responses
 */
export interface StreamEvent {
  type: 'start' | 'chunk' | 'member_complete' | 'member_error' | 'error' | 'complete';
  memberId?: string;
  content?: string;
  error?: string;
  memberCount?: number;
  members?: Array<{ id: string; model: string }>;
  contentLength?: number;
  responseCount?: number;
  timestamp: Date;
}
