/**
 * Property-based tests for Tool Execution Engine
 * Feature: council-enhancements
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { ToolExecutionEngine } from '../execution-engine';
import { FunctionToolAdapter, HTTPToolAdapter } from '../tool-adapter';
import { ToolDefinition, ToolCall } from '../../types/core';

describe('Tool Execution Engine - Property Tests', () => {
  let dbPool: Pool;
  let engine: ToolExecutionEngine;
  let functionAdapter: FunctionToolAdapter;

  beforeAll(() => {
    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/test'
    });
  });

  afterAll(async () => {
    await dbPool.end();
  });

  beforeEach(async () => {
    engine = new ToolExecutionEngine(dbPool);

    // Register adapters
    functionAdapter = new FunctionToolAdapter();
    engine.registerAdapter(functionAdapter);
    engine.registerAdapter(new HTTPToolAdapter());

    // Clean up test data (ignore if table doesn't exist)
    try {
      await dbPool.query('DELETE FROM tool_usage WHERE request_id LIKE $1', ['test-%']);
    } catch (error: any) {
      // Ignore error if table doesn't exist (e.g., in test environments without full schema)
      if (!error.message?.includes('does not exist')) {
        throw error;
      }
    }
  });

  /**
   * Property 7: Tool definition inclusion
   * Feature: council-enhancements, Property 7: For any council member that supports
   * tool use, the request should include available tool definitions.
   */
  test('Property 7: Tool definition inclusion', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.constantFrom('function', 'http'),
        (toolName, description, adapter) => {
          const toolDef: ToolDefinition = {
            name: toolName,
            description,
            adapter,
            parameters: []
          };

          engine.registerTool(toolDef);

          const availableTools = engine.getAvailableTools();

          // Assertions
          expect(availableTools.length).toBeGreaterThan(0);
          const registered = availableTools.find(t => t.name === toolName);
          expect(registered).toBeDefined();
          expect(registered?.description).toBe(description);
          expect(registered?.adapter).toBe(adapter);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8: Tool execution and result delivery
   * Feature: council-enhancements, Property 8: For any tool call made by a council
   * member, the system should execute the tool and provide results to that member.
   */
  test('Property 8: Tool execution and result delivery', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.uuid(),
        fc.integer({ min: 1, max: 100 }),
        async (toolName, councilMemberId, requestId, inputValue) => {
          // Register a test function
          functionAdapter.registerFunction(toolName, async (params: any) => {
            return { result: params.value * 2 };
          });

          // Register tool
          const toolDef: ToolDefinition = {
            name: toolName,
            description: 'Test tool',
            adapter: 'function',
            parameters: [
              {
                name: 'value',
                type: 'number',
                description: 'Input value',
                required: true
              }
            ]
          };

          engine.registerTool(toolDef);

          // Execute tool
          const result = await engine.executeTool(
            toolName,
            { value: inputValue },
            councilMemberId,
            `test-${requestId}`
          );

          // Assertions
          expect(result.success).toBe(true);
          expect(result.toolName).toBe(toolName);
          expect(result.councilMemberId).toBe(councilMemberId);
          expect(result.result).toEqual({ result: inputValue * 2 });
          expect(result.latency).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 9: Parallel tool execution
   * Feature: council-enhancements, Property 9: For any set of tool calls from
   * multiple council members, all tool calls should execute in parallel.
   */
  test('Property 9: Parallel tool execution', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
        fc.uuid(),
        async (councilMemberIds, requestId) => {
          const toolName = 'parallel-test';

          // Register a test function
          functionAdapter.registerFunction(toolName, async (params: any) => {
            // Simulate some work
            await new Promise(resolve => setTimeout(resolve, 10));
            return { memberId: params.memberId, value: params.value };
          });

          // Register tool
          const toolDef: ToolDefinition = {
            name: toolName,
            description: 'Parallel test tool',
            adapter: 'function',
            parameters: [
              {
                name: 'memberId',
                type: 'string',
                description: 'Member ID',
                required: true
              },
              {
                name: 'value',
                type: 'number',
                description: 'Value',
                required: true
              }
            ]
          };

          engine.registerTool(toolDef);

          // Create tool calls for each member
          const toolCalls: ToolCall[] = councilMemberIds.map((memberId, index) => ({
            toolName,
            parameters: { memberId, value: index },
            councilMemberId: memberId,
            requestId: `test-${requestId}`
          }));

          const startTime = Date.now();
          const results = await engine.executeParallel(toolCalls);
          const totalTime = Date.now() - startTime;

          // Assertions
          expect(results.length).toBe(councilMemberIds.length);

          // All should succeed
          results.forEach(result => {
            expect(result.success).toBe(true);
          });

          // Each member should get their own result
          results.forEach((result, index) => {
            expect(result.councilMemberId).toBe(councilMemberIds[index]);
            expect(result.result.memberId).toBe(councilMemberIds[index]);
          });

          // Parallel execution should be faster than sequential
          // Sequential would take at least (n * 10ms), parallel should be much less
          const sequentialTime = councilMemberIds.length * 10;
          expect(totalTime).toBeLessThan(sequentialTime * 0.8); // At least 20% faster
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test parameter validation
   */
  test('Parameter validation enforces required parameters', async () => {
    const toolDef: ToolDefinition = {
      name: 'validation-test',
      description: 'Test parameter validation',
      adapter: 'function',
      parameters: [
        {
          name: 'required-param',
          type: 'string',
          description: 'A required parameter',
          required: true
        },
        {
          name: 'optional-param',
          type: 'number',
          description: 'An optional parameter',
          required: false
        }
      ]
    };

    functionAdapter.registerFunction('validation-test', async () => ({ success: true }));
    engine.registerTool(toolDef);

    // Should fail without required parameter
    const result = await engine.executeTool(
      'validation-test',
      { 'optional-param': 42 },
      'member-1',
      'test-request'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('required-param');
  });

  /**
   * Test tool execution timeout
   */
  test('Tool execution times out for long-running tools', async () => {
    const toolDef: ToolDefinition = {
      name: 'timeout-test',
      description: 'Test timeout handling',
      adapter: 'function',
      parameters: []
    };

    functionAdapter.registerFunction('timeout-test', async () => {
      // Simulate a very long operation
      await new Promise(resolve => setTimeout(resolve, 35000));
      return { success: true };
    });

    engine.registerTool(toolDef);

    const result = await engine.executeTool(
      'timeout-test',
      {},
      'member-1',
      'test-request'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });
});
