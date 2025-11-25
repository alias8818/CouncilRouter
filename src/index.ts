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
export * from './interfaces/IModelDiscoveryService';
export * from './interfaces/IPricingScraper';
export * from './interfaces/IModelEnrichmentEngine';
export * from './interfaces/IModelRegistry';
export * from './interfaces/ISyncScheduler';

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

// Export model discovery service
export { ModelDiscoveryService } from './discovery/service';
export { BaseModelFetcher } from './discovery/base-fetcher';
export { OpenAIModelFetcher } from './discovery/openai-fetcher';
export { AnthropicModelFetcher } from './discovery/anthropic-fetcher';
export { GoogleModelFetcher } from './discovery/google-fetcher';
export { XAIModelFetcher } from './discovery/xai-fetcher';
export type { FetcherConfig } from './discovery/base-fetcher';

// Export model enrichment engine
export { ModelEnrichmentEngine } from './discovery/enrichment-engine';

// Export model registry
export { ModelRegistry } from './discovery/registry';

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

// Export admin server
export { AdminServer } from './dashboard/admin-server';
