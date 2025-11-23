/**
 * Jest setup file for global test configuration
 * 
 * This file runs before all tests and configures global settings for fast-check
 * and other test utilities.
 */

import * as fc from 'fast-check';
import { getPropertyTestRuns } from './test-helpers';

// Configure fast-check globally
// This sets default options that can be overridden per-test if needed
fc.configureGlobal({
  // Use environment variable for numRuns, defaulting to 100
  numRuns: getPropertyTestRuns(100),
  // Increase verbosity only in verbose mode
  verbose: process.env.JEST_VERBOSE === 'true' ? 2 : 0,
  // Set seed for reproducibility (can be overridden)
  seed: process.env.FAST_CHECK_SEED ? parseInt(process.env.FAST_CHECK_SEED, 10) : undefined,
});

