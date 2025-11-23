/**
 * Orchestration Engine Tests
 * Tests for request distribution, timeout handling, and failure tracking
 */

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

import { ProviderHealthTracker } from '../../providers/health-tracker';

// Mock implementations
class MockProviderPool implements IProviderPool {
  private responses: Map<string, ProviderResponse> = new Map();
  private healthStatuses: Map<string, ProviderHealth> = new Map();
  private disabledProviders: Set<string> = new Set();
  private healthTracker?: ProviderHealthTracker;

  setHealthTracker(tracker: ProviderHealthTracker): void {
    this.healthTracker = tracker;
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
    const response = this.responses.get(member.id);

    if (!response) {
      const successResponse = {
        content: `Response from ${member.id}`,
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latency: 100,
        success: true
      };
      this.healthTracker?.recordSuccess(member.provider);
      return successResponse;
    }

    if (response.success) {
      this.healthTracker?.recordSuccess(member.provider);
    } else {
      this.healthTracker?.recordFailure(member.provider);
    }

    return response;
  }

  getProviderHealth(providerId: string): ProviderHealth {
    // CRITICAL FIX: Check tracker first for most up-to-date health status
    // This ensures consistency between recorded successes/failures and reported health
    if (this.healthTracker) {
      const isDisabled = this.healthTracker.isDisabled(providerId);
      if (isDisabled) {
        return {
          providerId,
          status: 'disabled',
          successRate: this.healthTracker.getSuccessRate(providerId),
          avgLatency: 100
        };
      }

      // Return tracker-based health even if not disabled
      return {
        providerId,
        status: 'healthy',
        successRate: this.healthTracker.getSuccessRate(providerId),
        avgLatency: 100
      };
    }

    // Fall back to manual health statuses if no tracker
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
    if (this.healthTracker) {
      return this.healthTracker.getTrackedProviders().map((providerId) =>
        this.getProviderHealth(providerId)
      );
    }
    // Return health for all known providers
    const providers = new Set([...this.healthStatuses.keys(), 'openai', 'anthropic', 'google']);
    return Array.from(providers).map(providerId => this.getProviderHealth(providerId));
  }

  markProviderDisabled(providerId: string, reason: string): void {
    this.disabledProviders.add(providerId);
    this.healthTracker?.markDisabled(providerId, reason);
  }
}

// ... (MockConfigurationManager and MockSynthesisEngine remain the same)

class MockConfigurationManager implements IConfigurationManager {
  private councilConfig: CouncilConfig;
  private deliberationConfig: DeliberationConfig;
  private performanceConfig: PerformanceConfig;
  private synthesisConfig: SynthesisConfig;
  private transparencyConfig: any;

  constructor() {
    const defaultRetryPolicy: RetryPolicy = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
    };

    this.councilConfig = {
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
  }

  setCouncilConfig(config: CouncilConfig): void {
    this.councilConfig = config;
  }

