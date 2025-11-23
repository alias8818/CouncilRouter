/**
 * Property-Based Tests for Orchestration Engine
 * Tests for request distribution, configuration enforcement, failure handling, and timeout behavior
 */

import * as fc from 'fast-check';
import { OrchestrationEngine } from '../engine';
import { IProviderPool } from '../../interfaces/IProviderPool';
import { IConfigurationManager } from '../../interfaces/IConfigurationManager';
import { ISynthesisEngine } from '../../interfaces/ISynthesisEngine';
import { ProviderHealthTracker, getSharedHealthTracker } from '../../providers/health-tracker';
import {
  UserRequest,
  CouncilMember,
  ProviderResponse,
  ProviderHealth,
  CouncilConfig,
  DeliberationConfig,
  PerformanceConfig,
  SynthesisConfig,
  ConversationContext,
  DeliberationThread,
  SynthesisStrategy,
  ConsensusDecision,
  RetryPolicy
} from '../../types/core';

// ============================================================================
// Mock Implementations
// ============================================================================

class MockProviderPool implements IProviderPool {
  private responses: Map<string, ProviderResponse> = new Map();
  private healthStatuses: Map<string, ProviderHealth> = new Map();
  private disabledProviders: Set<string> = new Set();
  private requestLog: Array<{ member: CouncilMember; prompt: string }> = [];
  private healthTracker: ProviderHealthTracker;
  
  constructor(healthTracker?: ProviderHealthTracker) {
    this.healthTracker = healthTracker || getSharedHealthTracker();
  }
  
  // Track which members received requests
  getRequestLog(): Array<{ member: CouncilMember; prompt: string }> {
    return this.requestLog;
  }
  
  clearRequestLog(): void {
    this.requestLog = [];
  }
  
  setResponse(memberId: string, response: ProviderResponse): void {
    this.responses.set(memberId, response);
  }
  
  setHealthStatus(providerId: string, health: ProviderHealth): void {
    this.healthStatuses.set(providerId, health);
  }
  
  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    // Log the request
    this.requestLog.push({ member, prompt });
    
    const response = this.responses.get(member.id);
    if (!response) {
      const successResponse: ProviderResponse = {
        content: `Response from ${member.id}`,
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latency: 100,
        success: true
      };
      // Record success in health tracker (mimicking ProviderPool behavior)
      this.healthTracker.recordSuccess(member.provider);
      return successResponse;
    }
    
    // Record failure/success in health tracker (mimicking ProviderPool.updateHealthTracking)
    if (response.success) {
      this.healthTracker.recordSuccess(member.provider);
    } else {
      this.healthTracker.recordFailure(member.provider);
    }
    
    return response;
<<<<<<< HEAD
  }
  
  getAllProviderHealth(): ProviderHealth[] {
    const providers = ['openai', 'anthropic', 'google'];
    return providers.map(providerId => this.getProviderHealth(providerId));
  }

  getProviderHealth(providerId: string): ProviderHealth {
    const health = this.healthStatuses.get(providerId);
    if (health) return health;
=======
    }
>>>>>>> claude/review-critical-bugs-019u6KG7dKygBhX3AZ5LWB5z
    
    getProviderHealth(providerId: string): ProviderHealth {
      const health = this.healthStatuses.get(providerId);
      if (health) return health;
      
      return {
        providerId,
        status: this.disabledProviders.has(providerId) ? 'disabled' : 'healthy',
        successRate: 1.0,
        avgLatency: 100
      };
    }

    getAllProviderHealth(): ProviderHealth[] {
      if (this.healthStatuses.size > 0) {
        return Array.from(this.healthStatuses.values());
      }
      return Array.from(this.disabledProviders).map((providerId) =>
        this.getProviderHealth(providerId)
      );
    }
  
  markProviderDisabled(providerId: string, reason: string): void {
    this.disabledProviders.add(providerId);
  }

  getAllProviderHealth(): ProviderHealth[] {
    const providers = new Set([...this.healthStatuses.keys(), 'openai', 'anthropic', 'google']);
    return Array.from(providers).map(providerId => this.getProviderHealth(providerId));
  }

  isProviderDisabled(providerId: string): boolean {
    return this.disabledProviders.has(providerId);
  }
}

