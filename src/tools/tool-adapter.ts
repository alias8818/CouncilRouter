/**
 * Tool Adapter Interface
 * Adapters execute actual tool calls
 */

export interface IToolAdapter {
  /**
   * Adapter name/type
   */
  name: string;

  /**
   * Execute a tool with given parameters
   */
  execute(
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any>;
}

/**
 * Example HTTP Tool Adapter
 * Makes HTTP requests to external APIs
 */
export class HTTPToolAdapter implements IToolAdapter {
  name = 'http';

  async execute(toolName: string, parameters: Record<string, any>): Promise<any> {
    // Implement HTTP request logic
    // This is a stub - in production, would make actual HTTP calls
    return {
      status: 'success',
      data: `HTTP call to ${toolName} with parameters: ${JSON.stringify(parameters)}`
    };
  }
}

/**
 * Example Function Tool Adapter
 * Executes predefined functions
 */
export class FunctionToolAdapter implements IToolAdapter {
  name = 'function';

  private functions: Map<string, (params: any) => Promise<any>> = new Map();

  registerFunction(name: string, fn: (params: any) => Promise<any>): void {
    this.functions.set(name, fn);
  }

  async execute(toolName: string, parameters: Record<string, any>): Promise<any> {
    const fn = this.functions.get(toolName);
    if (!fn) {
      throw new Error(`Function ${toolName} not found`);
    }
    return fn(parameters);
  }
}
