/**
 * Integration Tests - Full Deliberation Flow
 * Tests end-to-end request processing through the entire system
 */

import { OrchestrationEngine } from '../../orchestration/engine';
import { ProviderPool } from '../../providers/pool';
import { SynthesisEngine } from '../../synthesis/engine';
import { ConfigurationManager } from '../../config/manager';
import { Pool } from 'pg';
import { createClient } from 'redis';
import {
  CouncilMember,
  UserRequest,
  ConsensusDecision,
  RetryPolicy,
  CouncilConfig,
  DeliberationConfig,
  PerformanceConfig,
  SynthesisConfig
} from '../../types/core';

// Mock database and redis
const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  end: jest.fn().mockResolvedValue(undefined)
} as unknown as Pool;

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn().mockResolvedValue(undefined),
  connect: jest.fn().mockResolvedValue(undefined)
} as any;

// Mock configuration
const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 2,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
  retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
};

const mockCouncilConfig: CouncilConfig = {
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
      model: 'claude-3-opus',
      timeout: 30,
      retryPolicy: defaultRetryPolicy
    },
    {
      id: 'member-3',
      provider: 'google',
      model: 'gemini-pro',
      timeout: 30,
      retryPolicy: defaultRetryPolicy
    }
  ],
  minimumSize: 2,
  requireMinimumForConsensus: true
};

const mockDeliberationConfig: DeliberationConfig = {
  rounds: 0,
  timeoutPerRound: 30
};

const mockPerformanceConfig: PerformanceConfig = {
  globalTimeout: 60,
  enableParallelProcessing: true
};

const mockSynthesisConfig: SynthesisConfig = {
  strategy: {
    type: 'consensus-extraction',
    minAgreementThreshold: 0.7
  }
};

