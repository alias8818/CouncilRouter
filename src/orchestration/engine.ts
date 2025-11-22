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
 */
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
        return await this.handleTimeout(partialResponses);
      }
      
      // Clean up tracking
      this.partialResponsesByRequest.delete(request.id);
      
      // Conduct deliberation if configured
      const deliberationThread = await this.conductDeliberation(
        raceResult.responses,
        deliberationConfig.rounds
      );
      
      // Synthesize consensus decision
      const consensusDecision = await this.synthesisEngine.synthesize(
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
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const member = councilMembers[i];
      
      if (result.status === 'fulfilled' && result.value.response.success) {
        // Successful response
        initialResponses.push(result.value.initialResponse);
        this.resetFailureCount(member);
      } else {
        // Failed response - track failure
        // Handle both rejected promises and failed responses
        this.trackFailure(member);
      }
    }
    
    // Check if we have at least one successful response
    if (initialResponses.length === 0) {
      throw new Error('All council members failed to respond');
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
    deliberationRounds.push({
      roundNumber: 0,
      exchanges: initialResponses.map(response => ({
        councilMemberId: response.councilMemberId,
        content: response.content,
        referencesTo: [],
        tokenUsage: response.tokenUsage
      }))
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
      previousRoundResponses = roundExchanges.map(exchange => ({
        councilMemberId: exchange.councilMemberId,
        content: exchange.content,
        tokenUsage: exchange.tokenUsage,
        latency: 0,
        timestamp: new Date()
      }));
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
      const startTime = Date.now();
      const providerResponse = await this.providerPool.sendRequest(
        member,
        deliberationPrompt,
        undefined // No conversation context for deliberation
      );
      const endTime = Date.now();
      
      if (!providerResponse.success) {
        // If deliberation fails, use original response
        return {
          councilMemberId: response.councilMemberId,
          content: response.content,
          referencesTo: peerResponses.map(r => r.councilMemberId),
          tokenUsage: response.tokenUsage
        };
      }
      
      return {
        councilMemberId: response.councilMemberId,
        content: providerResponse.content,
        referencesTo: peerResponses.map(r => r.councilMemberId),
        tokenUsage: providerResponse.tokenUsage
      };
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
    
    prompt += `Here are the responses from other council members:\n\n`;
    
    peerResponses.forEach((peer, index) => {
      prompt += `Council Member ${index + 1} (${peer.councilMemberId}):\n`;
      prompt += `"${peer.content}"\n\n`;
    });
    
    prompt += `Please review these responses and provide your critique, agreement, or alternative perspectives. `;
    prompt += `Consider:\n`;
    prompt += `- Points of agreement or disagreement\n`;
    prompt += `- Strengths and weaknesses in each response\n`;
    prompt += `- Additional insights or perspectives not yet covered\n`;
    prompt += `- How your view might be refined based on these perspectives\n\n`;
    prompt += `Provide your deliberation response:`;
    
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
    partialResponses: ProviderResponse[] | TrackedResponse[]
  ): Promise<ConsensusDecision> {
    // Use the partial responses passed as parameter (collected from getPartialResults)
    // This ensures we use the complete set of responses that were successfully collected
    // before the timeout, rather than relying on this.partialResponses which may be incomplete
    // if the timeout occurred before all callbacks executed
    
    // getPartialResults now returns TrackedResponse[], so we can safely cast
    // The interface allows ProviderResponse[] for backward compatibility, but internally
    // we always pass TrackedResponse[] from getPartialResults
    const trackedResponses = partialResponses as TrackedResponse[];
    
    if (trackedResponses.length === 0) {
      throw new Error('Global timeout reached with no successful responses');
    }
    
    // Convert to deliberation thread with actual member IDs
    const deliberationThread: DeliberationThread = {
      rounds: [{
        roundNumber: 0,
        exchanges: trackedResponses.map((tracked) => ({
          councilMemberId: tracked.memberId, // Use actual member ID
          content: tracked.response.content,
          referencesTo: [],
          tokenUsage: tracked.response.tokenUsage
        }))
      }],
      totalDuration: 0
    };
    
    // Get synthesis config
    const synthesisConfig = await this.configManager.getSynthesisConfig();
    
    // Synthesize with partial responses
    const consensusDecision = await this.synthesisEngine.synthesize(
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
   */
  private async sendRequestToMember(
    request: UserRequest,
    member: CouncilMember
  ): Promise<{ response: ProviderResponse; initialResponse: InitialResponse; memberId: string }> {
    const startTime = Date.now();
    
    // Create timeout promise for this specific member
    const timeoutMs = member.timeout * 1000;
    const timeoutPromise = new Promise<ProviderResponse>((resolve) => {
      setTimeout(() => {
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
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    // Convert to InitialResponse format
    const initialResponse: InitialResponse = {
      councilMemberId: member.id,
      content: response.content,
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
   * Create a global timeout promise
   */
  private createGlobalTimeout(timeoutMs: number): Promise<'GLOBAL_TIMEOUT'> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve('GLOBAL_TIMEOUT');
      }, timeoutMs);
    });
  }
  
}
