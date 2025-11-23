import {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolUsage
} from '../types/core';

/**
 * Tool Execution Engine Interface
 * Manages tool registration and execution for Council Members
 */
export interface IToolExecutionEngine {
  /**
   * Register a tool with the engine
   */
  registerTool(tool: ToolDefinition): void;

  /**
   * Get all available tool definitions
   */
  getAvailableTools(): ToolDefinition[];

  /**
   * Execute a single tool
   */
  executeTool(
    toolName: string,
    parameters: Record<string, any>,
    councilMemberId: string,
    requestId: string
  ): Promise<ToolResult>;

  /**
   * Execute multiple tools in parallel
   */
  executeParallel(
    toolCalls: ToolCall[]
  ): Promise<ToolResult[]>;

  /**
   * Get tool usage for a specific request
   */
  getToolUsageForRequest(
    requestId: string
  ): Promise<ToolUsage[]>;
}
