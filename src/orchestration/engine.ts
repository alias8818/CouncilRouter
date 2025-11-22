/**
 * Orchestration Engine
 * Coordinates the entire request lifecycle including distribution, collection, and timeout handling
 */

import { IOrchestrationEngine } from '../interfaces/IOrchestrationEngine';
import { IProviderPool } from '../interfaces/IProviderPool';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';
import { ISynthesisEngine } from '../interfaces/ISynthesisEngine';
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
 * Orchestration Engine implementation
 */
export class OrchestrationEngine implements IOrchestrationEngine {
  private providerPool: IProviderPool;
  private configManager: IConfigurationManager;
  private synthesisEngine: ISynthesisEngine;
  
  // Failure tracking for automatic member disabling
  private consecutiveFailures: Map<string, number> = new Map();
  private readonly FAILURE_THRESHOLD = 5; // consecutive failures before disabling
  
  constructor(
    providerPool: IProviderPool,
    configManager: IConfigurationManager,
    synthesisEngine: ISynthesisEngine
  ) {
    this.providerPool = providerPool;
    this.configManager = configManager;
    this.synthesisEngine = synthesisEngine;
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
      // Distribute request to council with global timeout
      const distributionPromise = this.distributeToCouncil(request, activeMembers);
      
      const initialResponses = await Promise.race([
        distributionPromise,
        globalTimeoutPromise
      ]);
      
      // Check if we hit global timeout
      if (initialResponses === 'GLOBAL_TIMEOUT') {
        // Get partial responses collected so far
        const partialResults = await this.getPartialResults(distributionPromise);
        return await this.handleTimeout(partialResults);
      }
      
      // Conduct deliberation if configured
      const deliberationThread = await this.conductDeliberation(
        initialResponses as InitialResponse[],
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
    // Create promises for all council member requests
    const requestPromises = councilMembers.map(member =>
      this.sendRequestToMember(request, member)
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
        this.resetFailureCount(member.id);
      } else {
        // Failed response - track failure
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
   */
  async handleTimeout(
    partialResponses: ProviderResponse[]
  ): Promise<ConsensusDecision> {
    // Filter successful responses
    const successfulResponses = partialResponses.filter(r => r.success);
    
    if (successfulResponses.length === 0) {
      throw new Error('Global timeout reached with no successful responses');
    }
    
    // Convert to InitialResponse format (we need member IDs, but they're not in ProviderResponse)
    // For now, create a simple deliberation thread
    const deliberationThread: DeliberationThread = {
      rounds: [{
        roundNumber: 0,
        exchanges: successfulResponses.map((response, index) => ({
          councilMemberId: `member-${index}`, // Placeholder - will be fixed when we have proper tracking
          content: response.content,
          referencesTo: [],
          tokenUsage: response.tokenUsage
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
  ): Promise<{ response: ProviderResponse; initialResponse: InitialResponse }> {
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
    
    return { response, initialResponse };
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
   * Track failure for a council member
   */
  private trackFailure(member: CouncilMember): void {
    const currentFailures = this.consecutiveFailures.get(member.id) || 0;
    const newFailures = currentFailures + 1;
    
    this.consecutiveFailures.set(member.id, newFailures);
    
    // Check if we should disable this member
    if (newFailures >= this.FAILURE_THRESHOLD) {
      this.providerPool.markProviderDisabled(
        member.provider,
        `Council member ${member.id} failed ${this.FAILURE_THRESHOLD} consecutive times`
      );
    }
  }
  
  /**
   * Reset failure count for a council member
   */
  private resetFailureCount(memberId: string): void {
    this.consecutiveFailures.set(memberId, 0);
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
  
  /**
   * Get partial results from a distribution promise that may still be running
   */
  private async getPartialResults(
    distributionPromise: Promise<InitialResponse[]>
  ): Promise<ProviderResponse[]> {
    // This is a simplified implementation
    // In a real system, we'd track individual member responses as they come in
    try {
      const responses = await Promise.race([
        distributionPromise,
        new Promise<InitialResponse[]>((resolve) => setTimeout(() => resolve([]), 100))
      ]);
      
      return responses.map(r => ({
        content: r.content,
        tokenUsage: r.tokenUsage,
        latency: r.latency,
        success: true
      }));
    } catch {
      return [];
    }
  }
}
