/**
 * Property-Based Test: Graceful Degradation with Partial Responses
 * Feature: ai-council-proxy, Property 30: Graceful degradation with partial responses
 * 
 * Validates: Requirements 9.2
 */

import * as fc from 'fast-check';
import { OrchestrationEngine } from '../engine';
import { IProviderPool } from '../../interfaces/IProviderPool';
import { IConfigurationManager } from '../../interfaces/IConfigurationManager';
import { ISynthesisEngine } from '../../interfaces/ISynthesisEngine';
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
  RetryPolicy,
  DevilsAdvocateConfig
} from '../../types/core';

// ============================================================================
// Mock Implementations
// ============================================================================

class MockProviderPool implements IProviderPool {
  private responses: Map<string, ProviderResponse> = new Map();
  private healthStatuses: Map<string, ProviderHealth> = new Map();
  private disabledProviders: Set<string> = new Set();
  
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
    const response = this.responses.get(member.id);
    if (!response) {
      return {
        content: `Response from ${member.id}`,
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latency: 100,
        success: true
      };
    }
    return response;
  }
  
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
    const providers = ['openai', 'anthropic', 'google'];
    return providers.map(providerId => this.getProviderHealth(providerId));
  }
  
  markProviderDisabled(providerId: string, reason: string): void {
    this.disabledProviders.add(providerId);
  }
}

class MockConfigurationManager implements IConfigurationManager {
  private councilConfig: CouncilConfig;
  private deliberationConfig: DeliberationConfig;
  private performanceConfig: PerformanceConfig;
  private synthesisConfig: SynthesisConfig;
  private transparencyConfig: any;
  private devilsAdvocateConfig: DevilsAdvocateConfig;
  
