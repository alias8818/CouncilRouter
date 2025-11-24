/**
 * Orchestration Engine
 * Coordinates the entire request lifecycle including distribution, collection, and timeout handling
 */

import { IOrchestrationEngine } from '../interfaces/IOrchestrationEngine';
import { IProviderPool } from '../interfaces/IProviderPool';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';
import { ISynthesisEngine } from '../interfaces/ISynthesisEngine';
import { ProviderHealthTracker, getSharedHealthTracker } from '../providers/health-tracker';
import {
  UserRequest,
  CouncilMember,
  InitialResponse,
  DeliberationThread,
  ConsensusDecision,
  ProviderResponse,
  DeliberationRound,
  Exchange
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

  // Track partial responses per request (keyed by request ID) to avoid shared state corruption
  private partialResponsesByRequest: Map<string, TrackedResponse[]> = new Map();

  // Store deliberation threads by request ID for API retrieval
  private deliberationThreadsByRequest: Map<string, DeliberationThread> = new Map();

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
  }

  /**
   * Process a user request through the entire council deliberation cycle
   */
  async processRequest(request: UserRequest): Promise<ConsensusDecision> {
    // Get configurations
    const councilConfig = await this.configManager.getCouncilConfig();
    const deliberationConfig = await this.configManager.getDeliberationConfig();
    const performanceConfig = await this.configManager.getPerformanceConfig();
    const synthesisConfig = await this.configManager.getSynthesisConfig();

    // Filter out disabled members
    const activeMembers = await this.filterActiveMembers(councilConfig.members);

    // Check minimum quorum
    if (councilConfig.requireMinimumForConsensus &&
        activeMembers.length < councilConfig.minimumSize) {
      throw new Error(
        `Insufficient council members: ${activeMembers.length} available, ` +
        `${councilConfig.minimumSize} required`
      );
    }

    // Set up global timeout
    // Validate globalTimeout value to prevent NaN
    if (typeof performanceConfig.globalTimeout !== 'number' ||
        isNaN(performanceConfig.globalTimeout) ||
        performanceConfig.globalTimeout <= 0) {
      throw new Error(`Invalid globalTimeout value: ${performanceConfig.globalTimeout}`);
    }
    const globalTimeoutMs = performanceConfig.globalTimeout * 1000;
    const globalTimeoutPromise = this.createGlobalTimeout(globalTimeoutMs);

    try {
      // Initialize partial responses tracking for this request
      this.partialResponsesByRequest.set(request.id, []);

      // Distribute request to council with global timeout
      const distributionPromise = this.distributeToCouncil(request, activeMembers);

      // Use Promise.race with proper timeout handling
      const raceResult = await Promise.race([
        distributionPromise.then(responses => ({ type: 'success' as const, responses })),
        globalTimeoutPromise.then(() => ({ type: 'timeout' as const }))
      ]);

      if (raceResult.type === 'timeout') {
        // Global timeout occurred - wait for distribution to settle and collect partial results
        // Use Promise.allSettled to ensure all callbacks complete
        await Promise.allSettled([distributionPromise]);
        // Get partial responses for this request
        const partialResponses = this.partialResponsesByRequest.get(request.id) || [];
        // Clean up tracking
        this.partialResponsesByRequest.delete(request.id);
        return await this.handleTimeout(request, partialResponses);
      }

      // Clean up tracking
      this.partialResponsesByRequest.delete(request.id);

      // Conduct deliberation if configured
      const deliberationThread = await this.conductDeliberation(
        raceResult.responses,
        deliberationConfig.rounds
      );

      // Store deliberation thread for API retrieval
      this.deliberationThreadsByRequest.set(request.id, deliberationThread);

      // Synthesize consensus decision
      const consensusDecision = await this.synthesisEngine.synthesize(
        request,
        deliberationThread,
        synthesisConfig.strategy
      );

      return consensusDecision;
    } catch (error) {
      // If all members failed, throw error
      throw new Error(`Request processing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Distribute a request to all configured council members in parallel
   */
  async distributeToCouncil(
    request: UserRequest,
    councilMembers: CouncilMember[]
  ): Promise<InitialResponse[]> {
    // Get or initialize partial responses tracking for this request
    const partialResponses = this.partialResponsesByRequest.get(request.id) || [];
    this.partialResponsesByRequest.set(request.id, partialResponses);

    // Create promises for all council member requests
    const requestPromises = councilMembers.map(member =>
      this.sendRequestToMember(request, member).then(result => {
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
        console.log(`✓ Council member ${member.id} (${member.provider}/${member.model}) responded successfully`);

        const initialResponse = result.value.initialResponse;
        console.error(`[Orchestration] STEP 4: Received InitialResponse for ${member.id}:`, {
          contentType: typeof initialResponse.content,
          isArray: Array.isArray(initialResponse.content),
          contentLength: typeof initialResponse.content === 'string' ? initialResponse.content.length : 'N/A',
          contentPreview: typeof initialResponse.content === 'string' ? initialResponse.content.substring(0, 200) : JSON.stringify(initialResponse.content).substring(0, 500),
          hasObjectObject: typeof initialResponse.content === 'string' && initialResponse.content.includes('[object Object]')
        });

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

    // Log summary of successful vs failed members
    const successfulMembers = initialResponses.map(r => r.councilMemberId).join(', ');
    console.log(`\n[Request ${request.id}] Council response summary:`);
    console.log(`  ✓ Successful (${initialResponses.length}/${councilMembers.length}): ${successfulMembers}`);
    if (failureDetails.length > 0) {
      console.log(`  ✗ Failed (${failureDetails.length}/${councilMembers.length}):`);
      failureDetails.forEach(detail => console.log(`    - ${detail}`));
    }

    return initialResponses;
  }

  /**
   * Conduct deliberation rounds with peer response sharing
   */
  async conductDeliberation(
    initialResponses: InitialResponse[],
    rounds: number
  ): Promise<DeliberationThread> {
    const startTime = Date.now();
    const deliberationRounds: DeliberationRound[] = [];

    // Round 0: Initial responses
    console.error(`[Orchestration] STEP 5: Creating Round 0 exchanges from ${initialResponses.length} initial responses`);
    deliberationRounds.push({
      roundNumber: 0,
      exchanges: initialResponses.map((response, idx) => {
        console.error(`[Orchestration] STEP 5.${idx}: Processing initial response ${response.councilMemberId}:`, {
          contentType: typeof response.content,
          isArray: Array.isArray(response.content),
          contentPreview: typeof response.content === 'string' ? response.content.substring(0, 200) : JSON.stringify(response.content).substring(0, 500)
        });

        // Ensure content is always a string
        let content = response.content;
        if (typeof content !== 'string') {
          if (content && typeof content === 'object') {
            if (Array.isArray(content)) {
              // Handle arrays properly - extract strings from each item
              const contentArray = content as any[];
              content = contentArray.map((item: any) => {
                if (typeof item === 'string') {return item;}
                if (item && typeof item === 'object') {
                  return item.text || item.content || item.message || JSON.stringify(item);
                }
                return String(item || '');
              }).filter((item: string) => item && !item.includes('[object Object]')).join(' ');
            } else {
              content = (content as any).text || (content as any).content || (content as any).message || JSON.stringify(content);
            }
          } else {
            content = String(content || '');
          }
        }
        // Final safety check
        if (content && typeof content === 'string' && content.includes('[object Object]')) {
          console.warn(`[Orchestration] Found [object Object] in initial response for ${response.councilMemberId}`);
          content = 'Content extraction failed';
        }
        const exchange = {
          councilMemberId: response.councilMemberId,
          content: content,
          referencesTo: [],
          tokenUsage: response.tokenUsage
        };

        console.error(`[Orchestration] STEP 5.${idx}: Created Round 0 exchange for ${response.councilMemberId}:`, {
          exchangeContentType: typeof exchange.content,
          exchangeContentLength: typeof exchange.content === 'string' ? exchange.content.length : 'N/A',
          exchangeContentPreview: typeof exchange.content === 'string' ? exchange.content.substring(0, 200) : JSON.stringify(exchange.content).substring(0, 500),
          hasObjectObject: typeof exchange.content === 'string' && exchange.content.includes('[object Object]')
        });

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
    const councilConfig = await this.configManager.getCouncilConfig();
    const memberMap = new Map(councilConfig.members.map(m => [m.id, m]));

    // Conduct deliberation rounds
    let previousRoundResponses = initialResponses;

    for (let roundNum = 1; roundNum <= rounds; roundNum++) {
      const roundExchanges = await this.conductDeliberationRound(
        roundNum,
        previousRoundResponses,
        memberMap
      );

      deliberationRounds.push({
        roundNumber: roundNum,
        exchanges: roundExchanges
      });

      // Update previous responses for next round
      previousRoundResponses = roundExchanges.map(exchange => {
        // Ensure content is always a string (defensive check)
        let content = exchange.content;
        if (typeof content !== 'string') {
          if (content && typeof content === 'object') {
            if (Array.isArray(content)) {
              // Handle arrays properly - extract strings from each item
              const contentArray = content as any[];
              content = contentArray.map((item: any) => {
                if (typeof item === 'string') {return item;}
                if (item && typeof item === 'object') {
                  return item.text || item.content || item.message || JSON.stringify(item);
                }
                return String(item || '');
              }).filter((item: string) => item && !item.includes('[object Object]')).join(' ');
            } else {
              content = (content as any).text || (content as any).content || (content as any).message || JSON.stringify(content);
            }
          } else {
            content = String(content || '');
          }
        }
        // Final check - if it still contains [object Object], try to extract properly
        if (content && typeof content === 'string' && content.includes('[object Object]')) {
          console.warn(`[Orchestration] Found [object Object] in content for ${exchange.councilMemberId}, attempting recovery`);
          // Try to recover from the original exchange content
          const original = exchange.content;
          if (original && typeof original === 'object' && Array.isArray(original)) {
            const originalArray = original as any[];
            content = originalArray.map((item: any) => {
              if (typeof item === 'string') {return item;}
              return item?.text || item?.content || item?.message || JSON.stringify(item);
            }).filter((item: string) => item && !item.includes('[object Object]')).join(' ');
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
    memberMap: Map<string, CouncilMember>
  ): Promise<Exchange[]> {
    // Create deliberation prompts for each council member
    const deliberationPromises = previousResponses.map(async (response) => {
      const member = memberMap.get(response.councilMemberId);
      if (!member) {
        throw new Error(`Council member ${response.councilMemberId} not found`);
      }

      // Get peer responses (all responses except this member's own)
      const peerResponses = previousResponses.filter(
        r => r.councilMemberId !== response.councilMemberId
      );

      // Generate deliberation prompt
      const deliberationPrompt = this.generateDeliberationPrompt(
        response,
        peerResponses,
        roundNumber
      );

      // Send deliberation request to council member
      console.error(`[Orchestration] STEP 6: Round ${roundNumber} - Sending deliberation request to ${response.councilMemberId}`);
      const _startTime = Date.now();
      const providerResponse = await this.providerPool.sendRequest(
        member,
        deliberationPrompt,
        undefined // No conversation context for deliberation
      );
      const _endTime = Date.now();

      console.error(`[Orchestration] STEP 7: Round ${roundNumber} - Received provider response for ${response.councilMemberId}:`, {
        success: providerResponse.success,
        contentType: typeof providerResponse.content,
        isArray: Array.isArray(providerResponse.content),
        contentPreview: typeof providerResponse.content === 'string' ? providerResponse.content.substring(0, 200) : JSON.stringify(providerResponse.content).substring(0, 500),
        hasObjectObject: typeof providerResponse.content === 'string' && providerResponse.content.includes('[object Object]')
      });

      if (!providerResponse.success) {
        // If deliberation fails, use original response
        console.error(`[Orchestration] STEP 7: Round ${roundNumber} - Deliberation failed for ${response.councilMemberId}, using original response`);
        return {
          councilMemberId: response.councilMemberId,
          content: response.content,
          referencesTo: peerResponses.map(r => r.councilMemberId),
          tokenUsage: response.tokenUsage
        };
      }

      // Ensure content is always a string
      let content = providerResponse.content;

      // Debug logging
      console.error(`[Orchestration] STEP 8: Round ${roundNumber} - Processing content for ${response.councilMemberId}:`, {
        contentType: typeof content,
        isArray: Array.isArray(content),
        contentPreview: typeof content === 'string' ? content.substring(0, 200) : JSON.stringify(content).substring(0, 500),
        hasObjectObject: typeof content === 'string' && content.includes('[object Object]')
      });

      if (typeof content !== 'string') {
        console.error(`[Orchestration] ERROR: Round ${roundNumber} - Deliberation response for ${response.councilMemberId} has non-string content:`, {
          type: typeof content,
          isArray: Array.isArray(content),
          content: content
        });
      } else if (content.includes('[object Object]')) {
        console.error(`[Orchestration] ERROR: Round ${roundNumber} - Deliberation response for ${response.councilMemberId} has corrupted content string:`, {
          content: content,
          contentLength: content.length
        });
      }

      if (typeof content !== 'string') {
        if (content && typeof content === 'object') {
          if (Array.isArray(content)) {
            // Handle arrays properly - extract strings from each item
            const contentArray = content as any[];
            content = contentArray.map((item: any) => {
              if (typeof item === 'string') {return item;}
              if (item && typeof item === 'object') {
                return item.text || item.content || item.message || JSON.stringify(item);
              }
              return String(item || '');
            }).filter((item: string) => item && !item.includes('[object Object]')).join(' ');
          } else {
            content = (content as any).text || (content as any).content || (content as any).message || JSON.stringify(content);
          }
        } else {
          content = String(content || '');
        }
      }
      // Final safety check
      if (content && typeof content === 'string' && content.includes('[object Object]')) {
        console.warn(`[Orchestration] Found [object Object] in deliberation response for ${response.councilMemberId}`);
        content = 'Content extraction failed';
      }

      const exchange = {
        councilMemberId: response.councilMemberId,
        content: content,
        referencesTo: peerResponses.map(r => r.councilMemberId),
        tokenUsage: providerResponse.tokenUsage
      };

      console.error(`[Orchestration] STEP 9: Round ${roundNumber} - Created exchange for ${response.councilMemberId}:`, {
        exchangeContentType: typeof exchange.content,
        exchangeContentLength: typeof exchange.content === 'string' ? exchange.content.length : 'N/A',
        exchangeContentPreview: typeof exchange.content === 'string' ? exchange.content.substring(0, 200) : JSON.stringify(exchange.content).substring(0, 500),
        hasObjectObject: typeof exchange.content === 'string' && exchange.content.includes('[object Object]')
      });

      return exchange;
    });

    // Wait for all deliberation responses
    const exchanges = await Promise.all(deliberationPromises);

    return exchanges;
  }

  /**
   * Generate a deliberation prompt for peer review
   */
  private generateDeliberationPrompt(
    ownResponse: InitialResponse,
    peerResponses: InitialResponse[],
    roundNumber: number
  ): string {
    let prompt = `You are participating in a deliberation round ${roundNumber} with other AI models.\n\n`;

    prompt += `Your previous response was:\n"${ownResponse.content}"\n\n`;

    prompt += 'Here are the responses from other council members:\n\n';

    peerResponses.forEach((peer, index) => {
      prompt += `Council Member ${index + 1} (${peer.councilMemberId}):\n`;
      prompt += `"${peer.content}"\n\n`;
    });

    prompt += 'Please review these responses and provide your critique, agreement, or alternative perspectives. ';
    prompt += 'Consider:\n';
    prompt += '- Points of agreement or disagreement\n';
    prompt += '- Strengths and weaknesses in each response\n';
    prompt += '- Additional insights or perspectives not yet covered\n';
    prompt += '- How your view might be refined based on these perspectives\n\n';
    prompt += 'Provide your deliberation response:';

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
      return obj && typeof obj === 'object' &&
             'memberId' in obj &&
             'response' in obj &&
             'initialResponse' in obj;
    };

    if (!Array.isArray(partialResponses) || !partialResponses.every(isTrackedResponse)) {
      throw new Error('Invalid partial responses: expected TrackedResponse[]');
    }

    const trackedResponses = partialResponses;

    if (trackedResponses.length === 0) {
      throw new Error('Global timeout reached with no successful responses');
    }

    // Convert to deliberation thread with actual member IDs
    const deliberationThread: DeliberationThread = {
      rounds: [{
        roundNumber: 0,
        exchanges: trackedResponses.map((tracked) => {
          // Ensure content is always a string
          let content = tracked.response.content;
          if (typeof content !== 'string') {
            if (content && typeof content === 'object') {
              content = (content as any).text || (content as any).content || (content as any).message || JSON.stringify(content);
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
      }],
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

    // Mark as low confidence due to timeout
    return {
      ...consensusDecision,
      confidence: 'low'
    };
  }

  /**
   * Send request to a single council member with timeout handling
   * CRITICAL FIX: Properly clears timeout to prevent resource leaks
   */
  private async sendRequestToMember(
    request: UserRequest,
    member: CouncilMember
  ): Promise<{ response: ProviderResponse; initialResponse: InitialResponse; memberId: string }> {
    const startTime = Date.now();

    // Create timeout promise for this specific member with cleanup
    // Validate timeout value to prevent NaN
    if (typeof member.timeout !== 'number' || isNaN(member.timeout) || member.timeout <= 0) {
      throw new Error(`Invalid timeout value for member ${member.id}: ${member.timeout}`);
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
          error: new Error(`Request to ${member.id} timed out after ${member.timeout}s`)
        });
      }, timeoutMs);
    });

    // Race between actual request and timeout
    const response = await Promise.race([
      this.providerPool.sendRequest(member, request.query, request.context),
      timeoutPromise
    ]);

    // CRITICAL FIX: Clear timeout if request completed first to prevent resource leak
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    const endTime = Date.now();
    const latency = endTime - startTime;

    // Ensure content is always a string before creating InitialResponse
    let content = response.content;

    // Debug logging
    if (typeof content !== 'string') {
      console.warn(`[Orchestration] InitialResponse for ${member.id} has non-string content:`, {
        type: typeof content,
        isArray: Array.isArray(content),
        content: content,
        responseKeys: response ? Object.keys(response) : []
      });
    } else if (content.includes('[object Object]')) {
      console.error(`[Orchestration] InitialResponse for ${member.id} has corrupted content string:`, {
        content: content,
        contentLength: content.length
      });
    }

    if (typeof content !== 'string') {
      if (content && typeof content === 'object') {
        content = (content as any).text || (content as any).content || (content as any).message || JSON.stringify(content);
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
  private async filterActiveMembers(members: CouncilMember[]): Promise<CouncilMember[]> {
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
      const disabledReason = this.healthTracker.getDisabledReason(member.provider);
      this.providerPool.markProviderDisabled(
        member.provider,
        disabledReason || `Provider ${member.provider} failed ${failureCount} consecutive times`
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

}
