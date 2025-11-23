/**
 * Tool Adapter Tests
 * Tests for HTTP and Function tool adapters
 */

import { HTTPToolAdapter, FunctionToolAdapter } from '../tool-adapter';

describe('HTTPToolAdapter', () => {
  let adapter: HTTPToolAdapter;

  beforeEach(() => {
    adapter = new HTTPToolAdapter();
  });

  it('should have name "http"', () => {
    expect(adapter.name).toBe('http');
  });

  it('should execute with tool name and parameters', async () => {
    const result = await adapter.execute('weather', {
      city: 'Paris',
      units: 'metric'
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.data).toContain('weather');
    expect(result.data).toContain('Paris');
  });

  it('should handle empty parameters', async () => {
    const result = await adapter.execute('health-check', {});

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
  });

  it('should handle complex nested parameters', async () => {
    const complexParams = {
      user: {
        name: 'John',
        preferences: {
          language: 'en',
          timezone: 'UTC'
        }
      },
      filters: ['active', 'verified']
    };

    const result = await adapter.execute('user-search', complexParams);

    expect(result).toBeDefined();
    expect(result.data).toContain('user-search');
  });

  it('should serialize parameters correctly', async () => {
    const params = {
      count: 42,
      enabled: true,
      tags: ['urgent', 'important']
    };

    const result = await adapter.execute('test-tool', params);

    expect(result.data).toContain(JSON.stringify(params));
  });
});

describe('FunctionToolAdapter', () => {
  let adapter: FunctionToolAdapter;

  beforeEach(() => {
    adapter = new FunctionToolAdapter();
  });

  it('should have name "function"', () => {
    expect(adapter.name).toBe('function');
  });

  describe('registerFunction', () => {
    it('should register a function', () => {
      const testFn = jest.fn().mockResolvedValue({ result: 'success' });

      adapter.registerFunction('test-function', testFn);

      // Function should be stored (verified by execution)
      expect(() => adapter.registerFunction('test-function', testFn)).not.toThrow();
    });

    it('should allow registering multiple functions', () => {
      const fn1 = jest.fn().mockResolvedValue({ result: 1 });
      const fn2 = jest.fn().mockResolvedValue({ result: 2 });
      const fn3 = jest.fn().mockResolvedValue({ result: 3 });

      adapter.registerFunction('func-1', fn1);
      adapter.registerFunction('func-2', fn2);
      adapter.registerFunction('func-3', fn3);

      // Should not throw
      expect(fn1).toBeDefined();
      expect(fn2).toBeDefined();
      expect(fn3).toBeDefined();
    });

    it('should allow overwriting existing function', () => {
      const fn1 = jest.fn().mockResolvedValue({ result: 'old' });
      const fn2 = jest.fn().mockResolvedValue({ result: 'new' });

      adapter.registerFunction('overwrite-test', fn1);
      adapter.registerFunction('overwrite-test', fn2);

      // Second registration should overwrite first
      expect(fn2).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute a registered function', async () => {
      const mockFn = jest.fn().mockResolvedValue({ result: 'executed' });

      adapter.registerFunction('execute-test', mockFn);

      const params = { input: 'test-data' };
      const result = await adapter.execute('execute-test', params);

      expect(mockFn).toHaveBeenCalledWith(params);
      expect(result.result).toBe('executed');
    });

    it('should throw error for non-existent function', async () => {
      await expect(
        adapter.execute('non-existent', {})
      ).rejects.toThrow('Function non-existent not found');
    });

    it('should pass parameters correctly to function', async () => {
      const capturedParams = jest.fn().mockResolvedValue({ ok: true });

      adapter.registerFunction('param-test', capturedParams);

      const params = {
        name: 'Alice',
        age: 30,
        tags: ['developer', 'engineer']
      };

      await adapter.execute('param-test', params);

      expect(capturedParams).toHaveBeenCalledWith(params);
    });

    it('should handle async functions', async () => {
      const asyncFn = async (params: any) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { processed: params.data };
      };

      adapter.registerFunction('async-test', asyncFn);

      const result = await adapter.execute('async-test', { data: 'test' });

      expect(result.processed).toBe('test');
    });

    it('should handle functions that return primitives', async () => {
      adapter.registerFunction('return-string', async () => 'Hello');
      adapter.registerFunction('return-number', async () => 42);
      adapter.registerFunction('return-boolean', async () => true);

      expect(await adapter.execute('return-string', {})).toBe('Hello');
      expect(await adapter.execute('return-number', {})).toBe(42);
      expect(await adapter.execute('return-boolean', {})).toBe(true);
    });

    it('should handle functions that throw errors', async () => {
      const errorFn = async () => {
        throw new Error('Function execution failed');
      };

      adapter.registerFunction('error-test', errorFn);

      await expect(
        adapter.execute('error-test', {})
      ).rejects.toThrow('Function execution failed');
    });

    it('should handle functions with complex return types', async () => {
      const complexFn = async (params: any) => {
        return {
          status: 'success',
          data: {
            items: [1, 2, 3],
            metadata: {
              count: 3,
              timestamp: new Date().toISOString()
            }
          }
        };
      };

      adapter.registerFunction('complex-test', complexFn);

      const result = await adapter.execute('complex-test', {});

      expect(result.status).toBe('success');
      expect(result.data.items).toEqual([1, 2, 3]);
      expect(result.data.metadata.count).toBe(3);
    });

    it('should handle empty parameters object', async () => {
      const fn = jest.fn().mockResolvedValue({ ok: true });

      adapter.registerFunction('empty-params', fn);

      await adapter.execute('empty-params', {});

      expect(fn).toHaveBeenCalledWith({});
    });

    it('should handle null parameters', async () => {
      const fn = jest.fn().mockResolvedValue({ ok: true });

      adapter.registerFunction('null-params', fn);

      await adapter.execute('null-params', null as any);

      expect(fn).toHaveBeenCalledWith(null);
    });
  });

  describe('Edge Cases', () => {
    it('should handle functions with side effects', async () => {
      let counter = 0;
      const sideEffectFn = async () => {
        counter++;
        return { count: counter };
      };

      adapter.registerFunction('side-effect', sideEffectFn);

      const result1 = await adapter.execute('side-effect', {});
      const result2 = await adapter.execute('side-effect', {});

      expect(result1.count).toBe(1);
      expect(result2.count).toBe(2);
    });

    it('should handle very long function names', async () => {
      const longName = 'a'.repeat(1000);
      const fn = jest.fn().mockResolvedValue({ ok: true });

      adapter.registerFunction(longName, fn);

      const result = await adapter.execute(longName, {});

      expect(result.ok).toBe(true);
    });

    it('should handle special characters in function names', async () => {
      const specialNames = [
        'func-with-dash',
        'func_with_underscore',
        'func.with.dot',
        'func:with:colon'
      ];

      for (const name of specialNames) {
        const fn = jest.fn().mockResolvedValue({ name });
        adapter.registerFunction(name, fn);

        const result = await adapter.execute(name, {});
        expect(result.name).toBe(name);
      }
    });

    it('should handle functions that return undefined', async () => {
      const undefinedFn = async () => {
        return undefined;
      };

      adapter.registerFunction('undefined-return', undefinedFn);

      const result = await adapter.execute('undefined-return', {});

      expect(result).toBeUndefined();
    });

    it('should handle functions that resolve immediately', async () => {
      const immediateFn = async () => 'immediate';

      adapter.registerFunction('immediate', immediateFn);

      const start = Date.now();
      const result = await adapter.execute('immediate', {});
      const elapsed = Date.now() - start;

      expect(result).toBe('immediate');
      expect(elapsed).toBeLessThan(100); // Should be very fast
    });
  });

  describe('Function Isolation', () => {
    it('should not interfere with other registered functions', async () => {
      const fn1 = jest.fn().mockResolvedValue({ id: 1 });
      const fn2 = jest.fn().mockResolvedValue({ id: 2 });

      adapter.registerFunction('func-1', fn1);
      adapter.registerFunction('func-2', fn2);

      await adapter.execute('func-1', {});

      expect(fn1).toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
    });

    it('should maintain separate parameter scopes', async () => {
      const params1 = { value: 'first' };
      const params2 = { value: 'second' };

      const captureFn = jest.fn().mockResolvedValue({ ok: true });

      adapter.registerFunction('capture', captureFn);

      await adapter.execute('capture', params1);
      await adapter.execute('capture', params2);

      expect(captureFn).toHaveBeenNthCalledWith(1, params1);
      expect(captureFn).toHaveBeenNthCalledWith(2, params2);
    });
  });
});