  constructor(councilConfig?: CouncilConfig) {
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
    
    this.deliberationConfig = {
      rounds: 0,
      preset: 'fast'
    };
    
    this.performanceConfig = {
      globalTimeout: 60,
      enableFastFallback: true,
      streamingEnabled: true
    };
    
    this.synthesisConfig = {
      strategy: { type: 'consensus-extraction' }
    };
    
    this.transparencyConfig = {
      enabled: false,
      forcedTransparency: false
    };

    this.devilsAdvocateConfig = {
      enabled: false,
      applyToCodeRequests: true,
      applyToTextRequests: false,
      intensityLevel: 'moderate',
      provider: 'openai',
      model: 'gpt-4'
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

  async getDevilsAdvocateConfig(): Promise<DevilsAdvocateConfig> {
    return this.devilsAdvocateConfig;
  }

  async updateDevilsAdvocateConfig(config: DevilsAdvocateConfig): Promise<void> {
    this.devilsAdvocateConfig = config;
  }
  
  async applyPreset(): Promise<void> {
    // Not needed for tests
  }
}

class MockSynthesisEngine implements ISynthesisEngine {
  async synthesize(
    request: UserRequest,
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
  maxAttempts: fc.integer({ min: 0, max: 5 }),
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
  members: fc.array(councilMemberArbitrary, { minLength: 3, maxLength: 8 }),
  minimumSize: fc.integer({ min: 1, max: 8 }),
  requireMinimumForConsensus: fc.constant(false) // Must be false for graceful degradation
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

describe('Property Test: Graceful Degradation with Partial Responses', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Feature: ai-council-proxy, Property 30: Graceful degradation with partial responses
   * 
   * For any request where at least one council member successfully responds, a consensus
   * decision should be produced using the available responses.
   * 
   * Validates: Requirements 9.2
   */
  test('should produce consensus decision when at least one member responds successfully', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        councilConfigArbitrary,
        fc.integer({ min: 1, max: 100 }), // Number of failing members (as percentage)
        async (request, councilConfig, failurePercentage) => {
          // Ensure we have at least 3 members for meaningful partial failure testing
          fc.pre(councilConfig.members.length >= 3);
          
          // Calculate how many members should fail (but ensure at least one succeeds)
          const numMembersToFail = Math.min(
            Math.floor((councilConfig.members.length * failurePercentage) / 100),
            councilConfig.members.length - 1 // Always leave at least one successful
          );
          
          // Ensure at least one member fails for this test to be meaningful
          fc.pre(numMembersToFail >= 1);
          
          // Setup
          const mockProviderPool = new MockProviderPool();
          const mockConfigManager = new MockConfigurationManager(councilConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Make some members fail
          for (let i = 0; i < numMembersToFail; i++) {
            const failingMember = councilConfig.members[i];
            mockProviderPool.setResponse(failingMember.id, {
              content: '',
              tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              latency: 0,
              success: false,
              error: new Error('Provider failure')
            });
          }
          
          // Execute request
          const result = await engine.processRequest(request);
          
          // Property assertions:
          // 1. A consensus decision should be produced
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);
          
          // 2. The consensus should include only successful members
          const successfulMemberIds = councilConfig.members
            .slice(numMembersToFail)
            .map(m => m.id);
          
          for (const contributingMember of result.contributingMembers) {
            expect(successfulMemberIds).toContain(contributingMember);
          }
          
          // 3. The number of contributing members should be less than total members
          expect(result.contributingMembers.length).toBeLessThan(councilConfig.members.length);
          
          // 4. The number of contributing members should equal the number of successful members
          const expectedSuccessfulCount = councilConfig.members.length - numMembersToFail;
          expect(result.contributingMembers).toHaveLength(expectedSuccessfulCount);
          
          // 5. Consensus decision should have valid structure
          expect(result.confidence).toBeDefined();
          expect(['high', 'medium', 'low']).toContain(result.confidence);
          expect(result.agreementLevel).toBeGreaterThanOrEqual(0);
          expect(result.agreementLevel).toBeLessThanOrEqual(1);
          expect(result.synthesisStrategy).toBeDefined();
          expect(result.timestamp).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  test('should handle majority failure gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        councilConfigArbitrary.filter(config => config.members.length >= 5),
        async (request, councilConfig) => {
          // Setup - make majority of members fail (but not all)
          const numMembersToFail = councilConfig.members.length - 1;
          
          const mockProviderPool = new MockProviderPool();
          const mockConfigManager = new MockConfigurationManager(councilConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Make all but one member fail
          for (let i = 0; i < numMembersToFail; i++) {
            const failingMember = councilConfig.members[i];
            mockProviderPool.setResponse(failingMember.id, {
              content: '',
              tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              latency: 0,
              success: false,
              error: new Error('Provider failure')
            });
          }
          
          // Execute request
          const result = await engine.processRequest(request);
          
          // Property assertions:
          // 1. Should still produce a consensus decision with just one member
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          
          // 2. Should have exactly one contributing member
          expect(result.contributingMembers).toHaveLength(1);
          
          // 3. The contributing member should be the one that didn't fail
          const successfulMember = councilConfig.members[numMembersToFail];
          expect(result.contributingMembers).toContain(successfulMember.id);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  test('should fail when all members fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        councilConfigArbitrary,
        async (request, councilConfig) => {
          // Setup - make all members fail
          const mockProviderPool = new MockProviderPool();
          const mockConfigManager = new MockConfigurationManager(councilConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Make all members fail
          for (const member of councilConfig.members) {
            mockProviderPool.setResponse(member.id, {
              content: '',
              tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              latency: 0,
              success: false,
              error: new Error('Provider failure')
            });
          }
          
          // Execute request and expect failure
          await expect(engine.processRequest(request)).rejects.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  test('should maintain response quality with partial failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        councilConfigArbitrary.filter(config => config.members.length >= 4),
        async (request, councilConfig) => {
          // Setup - make half the members fail
          const numMembersToFail = Math.floor(councilConfig.members.length / 2);
          
          const mockProviderPool = new MockProviderPool();
          const mockConfigManager = new MockConfigurationManager(councilConfig);
          const mockSynthesisEngine = new MockSynthesisEngine();
          
          const engine = new OrchestrationEngine(
            mockProviderPool,
            mockConfigManager,
            mockSynthesisEngine
          );
          
          // Make half the members fail
          for (let i = 0; i < numMembersToFail; i++) {
            const failingMember = councilConfig.members[i];
            mockProviderPool.setResponse(failingMember.id, {
              content: '',
              tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              latency: 0,
              success: false,
              error: new Error('Provider failure')
            });
          }
          
          // Execute request
          const result = await engine.processRequest(request);
          
          // Property assertions:
          // 1. Consensus decision should be produced
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          
          // 2. Content should be non-empty and meaningful
          expect(result.content.length).toBeGreaterThan(0);
          
          // 3. Should have valid confidence level
          expect(['high', 'medium', 'low']).toContain(result.confidence);
          
          // 4. Agreement level should be valid
          expect(result.agreementLevel).toBeGreaterThanOrEqual(0);
          expect(result.agreementLevel).toBeLessThanOrEqual(1);
          
          // 5. Contributing members should match successful members
          const expectedSuccessfulCount = councilConfig.members.length - numMembersToFail;
          expect(result.contributingMembers).toHaveLength(expectedSuccessfulCount);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
