import { PricingData, ProviderType, ScrapingConfig } from '../types/core';

/**
 * Pricing Scraper Interface
 * Scrapes pricing information from provider websites
 */
export interface IPricingScraper {
    /**
     * Scrape pricing information from a provider's website
     */
    scrapePricing(provider: ProviderType): Promise<PricingData[]>;

    /**
     * Validate scraping configuration for a provider
     */
    validateConfig(provider: ProviderType, config: ScrapingConfig): Promise<boolean>;

    /**
     * Get cached pricing data when scraping fails
     */
    getFallbackPricing(provider: ProviderType): Promise<PricingData[]>;
}