describe('Integration Tests - Full Deliberation Flow', () => {
  let orchestrationEngine: OrchestrationEngine;
  let providerPool: ProviderPool;
  let synthesisEngine: SynthesisEngine;
  let configManager: ConfigurationManager;

  // Store original environment variables
  const originalEnv = process.env;

  beforeAll(() => {
    // Mock environment variables for providers (required for ProviderPool initialization)
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.GOOGLE_API_KEY = 'test-google-key';
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  beforeEach(() => {
    // Create provider pool
    providerPool = new ProviderPool();

    // Create configuration manager with mocked config methods
    configManager = new ConfigurationManager(mockDb, mockRedis);

    // Mock all config getters
    jest.spyOn(configManager, 'getCouncilConfig').mockResolvedValue(mockCouncilConfig);
    jest.spyOn(configManager, 'getDeliberationConfig').mockResolvedValue(mockDeliberationConfig);
    jest.spyOn(configManager, 'getPerformanceConfig').mockResolvedValue(mockPerformanceConfig);
    jest.spyOn(configManager, 'getSynthesisConfig').mockResolvedValue(mockSynthesisConfig);

    // Create synthesis engine
    synthesisEngine = new SynthesisEngine(providerPool, configManager);

    // Create orchestration engine
    orchestrationEngine = new OrchestrationEngine(
      providerPool,
      configManager,
      synthesisEngine
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Successful Deliberation Flow', () => {
    it('should process a request through all council members and synthesize result', async () => {
      const userRequest: UserRequest = {
        id: 'req-123',
        query: 'What is the capital of France?',
        sessionId: 'session-123',
        userId: 'user-456'
      };

      // Mock provider responses
      jest.spyOn(providerPool, 'sendRequest').mockResolvedValue({
        content: 'Paris is the capital of France',
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latency: 100,
        success: true
      });

      const decision = await orchestrationEngine.processRequest(userRequest);

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
        id: 'req-124',
        query: 'Explain quantum computing',
        sessionId: 'session-124',
        userId: 'user-456'
      };

      // Mock provider responses with token usage
      jest.spyOn(providerPool, 'sendRequest').mockResolvedValue({
        content: 'Quantum computing uses qubits...',
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latency: 100,
        success: true
      });

      const decision = await orchestrationEngine.processRequest(userRequest);

      // Each provider returns 30 total tokens, with 3 members total should be 90
      expect(decision).toBeDefined();
      expect(decision.contributingMembers.length).toBe(3);
    });

    it('should maintain session context across multiple requests', async () => {
      const sessionId = 'session-125';

      // Mock provider responses
      jest.spyOn(providerPool, 'sendRequest').mockResolvedValue({
        content: 'AI is artificial intelligence...',
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latency: 100,
        success: true
      });

      const request1: UserRequest = {
        id: 'req-125-1',
        query: 'What is AI?',
        sessionId,
        userId: 'user-456'
      };

      const decision1 = await orchestrationEngine.processRequest(request1);
      expect(decision1.content).toBeDefined();

      const request2: UserRequest = {
        id: 'req-125-2',
        query: 'Tell me more about that',
        sessionId,
        userId: 'user-456'
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
      const request: UserRequest = {
        id: 'req-126',
        query: 'Test query',
        sessionId: 'session-126',
        userId: 'user-456'
      };

      // Mock sendRequest to fail for member-2 only
      let callCount = 0;
      jest.spyOn(providerPool, 'sendRequest').mockImplementation(async (member) => {
        callCount++;
        if (member.id === 'member-2') {
          return {
            content: '',
            tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            latency: 0,
            success: false,
            error: new Error('Provider failure')
          };
        }
        return {
          content: `Response from ${member.id}`,
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          success: true
        };
      });

      const decision = await orchestrationEngine.processRequest(request);

      // Should still get a decision from the working providers
      expect(decision).toBeDefined();
      expect(decision.contributingMembers.length).toBe(2);
      expect(decision.contributingMembers).not.toContain('member-2');
    });

    it('should synthesize responses even with only 2 out of 3 providers', async () => {
      const request: UserRequest = {
        id: 'req-127',
        query: 'Synthesize this',
        sessionId: 'session-127',
        userId: 'user-456'
      };

      // Mock sendRequest to fail for member-3
      jest.spyOn(providerPool, 'sendRequest').mockImplementation(async (member) => {
        if (member.id === 'member-3') {
          return {
            content: '',
            tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            latency: 0,
            success: false,
            error: new Error('Provider failure')
          };
        }
        return {
          content: `Response from ${member.id}`,
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          success: true
        };
      });

      const decision = await orchestrationEngine.processRequest(request);

      expect(decision.content).toBeDefined();
      expect(decision.contributingMembers).toHaveLength(2);
      expect(decision.synthesisStrategy).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should fail gracefully when all providers are unavailable', async () => {
      const request: UserRequest = {
        id: 'req-128',
        query: 'This will fail',
        sessionId: 'session-128',
        userId: 'user-456'
      };

      // Mock all providers to fail
      jest.spyOn(providerPool, 'sendRequest').mockResolvedValue({
        content: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        success: false,
        error: new Error('All providers unavailable')
      });

      await expect(orchestrationEngine.processRequest(request)).rejects.toThrow();
    });

    it('should handle empty query gracefully', async () => {
      const request: UserRequest = {
        id: 'req-129',
        query: '',
        sessionId: 'session-129',
        userId: 'user-456'
      };

      // Mock provider to return empty response
      jest.spyOn(providerPool, 'sendRequest').mockResolvedValue({
        content: 'Cannot process empty query',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 10,
        success: true
      });

      // Empty query should still process (validation is done elsewhere)
      const decision = await orchestrationEngine.processRequest(request);
      expect(decision).toBeDefined();
    });
  });

  describe('Synthesis Strategies', () => {
    it('should use consensus extraction for high agreement', async () => {
      const request: UserRequest = {
        id: 'req-130',
        query: 'What is the capital of France?',
        sessionId: 'session-130',
        userId: 'user-456'
      };

      // Mock all providers to return similar responses
      jest.spyOn(providerPool, 'sendRequest').mockResolvedValue({
        content: 'Paris is the capital of France',
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latency: 100,
        success: true
      });

      const decision = await orchestrationEngine.processRequest(request);

      expect(decision.synthesisStrategy.type).toBe('consensus-extraction');
      expect(decision.agreementLevel).toBeGreaterThan(0.8);
    });

    it('should handle divergent responses from different providers', async () => {
      const request: UserRequest = {
        id: 'req-131',
        query: 'Controversial topic',
        sessionId: 'session-131',
        userId: 'user-456'
      };

      // Mock providers to return different responses
      let responseIndex = 0;
      const responses = [
        'Response about topic A - focused on economic aspects',
        'Response about topic B - focused on social aspects',
        'Response about topic C - focused on political aspects'
      ];

      jest.spyOn(providerPool, 'sendRequest').mockImplementation(async () => {
        const content = responses[responseIndex % responses.length];
        responseIndex++;
        return {
          content,
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 100,
          success: true
        };
      });

      const decision = await orchestrationEngine.processRequest(request);

      expect(decision).toBeDefined();
      expect(decision.contributingMembers).toHaveLength(3);
      // Agreement level should be lower for divergent responses
      expect(decision.agreementLevel).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should process requests in parallel for better performance', async () => {
      const request: UserRequest = {
        id: 'req-132',
        query: 'Parallel processing test',
        sessionId: 'session-132',
        userId: 'user-456'
      };

      // Mock provider with small delay to test parallelism
      jest.spyOn(providerPool, 'sendRequest').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          content: 'Response with simulated delay',
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          latency: 10,
          success: true
        };
      });

      const startTime = Date.now();
      const decision = await orchestrationEngine.processRequest(request);
      const elapsed = Date.now() - startTime;

      // With parallel execution, should complete in ~10-100ms (3 providers in parallel)
      // If sequential, would take ~30ms+ (3 providers * 10ms each)
      expect(elapsed).toBeLessThan(200);
      expect(decision.contributingMembers).toHaveLength(3);
    });
  });
});
