/**
 * Integration Tests for Code-Aware Synthesis
 * Tests end-to-end synthesis with code responses
 */

import { SynthesisEngine } from '../engine';
import {
  DeliberationThread,
  DeliberationRound,
  Exchange,
  SynthesisStrategy,
  CouncilMember,
  TokenUsage,
  UserRequest
} from '../../types/core';

describe('Code-Aware Synthesis Integration Tests', () => {
  let engine: SynthesisEngine;
  let mockProviderPool: any;
  let mockConfigManager: any;

  beforeEach(() => {
    mockProviderPool = {
      sendRequest: jest.fn().mockResolvedValue({
        success: true,
        content: 'Synthesized code result',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latencyMs: 500,
        cost: 0.01
      })
    };

    mockConfigManager = {
      getCouncilConfig: jest.fn().mockResolvedValue({
        members: [
          { id: 'member1', model: 'gpt-4' },
          { id: 'member2', model: 'claude-3-opus' },
          { id: 'member3', model: 'gemini-pro' }
        ]
      }),
      getModelRankings: jest.fn().mockResolvedValue({
        'gpt-4': 85,
        'claude-3-opus': 93,
        'gemini-pro': 92,
        'gpt-3.5-turbo': 65,
        'default': 50
      })
    };

    engine = new SynthesisEngine(mockProviderPool, mockConfigManager);
  });

  const createExchange = (
    councilMemberId: string,
    content: string,
    referencesTo: string[] = []
  ): Exchange => ({
    councilMemberId,
    content,
    referencesTo,
    tokenUsage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150
    }
  });

  const createThread = (exchanges: Exchange[]): DeliberationThread => ({
    rounds: [
      {
        roundNumber: 0,
        exchanges
      }
    ],
    totalDuration: 1000
  });

  const createRequest = (query: string = 'Test query'): UserRequest => ({
    id: 'test-request-id',
    query,
    timestamp: new Date()
  });

  describe('End-to-end synthesis with JavaScript code', () => {
    it('should synthesize JavaScript code responses', async () => {
      const exchanges = [
        createExchange('member1', '```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```'),
        createExchange('member2', '```javascript\nfunction add(x, y) {\n  return x + y;\n}\n```'),
        createExchange('member3', '```javascript\nfunction add(num1, num2) {\n  return num1 + num2;\n}\n```')
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a function to add two numbers');
      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.agreementLevel).toBeGreaterThan(0);
      expect(result.agreementLevel).toBeLessThanOrEqual(1);
      expect(result.confidence).toMatch(/^(high|medium|low)$/);
    });

    it('should synthesize Python code responses', async () => {
      const exchanges = [
        createExchange('member1', '```python\ndef add(a, b):\n    return a + b\n```'),
        createExchange('member2', '```python\ndef add(x, y):\n    return x + y\n```')
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a Python function to add two numbers');
      const strategy: SynthesisStrategy = { type: 'weighted-fusion', weights: new Map() };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.agreementLevel).toBeGreaterThan(0);
    });
  });

  describe('End-to-end synthesis with mixed code/text', () => {
    it('should handle mixed code and text responses', async () => {
      const exchanges = [
        createExchange('member1', '```javascript\nfunction test() {}\n```\n\nThis is the solution.'),
        createExchange('member2', 'Here is my approach:\n```javascript\nfunction test() {}\n```'),
        createExchange('member3', 'I think the best solution is:\n```javascript\nfunction test() {}\n```')
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a function to add two numbers');
      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      // Should use code-aware similarity since at least one exchange has code
      expect(result.agreementLevel).toBeGreaterThan(0);
    });
  });

  describe('Meta-synthesis with code responses', () => {
    it('should use code-specific prompts when code is detected', async () => {
      const exchanges = [
        createExchange('member1', '```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```'),
        createExchange('member2', '```javascript\nfunction add(x, y) {\n  return x + y;\n}\n```')
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a function to add two numbers');
      const strategy: SynthesisStrategy = {
        type: 'meta-synthesis',
        moderatorStrategy: { type: 'strongest' }
      };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      // Verify that meta-synthesis was called (should have sent request to moderator)
      expect(mockProviderPool.sendRequest).toHaveBeenCalled();
      
      // Check that prompt contains code-specific instructions
      const callArgs = mockProviderPool.sendRequest.mock.calls[0];
      const prompt = callArgs[1]; // Second argument is the prompt
      expect(prompt).toContain('CRITICAL REQUIREMENTS FOR PRODUCTION-READY CODE');
      expect(prompt).toContain('Correctness');
      expect(prompt).toContain('Security');
    });
  });

  describe('Validation weighting integration', () => {
    it('should apply validation weights in weighted-fusion', async () => {
      const exchanges = [
        createExchange('member1', '```javascript\nfunction test() {\n  return x;\n}\n```'), // Valid code
        createExchange('member2', '```javascript\nfunction test() {\n  return x;\n```') // Unbalanced brackets
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a function');
      const weights = new Map([
        ['member1', 1.0],
        ['member2', 1.0]
      ]);
      const strategy: SynthesisStrategy = { type: 'weighted-fusion', weights };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      // For code responses, we select a single best response (not concatenated)
      // So the result should contain code, not member IDs
      expect(result.content).toContain('function');
    });
  });

  describe('Backward compatibility', () => {
    it('should handle non-code responses with text-based similarity', async () => {
      const exchanges = [
        createExchange('member1', 'This is a text response without any code.'),
        createExchange('member2', 'This is another text response.'),
        createExchange('member3', 'Yet another text response.')
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a function to add two numbers');
      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.agreementLevel).toBeGreaterThan(0);
      // Should use text-based similarity (no code detected)
    });

    it('should fallback gracefully on code detection failure', async () => {
      // This test ensures backward compatibility is maintained
      const exchanges = [
        createExchange('member1', 'Some content'),
        createExchange('member2', 'Other content')
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a function to add two numbers');
      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      // Should not throw error even if code detection fails
    });
  });

  describe('Edge cases', () => {
    it('should handle empty code blocks', async () => {
      const exchanges = [
        createExchange('member1', '```\n```'),
        createExchange('member2', '```\n```')
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a function to add two numbers');
      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should handle malformed code blocks', async () => {
      const exchanges = [
        createExchange('member1', '```javascript\nfunction test() {'),
        createExchange('member2', '```javascript\nfunction test() {')
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a function to add two numbers');
      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      // Should handle gracefully without throwing errors
    });

    it('should handle responses with only comments', async () => {
      const exchanges = [
        createExchange('member1', '```javascript\n// This is a comment\n```'),
        createExchange('member2', '```javascript\n/* Another comment */\n```')
      ];

      const thread = createThread(exchanges);
      const request = createRequest('Generate a function to add two numbers');
      const strategy: SynthesisStrategy = { type: 'consensus-extraction' };

      const result = await engine.synthesize(request, thread, strategy);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });
});

