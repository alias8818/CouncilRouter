import { DiscoveredModel, ProviderType } from '../types/core';

/**
 * Model Discovery Service Interface
 * Fetches available models from provider APIs
 */
export interface IModelDiscoveryService {
    /**
     * Fetch models from a specific provider's API
     */
    fetchModels(provider: ProviderType): Promise<DiscoveredModel[]>;

    /**
     * Fetch models from all configured providers
     */
    fetchAllModels(): Promise<Map<ProviderType, DiscoveredModel[]>>;

    /**
     * Get the last successful sync timestamp for a provider
     */
    getLastSync(provider: ProviderType): Promise<Date | null>;
}
