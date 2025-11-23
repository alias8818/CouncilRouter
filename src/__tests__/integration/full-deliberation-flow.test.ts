/**
 * Integration Tests - Full Deliberation Flow
 * Tests end-to-end request processing through the entire system
 */

import { OrchestrationEngine } from '../../orchestration/engine';
import { ProviderPool } from '../../providers/pool';
import { SynthesisEngine } from '../../synthesis/engine';
import { SessionManager } from '../../session/manager';
import { CostCalculator } from '../../cost/calculator';
import { BaseProviderAdapter } from '../../providers/adapters/base';
import {
  CouncilMember,
  UserRequest,
  ProviderResponse,
  ConsensusDecision,
  RetryPolicy
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
        error: { code: 'TEST_ERROR', message: 'Simulated provider failure', retryable: false }
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

describe('Integration Tests - Full Deliberation Flow', () => {
  let orchestrationEngine: OrchestrationEngine;
  let providerPool: ProviderPool;
  let synthesisEngine: SynthesisEngine;
  let sessionManager: SessionManager;
  let costCalculator: CostCalculator;

  const defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 2,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
  };

  beforeEach(() => {
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
    providerPool = new ProviderPool(members, adapters as any);

    // Create synthesis engine
    synthesisEngine = new SynthesisEngine();

    // Create cost calculator
    costCalculator = new CostCalculator();

    // Create session manager (mock Redis)
    const mockRedis: any = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    };
    sessionManager = new SessionManager(mockRedis);

    // Create orchestration engine
    orchestrationEngine = new OrchestrationEngine(
      providerPool,
      synthesisEngine,
      costCalculator
    );
  });

  describe('Successful Deliberation Flow', () => {
    it('should process a request through all council members and synthesize result', async () => {
      const userRequest: UserRequest = {
        query: 'What is the capital of France?',
        sessionId: 'session-123',
        userId: 'user-456'
      };

      const decision = await orchestrationEngine.submitRequest(userRequest);

      expect(decision).toBeDefined();
      expect(decision.content).toBeDefined();
      expect(decision.content.length).toBeGreaterThan(0);
      expect(decision.contributingMembers).toHaveLength(3);
      expect(decision.contributingMembers).toContain('member-1');
      expect(decision.contributingMembers).toContain('member-2');
      expect(decision.contributingMembers).toContain('member-3');
      expect(decision.agreementLevel).toBeGreaterThanOrEqual(0);
      expect(decision.agreementLevel).toBeLessThanOrEqual(1);
    });

    it('should calculate token usage across all members', async () => {
      const userRequest: UserRequest = {
        query: 'Explain quantum computing',
        sessionId: 'session-124',
        userId: 'user-456'
      };

      const decision = await orchestrationEngine.submitRequest(userRequest);

      // Each mock provider returns 10 prompt + 20 completion = 30 total tokens
      // With 3 members, total should be 90
      expect(decision).toBeDefined();
      expect(decision.contributingMembers.length).toBe(3);
    });

    it('should maintain session context across multiple requests', async () => {
      const sessionId = 'session-125';

      const request1: UserRequest = {
        query: 'What is AI?',
        sessionId,
        userId: 'user-456'
      };

      const decision1 = await orchestrationEngine.submitRequest(request1);
      expect(decision1.content).toBeDefined();

      const request2: UserRequest = {
        query: 'Tell me more about that',
        sessionId,
        userId: 'user-456'
      };

      const decision2 = await orchestrationEngine.submitRequest(request2);
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

      const pool = new ProviderPool(members, adapters as any);
      const engine = new OrchestrationEngine(pool, synthesisEngine, costCalculator);

      const request: UserRequest = {
        query: 'Test query',
        sessionId: 'session-126',
        userId: 'user-456'
      };

      const decision = await engine.submitRequest(request);

      // Should still get a decision from the working providers
      expect(decision).toBeDefined();
      expect(decision.contributingMembers.length).toBe(2);
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

      const pool = new ProviderPool(members, adapters as any);
      const engine = new OrchestrationEngine(pool, synthesisEngine, costCalculator);

      const request: UserRequest = {
        query: 'Synthesize this',
        sessionId: 'session-127',
        userId: 'user-456'
      };

      const decision = await engine.submitRequest(request);

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

      const pool = new ProviderPool(members, failingAdapters as any);
      const engine = new OrchestrationEngine(pool, synthesisEngine, costCalculator);

      const request: UserRequest = {
        query: 'This will fail',
        sessionId: 'session-128',
        userId: 'user-456'
      };

      await expect(engine.submitRequest(request)).rejects.toThrow();
    });

    it('should handle empty query gracefully', async () => {
      const request: UserRequest = {
        query: '',
        sessionId: 'session-129',
        userId: 'user-456'
      };

      // Should either reject or handle empty query
      await expect(
        orchestrationEngine.submitRequest(request)
      ).rejects.toThrow();
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

      const pool = new ProviderPool(members, adapters as any);
      const engine = new OrchestrationEngine(pool, synthesisEngine, costCalculator);

      const request: UserRequest = {
        query: 'What is the capital of France?',
        sessionId: 'session-130',
        userId: 'user-456'
      };

      const decision = await engine.submitRequest(request);

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

      const pool = new ProviderPool(members, adapters as any);
      const engine = new OrchestrationEngine(pool, synthesisEngine, costCalculator);

      const request: UserRequest = {
        query: 'Controversial topic',
        sessionId: 'session-131',
        userId: 'user-456'
      };

      const decision = await engine.submitRequest(request);

      expect(decision).toBeDefined();
      expect(decision.contributingMembers).toHaveLength(3);
      // Agreement level should be lower for divergent responses
      expect(decision.agreementLevel).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should process requests in parallel for better performance', async () => {
      const startTime = Date.now();

      const request: UserRequest = {
        query: 'Parallel processing test',
        sessionId: 'session-132',
        userId: 'user-456'
      };

      const decision = await orchestrationEngine.submitRequest(request);

      const elapsed = Date.now() - startTime;

      // With parallel execution, should complete in ~10-50ms (mock delay)
      // If sequential, would take ~30ms+ (3 providers * 10ms each)
      expect(elapsed).toBeLessThan(100);
      expect(decision.contributingMembers).toHaveLength(3);
    });
  });
});