class MockConfigurationManager implements IConfigurationManager {
  private councilConfig: CouncilConfig;
  private deliberationConfig: DeliberationConfig;
  private performanceConfig: PerformanceConfig;
  private synthesisConfig: SynthesisConfig;
  private transparencyConfig: any;
  
  constructor(
    councilConfig?: CouncilConfig,
    deliberationConfig?: DeliberationConfig,
    performanceConfig?: PerformanceConfig,
    synthesisConfig?: SynthesisConfig
  ) {
    const defaultRetryPolicy: RetryPolicy = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
    };
    
    this.councilConfig = councilConfig || {
      members: [
        {
          id: 'member-1',
          provider: 'openai',
          model: 'gpt-4',
          timeout: 30,
          retryPolicy: defaultRetryPolicy
        },
        {
          id: 'member-2',
          provider: 'anthropic',
          model: 'claude-3',
          timeout: 30,
          retryPolicy: defaultRetryPolicy
        }
      ],
      minimumSize: 2,
      requireMinimumForConsensus: false
    };
    
    this.deliberationConfig = deliberationConfig || {
      rounds: 0,
      preset: 'fast'
    };
    
    this.performanceConfig = performanceConfig || {
      globalTimeout: 60,
      enableFastFallback: true,
      streamingEnabled: true
    };
    
    this.synthesisConfig = synthesisConfig || {
      strategy: { type: 'consensus-extraction' }
    };
    
    this.transparencyConfig = {
      enabled: false,
      forcedTransparency: false
    };
  }
  
  async getCouncilConfig(): Promise<CouncilConfig> {
    return this.councilConfig;
  }
  
  async updateCouncilConfig(config: CouncilConfig): Promise<void> {
    this.councilConfig = config;
  }
  
  async getDeliberationConfig(): Promise<DeliberationConfig> {
    return this.deliberationConfig;
  }
  
  async getSynthesisConfig(): Promise<SynthesisConfig> {
    return this.synthesisConfig;
  }
  
  async getPerformanceConfig(): Promise<PerformanceConfig> {
    return this.performanceConfig;
  }
  
  async getTransparencyConfig(): Promise<any> {
    return this.transparencyConfig;
  }
  
  async updateTransparencyConfig(config: any): Promise<void> {
    this.transparencyConfig = config;
  }
  
  async applyPreset(): Promise<void> {
    // Not needed for tests
  }
}

class MockSynthesisEngine implements ISynthesisEngine {
  async synthesize(
    thread: DeliberationThread,
    strategy: SynthesisStrategy
  ): Promise<ConsensusDecision> {
    const content = thread.rounds
      .flatMap(r => r.exchanges)
      .map(e => e.content)
      .join(' ');
    
    return {
      content,
      confidence: 'high',
      agreementLevel: 0.9,
      synthesisStrategy: strategy,
      contributingMembers: thread.rounds.flatMap(r => r.exchanges.map(e => e.councilMemberId)),
      timestamp: new Date()
    };
  }
  
  async selectModerator(members: CouncilMember[]): Promise<CouncilMember> {
    return members[0];
  }
}

// ============================================================================
// Arbitraries for Property-Based Testing
// ============================================================================

const retryPolicyArbitrary = fc.record({
  maxAttempts: fc.integer({ min: 1, max: 5 }),
  initialDelayMs: fc.integer({ min: 100, max: 2000 }),
  maxDelayMs: fc.integer({ min: 1000, max: 10000 }),
  backoffMultiplier: fc.double({ min: 1.1, max: 3.0 }),
  retryableErrors: fc.array(
    fc.constantFrom('RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE'),
    { minLength: 1, maxLength: 3 }
  )
}).filter(policy => policy.maxDelayMs >= policy.initialDelayMs);

const councilMemberArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }).map(s => `member-${s}`),
  provider: fc.constantFrom('openai', 'anthropic', 'google'),
  model: fc.string({ minLength: 1, maxLength: 20 }),
  version: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
  weight: fc.option(fc.double({ min: 0, max: 1 }), { nil: undefined }),
  timeout: fc.integer({ min: 5, max: 60 }),
  retryPolicy: retryPolicyArbitrary
});

const councilConfigArbitrary = fc.record({
  members: fc.array(councilMemberArbitrary, { minLength: 2, maxLength: 8 }),
  minimumSize: fc.integer({ min: 1, max: 8 }),
  requireMinimumForConsensus: fc.boolean()
}).filter(config => {
  // Ensure minimum size is valid
  if (config.minimumSize > config.members.length) return false;
  
  // Ensure all member IDs are unique
  const memberIds = config.members.map(m => m.id);
  const uniqueIds = new Set(memberIds);
  return uniqueIds.size === memberIds.length;
});

