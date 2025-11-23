/**
 * Property-Based Test: Orchestration Engine Timeout Conversion
 * Feature: bug-fixes-critical, Property 1: Orchestration Engine timeout conversion
 * 
 * Validates: Requirements 1.1
 * 
 * For any Council Member with timeout configured in seconds, the Orchestration Engine
 * should pass the timeout value multiplied by 1000 to setTimeout.
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
  RetryPolicy
} from '../../types/core';

// ============================================================================
// Mock Implementations
// ============================================================================

class MockProviderPool implements IProviderPool {
  private responses: Map<string, ProviderResponse> = new Map();
  private healthStatuses: Map<string, ProviderHealth> = new Map();
  private disabledProviders: Set<string> = new Set();
  private requestLog: Array<{ member: CouncilMember; prompt: string; context?: ConversationContext }> = [];
  
  // Track setTimeout calls to verify timeout conversion
  private timeoutCalls: Array<{ memberId: string; timeoutMs: number }> = [];
  
  getTimeoutCalls(): Array<{ memberId: string; timeoutMs: number }> {
    return this.timeoutCalls;
  }
  
  clearTimeoutCalls(): void {
    this.timeoutCalls = [];
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
    this.requestLog.push({ member, prompt, context });
    
    // Simulate a delay to allow timeout tracking
    await new Promise(resolve => setTimeout(resolve, 10));
    
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
    const providers = new Set([...this.healthStatuses.keys(), 'openai', 'anthropic', 'google']);
    return Array.from(providers).map(providerId => this.getProviderHealth(providerId));
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
  timeout: fc.integer({ min: 1, max: 120 }), // Timeout in seconds
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
// Property Test: Timeout Conversion
// ============================================================================

describe('Property Test: Orchestration Engine Timeout Conversion', () => {
  /**
   * Feature: bug-fixes-critical, Property 1: Orchestration Engine timeout conversion
   * 
   * For any Council Member with timeout configured in seconds, the Orchestration Engine
   * should pass the timeout value multiplied by 1000 to setTimeout.
   * 
   * Validates: Requirements 1.1
   */
  test('should convert timeout from seconds to milliseconds before setTimeout', async () => {
    // Spy on setTimeout to track timeout values
    const originalSetTimeout = global.setTimeout;
    const setTimeoutCalls: Array<{ callback: Function; delay: number }> = [];
    
    global.setTimeout = jest.fn((callback: any, delay?: number) => {
      setTimeoutCalls.push({ callback, delay: delay || 0 });
      return originalSetTimeout(callback, delay) as any;
    }) as any;
    
    try {
      await fc.assert(
        fc.asyncProperty(
          userRequestArbitrary,
          councilMemberArbitrary,
          async (request, member) => {
            // Setup
            const mockProviderPool = new MockProviderPool();
            const councilConfig: CouncilConfig = {
              members: [member],
              minimumSize: 1,
              requireMinimumForConsensus: false
            };
            
            const mockConfigManager = new MockConfigurationManager(councilConfig);
            const mockSynthesisEngine = new MockSynthesisEngine();
            
            const engine = new OrchestrationEngine(
              mockProviderPool,
              mockConfigManager,
              mockSynthesisEngine
            );
            
            // Clear setTimeout tracking
            setTimeoutCalls.length = 0;
            
            // Execute request (this will trigger timeout setup)
            try {
              await engine.processRequest(request);
            } catch (error) {
              // May fail, but we're testing timeout conversion
            }
            
            // Property assertions:
            // Find setTimeout calls related to member timeout
            // The timeout should be member.timeout * 1000 (converted to milliseconds)
            const expectedTimeoutMs = member.timeout * 1000;
            
            // Look for setTimeout calls with the expected timeout value
            const timeoutCalls = setTimeoutCalls.filter(call => 
              call.delay === expectedTimeoutMs
            );
            
            // Should have at least one setTimeout call with the correct timeout
            expect(timeoutCalls.length).toBeGreaterThan(0);
            
            // Verify the timeout is in milliseconds (should be >= 1000 for timeouts >= 1 second)
            if (member.timeout >= 1) {
              const foundTimeouts = setTimeoutCalls.map(call => call.delay);
              const hasMillisecondTimeout = foundTimeouts.some(delay => delay >= 1000);
              expect(hasMillisecondTimeout).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    }
  }, 120000);
});