  setDeliberationConfig(config: DeliberationConfig): void {
    this.deliberationConfig = config;
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

describe('OrchestrationEngine', () => {
  let engine: OrchestrationEngine;
  let mockProviderPool: MockProviderPool;
  let mockConfigManager: MockConfigurationManager;
  let mockSynthesisEngine: MockSynthesisEngine;
  let healthTracker: ProviderHealthTracker;

  beforeEach(() => {
    mockProviderPool = new MockProviderPool();
    mockConfigManager = new MockConfigurationManager();
    mockSynthesisEngine = new MockSynthesisEngine();
    healthTracker = new ProviderHealthTracker();

    mockProviderPool.setHealthTracker(healthTracker);

    engine = new OrchestrationEngine(
      mockProviderPool,
      mockConfigManager,
      mockSynthesisEngine,
      healthTracker
    );
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('distributeToCouncil', () => {
    it('should distribute request to all council members', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      const councilConfig = await mockConfigManager.getCouncilConfig();
      const responses = await engine.distributeToCouncil(request, councilConfig.members);

      expect(responses).toHaveLength(2);
      expect(responses[0].councilMemberId).toBe('member-1');
      expect(responses[1].councilMemberId).toBe('member-2');
    });

    it('should handle individual member failures gracefully', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      // Make one member fail
      mockProviderPool.setResponse('member-1', {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error('Provider failed')
      });

      const councilConfig = await mockConfigManager.getCouncilConfig();
      const responses = await engine.distributeToCouncil(request, councilConfig.members);

      // Should still get response from member-2
      expect(responses).toHaveLength(1);
      expect(responses[0].councilMemberId).toBe('member-2');
    });

    it('should throw error when all members fail', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      // Make all members fail
      mockProviderPool.setResponse('member-1', {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error('Provider failed')
      });

      mockProviderPool.setResponse('member-2', {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error('Provider failed')
      });

      const councilConfig = await mockConfigManager.getCouncilConfig();

      await expect(
        engine.distributeToCouncil(request, councilConfig.members)
      ).rejects.toThrow('All council members failed to respond');
    });
  });

  describe('processRequest', () => {
    it('should process a complete request successfully', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      const result = await engine.processRequest(request);

      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(result.contributingMembers).toHaveLength(2);
    });

    it('should filter out disabled members', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      // Mark one provider as disabled via the provider pool
      // This properly updates the health tracker
      mockProviderPool.markProviderDisabled('openai', 'Test disable');

      const result = await engine.processRequest(request);

      expect(result).toBeDefined();
      expect(result.contributingMembers).toHaveLength(1);
      expect(result.contributingMembers[0]).toBe('member-2');
    });

    it('should throw error when minimum quorum not met', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      // Enable minimum quorum requirement
      const councilConfig = await mockConfigManager.getCouncilConfig();
      councilConfig.requireMinimumForConsensus = true;
      councilConfig.minimumSize = 2;
      mockConfigManager.setCouncilConfig(councilConfig);

      // Disable one provider via the provider pool
      // This properly updates the health tracker
      mockProviderPool.markProviderDisabled('openai', 'Test disable');

      await expect(
        engine.processRequest(request)
      ).rejects.toThrow('Insufficient council members');
    });
  });

  describe('failure tracking', () => {
    it('should track consecutive failures', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      // Make member-1 fail consistently
      mockProviderPool.setResponse('member-1', {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error('Provider failed')
      });

      const councilConfig = await mockConfigManager.getCouncilConfig();

      // Trigger 5 failures (threshold)
      for (let i = 0; i < 5; i++) {
        await engine.distributeToCouncil(request, councilConfig.members);
      }

      // Check that provider was marked as disabled
      const health = mockProviderPool.getProviderHealth('openai');
      expect(health.status).toBe('disabled');
    });
  });

  describe('conductDeliberation', () => {
    it('should return only initial responses when rounds is 0', async () => {
      const initialResponses = [
        {
          councilMemberId: 'member-1',
          content: 'Response 1',
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          timestamp: new Date()
        },
        {
          councilMemberId: 'member-2',
          content: 'Response 2',
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          timestamp: new Date()
        }
      ];

      const thread = await engine.conductDeliberation(initialResponses, 0);

      expect(thread.rounds).toHaveLength(1);
      expect(thread.rounds[0].roundNumber).toBe(0);
      expect(thread.rounds[0].exchanges).toHaveLength(2);
      expect(thread.rounds[0].exchanges[0].councilMemberId).toBe('member-1');
      expect(thread.rounds[0].exchanges[1].councilMemberId).toBe('member-2');
    });

    it('should conduct deliberation rounds when configured', async () => {
      const initialResponses = [
        {
          councilMemberId: 'member-1',
          content: 'Initial response from member 1',
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          timestamp: new Date()
        },
        {
          councilMemberId: 'member-2',
          content: 'Initial response from member 2',
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          timestamp: new Date()
        }
      ];

      const thread = await engine.conductDeliberation(initialResponses, 2);

      // Should have 3 rounds: initial (0) + 2 deliberation rounds
      expect(thread.rounds).toHaveLength(3);
      expect(thread.rounds[0].roundNumber).toBe(0);
      expect(thread.rounds[1].roundNumber).toBe(1);
      expect(thread.rounds[2].roundNumber).toBe(2);

      // Each round should have exchanges from all members
      expect(thread.rounds[1].exchanges).toHaveLength(2);
      expect(thread.rounds[2].exchanges).toHaveLength(2);

      // Exchanges should reference peer responses
      expect(thread.rounds[1].exchanges[0].referencesTo).toContain('member-2');
      expect(thread.rounds[1].exchanges[1].referencesTo).toContain('member-1');
    });

    it('should handle deliberation failures gracefully', async () => {
      const initialResponses = [
        {
          councilMemberId: 'member-1',
          content: 'Initial response from member 1',
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          timestamp: new Date()
        },
        {
          councilMemberId: 'member-2',
          content: 'Initial response from member 2',
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          timestamp: new Date()
        }
      ];

      // Make member-1 fail during deliberation
      mockProviderPool.setResponse('member-1', {
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error('Deliberation failed')
      });

      const thread = await engine.conductDeliberation(initialResponses, 1);

      // Should still complete with member-1 using original response
      expect(thread.rounds).toHaveLength(2);
      expect(thread.rounds[1].exchanges).toHaveLength(2);
      expect(thread.rounds[1].exchanges[0].content).toBe('Initial response from member 1');
    });

    it('should include total duration', async () => {
      const initialResponses = [
        {
          councilMemberId: 'member-1',
          content: 'Response 1',
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          timestamp: new Date()
        }
      ];

      const thread = await engine.conductDeliberation(initialResponses, 1);

      expect(thread.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deliberation presets', () => {
    it('should use fast preset with 0 rounds', async () => {
      mockConfigManager.setDeliberationConfig({
        rounds: 0,
        preset: 'fast'
      });

      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      const result = await engine.processRequest(request);

      expect(result).toBeDefined();
      // With 0 rounds, should only have initial responses
      expect(result.contributingMembers).toHaveLength(2);
    });

    it('should use balanced preset with 1 round', async () => {
      mockConfigManager.setDeliberationConfig({
        rounds: 1,
        preset: 'balanced'
      });

      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      const result = await engine.processRequest(request);

      expect(result).toBeDefined();
      expect(result.contributingMembers.length).toBeGreaterThan(0);
    });

    it('should use thorough preset with 2 rounds', async () => {
      mockConfigManager.setDeliberationConfig({
        rounds: 2,
        preset: 'thorough'
      });

      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      const result = await engine.processRequest(request);

      expect(result).toBeDefined();
      expect(result.contributingMembers.length).toBeGreaterThan(0);
    });

    it('should use research-grade preset with 4 rounds', async () => {
      mockConfigManager.setDeliberationConfig({
        rounds: 4,
        preset: 'research-grade'
      });

      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date()
      };

      const result = await engine.processRequest(request);

      expect(result).toBeDefined();
      expect(result.contributingMembers.length).toBeGreaterThan(0);
    });
  });

  describe('context propagation integration', () => {
    it('should propagate conversation context through entire request lifecycle', async () => {
      // Create a context-tracking provider pool
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
          // Track the context passed to this member
          this.contextLog.push({ memberId: member.id, context });

          // Call parent implementation
          return super.sendRequest(member, prompt, context);
        }
      }

      const contextTrackingPool = new ContextTrackingProviderPool();
      const contextEngine = new OrchestrationEngine(
        contextTrackingPool,
        mockConfigManager,
        mockSynthesisEngine
      );

      // Create a request with conversation context
      const conversationContext: ConversationContext = {
        messages: [
          {
            role: 'user',
            content: 'Previous question',
            timestamp: new Date(Date.now() - 60000)
          },
          {
            role: 'assistant',
            content: 'Previous answer',
            timestamp: new Date(Date.now() - 30000)
          }
        ],
        totalTokens: 50,
        summarized: false
      };

      const request: UserRequest = {
        id: 'req-1',
        query: 'Follow-up question',
        sessionId: 'session-123',
        context: conversationContext,
        timestamp: new Date()
      };

      // Process the request
      const result = await contextEngine.processRequest(request);

      // Verify the result
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();

      // Verify context was propagated to all council members
      const contextLog = contextTrackingPool.getContextLog();

      // Should have context entries for initial distribution
      const initialDistributionCalls = contextLog.filter(log =>
        log.context !== undefined
      );

      expect(initialDistributionCalls.length).toBeGreaterThan(0);

      // Verify each member received the same context
      for (const log of initialDistributionCalls) {
        expect(log.context).toBeDefined();
        expect(log.context?.messages).toEqual(conversationContext.messages);
        expect(log.context?.totalTokens).toBe(conversationContext.totalTokens);
        expect(log.context?.summarized).toBe(conversationContext.summarized);
      }

      // Verify all configured members received context
      const councilConfig = await mockConfigManager.getCouncilConfig();
      const memberIdsWithContext = new Set(
        initialDistributionCalls.map(log => log.memberId)
      );

      for (const member of councilConfig.members) {
        expect(memberIdsWithContext.has(member.id)).toBe(true);
      }
    });

    it('should handle requests without context', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'First question without context',
        timestamp: new Date()
      };

      const result = await engine.processRequest(request);

      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(result.contributingMembers.length).toBeGreaterThan(0);
    });

    it('should maintain context consistency across all council members', async () => {
      class ContextConsistencyTracker extends MockProviderPool {
        private contexts: ConversationContext[] = [];

        async sendRequest(
          member: CouncilMember,
          prompt: string,
          context?: ConversationContext
        ): Promise<ProviderResponse> {
          if (context) {
            this.contexts.push(context);
          }
          return super.sendRequest(member, prompt, context);
        }

        verifyConsistency(): boolean {
          if (this.contexts.length === 0) return true;

          const first = this.contexts[0];
          return this.contexts.every(ctx =>
            JSON.stringify(ctx) === JSON.stringify(first)
          );
        }
      }

      const consistencyTracker = new ContextConsistencyTracker();
      const consistencyEngine = new OrchestrationEngine(
        consistencyTracker,
        mockConfigManager,
        mockSynthesisEngine
      );

      const conversationContext: ConversationContext = {
        messages: [
          {
            role: 'user',
            content: 'Context message',
            timestamp: new Date()
          }
        ],
        totalTokens: 25,
        summarized: false
      };

      const request: UserRequest = {
        id: 'req-1',
        query: 'Query with context',
        context: conversationContext,
        timestamp: new Date()
      };

      await consistencyEngine.processRequest(request);

      // Verify all members received identical context
      expect(consistencyTracker.verifyConsistency()).toBe(true);
    });
  });
});
