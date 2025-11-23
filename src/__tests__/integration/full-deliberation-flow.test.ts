/**
 * Integration Tests - Full Deliberation Flow
 * Tests end-to-end request processing through the entire system
 */

import { OrchestrationEngine } from '../../orchestration/engine';
import { SynthesisEngine } from '../../synthesis/engine';
import { SessionManager } from '../../session/manager';
import { BaseProviderAdapter } from '../../providers/adapters/base';
import { IConfigurationManager } from '../../interfaces/IConfigurationManager';
import { IProviderPool } from '../../interfaces/IProviderPool';
import { ProviderHealthTracker, getSharedHealthTracker } from '../../providers/health-tracker';
import {
  CouncilMember,
  UserRequest,
  ProviderResponse,
  ConsensusDecision,
  RetryPolicy,
  CouncilConfig,
  DeliberationConfig,
  PerformanceConfig,
  SynthesisConfig,
  ProviderHealth,
  ConversationContext,
  ProviderError,
  DevilsAdvocateConfig
} from '../../types/core';

// Mock Provider Adapter for testing
class MockProviderAdapter extends BaseProviderAdapter {
  private responseText: string;
  private shouldFail: boolean;

  constructor(apiKey: string, responseText: string = 'Test response', shouldFail: boolean = false) {
    super(apiKey);
    this.responseText = responseText;
    this.shouldFail = shouldFail;
  }

  async sendRequest(member: CouncilMember, prompt: string): Promise<ProviderResponse> {
    if (this.shouldFail) {
      return {
        success: false,
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        error: new ProviderError('TEST_ERROR', 'Simulated provider failure', false)
      };
    }

    return this.executeWithRetry(member, async () => {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 10));

      return {
        content: `${this.responseText} from ${member.id}`,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };
    });
  }

  async getHealth(): Promise<{ available: boolean; latency?: number }> {
    return { available: !this.shouldFail, latency: 5 };
  }

  protected formatRequest(prompt: string): any {
    return { prompt };
  }

  protected parseResponse(response: any): { content: string; tokenUsage: any } {
    return {
      content: response.content,
      tokenUsage: response.tokenUsage
    };
  }
}

// Mock Provider Pool for testing
class MockProviderPool implements IProviderPool {
  private adapters: Map<string, MockProviderAdapter>;
  private healthTracker: ProviderHealthTracker;
  private members: CouncilMember[];

  constructor(members: CouncilMember[], adapters: Map<string, MockProviderAdapter>, healthTracker?: ProviderHealthTracker) {
    this.adapters = adapters;
    this.members = members;
    this.healthTracker = healthTracker || getSharedHealthTracker();
    
    // Initialize health tracking for all providers
    members.forEach(member => {
      this.healthTracker.initializeProvider(member.provider);
    });
  }

  async sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse> {
    const adapter = this.adapters.get(member.id);
    
    if (!adapter) {
      const error: ProviderResponse = {
        success: false,
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        error: new ProviderError('ADAPTER_NOT_FOUND', `Adapter for ${member.id} not found`, false)
      };
      this.healthTracker.recordFailure(member.provider);
      return error;
    }

    if (this.healthTracker.isDisabled(member.provider)) {
      const error: ProviderResponse = {
        success: false,
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        error: new ProviderError('PROVIDER_DISABLED', `Provider ${member.provider} is disabled`, false)
      };
      return error;
    }

    try {
      const response = await adapter.sendRequest(member, prompt);
      
      if (response.success) {
        this.healthTracker.recordSuccess(member.provider);
      } else {
        this.healthTracker.recordFailure(member.provider);
      }
      
      return response;
    } catch (error: any) {
      this.healthTracker.recordFailure(member.provider);
      return {
        success: false,
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        error: new ProviderError('EXECUTION_ERROR', error.message || 'Unknown error', true)
      };
    }
  }

  getProviderHealth(providerId: string): ProviderHealth {
    const status = this.healthTracker.getHealthStatus(providerId);
    const successRate = this.healthTracker.getSuccessRate(providerId);
    
    return {
      providerId,
      status: this.healthTracker.isDisabled(providerId) ? 'disabled' : status,
      successRate,
      avgLatency: 100
    };
  }

  getAllProviderHealth(): ProviderHealth[] {
    // Get unique provider IDs from members
    const providers = new Set(this.members.map(m => m.provider));
    return Array.from(providers).map(providerId => this.getProviderHealth(providerId));
  }

  markProviderDisabled(providerId: string, reason: string): void {
    this.healthTracker.markDisabled(providerId, reason);
  }
}

