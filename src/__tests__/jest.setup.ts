/**
 * Jest setup file for global test configuration
 * 
 * This file runs before all tests and configures global settings for fast-check
 * and other test utilities.
 */

import * as fc from 'fast-check';
import { getPropertyTestRuns } from './test-helpers';

// Suppress console output during tests to reduce spam
// Set JEST_VERBOSE=true to see all console output for debugging
const isVerbose = process.env.JEST_VERBOSE === 'true';

if (!isVerbose) {
  // Store original console methods
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;
  const originalConsoleDebug = console.debug;
  
  // Suppress routine logging (log, info, debug)
  // These are typically used for request logging, server startup messages, etc.
  console.log = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();
  
  // Suppress warnings and errors from application code during tests
  // These are often from error handling paths that are expected in tests
  // Jest will still show actual test failures and assertion errors
  console.error = jest.fn();
  console.warn = jest.fn();
  
  // Restore console methods after all tests
  afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;
    console.debug = originalConsoleDebug;
  });
}

// Configure fast-check globally
// This sets default options that can be overridden per-test if needed
fc.configureGlobal({
  // Use environment variable for numRuns, defaulting to 100
  numRuns: getPropertyTestRuns(100),
  // Increase verbosity only in verbose mode
  verbose: isVerbose ? 2 : 0,
  // Set seed for reproducibility (can be overridden)
  seed: process.env.FAST_CHECK_SEED ? parseInt(process.env.FAST_CHECK_SEED, 10) : undefined,
});

