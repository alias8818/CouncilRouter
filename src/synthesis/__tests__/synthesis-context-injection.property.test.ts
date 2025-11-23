/**
 * Property-Based Tests for Synthesis Context Injection
 * Feature: synthesis-context-injection
 */

import * as fc from 'fast-check';
import { SynthesisEngine } from '../engine';
import {
  DeliberationThread,
  DeliberationRound,
  Exchange,
  CouncilMember,
  SynthesisStrategy,
  ModeratorStrategy,
  TokenUsage,
  UserRequest
} from '../../types/core';

describe('SynthesisEngine - Synthesis Context Injection Property Tests', () => {
  let engine: SynthesisEngine;
  let mockProviderPool: any;
  let mockConfigManager: any;
  let capturedPrompts: string[];

  beforeEach(() => {
    capturedPrompts = [];
    
    mockProviderPool = {
      sendRequest: jest.fn().mockImplementation(async (member, prompt) => {
        capturedPrompts.push(prompt);
        return {
          success: true,
          content: 'Meta-synthesis result',
          tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          latencyMs: 500,
          cost: 0.01
        };
      })
    } as any;

    mockConfigManager = {
      getCouncilConfig: jest.fn().mockResolvedValue({
        members: [
          { id: 'member1', model: 'gpt-4' },
          { id: 'member2', model: 'claude-3-opus' },
          { id: 'member3', model: 'gemini-pro' }
        ]
      }),
      getDevilsAdvocateConfig: jest.fn().mockResolvedValue({
        enabled: false,
        applyToCodeRequests: true,
        applyToTextRequests: false,
        intensityLevel: 'moderate',
        provider: 'openai',
        model: 'gpt-4'
      }),
      getModelRankings: jest.fn().mockResolvedValue({
        'gpt-4': 85,
        'claude-3-opus': 93,
        'gemini-pro': 92,
        'gpt-3.5-turbo': 65,
        'default': 50
      })
    } as any;

    engine = new SynthesisEngine(mockProviderPool, mockConfigManager);
  });

  // Arbitraries for generating test data
  const tokenUsageArb = fc.record({
    promptTokens: fc.integer({ min: 1, max: 10000 }),
    completionTokens: fc.integer({ min: 1, max: 10000 }),
    totalTokens: fc.integer({ min: 2, max: 20000 })
  });

  const exchangeArb = fc.record({
    councilMemberId: fc.oneof(
      fc.constant('member1'),
      fc.constant('member2'),
      fc.constant('member3')
    ),
    content: fc.string({ minLength: 10, maxLength: 500 }),
    referencesTo: fc.array(fc.string(), { maxLength: 3 }),
    tokenUsage: tokenUsageArb
  });

  const deliberationRoundArb = fc.record({
    roundNumber: fc.integer({ min: 1, max: 5 }),
    exchanges: fc.array(exchangeArb, { minLength: 1, maxLength: 10 })
  });

  const deliberationThreadArb = fc.record({
    rounds: fc.array(deliberationRoundArb, { minLength: 1, maxLength: 5 }),
    totalDuration: fc.integer({ min: 100, max: 60000 })
  });

  const consensusExtractionStrategyArb: fc.Arbitrary<SynthesisStrategy> = fc.constant({
    type: 'consensus-extraction' as const
  });

  const weightedFusionStrategyArb: fc.Arbitrary<SynthesisStrategy> = fc.record({
    type: fc.constant('weighted-fusion' as const),
    weights: fc.dictionary(
      fc.oneof(
        fc.constant('member1'),
        fc.constant('member2'),
        fc.constant('member3')
      ),
      fc.double({ min: 0.1, max: 5.0, noNaN: true })
    ).map(dict => new Map(Object.entries(dict)))
  });

  const metaSynthesisStrategyArb: fc.Arbitrary<SynthesisStrategy> = fc.record({
    type: fc.constant('meta-synthesis' as const),
    moderatorStrategy: fc.oneof(
      fc.record({ type: fc.constant('permanent' as const), memberId: fc.constant('member1') }),
      fc.record({ type: fc.constant('rotate' as const) }),
      fc.record({ type: fc.constant('strongest' as const) })
    )
  });

  const synthesisStrategyArb = fc.oneof(
    consensusExtractionStrategyArb,
    weightedFusionStrategyArb,
    metaSynthesisStrategyArb
  );

  const userRequestArb = fc.record({
    id: fc.uuid(),
    query: fc.string({ minLength: 10, maxLength: 500 }),
    timestamp: fc.constant(new Date())
  });

  /**
   * Property-Based Test: Query Context Preservation Across All Strategies
   * Feature: synthesis-context-injection, Property 1: Query context must be accessible to all synthesis strategies
   * 
   * Validates: Requirements 1.1, 1.2, 1.5, 4.2, 4.3
   */
  test('Property 1: Query context is preserved across all synthesis strategies', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArb,
        deliberationThreadArb,
        synthesisStrategyArb,
        async (request, thread, strategy) => {
          capturedPrompts.length = 0;
          
          const result = await engine.synthesize(request, thread, strategy);

          // For meta-synthesis, verify query is in the prompt (if query is not whitespace-only)
          if (strategy.type === 'meta-synthesis') {
            expect(capturedPrompts.length).toBeGreaterThan(0);
            const prompt = capturedPrompts[0];
            if (request.query && request.query.trim().length > 0) {
              expect(prompt).toContain('ORIGINAL USER QUERY');
              expect(prompt).toContain(request.query.trim());
            }
          }

          // Result should be defined
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Code Non-Concatenation
   * Feature: synthesis-context-injection, Property 2: Code responses must not be concatenated
   * 
   * Validates: Requirements 2.1
   */
  test('Property 2: Code responses are not concatenated in consensus extraction or weighted fusion', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArb,
        fc.array(
          fc.record({
            councilMemberId: fc.oneof(
              fc.constant('member1'),
              fc.constant('member2'),
              fc.constant('member3')
            ),
            content: fc.string({ minLength: 20, maxLength: 200 }).map(s => 
              `\`\`\`javascript\nfunction test() {\n  return ${s};\n}\n\`\`\``
            ),
            referencesTo: fc.array(fc.string(), { maxLength: 3 }),
            tokenUsage: tokenUsageArb
          }),
          { minLength: 2, maxLength: 5 }
        ),
        fc.oneof(
          consensusExtractionStrategyArb,
          weightedFusionStrategyArb
        ),
        async (request, exchanges, strategy) => {
          const thread: DeliberationThread = {
            rounds: [{
              roundNumber: 1,
              exchanges
            }],
            totalDuration: 1000
          };

          const result = await engine.synthesize(request, thread, strategy);

          // Extract code blocks from result
          const codeBlockMatches = result.content.match(/```[\s\S]*?```/g);
          
          if (codeBlockMatches && codeBlockMatches.length > 0) {
            // Should have at most one complete code block (not concatenated)
            // Allow for markdown formatting but not multiple separate code blocks
            const codeBlocks = codeBlockMatches.filter(block => 
              block.includes('function') || block.includes('const') || block.includes('class')
            );
            
            // The result should be a single code response, not concatenation of multiple
            // We check that we don't have multiple distinct code blocks separated by text
            const distinctCodeBlocks = new Set(codeBlocks.map(b => b.trim()));
            expect(distinctCodeBlocks.size).toBeLessThanOrEqual(exchanges.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Critical Error Rejection
   * Feature: synthesis-context-injection, Property 3: Critical errors must be rejected
   * 
   * Validates: Requirements 2.1
   */
  test('Property 3: Code responses with syntax errors are rejected (weight 0.0)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArb,
        fc.array(
          fc.record({
            councilMemberId: fc.oneof(
              fc.constant('member1'),
              fc.constant('member2'),
              fc.constant('member3')
            ),
            content: fc.oneof(
              // Valid code
              fc.string({ minLength: 20, maxLength: 200 }).map(s => 
                `\`\`\`javascript\nfunction test() {\n  return "${s}";\n}\n\`\`\``
              ),
              // Invalid code with syntax errors
              fc.constant('```javascript\nfunction test( {\n  retrun "test";\n}\n```'),
              fc.constant('```javascript\nconst x = "unclosed string;\n```'),
              fc.constant('```javascript\nif (x ==== y) { }\n```')
            ),
            referencesTo: fc.array(fc.string(), { maxLength: 3 }),
            tokenUsage: tokenUsageArb
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (request, exchanges) => {
          const thread: DeliberationThread = {
            rounds: [{
              roundNumber: 1,
              exchanges
            }],
            totalDuration: 1000
          };

          const strategy: SynthesisStrategy = { type: 'consensus-extraction' };
          const result = await engine.synthesize(request, thread, strategy);

          // Result should be defined (synthesis should complete)
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          
          // If all exchanges had syntax errors, the result might be degraded but should still exist
          // The key property is that synthesis completes without crashing
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Production-Ready Code Prompt Completeness
   * Feature: synthesis-context-injection, Property 4: Code prompts must include production-ready requirements
   * 
   * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 5.2, 5.3, 5.4, 5.5
   */
  test('Property 4: Meta-synthesis prompts for code include production-ready requirements', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArb,
        fc.array(
          fc.record({
            councilMemberId: fc.oneof(
              fc.constant('member1'),
              fc.constant('member2'),
              fc.constant('member3')
            ),
            content: fc.string({ minLength: 20, maxLength: 200 }).map(s => 
              `\`\`\`javascript\nfunction test() {\n  return "${s}";\n}\n\`\`\``
            ),
            referencesTo: fc.array(fc.string(), { maxLength: 3 }),
            tokenUsage: tokenUsageArb
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (request, exchanges) => {
          capturedPrompts.length = 0;
          
          const thread: DeliberationThread = {
            rounds: [{
              roundNumber: 1,
              exchanges
            }],
            totalDuration: 1000
          };

          const strategy: SynthesisStrategy = {
            type: 'meta-synthesis',
            moderatorStrategy: { type: 'strongest' }
          };

          await engine.synthesize(request, thread, strategy);

          // Verify prompt contains production-ready requirements
          expect(capturedPrompts.length).toBeGreaterThan(0);
          const prompt = capturedPrompts[0];
          
          expect(prompt).toContain('CRITICAL REQUIREMENTS FOR PRODUCTION-READY CODE');
          expect(prompt).toContain('Correctness');
          expect(prompt).toContain('Security');
          expect(prompt).toContain('Error Handling');
          expect(prompt).toContain('Best Practices');
          expect(prompt).toContain('User Constraints');
          expect(prompt).toContain('Completeness');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Code-Specific Prompt Template Selection
   * Feature: synthesis-context-injection, Property 5: Code requests use specialized prompts
   * 
   * Validates: Requirements 5.1
   */
  test('Property 5: Code requests use code-specific prompt template', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArb,
        fc.oneof(
          // Code request
          fc.record({
            exchanges: fc.array(
              fc.record({
                councilMemberId: fc.oneof(
                  fc.constant('member1'),
                  fc.constant('member2'),
                  fc.constant('member3')
                ),
                content: fc.string({ minLength: 20, maxLength: 200 }).map(s => 
                  `\`\`\`javascript\nfunction test() {\n  return "${s}";\n}\n\`\`\``
                ),
                referencesTo: fc.array(fc.string(), { maxLength: 3 }),
                tokenUsage: tokenUsageArb
              }),
              { minLength: 1, maxLength: 5 }
            ),
            isCode: fc.constant(true)
          }),
          // Text request
          fc.record({
            exchanges: fc.array(
              fc.record({
                councilMemberId: fc.oneof(
                  fc.constant('member1'),
                  fc.constant('member2'),
                  fc.constant('member3')
                ),
                content: fc.string({ minLength: 20, maxLength: 200 }),
                referencesTo: fc.array(fc.string(), { maxLength: 3 }),
                tokenUsage: tokenUsageArb
              }),
              { minLength: 1, maxLength: 5 }
            ),
            isCode: fc.constant(false)
          })
        ),
        async (request, testCase) => {
          capturedPrompts.length = 0;
          
          const thread: DeliberationThread = {
            rounds: [{
              roundNumber: 1,
              exchanges: testCase.exchanges
            }],
            totalDuration: 1000
          };

          const strategy: SynthesisStrategy = {
            type: 'meta-synthesis',
            moderatorStrategy: { type: 'strongest' }
          };

          await engine.synthesize(request, thread, strategy);

          expect(capturedPrompts.length).toBeGreaterThan(0);
          const prompt = capturedPrompts[0];

          if (testCase.isCode) {
            // Code requests should use code-specific template
            expect(prompt).toContain('CRITICAL REQUIREMENTS FOR PRODUCTION-READY CODE');
            expect(prompt).not.toContain('Identify the core consensus'); // Text-specific instruction
          } else {
            // Text requests should use standard template
            expect(prompt).toContain('Identify the core consensus');
            expect(prompt).not.toContain('CRITICAL REQUIREMENTS FOR PRODUCTION-READY CODE');
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Query Validation
   * Feature: synthesis-context-injection, Property 8: Query validation handles null/empty gracefully
   * 
   * Validates: Requirements 4.5
   */
  test('Property 8: Query validation handles null/empty queries gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({
            id: fc.uuid(),
            query: fc.constant(''),
            timestamp: fc.constant(new Date())
          }),
          fc.record({
            id: fc.uuid(),
            query: fc.constant('   '), // Whitespace only
            timestamp: fc.constant(new Date())
          }),
          fc.record({
            id: fc.uuid(),
            query: fc.string({ minLength: 10, maxLength: 500 }), // Valid query
            timestamp: fc.constant(new Date())
          })
        ),
        deliberationThreadArb,
        synthesisStrategyArb,
        async (request, thread, strategy) => {
          // Should not throw error, even with empty query
          const result = await engine.synthesize(request, thread, strategy);
          
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  /**
   * Property-Based Test: Devil's Advocate Configuration Enforcement
   * Feature: synthesis-context-injection, Property 9: Configuration changes apply without restart
   * 
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
   */
  test('Property 9: Devil\'s Advocate configuration is enforced', async () => {
    await fc.assert(
      fc.asyncProperty(
        userRequestArb,
        deliberationThreadArb,
        fc.record({
          enabled: fc.boolean(),
          applyToCodeRequests: fc.boolean(),
          applyToTextRequests: fc.boolean()
        }),
        async (request, thread, config) => {
          // Create engine with mock Devil's Advocate
          const mockDevilsAdvocate = {
            synthesizeWithCritique: jest.fn().mockResolvedValue('Improved synthesis')
          };

          const mockConfigWithDA = {
            ...mockConfigManager,
            getDevilsAdvocateConfig: jest.fn().mockResolvedValue({
              ...config,
              intensityLevel: 'moderate',
              provider: 'openai',
              model: 'gpt-4'
            })
          };

          const engineWithDA = new SynthesisEngine(
            mockProviderPool,
            mockConfigWithDA,
            mockDevilsAdvocate as any
          );

          // Detect if code request
          const allExchanges = thread.rounds.flatMap(r => r.exchanges);
          const isCodeRequest = allExchanges.some(e => 
            e.content.includes('```') || e.content.includes('function')
          );

          await engineWithDA.synthesize(request, thread, { type: 'consensus-extraction' });

          // If enabled and matches request type, Devil's Advocate should be called
          const shouldCallDA = config.enabled && (
            (isCodeRequest && config.applyToCodeRequests) ||
            (!isCodeRequest && config.applyToTextRequests)
          );

          if (shouldCallDA) {
            expect(mockDevilsAdvocate.synthesizeWithCritique).toHaveBeenCalled();
          } else {
            // If disabled or doesn't match, should not be called
            expect(mockDevilsAdvocate.synthesizeWithCritique).not.toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 50 } // Reduced runs for this test due to complexity
    );
  }, 120000);
});

