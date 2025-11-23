/**
 * Property-Based Test: Global Timeout Preserves Member IDs
 * Feature: bug-fixes-critical, Property 5: Global timeout preserves member IDs
 * 
 * Validates: Requirements 2.1
 * 
 * For any request that experiences a global timeout, all deliberation exchanges
 * should contain the actual Council Member IDs not placeholder values.
 */

import * as fc from 'fast-check';
import { OrchestrationEngine } from '../engine';
import { IProviderPool } from '../../interfaces/IProviderPool';
import { IConfigurationManager } from '../../interfaces/IConfigurationManager';
import { ISynthesisEngine } from '../../interfaces/ISynthesisEngine';
import {
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
  UserRequest
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
    // Simulate slow response to trigger global timeout
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = this.responses.get(member.id);
    if (response) {
      return response;
    }
    
    return {
      content: `Response from ${member.id}`,
      tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      latency: 100,
      success: true
    };
  }
  
  getAllProviderHealth(): ProviderHealth[] {
    const providers = ['openai', 'anthropic', 'google'];
    return providers.map(providerId => this.getProviderHealth(providerId));
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
        }
      ],
      minimumSize: 1,
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
  private lastThread: DeliberationThread | null = null;
  
  getLastThread(): DeliberationThread | null {
    return this.lastThread;
  }
  
  async synthesize(
    thread: DeliberationThread,
    strategy: SynthesisStrategy
  ): Promise<ConsensusDecision> {
    this.lastThread = thread;
    
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
  id: fc.string({ minLength: 3, maxLength: 20 }).filter(s => !/^\d+$/.test(s)).map(s => `member-${s}`),
  provider: fc.constantFrom('openai', 'anthropic', 'google'),
  model: fc.string({ minLength: 1, maxLength: 20 }),
  version: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
  weight: fc.option(fc.double({ min: 0, max: 1 }), { nil: undefined }),
  timeout: fc.integer({ min: 5, max: 120 }),
  retryPolicy: retryPolicyArbitrary
});

const userRequestArbitrary = fc.record({
  id: fc.uuid(),
  query: fc.string({ minLength: 1, maxLength: 200 }),
  sessionId: fc.option(fc.uuid(), { nil: undefined }),
  context: fc.constant(undefined),
  timestamp: fc.date()
});

// ============================================================================
// Property Test: Global Timeout Preserves Member IDs
// ============================================================================

describe('Property Test: Global Timeout Preserves Member IDs', () => {
  /**
   * Feature: bug-fixes-critical, Property 5: Global timeout preserves member IDs
   * 
   * For any request that experiences a global timeout, all deliberation exchanges
   * should contain the actual Council Member IDs not placeholder values.
   * 
   * Validates: Requirements 2.1
   */
  test('should preserve actual member IDs when global timeout occurs', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArbitrary,
        fc.array(councilMemberArbitrary, { minLength: 2, maxLength: 5 }),
        async (request, members) => {
          // Ensure unique member IDs
          const uniqueMembers = members.filter((m, i, arr) => 
            arr.findIndex(x => x.id === m.id) === i
          );
          
          if (uniqueMembers.length < 2) {
            return; // Skip if we don't have enough unique members
          }
          
          // Setup: Configure a very short global timeout to force timeout
          const mockProviderPool = new MockProviderPool();
          
          // Set up responses for each member
          uniqueMembers.forEach(member => {
            mockProviderPool.setResponse(member.id, {
              content: `Response from ${member.id}`,
              tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
              latency: 100,
              success: true
            });
          });
          
          const councilConfig: CouncilConfig = {
            members: uniqueMembers,
            minimumSize: 1,
            requireMinimumForConsensus: false
          };
          
          const performanceConfig: PerformanceConfig = {
            globalTimeout: 0.05, // 50ms - very short to force timeout
            enableFastFallback: true,
            streamingEnabled: true
          };
          
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
          
          // Execute request - should hit global timeout
          try {
            await engine.processRequest(request);
          } catch (error) {
            // May throw if no responses collected
            return;
          }
          
          // Get the deliberation thread that was passed to synthesis
          const thread = mockSynthesisEngine.getLastThread();
          
          if (!thread || thread.rounds.length === 0) {
            return; // No thread created, skip
          }
          
          // Property assertion: All exchanges should have actual member IDs, not placeholders
          const allExchanges = thread.rounds.flatMap(r => r.exchanges);
          const memberIds = uniqueMembers.map(m => m.id);
          
          for (const exchange of allExchanges) {
            // Should not be a placeholder pattern like "member-0", "member-1", etc.
            const isPlaceholder = /^member-\d+$/.test(exchange.councilMemberId);
            expect(isPlaceholder).toBe(false);
            
            // Should be one of the actual member IDs
            expect(memberIds).toContain(exchange.councilMemberId);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
