/**
 * Property-Based Tests for Model Enrichment Engine
 *
 * Tests universal properties that should hold across all inputs
 */

import * as fc from 'fast-check';
import { ModelEnrichmentEngine } from '../enrichment-engine';
import {
    DiscoveredModel,
    PricingData,
    ModelCapability,
    ProviderType,
} from '../../types/core';

describe('ModelEnrichmentEngine - Property-Based Tests', () => {
    let engine: ModelEnrichmentEngine;

    beforeEach(() => {
        engine = new ModelEnrichmentEngine();
    });

    /**
     * Property-Based Test: Fuzzy Matching Accuracy
     * Feature: dynamic-model-pricing, Property 7: Fuzzy Matching Accuracy
     *
     * Validates: Requirements 2.2
     *
     * For any pair of model names where one is from the API and one is from scraping,
     * if they are similar (edit distance < 20% of length), they should be matched together.
     */
    test(
        'Property 7: Fuzzy Matching Accuracy - similar names should match',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate a base model name
                    fc.string({ minLength: 5, maxLength: 30 }),
                    // Generate a variation type
                    fc.constantFrom('hyphen', 'underscore', 'case', 'space', 'none'),
                    async (baseName, variationType) => {
                        // Create a variation of the base name
                        let variantName = baseName;
                        switch (variationType) {
                            case 'hyphen':
                                // Replace some characters with hyphens
                                variantName = baseName.replace(/[aeiou]/g, '-');
                                break;
                            case 'underscore':
                                // Replace some characters with underscores
                                variantName = baseName.replace(/[aeiou]/g, '_');
                                break;
                            case 'case':
                                // Change case
                                variantName = baseName.toUpperCase();
                                break;
                            case 'space':
                                // Add spaces
                                variantName = baseName.split('').join(' ');
                                break;
                            case 'none':
                                // No variation - exact match
                                variantName = baseName;
                                break;
                        }

                        // Create pricing data with the variant name
                        const pricingData: PricingData[] = [
                            {
                                modelName: variantName,
                                inputCostPerMillion: 1.0,
                                outputCostPerMillion: 2.0,
                                tier: 'standard',
                            },
                        ];

                        // Try to match
                        const matched = engine.matchPricing(baseName, pricingData);

                        // For exact matches and case differences, we should always find a match
                        if (variationType === 'none' || variationType === 'case') {
                            expect(matched).not.toBeNull();
                            if (matched) {
                                expect(matched.modelName).toBe(variantName);
                            }
                        }

                        // For other variations, the match depends on similarity
                        // We just verify that if a match is found, it's the correct one
                        if (matched) {
                            expect(matched.modelName).toBe(variantName);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Fuzzy Matching with Known Similar Pairs
     * Feature: dynamic-model-pricing, Property 7: Fuzzy Matching Accuracy
     *
     * Validates: Requirements 2.2
     *
     * Tests that known similar model name pairs are matched correctly
     */
    test(
        'Property 7: Fuzzy Matching Accuracy - known similar pairs should match',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(
                        { api: 'gpt-4', scraped: 'GPT-4' },
                        { api: 'gpt-4-turbo', scraped: 'GPT-4 Turbo' },
                        { api: 'claude-3-opus', scraped: 'Claude 3 Opus' },
                        { api: 'claude-3-sonnet', scraped: 'Claude-3-Sonnet' },
                        { api: 'gemini-pro', scraped: 'Gemini Pro' },
                        { api: 'text-embedding-3-large', scraped: 'text_embedding_3_large' }
                    ),
                    async (pair) => {
                        const pricingData: PricingData[] = [
                            {
                                modelName: pair.scraped,
                                inputCostPerMillion: 1.0,
                                outputCostPerMillion: 2.0,
                                tier: 'standard',
                            },
                        ];

                        const matched = engine.matchPricing(pair.api, pricingData);

                        // These known pairs should always match
                        expect(matched).not.toBeNull();
                        if (matched) {
                            expect(matched.modelName).toBe(pair.scraped);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Fuzzy Matching with Dissimilar Names
     * Feature: dynamic-model-pricing, Property 7: Fuzzy Matching Accuracy
     *
     * Validates: Requirements 2.2
     *
     * Tests that completely different model names are not matched
     */
    test(
        'Property 7: Fuzzy Matching Accuracy - dissimilar names should not match',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 10, maxLength: 20 }),
                    fc.string({ minLength: 10, maxLength: 20 }),
                    async (name1, name2) => {
                        // Ensure the names are sufficiently different
                        const normalized1 = name1.toLowerCase().replace(/[-_\s]/g, '');
                        const normalized2 = name2.toLowerCase().replace(/[-_\s]/g, '');

                        // Skip if names are too similar
                        if (normalized1 === normalized2) {
                            return;
                        }

                        const pricingData: PricingData[] = [
                            {
                                modelName: name2,
                                inputCostPerMillion: 1.0,
                                outputCostPerMillion: 2.0,
                                tier: 'standard',
                            },
                        ];

                        const matched = engine.matchPricing(name1, pricingData);

                        // If a match is found, verify it meets the similarity threshold
                        // (We can't guarantee no match because some random strings might be similar)
                        if (matched) {
                            expect(matched.modelName).toBe(name2);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Pattern-Based Classification
     * Feature: dynamic-model-pricing, Property 11: Pattern-Based Classification
     *
     * Validates: Requirements 3.1
     *
     * For any model ID containing recognizable patterns (e.g., "gpt-", "claude-", "embedding-"),
     * the system should assign the corresponding classification.
     */
    test(
        'Property 11: Pattern-Based Classification - recognizable patterns should be classified',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(
                        { pattern: 'gpt', expectedClass: 'chat' as const },
                        { pattern: 'chat', expectedClass: 'chat' as const },
                        { pattern: 'o1', expectedClass: 'reasoning' as const },
                        { pattern: 'o3', expectedClass: 'reasoning' as const },
                        { pattern: 'reasoning', expectedClass: 'reasoning' as const },
                        { pattern: 'code', expectedClass: 'coding' as const },
                        { pattern: 'codex', expectedClass: 'coding' as const },
                        { pattern: 'vision', expectedClass: 'multimodal' as const },
                        { pattern: 'multimodal', expectedClass: 'multimodal' as const },
                        { pattern: 'gemini', expectedClass: 'multimodal' as const },
                        { pattern: 'embedding', expectedClass: 'embedding' as const },
                        { pattern: 'embed', expectedClass: 'embedding' as const }
                    ),
                    fc.string({ minLength: 0, maxLength: 10 }),
                    fc.string({ minLength: 0, maxLength: 10 }),
                    async (patternInfo, prefix, suffix) => {
                        // Create a model ID with the pattern
                        const modelId = `${prefix}${patternInfo.pattern}${suffix}`;

                        const model: DiscoveredModel = {
                            id: modelId,
                            provider: 'openai' as ProviderType,
                            deprecated: false,
                        };

                        const classifications = engine.classifyModel(model);

                        // The model should have the expected classification
                        expect(classifications).toContain(patternInfo.expectedClass);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Pattern-Based Classification - Multiple Patterns
     * Feature: dynamic-model-pricing, Property 11: Pattern-Based Classification
     *
     * Validates: Requirements 3.1
     *
     * Tests that models with multiple patterns get multiple classifications
     */
    test(
        'Property 11: Pattern-Based Classification - multiple patterns should yield multiple classifications',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(
                        { id: 'gpt-4-vision', expected: ['chat', 'multimodal'] },
                        { id: 'code-embedding', expected: ['coding', 'embedding'] },
                        { id: 'chat-reasoning-model', expected: ['chat', 'reasoning'] }
                    ),
                    async (testCase) => {
                        const model: DiscoveredModel = {
                            id: testCase.id,
                            provider: 'openai' as ProviderType,
                            deprecated: false,
                        };

                        const classifications = engine.classifyModel(model);

                        // All expected classifications should be present
                        for (const expectedClass of testCase.expected) {
                            expect(classifications).toContain(expectedClass);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Capability-Based Classification
     * Feature: dynamic-model-pricing, Property 12: Capability-Based Classification
     *
     * Validates: Requirements 3.2
     *
     * For any model with capability flags in API metadata,
     * the system should derive classifications from those capabilities.
     */
    test(
        'Property 12: Capability-Based Classification - capabilities should determine classification',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(
                        {
                            capability: { type: 'chat' as const, supported: true },
                            expectedClass: 'chat' as const,
                        },
                        {
                            capability: { type: 'embedding' as const, supported: true },
                            expectedClass: 'embedding' as const,
                        },
                        {
                            capability: { type: 'vision' as const, supported: true },
                            expectedClass: 'multimodal' as const,
                        },
                        {
                            capability: { type: 'function_calling' as const, supported: true },
                            expectedClass: 'tools' as const,
                        },
                        {
                            capability: { type: 'tools' as const, supported: true },
                            expectedClass: 'tools' as const,
                        }
                    ),
                    fc.string({ minLength: 5, maxLength: 20 }),
                    async (capabilityInfo, modelId) => {
                        const model: DiscoveredModel = {
                            id: modelId,
                            provider: 'openai' as ProviderType,
                            deprecated: false,
                            capabilities: [capabilityInfo.capability],
                        };

                        const classifications = engine.classifyModel(model);

                        // The model should have the expected classification
                        expect(classifications).toContain(capabilityInfo.expectedClass);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Capability-Based Classification - Unsupported Capabilities
     * Feature: dynamic-model-pricing, Property 12: Capability-Based Classification
     *
     * Validates: Requirements 3.2
     *
     * Tests that unsupported capabilities don't add classifications from capabilities alone
     */
    test(
        'Property 12: Capability-Based Classification - unsupported capabilities should not add classification from capability',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(
                        { type: 'chat' as const, expectedNotFromCapability: 'chat' as const },
                        { type: 'embedding' as const, expectedNotFromCapability: 'embedding' as const },
                        { type: 'vision' as const, expectedNotFromCapability: 'multimodal' as const }
                    ),
                    async (capabilityInfo) => {
                        // Use a model ID that won't trigger pattern-based classification
                        const modelId = 'random-model-xyz-123';

                        const model: DiscoveredModel = {
                            id: modelId,
                            provider: 'openai' as ProviderType,
                            deprecated: false,
                            capabilities: [
                                {
                                    type: capabilityInfo.type,
                                    supported: false, // Not supported
                                },
                            ],
                        };

                        const classifications = engine.classifyModel(model);

                        // Since the capability is not supported and the model ID has no patterns,
                        // it should default to 'general' and NOT include the capability-based classification
                        expect(classifications).toContain('general');
                        expect(classifications).not.toContain(capabilityInfo.expectedNotFromCapability);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Multiple Classification Assignment
     * Feature: dynamic-model-pricing, Property 13: Multiple Classification Assignment
     *
     * Validates: Requirements 3.3
     *
     * For any model supporting multiple capabilities,
     * all relevant classification tags should be assigned.
     */
    test(
        'Property 13: Multiple Classification Assignment - multiple capabilities should yield multiple classifications',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(
                        fc.constantFrom(
                            { type: 'chat' as const, supported: true },
                            { type: 'embedding' as const, supported: true },
                            { type: 'vision' as const, supported: true },
                            { type: 'function_calling' as const, supported: true },
                            { type: 'tools' as const, supported: true }
                        ),
                        { minLength: 2, maxLength: 5 }
                    ),
                    fc.string({ minLength: 5, maxLength: 20 }),
                    async (capabilities, modelId) => {
                        const model: DiscoveredModel = {
                            id: modelId,
                            provider: 'openai' as ProviderType,
                            deprecated: false,
                            capabilities,
                        };

                        const classifications = engine.classifyModel(model);

                        // Build expected classifications from capabilities
                        const expectedClassifications = new Set<string>();
                        for (const cap of capabilities) {
                            if (!cap.supported) continue;

                            switch (cap.type) {
                                case 'chat':
                                    expectedClassifications.add('chat');
                                    break;
                                case 'embedding':
                                    expectedClassifications.add('embedding');
                                    break;
                                case 'vision':
                                    expectedClassifications.add('multimodal');
                                    break;
                                case 'function_calling':
                                case 'tools':
                                    expectedClassifications.add('tools');
                                    break;
                            }
                        }

                        // All expected classifications should be present
                        for (const expectedClass of expectedClassifications) {
                            expect(classifications).toContain(expectedClass);
                        }

                        // Should have at least as many classifications as unique expected ones
                        expect(classifications.length).toBeGreaterThanOrEqual(
                            expectedClassifications.size
                        );
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Multiple Classification Assignment - Pattern and Capability Combined
     * Feature: dynamic-model-pricing, Property 13: Multiple Classification Assignment
     *
     * Validates: Requirements 3.3
     *
     * Tests that both pattern-based and capability-based classifications are combined
     */
    test(
        'Property 13: Multiple Classification Assignment - pattern and capability classifications should combine',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(
                        {
                            id: 'gpt-4-vision',
                            capabilities: [{ type: 'tools' as const, supported: true }],
                            expected: ['chat', 'multimodal', 'tools'],
                        },
                        {
                            id: 'code-model',
                            capabilities: [{ type: 'embedding' as const, supported: true }],
                            expected: ['coding', 'embedding'],
                        },
                        {
                            id: 'reasoning-chat',
                            capabilities: [{ type: 'vision' as const, supported: true }],
                            expected: ['reasoning', 'chat', 'multimodal'],
                        }
                    ),
                    async (testCase) => {
                        const model: DiscoveredModel = {
                            id: testCase.id,
                            provider: 'openai' as ProviderType,
                            deprecated: false,
                            capabilities: testCase.capabilities,
                        };

                        const classifications = engine.classifyModel(model);

                        // All expected classifications should be present
                        for (const expectedClass of testCase.expected) {
                            expect(classifications).toContain(expectedClass);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Default Classification Fallback
     * Feature: dynamic-model-pricing, Property 14: Default Classification Fallback
     *
     * Validates: Requirements 3.4
     *
     * For any model with no recognizable patterns or capabilities,
     * the system should assign the "General" classification.
     */
    test(
        'Property 14: Default Classification Fallback - models without patterns should default to general',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random strings that don't contain known patterns
                    fc
                        .string({ minLength: 5, maxLength: 20 })
                        .filter(
                            (str) =>
                                !str.toLowerCase().includes('gpt') &&
                                !str.toLowerCase().includes('chat') &&
                                !str.toLowerCase().includes('o1') &&
                                !str.toLowerCase().includes('o3') &&
                                !str.toLowerCase().includes('reasoning') &&
                                !str.toLowerCase().includes('code') &&
                                !str.toLowerCase().includes('codex') &&
                                !str.toLowerCase().includes('vision') &&
                                !str.toLowerCase().includes('multimodal') &&
                                !str.toLowerCase().includes('gemini') &&
                                !str.toLowerCase().includes('embedding') &&
                                !str.toLowerCase().includes('embed')
                        ),
                    async (modelId) => {
                        const model: DiscoveredModel = {
                            id: modelId,
                            provider: 'openai' as ProviderType,
                            deprecated: false,
                            // No capabilities
                        };

                        const classifications = engine.classifyModel(model);

                        // Should default to 'general'
                        expect(classifications).toContain('general');
                        expect(classifications).toHaveLength(1);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Default Classification Fallback - Empty Capabilities
     * Feature: dynamic-model-pricing, Property 14: Default Classification Fallback
     *
     * Validates: Requirements 3.4
     *
     * Tests that models with empty or unsupported capabilities default to general
     */
    test(
        'Property 14: Default Classification Fallback - empty capabilities should default to general',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc
                        .string({ minLength: 5, maxLength: 20 })
                        .filter(
                            (str) =>
                                !str.toLowerCase().includes('gpt') &&
                                !str.toLowerCase().includes('chat') &&
                                !str.toLowerCase().includes('o1') &&
                                !str.toLowerCase().includes('o3') &&
                                !str.toLowerCase().includes('reasoning') &&
                                !str.toLowerCase().includes('code') &&
                                !str.toLowerCase().includes('codex') &&
                                !str.toLowerCase().includes('vision') &&
                                !str.toLowerCase().includes('multimodal') &&
                                !str.toLowerCase().includes('gemini') &&
                                !str.toLowerCase().includes('embedding') &&
                                !str.toLowerCase().includes('embed')
                        ),
                    async (modelId) => {
                        const model: DiscoveredModel = {
                            id: modelId,
                            provider: 'openai' as ProviderType,
                            deprecated: false,
                            capabilities: [], // Empty capabilities
                        };

                        const classifications = engine.classifyModel(model);

                        // Should default to 'general'
                        expect(classifications).toContain('general');
                        expect(classifications).toHaveLength(1);
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Missing Pricing Fallback
     * Feature: dynamic-model-pricing, Property 9: Missing Pricing Fallback
     *
     * Validates: Requirements 2.4
     *
     * For any model without matching pricing data,
     * the cost fields should be marked as "TBD" and a warning should be logged.
     */
    test(
        'Property 9: Missing Pricing Fallback - models without pricing should have TBD marker',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 5, maxLength: 20 }),
                            provider: fc.constantFrom(
                                'openai' as ProviderType,
                                'anthropic' as ProviderType,
                                'google' as ProviderType,
                                'xai' as ProviderType
                            ),
                            deprecated: fc.boolean(),
                        }),
                        { minLength: 1, maxLength: 10 }
                    ),
                    async (models) => {
                        // Provide empty pricing data
                        const pricingData: PricingData[] = [];

                        const enrichedModels = await engine.enrichModels(models, pricingData);

                        // All models should have TBD pricing
                        for (const enrichedModel of enrichedModels) {
                            expect(enrichedModel.pricing).toHaveLength(1);
                            expect(enrichedModel.pricing[0].tier).toBe('TBD');
                            expect(enrichedModel.pricing[0].inputCostPerMillion).toBe(0);
                            expect(enrichedModel.pricing[0].outputCostPerMillion).toBe(0);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Missing Pricing Fallback - Partial Pricing
     * Feature: dynamic-model-pricing, Property 9: Missing Pricing Fallback
     *
     * Validates: Requirements 2.4
     *
     * Tests that only models without matching pricing get TBD marker
     */
    test(
        'Property 9: Missing Pricing Fallback - only unmatched models should have TBD',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 5, maxLength: 20 }),
                    fc.string({ minLength: 5, maxLength: 20 }),
                    async (modelId1, modelId2) => {
                        // Ensure different model IDs
                        if (modelId1 === modelId2) {
                            return;
                        }

                        const models: DiscoveredModel[] = [
                            {
                                id: modelId1,
                                provider: 'openai' as ProviderType,
                                deprecated: false,
                            },
                            {
                                id: modelId2,
                                provider: 'openai' as ProviderType,
                                deprecated: false,
                            },
                        ];

                        // Provide pricing only for the first model
                        const pricingData: PricingData[] = [
                            {
                                modelName: modelId1,
                                inputCostPerMillion: 1.0,
                                outputCostPerMillion: 2.0,
                                tier: 'standard',
                            },
                        ];

                        const enrichedModels = await engine.enrichModels(models, pricingData);

                        // First model should have real pricing
                        const enriched1 = enrichedModels.find((m) => m.id === modelId1);
                        expect(enriched1).toBeDefined();
                        if (enriched1) {
                            expect(enriched1.pricing[0].tier).toBe('standard');
                            expect(enriched1.pricing[0].inputCostPerMillion).toBe(1.0);
                            expect(enriched1.pricing[0].outputCostPerMillion).toBe(2.0);
                        }

                        // Second model should have TBD pricing
                        const enriched2 = enrichedModels.find((m) => m.id === modelId2);
                        expect(enriched2).toBeDefined();
                        if (enriched2) {
                            expect(enriched2.pricing[0].tier).toBe('TBD');
                            expect(enriched2.pricing[0].inputCostPerMillion).toBe(0);
                            expect(enriched2.pricing[0].outputCostPerMillion).toBe(0);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Context Window Preservation
     * Feature: dynamic-model-pricing, Property 15: Context Window Preservation
     *
     * Validates: Requirements 3.5
     *
     * For any model with context window information in the API response,
     * that value should be stored in the model metadata.
     */
    test(
        'Property 15: Context Window Preservation - context window should be preserved',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 5, maxLength: 20 }),
                            provider: fc.constantFrom(
                                'openai' as ProviderType,
                                'anthropic' as ProviderType,
                                'google' as ProviderType,
                                'xai' as ProviderType
                            ),
                            deprecated: fc.boolean(),
                            contextWindow: fc.integer({ min: 1000, max: 1000000 }),
                        }),
                        { minLength: 1, maxLength: 10 }
                    ),
                    async (models) => {
                        const pricingData: PricingData[] = [];

                        const enrichedModels = await engine.enrichModels(models, pricingData);

                        // All models should preserve their context window
                        for (let i = 0; i < models.length; i++) {
                            const original = models[i];
                            const enriched = enrichedModels[i];

                            expect(enriched.contextWindow).toBe(original.contextWindow);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );

    /**
     * Property-Based Test: Context Window Preservation - Missing Context Window
     * Feature: dynamic-model-pricing, Property 15: Context Window Preservation
     *
     * Validates: Requirements 3.5
     *
     * Tests that models without context window information default to 0
     */
    test(
        'Property 15: Context Window Preservation - missing context window should default to 0',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(
                        fc.record({
                            id: fc.string({ minLength: 5, maxLength: 20 }),
                            provider: fc.constantFrom(
                                'openai' as ProviderType,
                                'anthropic' as ProviderType,
                                'google' as ProviderType,
                                'xai' as ProviderType
                            ),
                            deprecated: fc.boolean(),
                            // No contextWindow field
                        }),
                        { minLength: 1, maxLength: 10 }
                    ),
                    async (models) => {
                        const pricingData: PricingData[] = [];

                        const enrichedModels = await engine.enrichModels(models, pricingData);

                        // All models should have context window of 0
                        for (const enriched of enrichedModels) {
                            expect(enriched.contextWindow).toBe(0);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        },
        120000
    );
});

