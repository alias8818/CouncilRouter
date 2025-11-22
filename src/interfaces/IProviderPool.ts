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
   * Mark a provider as disabled due to failures
   */
  markProviderDisabled(
    providerId: string,
    reason: string
  ): void;
}
