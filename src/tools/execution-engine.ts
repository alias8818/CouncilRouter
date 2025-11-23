/**
 * Tool Execution Engine
 * Manages tool registration and execution
 */

import { Pool } from 'pg';
import { IToolExecutionEngine } from '../interfaces/IToolExecutionEngine';
import {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolUsage
} from '../types/core';
import { IToolAdapter } from './tool-adapter';

/**
 * ToolExecutionEngine implementation
 */
export class ToolExecutionEngine implements IToolExecutionEngine {
  private tools: Map<string, ToolDefinition> = new Map();
  private adapters: Map<string, IToolAdapter> = new Map();
  private toolUsageByRequest: Map<string, ToolUsage[]> = new Map();
  private dbPool: Pool;
  private readonly DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

  constructor(dbPool: Pool) {
    this.dbPool = dbPool;
  }

  /**
   * Register a tool adapter
   */
  registerAdapter(adapter: IToolAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Register a tool with the engine
   */
  registerTool(tool: ToolDefinition): void {
    // Validate tool definition
    if (!tool.name || tool.name.trim().length === 0) {
      throw new Error('Tool name is required');
    }

    if (!tool.adapter || !this.adapters.has(tool.adapter)) {
      throw new Error(`Adapter ${tool.adapter} not found. Register adapter first.`);
    }

    // Validate parameters
    for (const param of tool.parameters) {
      if (!param.name || param.name.trim().length === 0) {
        throw new Error('Parameter name is required');
      }
    }

    this.tools.set(tool.name, tool);
  }

  /**
   * Get all available tool definitions
   */
  getAvailableTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a single tool
   */
  async executeTool(
    toolName: string,
    parameters: Record<string, any>,
    councilMemberId: string,
    requestId: string
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Get tool definition
      const tool = this.tools.get(toolName);
      if (!tool) {
        throw new Error(`Tool ${toolName} not found`);
      }

      // Validate parameters
      this.validateParameters(tool, parameters);

      // Get adapter
      const adapter = this.adapters.get(tool.adapter);
      if (!adapter) {
        throw new Error(`Adapter ${tool.adapter} not found`);
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(
        adapter.execute(toolName, parameters),
        this.DEFAULT_TIMEOUT_MS
      );

      const latency = Date.now() - startTime;

      const toolResult: ToolResult = {
        toolName,
        councilMemberId,
        success: true,
        result,
        latency,
        timestamp: new Date()
      };

      // Log to database
      await this.logToolUsage(requestId, councilMemberId, toolName, parameters, toolResult);

      return toolResult;
    } catch (error) {
      const latency = Date.now() - startTime;

      const toolResult: ToolResult = {
        toolName,
        councilMemberId,
        success: false,
        error: (error as Error).message,
        latency,
        timestamp: new Date()
      };

      // Log failed execution
      await this.logToolUsage(requestId, councilMemberId, toolName, parameters, toolResult);

      return toolResult;
    }
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeParallel(
    toolCalls: ToolCall[]
  ): Promise<ToolResult[]> {
    const promises = toolCalls.map(call =>
      this.executeTool(
        call.toolName,
        call.parameters,
        call.councilMemberId,
        call.requestId
      )
    );

    return await Promise.all(promises);
  }

  /**
   * Get tool usage for a specific request
   */
  async getToolUsageForRequest(
    requestId: string
  ): Promise<ToolUsage[]> {
    try {
      const result = await this.dbPool.query(
        `SELECT
          council_member_id,
          round_number,
          tool_name,
          parameters,
          result,
          success,
          latency_ms,
          created_at
        FROM tool_usage
        WHERE request_id = $1
        ORDER BY created_at ASC`,
        [requestId]
      );

      return result.rows.map(row => ({
        councilMemberId: row.council_member_id,
        toolName: row.tool_name,
        parameters: row.parameters,
        result: {
          toolName: row.tool_name,
          councilMemberId: row.council_member_id,
          success: row.success,
          result: row.result,
          error: row.result?.error,
          latency: row.latency_ms,
          timestamp: new Date(row.created_at)
        },
        roundNumber: row.round_number
      }));
    } catch (error) {
      console.error('Error fetching tool usage:', error);
      return [];
    }
  }

  /**
   * Validate tool parameters
   */
  private validateParameters(
    tool: ToolDefinition,
    parameters: Record<string, any>
  ): void {
    for (const param of tool.parameters) {
      if (param.required && !(param.name in parameters)) {
        throw new Error(`Required parameter ${param.name} is missing`);
      }

      if (param.name in parameters) {
        const value = parameters[param.name];
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        // Basic type checking
        if (param.type === 'number' && actualType !== 'number') {
          throw new Error(`Parameter ${param.name} must be a number`);
        }
        if (param.type === 'string' && actualType !== 'string') {
          throw new Error(`Parameter ${param.name} must be a string`);
        }
        if (param.type === 'boolean' && actualType !== 'boolean') {
          throw new Error(`Parameter ${param.name} must be a boolean`);
        }
        if (param.type === 'array' && !Array.isArray(value)) {
          throw new Error(`Parameter ${param.name} must be an array`);
        }
        if (param.type === 'object' && actualType !== 'object') {
          throw new Error(`Parameter ${param.name} must be an object`);
        }
      }
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeout = new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs);
    });

    return Promise.race([promise, timeout]);
  }

  /**
   * Log tool usage to database
   */
  private async logToolUsage(
    requestId: string,
    councilMemberId: string,
    toolName: string,
    parameters: Record<string, any>,
    result: ToolResult
  ): Promise<void> {
    try {
      await this.dbPool.query(
        `INSERT INTO tool_usage (
          id,
          request_id,
          council_member_id,
          round_number,
          tool_name,
          parameters,
          result,
          success,
          latency_ms,
          created_at
        ) VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
        )`,
        [
          requestId,
          councilMemberId,
          0, // round number - will be updated by orchestration
          toolName,
          JSON.stringify(parameters),
          JSON.stringify(result),
          result.success,
          result.latency,
          result.timestamp
        ]
      );
    } catch (error) {
      console.error('Error logging tool usage:', error);
    }
  }
}