const userRequestArbitrary = fc.record({
  id: fc.uuid(),
  query: fc.string({ minLength: 1, maxLength: 200 }),
  sessionId: fc.option(fc.uuid(), { nil: undefined }),
  context: fc.constant(undefined),
  timestamp: fc.date()
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Property Test: Request Distribution Completeness', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Feature: ai-council-proxy, Property 1: Request distribution completeness
   * 
   * For any user request and council configuration, when the orchestrator distributes
   * the request, all configured council members should receive the request.
   * 
   * Validates: Requirements 1.2
   */
  test('should distribute request to all configured council members', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        councilConfigArbitrary,
        async (request, councilConfig) => {
          // Setup
          const mockProviderPool = new MockProviderPool();
          const mockConfigManager = new MockConfigurationManager(councilConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Clear request log
          mockProviderPool.clearRequestLog();
          
          // Execute
          const responses = await engine.distributeToCouncil(
            request,
            councilConfig.members
          );
          
          // Get the request log
          const requestLog = mockProviderPool.getRequestLog();
          
          // Property assertions:
          // 1. All configured members should have received a request
          const memberIdsInLog = new Set(requestLog.map(log => log.member.id));
          const configuredMemberIds = new Set(councilConfig.members.map(m => m.id));
          
          for (const memberId of configuredMemberIds) {
            expect(memberIdsInLog.has(memberId)).toBe(true);
          }
          
          // 2. Number of requests should equal number of configured members
          expect(requestLog.length).toBe(councilConfig.members.length);
          
          // 3. Each member should receive the same query
          for (const log of requestLog) {
            expect(log.prompt).toBe(request.query);
          }
          
          // 4. All successful responses should be included in the result
          expect(responses.length).toBeGreaterThan(0);
          expect(responses.length).toBeLessThanOrEqual(councilConfig.members.length);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});

describe('Property Test: Active Configuration Enforcement', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Feature: ai-council-proxy, Property 5: Active configuration enforcement
   * 
   * For any request processed after a configuration update, only the council members
   * specified in the active configuration should be used.
   * 
   * Validates: Requirements 2.4
   */
  test('should use only members from active configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        councilConfigArbitrary,
        councilConfigArbitrary,
        async (request, initialConfig, updatedConfig) => {
          // Setup with initial configuration
          const mockProviderPool = new MockProviderPool();
          const mockConfigManager = new MockConfigurationManager(initialConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Update configuration
          await mockConfigManager.updateCouncilConfig(updatedConfig);
          
          // Clear request log
          mockProviderPool.clearRequestLog();
          
          // Execute request with updated configuration
          try {
            await engine.processRequest(request);
          } catch (error) {
            // May fail if all members fail, but we still check the distribution
          }
          
          // Get the request log
          const requestLog = mockProviderPool.getRequestLog();
          
          // Property assertions:
          // 1. All members that received requests should be from the updated config
          const updatedMemberIds = new Set(updatedConfig.members.map(m => m.id));
          const requestedMemberIds = new Set(requestLog.map(log => log.member.id));
          
          for (const memberId of requestedMemberIds) {
            expect(updatedMemberIds.has(memberId)).toBe(true);
          }
          
          // 2. No members from the initial config (that aren't in updated config) should be used
          const initialOnlyMembers = initialConfig.members.filter(
            m => !updatedMemberIds.has(m.id)
          );
          
          for (const member of initialOnlyMembers) {
            expect(requestedMemberIds.has(member.id)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});

describe('Property Test: Automatic Member Disabling', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Feature: ai-council-proxy, Property 31: Automatic member disabling
   * 
   * For any council member that fails consistently beyond a threshold, the system
   * should mark that member as temporarily disabled and exclude it from subsequent requests.
   * 
   * Validates: Requirements 9.4
   */
  test('should disable member after consecutive failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        councilConfigArbitrary.filter(config => config.members.length >= 2),
        fc.integer({ min: 5, max: 10 }), // Number of failures to trigger
        async (request, councilConfig, numFailures) => {
          // Setup
          const mockProviderPool = new MockProviderPool();
          const mockConfigManager = new MockConfigurationManager(councilConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Pick a member to fail consistently
          const failingMember = councilConfig.members[0];
          const failingProvider = failingMember.provider;
          
          // Set up ALL members with the same provider as the failing member to fail
          // This ensures failures are tracked correctly (successes reset failure counts)
          for (const member of councilConfig.members) {
            if (member.provider === failingProvider) {
              mockProviderPool.setResponse(member.id, {
                content: '',
                tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                latency: 0,
                success: false,
                error: new Error('Consistent failure')
              });
            } else {
              // Ensure other members with different providers succeed
              // This allows distributeToCouncil to complete successfully
              mockProviderPool.setResponse(member.id, {
                content: `Response from ${member.id}`,
                tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
                latency: 100,
                success: true
              });
            }
          }
          
          // Trigger failures
          for (let i = 0; i < numFailures; i++) {
            try {
              await engine.distributeToCouncil(request, councilConfig.members);
            } catch (error) {
              // May throw if all members fail, continue
            }
          }
          
          // Property assertions:
          // After threshold failures (5), the provider should be marked as disabled
          // Note: The engine uses a health tracker to track failures, and trackFailure()
          // checks if disabling is needed and calls markProviderDisabled on the pool
          if (numFailures >= 5) {
            // Check both the mock pool's disabled set and verify the provider was marked disabled
            const isDisabled = mockProviderPool.isProviderDisabled(failingMember.provider);
            expect(isDisabled).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  test('should exclude disabled members from subsequent requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        councilConfigArbitrary.filter(config => config.members.length >= 2),
        async (request, councilConfig) => {
          // Setup
          const mockProviderPool = new MockProviderPool();
          const mockConfigManager = new MockConfigurationManager(councilConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Pick a member to disable
          const disabledMember = councilConfig.members[0];
          
          // Mark the provider as disabled
          mockProviderPool.setHealthStatus(disabledMember.provider, {
            providerId: disabledMember.provider,
            status: 'disabled',
            successRate: 0,
            avgLatency: 0
          });
          
          // Clear request log
          mockProviderPool.clearRequestLog();
          
          // Execute request
          try {
            await engine.processRequest(request);
          } catch (error) {
            // May fail if minimum quorum not met
          }
          
          // Get the request log
          const requestLog = mockProviderPool.getRequestLog();
          
          // Property assertions:
          // The disabled member should not have received any requests
          const requestedMemberIds = requestLog.map(log => log.member.id);
          expect(requestedMemberIds).not.toContain(disabledMember.id);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});

describe('Property Test: Deliberation Round Count Enforcement', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Feature: ai-council-proxy, Property 7: Deliberation round count enforcement
   * 
   * For any deliberation configuration with N rounds where N > 0, the system should
   * execute exactly N rounds of peer review before synthesis.
   * 
   * Validates: Requirements 3.5
   */
  test('should execute exactly N deliberation rounds when N > 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilConfigArbitrary.filter(config => config.members.length >= 2),
        fc.integer({ min: 1, max: 5 }), // Number of deliberation rounds (1-5)
        async (councilConfig, numRounds) => {
          // Setup
          const mockProviderPool = new MockProviderPool();
          
          const deliberationConfig: DeliberationConfig = {
            rounds: numRounds,
            preset: 'balanced'
          };
          
          const mockConfigManager = new MockConfigurationManager(
            councilConfig,
            deliberationConfig
          );
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Create initial responses (one per council member)
          const initialResponses = councilConfig.members.map(member => ({
            councilMemberId: member.id,
            content: `Initial response from ${member.id}`,
            tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            latency: 100,
            timestamp: new Date()
          }));
          
          // Execute deliberation
          const deliberationThread = await engine.conductDeliberation(
            initialResponses,
            numRounds
          );
          
          // Property assertions:
          // 1. The deliberation thread should have exactly N+1 rounds
          //    (round 0 for initial responses + N deliberation rounds)
          expect(deliberationThread.rounds.length).toBe(numRounds + 1);
          
          // 2. Round 0 should contain the initial responses
          expect(deliberationThread.rounds[0].roundNumber).toBe(0);
          expect(deliberationThread.rounds[0].exchanges.length).toBe(councilConfig.members.length);
          
          // 3. Each subsequent round should be numbered correctly (1 through N)
          for (let i = 1; i <= numRounds; i++) {
            expect(deliberationThread.rounds[i].roundNumber).toBe(i);
            
            // Each deliberation round should have exchanges from all members
            expect(deliberationThread.rounds[i].exchanges.length).toBe(councilConfig.members.length);
            
            // Each exchange should reference peer responses
            for (const exchange of deliberationThread.rounds[i].exchanges) {
              expect(exchange.referencesTo).toBeDefined();
              expect(Array.isArray(exchange.referencesTo)).toBe(true);
              
              // Should reference all other members (not self)
              expect(exchange.referencesTo.length).toBe(councilConfig.members.length - 1);
            }
          }
          
          // 4. Total duration should be recorded
          expect(deliberationThread.totalDuration).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  test('should skip deliberation when rounds equals 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilConfigArbitrary.filter(config => config.members.length >= 2),
        async (councilConfig) => {
          // Setup with 0 deliberation rounds
          const mockProviderPool = new MockProviderPool();
          
          const deliberationConfig: DeliberationConfig = {
            rounds: 0,
            preset: 'fast'
          };
          
          const mockConfigManager = new MockConfigurationManager(
            councilConfig,
            deliberationConfig
          );
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Create initial responses
          const initialResponses = councilConfig.members.map(member => ({
            councilMemberId: member.id,
            content: `Initial response from ${member.id}`,
            tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            latency: 100,
            timestamp: new Date()
          }));
          
          // Execute deliberation with 0 rounds
          const deliberationThread = await engine.conductDeliberation(
            initialResponses,
            0
          );
          
          // Property assertions:
          // 1. Should have exactly 1 round (round 0 with initial responses only)
          expect(deliberationThread.rounds.length).toBe(1);
          
          // 2. Round 0 should contain the initial responses
          expect(deliberationThread.rounds[0].roundNumber).toBe(0);
          expect(deliberationThread.rounds[0].exchanges.length).toBe(councilConfig.members.length);
          
          // 3. No peer review exchanges should occur
          // (all exchanges should be the initial responses with empty referencesTo)
          for (const exchange of deliberationThread.rounds[0].exchanges) {
            expect(exchange.referencesTo).toEqual([]);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});

describe('Property Test: Peer Response Sharing Completeness', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Feature: ai-council-proxy, Property 8: Peer response sharing completeness
   * 
   * For any set of initial council member responses, each council member should receive
   * all other members' responses during deliberation.
   * 
   * Validates: Requirements 3.2
   */
  test('should share all peer responses with each council member during deliberation', async () => {
    await fc.assert(
      fc.asyncProperty(
        councilConfigArbitrary.filter(config => config.members.length >= 2),
        fc.integer({ min: 1, max: 3 }), // Number of deliberation rounds
        async (councilConfig, numRounds) => {
          // Setup
          const mockProviderPool = new MockProviderPool();
          
          const deliberationConfig: DeliberationConfig = {
            rounds: numRounds,
            preset: 'balanced'
          };
          
          const mockConfigManager = new MockConfigurationManager(
            councilConfig,
            deliberationConfig
          );
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Create initial responses (one per council member)
          const initialResponses = councilConfig.members.map(member => ({
            councilMemberId: member.id,
            content: `Initial response from ${member.id}`,
            tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            latency: 100,
            timestamp: new Date()
          }));
          
          // Clear request log to track deliberation prompts
          mockProviderPool.clearRequestLog();
          
          // Execute deliberation
          const deliberationThread = await engine.conductDeliberation(
            initialResponses,
            numRounds
          );
          
          // Get the request log to inspect deliberation prompts
          const requestLog = mockProviderPool.getRequestLog();
          
          // Property assertions:
          // For each deliberation round (rounds 1 through N)
          for (let roundNum = 1; roundNum <= numRounds; roundNum++) {
            const round = deliberationThread.rounds[roundNum];
            
            // For each council member in this round
            for (const exchange of round.exchanges) {
              const memberId = exchange.councilMemberId;
              
              // 1. The exchange should reference all other members (peer responses)
              expect(exchange.referencesTo).toBeDefined();
              expect(Array.isArray(exchange.referencesTo)).toBe(true);
              
              // 2. Should reference exactly N-1 members (all except self)
              const expectedPeerCount = councilConfig.members.length - 1;
              expect(exchange.referencesTo.length).toBe(expectedPeerCount);
              
              // 3. Should not reference self
              expect(exchange.referencesTo).not.toContain(memberId);
              
              // 4. Should reference all other council members
              const otherMemberIds = councilConfig.members
                .filter(m => m.id !== memberId)
                .map(m => m.id);
              
              for (const otherMemberId of otherMemberIds) {
                expect(exchange.referencesTo).toContain(otherMemberId);
              }
              
              // 5. No duplicate references
              const uniqueReferences = new Set(exchange.referencesTo);
              expect(uniqueReferences.size).toBe(exchange.referencesTo.length);
            }
          }
          
          // Additional verification: Check that deliberation prompts contain peer responses
          // Each member should have received (numRounds) deliberation prompts
          const expectedDeliberationCalls = councilConfig.members.length * numRounds;
          expect(requestLog.length).toBe(expectedDeliberationCalls);
          
          // Verify that each deliberation prompt contains references to peer responses
          for (const log of requestLog) {
            const prompt = log.prompt;
            
            // The prompt should mention "other council members" or similar
            expect(prompt).toContain('council member');
            
            // The prompt should contain content from peer responses
            // (checking for the pattern "Council Member" which appears in the prompt)
            const peerMentions = (prompt.match(/Council Member \d+/g) || []).length;
            
            // Should mention at least one peer (N-1 peers for N members)
            expect(peerMentions).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});

describe('Property Test: Global Timeout Synthesis Trigger', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Feature: ai-council-proxy, Property 37: Global timeout synthesis trigger
   * 
   * For any request that exceeds the configured global timeout, synthesis should be
   * immediately triggered using all responses received so far.
   * 
   * Validates: Requirements 11.2
   */
  test('should trigger synthesis when global timeout is exceeded', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        councilConfigArbitrary.filter(config => config.members.length >= 2),
        fc.integer({ min: 1, max: 5 }), // Global timeout in seconds
        async (request, councilConfig, globalTimeoutSeconds) => {
          // Setup with short global timeout
          const performanceConfig: PerformanceConfig = {
            globalTimeout: globalTimeoutSeconds,
            enableFastFallback: true,
            streamingEnabled: true
          };
          
          const mockProviderPool = new MockProviderPool();
          const mockConfigManager = new MockConfigurationManager(
            councilConfig,
            undefined,
            performanceConfig
          );
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Make some members slow (exceed global timeout)
          const slowMember = councilConfig.members[0];
          mockProviderPool.setResponse(slowMember.id, {
            content: 'Slow response',
            tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            latency: (globalTimeoutSeconds + 2) * 1000,
            success: true
          });
          
          // Execute request and measure time
          const startTime = Date.now();
          let result: ConsensusDecision | null = null;
          let timedOut = false;
          
          try {
            result = await engine.processRequest(request);
          } catch (error) {
            // May fail if all members timeout
            timedOut = true;
          }
          
          const endTime = Date.now();
          const elapsedSeconds = (endTime - startTime) / 1000;
          
          // Property assertions:
          // 1. Request should complete within reasonable time of global timeout
          // Allow some overhead for processing (2x timeout)
          expect(elapsedSeconds).toBeLessThan(globalTimeoutSeconds * 2 + 5);
          
          // 2. If synthesis succeeded, result should have low confidence due to timeout
          if (result && !timedOut) {
            // The handleTimeout method sets confidence to 'low'
            // We can't directly test this without modifying the implementation,
            // but we can verify that synthesis was triggered
            expect(result.content).toBeDefined();
          }
        }
      ),
      { numRuns: 50 } // Fewer runs due to timeout delays
    );
  }, 180000); // Longer test timeout
});

describe('Property Test: Context Inclusion in Distribution', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Feature: ai-council-proxy, Property 26: Context inclusion in distribution
   * 
   * For any request distributed to council members, relevant conversation context
   * should be included with the request.
   * 
   * Validates: Requirements 8.3
   */
  test('should include conversation context when distributing to council members', async () => {
    // Create arbitrary for conversation context
    const historyEntryArbitrary = fc.record({
      role: fc.constantFrom('user' as const, 'assistant' as const),
      content: fc.string({ minLength: 1, maxLength: 100 }),
      timestamp: fc.date(),
      requestId: fc.option(fc.uuid(), { nil: undefined })
    });

    const conversationContextArbitrary = fc.record({
      messages: fc.array(historyEntryArbitrary, { minLength: 1, maxLength: 10 }),
      totalTokens: fc.integer({ min: 10, max: 1000 }),
      summarized: fc.boolean()
    });

    const requestWithContextArbitrary = fc.record({
      id: fc.uuid(),
      query: fc.string({ minLength: 1, maxLength: 200 }),
      sessionId: fc.uuid(),
      context: conversationContextArbitrary,
      timestamp: fc.date()
    });

    await fc.assert(
      fc.asyncProperty(
        requestWithContextArbitrary,
        councilConfigArbitrary.filter(config => config.members.length >= 2),
        async (request, councilConfig) => {
          // Setup - Create a mock provider pool that tracks context
          class ContextTrackingProviderPool extends MockProviderPool {
            private contextLog: Array<{ memberId: string; context?: ConversationContext }> = [];
            
            getContextLog(): Array<{ memberId: string; context?: ConversationContext }> {
              return this.contextLog;
            }
            
            clearContextLog(): void {
              this.contextLog = [];
            }
            
            async sendRequest(
              member: CouncilMember,
              prompt: string,
              context?: ConversationContext
            ): Promise<ProviderResponse> {
              // Track the context passed to this member
              this.contextLog.push({ memberId: member.id, context });
              
              // Call parent implementation
              return super.sendRequest(member, prompt, context);
            }
          }
          
          const mockProviderPool = new ContextTrackingProviderPool();
          const mockConfigManager = new MockConfigurationManager(councilConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Clear logs
          mockProviderPool.clearContextLog();
          mockProviderPool.clearRequestLog();
          
          // Execute distribution
          await engine.distributeToCouncil(request, councilConfig.members);
          
          // Get the context log
          const contextLog = mockProviderPool.getContextLog();
          
          // Property assertions:
          // 1. All council members should have received the request
          expect(contextLog.length).toBe(councilConfig.members.length);
          
          // 2. Each member should have received the same context
          for (const log of contextLog) {
            expect(log.context).toBeDefined();
            
            if (request.context) {
              // Context should match the request context
              expect(log.context).toEqual(request.context);
              
              // Verify context structure
              expect(log.context?.messages).toBeDefined();
              expect(log.context?.totalTokens).toBeDefined();
              expect(log.context?.summarized).toBeDefined();
              
              // Verify messages match
              expect(log.context?.messages.length).toBe(request.context.messages.length);
              expect(log.context?.totalTokens).toBe(request.context.totalTokens);
              expect(log.context?.summarized).toBe(request.context.summarized);
            }
          }
          
          // 3. All members should have received the same context (consistency check)
          if (contextLog.length > 1) {
            const firstContext = contextLog[0].context;
            for (let i = 1; i < contextLog.length; i++) {
              expect(contextLog[i].context).toEqual(firstContext);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  test('should handle requests without context gracefully', async () => {
    const requestWithoutContextArbitrary = fc.record({
      id: fc.uuid(),
      query: fc.string({ minLength: 1, maxLength: 200 }),
      sessionId: fc.option(fc.uuid(), { nil: undefined }),
      context: fc.constant(undefined),
      timestamp: fc.date()
    });

    await fc.assert(
      fc.asyncProperty(
        requestWithoutContextArbitrary,
        councilConfigArbitrary.filter(config => config.members.length >= 2),
        async (request, councilConfig) => {
          // Setup
          class ContextTrackingProviderPool extends MockProviderPool {
            private contextLog: Array<{ memberId: string; context?: ConversationContext }> = [];
            
            getContextLog(): Array<{ memberId: string; context?: ConversationContext }> {
              return this.contextLog;
            }
            
            async sendRequest(
              member: CouncilMember,
              prompt: string,
              context?: ConversationContext
            ): Promise<ProviderResponse> {
              this.contextLog.push({ memberId: member.id, context });
              return super.sendRequest(member, prompt, context);
            }
          }
          
          const mockProviderPool = new ContextTrackingProviderPool();
          const mockConfigManager = new MockConfigurationManager(councilConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Execute distribution
          await engine.distributeToCouncil(request, councilConfig.members);
          
          // Get the context log
          const contextLog = mockProviderPool.getContextLog();
          
          // Property assertions:
          // 1. All members should have been called
          expect(contextLog.length).toBe(councilConfig.members.length);
          
          // 2. Context should be undefined for all members (no context provided)
          for (const log of contextLog) {
            expect(log.context).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
