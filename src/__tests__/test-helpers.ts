/**
 * Test helper utilities for property-based testing
 * 
 * Provides utilities to configure test runs based on environment variables,
 * allowing faster local development while maintaining full coverage in CI.
 */

/**
 * Gets the number of property test runs from environment variable or uses default
 * 
 * Set PROPERTY_TEST_RUNS environment variable to override the default number of runs.
 * This allows developers to run fewer iterations locally (e.g., 20-50) for faster feedback,
 * while CI can run the full 100 iterations for comprehensive coverage.
 * 
 * @param defaultRuns - The default number of runs if environment variable is not set (default: 100)
 * @returns The number of runs to use for property tests
 * 
 * @example
 * ```typescript
 * await fc.assert(
 *   fc.asyncProperty(/* arbitraries *\/, async (/* args *\/) => {
 *     // test implementation
 *   }),
 *   { numRuns: getPropertyTestRuns() }
 * );
 * ```
 */
export function getPropertyTestRuns(defaultRuns: number = 100): number {
  const envRuns = process.env.PROPERTY_TEST_RUNS;
  if (envRuns) {
    const parsed = parseInt(envRuns, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return defaultRuns;
}