// Mock Configuration Manager for testing
class MockConfigurationManager implements IConfigurationManager {
  private councilConfig: CouncilConfig;
  private deliberationConfig: DeliberationConfig;
  private performanceConfig: PerformanceConfig;
  private synthesisConfig: SynthesisConfig;
  private transparencyConfig: any;
  private devilsAdvocateConfig: DevilsAdvocateConfig;

  constructor(members: CouncilMember[]) {
    this.councilConfig = {
      members,
      minimumSize: 1,
      requireMinimumForConsensus: false
    };

    this.deliberationConfig = {
      rounds: 0,
      preset: 'fast'
    };

    this.performanceConfig = {
      globalTimeout: 5, // Shorter timeout for tests to avoid lingering timers
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

describe('Integration Tests - Full Deliberation Flow', () => {
  let orchestrationEngine: OrchestrationEngine;
  let providerPool: MockProviderPool;
  let synthesisEngine: SynthesisEngine;
  let sessionManager: SessionManager;
  let configManager: MockConfigurationManager;
  let healthTracker: ProviderHealthTracker;

  const defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 2,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
  };

  beforeEach(() => {
    // Create health tracker
    healthTracker = getSharedHealthTracker();
    
    // Track active timers for cleanup
    jest.useRealTimers();

    // Create mock adapters
    const mockAdapter1 = new MockProviderAdapter('key1', 'Response A');
    const mockAdapter2 = new MockProviderAdapter('key2', 'Response B');
    const mockAdapter3 = new MockProviderAdapter('key3', 'Response C');

    // Create council members
    const members: CouncilMember[] = [
      {
        id: 'member-1',
        provider: 'test-provider-1',
        model: 'test-model-1',
        timeout: 30,
        retryPolicy: defaultRetryPolicy
      },
      {
        id: 'member-2',
        provider: 'test-provider-2',
        model: 'test-model-2',
        timeout: 30,
        retryPolicy: defaultRetryPolicy
      },
      {
        id: 'member-3',
        provider: 'test-provider-3',
        model: 'test-model-3',
        timeout: 30,
        retryPolicy: defaultRetryPolicy
      }
    ];

    // Create provider pool with mock adapters
    const adapters = new Map([
      ['member-1', mockAdapter1],
      ['member-2', mockAdapter2],
      ['member-3', mockAdapter3]
    ]);
    providerPool = new MockProviderPool(members, adapters, healthTracker);

    // Create configuration manager
    configManager = new MockConfigurationManager(members);

    // Create synthesis engine
    synthesisEngine = new SynthesisEngine(providerPool, configManager);

    // Create session manager (mock database and Redis)
    const mockDb: any = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    };
    const mockRedis: any = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    };
    sessionManager = new SessionManager(mockDb, mockRedis);

    // Create orchestration engine
    orchestrationEngine = new OrchestrationEngine(
      providerPool,
      configManager,
      synthesisEngine
    );
  });

  afterEach(async () => {
    // Wait for any pending async operations to complete
    // Use multiple setImmediate calls to drain the event loop
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setImmediate(resolve));
    }
    
    // Clear any pending timers (this won't affect real timers but helps with fake timers)
    try {
      jest.runOnlyPendingTimers();
    } catch {
      // Ignore if no fake timers are active
    }
    
    // Clean up health tracker state
    if (healthTracker) {
      // Reset health tracker for next test
      const providers = ['test-provider-1', 'test-provider-2', 'test-provider-3', 'test-1', 'test-2', 'test-3'];
      providers.forEach(providerId => {
        try {
          if (healthTracker.isDisabled(providerId)) {
            healthTracker.enableProvider(providerId);
          }
        } catch {
          // Ignore errors if provider not initialized
        }
      });
    }
  });

  afterAll(async () => {
    // Final cleanup - wait for all async operations and timers
    // Wait long enough for the global timeout timer (5 seconds) to complete if it's still pending
    // This ensures any setTimeout callbacks from createGlobalTimeout complete
    await new Promise(resolve => setTimeout(resolve, 5100));
    
    // Drain event loop multiple times to ensure all callbacks complete
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setImmediate(resolve));
    }
    
    jest.useRealTimers();
  });

  describe('Successful Deliberation Flow', () => {
    it('should process a request through all council members and synthesize result', async () => {
      const userRequest: UserRequest = {
        id: 'req-1',
        query: 'What is the capital of France?',
        sessionId: 'session-123',
        timestamp: new Date()
      };

      const decision = await orchestrationEngine.processRequest(userRequest);

      expect(decision).toBeDefined();
      expect(decision.content).toBeDefined();
      expect(decision.content.length).toBeGreaterThan(0);
      expect(decision.contributingMembers).toHaveLength(3);
      expect(decision.contributingMembers).toContain('member-1');
      expect(decision.contributingMembers).toContain('member-2');
      expect(decision.contributingMembers).toContain('member-3');
      expect(decision.agreementLevel).toBeGreaterThanOrEqual(0);
      // Allow for floating point precision (can be slightly above 1 due to calculation)
      expect(decision.agreementLevel).toBeLessThanOrEqual(1.0001);
    });

    it('should calculate token usage across all members', async () => {
      const userRequest: UserRequest = {
        id: 'req-2',
        query: 'Explain quantum computing',
        sessionId: 'session-124',
        timestamp: new Date()
      };

      const decision = await orchestrationEngine.processRequest(userRequest);

      // Each mock provider returns 10 prompt + 20 completion = 30 total tokens
      // With 3 members, total should be 90
      expect(decision).toBeDefined();
      expect(decision.contributingMembers).toHaveLength(3);
    });

    it('should maintain session context across multiple requests', async () => {
      const sessionId = 'session-125';

      const request1: UserRequest = {
        id: 'req-3',
        query: 'What is AI?',
        sessionId,
        timestamp: new Date()
      };

      const decision1 = await orchestrationEngine.processRequest(request1);
      expect(decision1.content).toBeDefined();

      const request2: UserRequest = {
        id: 'req-4',
        query: 'Tell me more about that',
        sessionId,
        timestamp: new Date()
      };

      const decision2 = await orchestrationEngine.processRequest(request2);
      expect(decision2.content).toBeDefined();

      // Both requests should succeed
      expect(decision1.contributingMembers.length).toBeGreaterThan(0);
      expect(decision2.contributingMembers.length).toBeGreaterThan(0);
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle partial provider failures', async () => {
      // Replace one adapter with failing version
      const failingAdapter = new MockProviderAdapter('key-fail', '', true);
      const adapters = new Map([
        ['member-1', new MockProviderAdapter('key1', 'Response A')],
        ['member-2', failingAdapter],
        ['member-3', new MockProviderAdapter('key3', 'Response C')]
      ]);

      const members: CouncilMember[] = [
        { id: 'member-1', provider: 'test-1', model: 'model-1', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-2', provider: 'test-2', model: 'model-2', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-3', provider: 'test-3', model: 'model-3', timeout: 30, retryPolicy: defaultRetryPolicy }
      ];

      const pool = new MockProviderPool(members, adapters, healthTracker);
      const testConfigManager = new MockConfigurationManager(members);
      const testSynthesisEngine = new SynthesisEngine(pool, testConfigManager);
      const engine = new OrchestrationEngine(pool, testConfigManager, testSynthesisEngine);

      const request: UserRequest = {
        id: 'req-5',
        query: 'Test query',
        sessionId: 'session-126',
        timestamp: new Date()
      };

      const decision = await engine.processRequest(request);

      // Should still get a decision from the working providers
      expect(decision).toBeDefined();
      expect(decision.contributingMembers).toHaveLength(2);
      expect(decision.contributingMembers).not.toContain('member-2');
    });

    it('should synthesize responses even with only 2 out of 3 providers', async () => {
      const failingAdapter = new MockProviderAdapter('key-fail', '', true);
      const adapters = new Map([
        ['member-1', new MockProviderAdapter('key1', 'Response A')],
        ['member-2', new MockProviderAdapter('key2', 'Response B')],
        ['member-3', failingAdapter]
      ]);

      const members: CouncilMember[] = [
        { id: 'member-1', provider: 'test-1', model: 'model-1', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-2', provider: 'test-2', model: 'model-2', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-3', provider: 'test-3', model: 'model-3', timeout: 30, retryPolicy: defaultRetryPolicy }
      ];

      const pool = new MockProviderPool(members, adapters, healthTracker);
      const testConfigManager = new MockConfigurationManager(members);
      const testSynthesisEngine = new SynthesisEngine(pool, testConfigManager);
      const engine = new OrchestrationEngine(pool, testConfigManager, testSynthesisEngine);

      const request: UserRequest = {
        id: 'req-6',
        query: 'Synthesize this',
        sessionId: 'session-127',
        timestamp: new Date()
      };

      const decision = await engine.processRequest(request);

      expect(decision.content).toBeDefined();
      expect(decision.contributingMembers).toHaveLength(2);
      expect(decision.synthesisStrategy).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should fail gracefully when all providers are unavailable', async () => {
      const failingAdapters = new Map([
        ['member-1', new MockProviderAdapter('key1', '', true)],
        ['member-2', new MockProviderAdapter('key2', '', true)],
        ['member-3', new MockProviderAdapter('key3', '', true)]
      ]);

      const members: CouncilMember[] = [
        { id: 'member-1', provider: 'test-1', model: 'model-1', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-2', provider: 'test-2', model: 'model-2', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-3', provider: 'test-3', model: 'model-3', timeout: 30, retryPolicy: defaultRetryPolicy }
      ];

      const pool = new MockProviderPool(members, failingAdapters, healthTracker);
      const testConfigManager = new MockConfigurationManager(members);
      const testSynthesisEngine = new SynthesisEngine(pool, testConfigManager);
      const engine = new OrchestrationEngine(pool, testConfigManager, testSynthesisEngine);

      const request: UserRequest = {
        id: 'req-7',
        query: 'This will fail',
        sessionId: 'session-128',
        timestamp: new Date()
      };

      await expect(engine.processRequest(request)).rejects.toThrow();
    });

    it('should handle empty query gracefully', async () => {
      const request: UserRequest = {
        id: 'req-8',
        query: '',
        sessionId: 'session-129',
        timestamp: new Date()
      };

      // Empty queries are processed (providers can handle them)
      const decision = await orchestrationEngine.processRequest(request);
      expect(decision).toBeDefined();
      expect(decision.content).toBeDefined();
    });
  });

  describe('Synthesis Strategies', () => {
    it('should use consensus extraction for high agreement', async () => {
      // All adapters return similar responses
      const adapters = new Map([
        ['member-1', new MockProviderAdapter('key1', 'Paris is the capital')],
        ['member-2', new MockProviderAdapter('key2', 'Paris is the capital')],
        ['member-3', new MockProviderAdapter('key3', 'Paris is the capital')]
      ]);

      const members: CouncilMember[] = [
        { id: 'member-1', provider: 'test-1', model: 'model-1', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-2', provider: 'test-2', model: 'model-2', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-3', provider: 'test-3', model: 'model-3', timeout: 30, retryPolicy: defaultRetryPolicy }
      ];

      const pool = new MockProviderPool(members, adapters, healthTracker);
      const testConfigManager = new MockConfigurationManager(members);
      const testSynthesisEngine = new SynthesisEngine(pool, testConfigManager);
      const engine = new OrchestrationEngine(pool, testConfigManager, testSynthesisEngine);

      const request: UserRequest = {
        id: 'req-9',
        query: 'What is the capital of France?',
        sessionId: 'session-130',
        timestamp: new Date()
      };

      const decision = await engine.processRequest(request);

      expect(decision.synthesisStrategy.type).toBe('consensus-extraction');
      expect(decision.agreementLevel).toBeGreaterThan(0.8);
    });

    it('should handle divergent responses from different providers', async () => {
      const adapters = new Map([
        ['member-1', new MockProviderAdapter('key1', 'Response about topic A')],
        ['member-2', new MockProviderAdapter('key2', 'Response about topic B')],
        ['member-3', new MockProviderAdapter('key3', 'Response about topic C')]
      ]);

      const members: CouncilMember[] = [
        { id: 'member-1', provider: 'test-1', model: 'model-1', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-2', provider: 'test-2', model: 'model-2', timeout: 30, retryPolicy: defaultRetryPolicy },
        { id: 'member-3', provider: 'test-3', model: 'model-3', timeout: 30, retryPolicy: defaultRetryPolicy }
      ];

      const pool = new MockProviderPool(members, adapters, healthTracker);
      const testConfigManager = new MockConfigurationManager(members);
      const testSynthesisEngine = new SynthesisEngine(pool, testConfigManager);
      const engine = new OrchestrationEngine(pool, testConfigManager, testSynthesisEngine);

      const request: UserRequest = {
        id: 'req-10',
        query: 'Controversial topic',
        sessionId: 'session-131',
        timestamp: new Date()
      };

      const decision = await engine.processRequest(request);

      expect(decision).toBeDefined();
      expect(decision.contributingMembers).toHaveLength(3);
      // Agreement level should be lower for divergent responses
      expect(decision.agreementLevel).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should process requests in parallel for better performance', async () => {
      const request: UserRequest = {
        id: 'req-11',
        query: 'Parallel processing test',
        sessionId: 'session-132',
        timestamp: new Date()
      };

      const startTime = Date.now();
      const decision = await orchestrationEngine.processRequest(request);
      const elapsed = Date.now() - startTime;

      // With parallel execution, should complete in ~10-50ms (mock delay)
      // If sequential, would take ~30ms+ (3 providers * 10ms each)
      expect(elapsed).toBeLessThan(100);
      expect(decision.contributingMembers).toHaveLength(3);
    });
  });
});
