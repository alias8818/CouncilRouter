/**
 * AI Council Proxy - Main Entry Point
 */

// Export core types
export * from './types/core';

// Export interfaces
export * from './interfaces/IOrchestrationEngine';
export * from './interfaces/IProviderPool';
export * from './interfaces/ISynthesisEngine';
export * from './interfaces/ISessionManager';
export * from './interfaces/IConfigurationManager';
export * from './interfaces/IEventLogger';
export * from './interfaces/IDashboard';
export * from './interfaces/ICostCalculator';
export * from './interfaces/IAPIGateway';
export * from './interfaces/IAnalyticsEngine';
export * from './interfaces/IRedTeamTester';

// Export implementations (placeholders for now)
export { OrchestrationEngine } from './orchestration/engine';
export { ProviderPool } from './providers/pool';
export { SynthesisEngine } from './synthesis/engine';
export { SessionManager } from './session/manager';
export { ConfigurationManager } from './config/manager';
export { EventLogger } from './logging/logger';
export { Dashboard } from './dashboard/dashboard';
export { AnalyticsEngine } from './analytics/engine';
export { APIGateway } from './api/gateway';
export { RedTeamTester } from './redteam/tester';

// Export provider adapters
export { BaseProviderAdapter } from './providers/adapters/base';
export { OpenAIAdapter } from './providers/adapters/openai';
export { AnthropicAdapter } from './providers/adapters/anthropic';
export { GoogleAdapter } from './providers/adapters/google';
export { GrokAdapter } from './providers/adapters/grok';

// Export cost calculator
export { CostCalculator } from './cost/calculator';
export type {
  PricingConfig,
  CostCalculation,
  AggregatedCost,
  CostAlert
} from './cost/calculator';

// Export user interface
export { UserInterface } from './ui/interface';
