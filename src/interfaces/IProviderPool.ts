import {
  CouncilMember,
  ProviderResponse,
  ProviderHealth,
  ConversationContext
} from '../types/core';

/**
 * Provider Pool Interface
 * Manages connections to AI provider APIs
 */
export interface IProviderPool {
  /**
   * Send a request to a specific council member's provider
   */
  sendRequest(
    member: CouncilMember,
    prompt: string,
    context?: ConversationContext
  ): Promise<ProviderResponse>;

  /**
   * Get health status of a provider
   */
  getProviderHealth(providerId: string): ProviderHealth;

  /**
   * Get health status for all configured providers
   * Useful for dashboards and monitoring components that need an overview
   * of every provider without issuing individual calls for each one.
   */
  getAllProviderHealth(): ProviderHealth[];

  /**
   * Get health status of all providers
   */
  getAllProviderHealth(): ProviderHealth[];

  /**
   * Mark a provider as disabled due to failures
   */
  markProviderDisabled(
    providerId: string,
    reason: string
  ): void;

  /**
   * Get the adapter for a specific provider
   * Used for direct access to adapter methods like streaming
   */
  getAdapter(providerId: string): any;
}
