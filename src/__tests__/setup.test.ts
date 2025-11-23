/**
 * Basic setup test to verify Jest and TypeScript configuration
 */

import * as fc from 'fast-check';
import { getPropertyTestRuns } from './test-helpers';

describe('Project Setup', () => {
  test('Jest is configured correctly', () => {
    expect(true).toBe(true);
  });

  test('TypeScript compilation works', () => {
    const testObject: { name: string; value: number } = {
      name: 'test',
      value: 42
    };
    expect(testObject.name).toBe('test');
    expect(testObject.value).toBe(42);
  });

  test('fast-check is available for property-based testing', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return n + 0 === n;
      }),
      { numRuns: getPropertyTestRuns() }
    );
  });
});
