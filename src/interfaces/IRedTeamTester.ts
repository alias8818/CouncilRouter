/**
 * Interface for Red Team Testing System
 * Handles security testing of council members against prompt injection and jailbreak attempts
 */

import { RedTeamPrompt, RedTeamTestResult, RedTeamAnalytics } from '../types/core';

export interface IRedTeamTester {
  /**
   * Store a red-team prompt securely
   */
  storePrompt(prompt: RedTeamPrompt): Promise<void>;

  /**
   * Retrieve all red-team prompts
   */
  getPrompts(): Promise<RedTeamPrompt[]>;

  /**
   * Execute red-team tests against all council members
   */
  executeTests(): Promise<RedTeamTestResult[]>;

  /**
   * Record the result of a red-team test
   */
  recordResult(result: RedTeamTestResult): Promise<void>;

  /**
   * Get resistance rates per council member and attack category
   */
  getResistanceRates(): Promise<RedTeamAnalytics>;

  /**
   * Get security warnings for council members that consistently fail tests
   */
  getSecurityWarnings(): Promise<Map<string, string>>;
}
