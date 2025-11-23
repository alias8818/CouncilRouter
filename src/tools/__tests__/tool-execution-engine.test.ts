/**
 * Tool Execution Engine Tests
 * Comprehensive test suite for tool registration and execution
 */

import { Pool } from 'pg';
import { ToolExecutionEngine } from '../execution-engine';
import { IToolAdapter } from '../tool-adapter';
import { ToolDefinition, ToolResult } from '../../types/core';

// Mock Tool Adapter
class MockToolAdapter implements IToolAdapter {
  name: string;
  private responses: Map<string, any> = new Map();
  private executionLog: Array<{ toolName: string; parameters: Record<string, any> }> = [];

  constructor(name: string) {
    this.name = name;
  }

  setResponse(toolName: string, response: any): void {
    this.responses.set(toolName, response);
  }

  async execute(toolName: string, parameters: Record<string, any>): Promise<any> {
    this.executionLog.push({ toolName, parameters });

    const response = this.responses.get(toolName);
    if (response instanceof Error) {
      throw response;
    }

    return response || { success: true, data: `Result from ${toolName}` };
  }

  getExecutionLog(): Array<{ toolName: string; parameters: Record<string, any> }> {
    return this.executionLog;
  }
}

// Mock Pool
class MockPool {
  private toolUsage: any[] = [];

  async query(text: string, params?: any[]): Promise<any> {
    if (text.includes('INSERT INTO tool_usage')) {
      const usage = {
        id: 'uuid',
        request_id: params?.[0],
        council_member_id: params?.[1],
        round_number: params?.[2],
        tool_name: params?.[3],
        parameters: params?.[4],
        result: params?.[5],
        success: params?.[6],
        latency_ms: params?.[7],
        created_at: params?.[8]
      };
      this.toolUsage.push(usage);
      return { rows: [] };
    }

    if (text.includes('SELECT') && text.includes('FROM tool_usage')) {
      const requestId = params?.[0];
      const filtered = this.toolUsage.filter(u => u.request_id === requestId);
      return { rows: filtered };
    }

    return { rows: [] };
  }

  getToolUsage(): any[] {
    return this.toolUsage;
  }
}

describe('ToolExecutionEngine', () => {
  let engine: ToolExecutionEngine;
  let mockPool: MockPool;
  let mockAdapter: MockToolAdapter;

  beforeEach(() => {
    mockPool = new MockPool();
    engine = new ToolExecutionEngine(mockPool as unknown as Pool);
    mockAdapter = new MockToolAdapter('test-adapter');
  });

  describe('registerAdapter', () => {
    it('should register a tool adapter', () => {
      engine.registerAdapter(mockAdapter);

      // Verify by registering a tool that requires this adapter
      const tool: ToolDefinition = {
        name: 'test-tool',
        description: 'Test tool',
        adapter: 'test-adapter',
        parameters: []
      };

      expect(() => engine.registerTool(tool)).not.toThrow();
    });

    it('should allow multiple adapters', () => {
      const adapter1 = new MockToolAdapter('adapter-1');
      const adapter2 = new MockToolAdapter('adapter-2');

      engine.registerAdapter(adapter1);
      engine.registerAdapter(adapter2);

      const tool1: ToolDefinition = {
        name: 'tool-1',
        description: 'Tool 1',
        adapter: 'adapter-1',
        parameters: []
      };

      const tool2: ToolDefinition = {
        name: 'tool-2',
        description: 'Tool 2',
        adapter: 'adapter-2',
        parameters: []
      };

      expect(() => engine.registerTool(tool1)).not.toThrow();
      expect(() => engine.registerTool(tool2)).not.toThrow();
    });
  });

  describe('registerTool', () => {
    beforeEach(() => {
      engine.registerAdapter(mockAdapter);
    });

    it('should register a valid tool', () => {
      const tool: ToolDefinition = {
        name: 'search',
        description: 'Search tool',
        adapter: 'test-adapter',
        parameters: [
          { name: 'query', type: 'string', required: true, description: 'Search query' }
        ]
      };

      engine.registerTool(tool);

      const available = engine.getAvailableTools();
      expect(available).toContainEqual(tool);
    });

    it('should throw error when tool name is empty', () => {
      const tool: ToolDefinition = {
        name: '',
        description: 'Invalid tool',
        adapter: 'test-adapter',
        parameters: []
      };

      expect(() => engine.registerTool(tool)).toThrow('Tool name is required');
    });

    it('should throw error when tool name is whitespace only', () => {
      const tool: ToolDefinition = {
        name: '   ',
        description: 'Invalid tool',
        adapter: 'test-adapter',
        parameters: []
      };

      expect(() => engine.registerTool(tool)).toThrow('Tool name is required');
    });

    it('should throw error when adapter not found', () => {
      const tool: ToolDefinition = {
        name: 'test-tool',
        description: 'Test tool',
        adapter: 'non-existent-adapter',
        parameters: []
      };

      expect(() => engine.registerTool(tool)).toThrow(
        'Adapter non-existent-adapter not found. Register adapter first.'
      );
    });

    it('should throw error when parameter name is empty', () => {
      const tool: ToolDefinition = {
        name: 'test-tool',
        description: 'Test tool',
        adapter: 'test-adapter',
        parameters: [
          { name: '', type: 'string', required: true, description: 'Invalid param' }
        ]
      };

      expect(() => engine.registerTool(tool)).toThrow('Parameter name is required');
    });

    it('should handle tools with multiple parameters', () => {
      const tool: ToolDefinition = {
        name: 'complex-tool',
        description: 'Complex tool',
        adapter: 'test-adapter',
        parameters: [
          { name: 'param1', type: 'string', required: true, description: 'Param 1' },
          { name: 'param2', type: 'number', required: false, description: 'Param 2' },
          { name: 'param3', type: 'boolean', required: true, description: 'Param 3' }
        ]
      };

      expect(() => engine.registerTool(tool)).not.toThrow();

      const available = engine.getAvailableTools();
      expect(available).toContainEqual(tool);
    });
  });

  describe('executeTool', () => {
    beforeEach(() => {
      engine.registerAdapter(mockAdapter);
    });

    it('should execute a registered tool successfully', async () => {
      const tool: ToolDefinition = {
        name: 'calculator',
        description: 'Calculator tool',
        adapter: 'test-adapter',
        parameters: [
          { name: 'operation', type: 'string', required: true, description: 'Operation' },
          { name: 'value', type: 'number', required: true, description: 'Value' }
        ]
      };

      engine.registerTool(tool);
      mockAdapter.setResponse('calculator', { result: 42 });

      const result = await engine.executeTool(
        'calculator',
        { operation: 'add', value: 10 },
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('calculator');
      expect(result.councilMemberId).toBe('member-1');
      expect(result.result).toEqual({ result: 42 });
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should throw error when tool not found', async () => {
      const result = await engine.executeTool(
        'non-existent-tool',
        {},
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool non-existent-tool not found');
    });

    it('should validate required parameters', async () => {
      const tool: ToolDefinition = {
        name: 'validator-test',
        description: 'Test tool',
        adapter: 'test-adapter',
        parameters: [
          { name: 'required-param', type: 'string', required: true, description: 'Required' }
        ]
      };

      engine.registerTool(tool);

      const result = await engine.executeTool(
        'validator-test',
        {},
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Required parameter required-param is missing');
    });

    it('should validate parameter types - number', async () => {
      const tool: ToolDefinition = {
        name: 'number-tool',
        description: 'Tool requiring number',
        adapter: 'test-adapter',
        parameters: [
          { name: 'count', type: 'number', required: true, description: 'Count' }
        ]
      };

      engine.registerTool(tool);

      const result = await engine.executeTool(
        'number-tool',
        { count: 'not-a-number' },
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Parameter count must be a number');
    });

    it('should validate parameter types - string', async () => {
      const tool: ToolDefinition = {
        name: 'string-tool',
        description: 'Tool requiring string',
        adapter: 'test-adapter',
        parameters: [
          { name: 'text', type: 'string', required: true, description: 'Text' }
        ]
      };

      engine.registerTool(tool);

      const result = await engine.executeTool(
        'string-tool',
        { text: 123 },
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Parameter text must be a string');
    });

    it('should validate parameter types - boolean', async () => {
      const tool: ToolDefinition = {
        name: 'boolean-tool',
        description: 'Tool requiring boolean',
        adapter: 'test-adapter',
        parameters: [
          { name: 'flag', type: 'boolean', required: true, description: 'Flag' }
        ]
      };

      engine.registerTool(tool);

      const result = await engine.executeTool(
        'boolean-tool',
        { flag: 'true' },
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Parameter flag must be a boolean');
    });

    it('should validate parameter types - array', async () => {
      const tool: ToolDefinition = {
        name: 'array-tool',
        description: 'Tool requiring array',
        adapter: 'test-adapter',
        parameters: [
          { name: 'items', type: 'array', required: true, description: 'Items' }
        ]
      };

      engine.registerTool(tool);

      const result = await engine.executeTool(
        'array-tool',
        { items: 'not-an-array' },
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Parameter items must be an array');
    });

    it('should validate parameter types - object', async () => {
      const tool: ToolDefinition = {
        name: 'object-tool',
        description: 'Tool requiring object',
        adapter: 'test-adapter',
        parameters: [
          { name: 'config', type: 'object', required: true, description: 'Config' }
        ]
      };

      engine.registerTool(tool);

      const result = await engine.executeTool(
        'object-tool',
        { config: 'not-an-object' },
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Parameter config must be an object');
    });

    it('should handle optional parameters', async () => {
      const tool: ToolDefinition = {
        name: 'optional-tool',
        description: 'Tool with optional params',
        adapter: 'test-adapter',
        parameters: [
          { name: 'required', type: 'string', required: true, description: 'Required' },
          { name: 'optional', type: 'string', required: false, description: 'Optional' }
        ]
      };

      engine.registerTool(tool);
      mockAdapter.setResponse('optional-tool', { success: true });

      const result = await engine.executeTool(
        'optional-tool',
        { required: 'value' },
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(true);
    });

    it('should handle tool execution errors', async () => {
      const tool: ToolDefinition = {
        name: 'error-tool',
        description: 'Tool that throws error',
        adapter: 'test-adapter',
        parameters: []
      };

      engine.registerTool(tool);
      mockAdapter.setResponse('error-tool', new Error('Tool execution failed'));

      const result = await engine.executeTool(
        'error-tool',
        {},
        'member-1',
        'req-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool execution failed');
    });

    it('should log tool usage to database', async () => {
      const tool: ToolDefinition = {
        name: 'logged-tool',
        description: 'Tool with logging',
        adapter: 'test-adapter',
        parameters: []
      };

      engine.registerTool(tool);
      mockAdapter.setResponse('logged-tool', { data: 'result' });

      await engine.executeTool('logged-tool', {}, 'member-1', 'req-1');

      const usage = mockPool.getToolUsage();
      expect(usage.length).toBe(1);
      expect(usage[0].tool_name).toBe('logged-tool');
      expect(usage[0].council_member_id).toBe('member-1');
      expect(usage[0].request_id).toBe('req-1');
    });
  });

  describe('executeParallel', () => {
    beforeEach(() => {
      engine.registerAdapter(mockAdapter);
    });

    it('should execute multiple tools in parallel', async () => {
      const tool1: ToolDefinition = {
        name: 'tool-1',
        description: 'Tool 1',
        adapter: 'test-adapter',
        parameters: []
      };

      const tool2: ToolDefinition = {
        name: 'tool-2',
        description: 'Tool 2',
        adapter: 'test-adapter',
        parameters: []
      };

      engine.registerTool(tool1);
      engine.registerTool(tool2);

      mockAdapter.setResponse('tool-1', { result: 'one' });
      mockAdapter.setResponse('tool-2', { result: 'two' });

      const results = await engine.executeParallel([
        { toolName: 'tool-1', parameters: {}, councilMemberId: 'member-1', requestId: 'req-1' },
        { toolName: 'tool-2', parameters: {}, councilMemberId: 'member-1', requestId: 'req-1' }
      ]);

      expect(results.length).toBe(2);
      expect(results[0].toolName).toBe('tool-1');
      expect(results[1].toolName).toBe('tool-2');
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle mixed success and failure', async () => {
      const tool1: ToolDefinition = {
        name: 'success-tool',
        description: 'Success tool',
        adapter: 'test-adapter',
        parameters: []
      };

      const tool2: ToolDefinition = {
        name: 'failure-tool',
        description: 'Failure tool',
        adapter: 'test-adapter',
        parameters: []
      };

      engine.registerTool(tool1);
      engine.registerTool(tool2);

      mockAdapter.setResponse('success-tool', { result: 'success' });
      mockAdapter.setResponse('failure-tool', new Error('Failed'));

      const results = await engine.executeParallel([
        { toolName: 'success-tool', parameters: {}, councilMemberId: 'member-1', requestId: 'req-1' },
        { toolName: 'failure-tool', parameters: {}, councilMemberId: 'member-1', requestId: 'req-1' }
      ]);

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Failed');
    });
  });

  describe('getToolUsageForRequest', () => {
    it('should retrieve tool usage for a specific request', async () => {
      mockPool.getToolUsage().push({
        request_id: 'req-1',
        council_member_id: 'member-1',
        round_number: 1,
        tool_name: 'test-tool',
        parameters: { param: 'value' },
        result: { success: true },
        success: true,
        latency_ms: 100,
        created_at: new Date()
      });

      const usage = await engine.getToolUsageForRequest('req-1');

      expect(usage.length).toBe(1);
      expect(usage[0].toolName).toBe('test-tool');
      expect(usage[0].councilMemberId).toBe('member-1');
    });

    it('should return empty array when no usage found', async () => {
      const usage = await engine.getToolUsageForRequest('non-existent-req');

      expect(usage).toEqual([]);
    });
  });

  describe('getAvailableTools', () => {
    beforeEach(() => {
      engine.registerAdapter(mockAdapter);
    });

    it('should return all registered tools', () => {
      const tool1: ToolDefinition = {
        name: 'tool-1',
        description: 'Tool 1',
        adapter: 'test-adapter',
        parameters: []
      };

      const tool2: ToolDefinition = {
        name: 'tool-2',
        description: 'Tool 2',
        adapter: 'test-adapter',
        parameters: []
      };

      engine.registerTool(tool1);
      engine.registerTool(tool2);

      const available = engine.getAvailableTools();

      expect(available.length).toBe(2);
      expect(available).toContainEqual(tool1);
      expect(available).toContainEqual(tool2);
    });

    it('should return empty array when no tools registered', () => {
      const available = engine.getAvailableTools();

      expect(available).toEqual([]);
    });
  });
});
