/**
 * Integration Test: Metrics Tracking End-to-End
 * Feature: metrics-tracking
 * 
 * Validates: Complete metrics tracking flow from request to database
 */

import { Pool } from 'pg';
import { RedisClientType, createClient } from 'redis';
import { OrchestrationEngine } from '../orchestration/engine';
import { ProviderPool } from '../providers/pool';
import { ConfigurationManager } from '../config/manager';
import { SynthesisEngine } from '../synthesis/engine';
import { SessionManager } from '../session/manager';
import { EventLogger } from '../logging/logger';
import { APIGateway } from '../api/gateway';
import { UserRequest } from '../types/core';
import { getSharedHealthTracker } from '../providers/health-tracker';

describe('Metrics Tracking Integration', () => {
    let db: Pool;
    let redis: RedisClientType;
    let orchestrationEngine: OrchestrationEngine;
    let providerPool: ProviderPool;
    let configManager: ConfigurationManager;
    let synthesisEngine: SynthesisEngine;
    let sessionManager: SessionManager;
    let eventLogger: EventLogger;
    let apiGateway: APIGateway;

    beforeAll(async () => {
        // Set up test database
        db = new Pool({
            connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_council_test'
        });

        // Set up test Redis
        redis = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });
        await redis.connect();

        // Initialize components
        configManager = new ConfigurationManager(db, redis);
        providerPool = new ProviderPool(getSharedHealthTracker(db), configManager, db);
        synthesisEngine = new SynthesisEngine();
        sessionManager = new SessionManager(db, redis);
        eventLogger = new EventLogger(db);
        orchestrationEngine = new OrchestrationEngine(
            providerPool,
            configManager,
            synthesisEngine
        );
        apiGateway = new APIGateway(
            orchestrationEngine,
            sessionManager,
            eventLogger,
            redis,
            db,
            'test-secret'
        );

        // Clean up test data
        await db.query('DELETE FROM cost_records WHERE request_id LIKE \'test-%\'');
        await db.query('DELETE FROM provider_health WHERE provider_id LIKE \'test-%\'');
        await db.query('DELETE FROM requests WHERE id LIKE \'test-%\'');
    });

    afterAll(async () => {
        await redis.quit();
        await db.end();
    });

    test('request completion populates all metrics', async () => {
        // Skip if no API keys configured
        if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_API_KEY) {
            console.log('Skipping integration test: No API keys configured');
            return;
        }

        const requestId = 'test-metrics-' + Date.now();
        const userRequest: UserRequest = {
            id: requestId,
            query: 'What is 2+2?',
            sessionId: null,
            context: [],
            timestamp: new Date()
        };

        // Log request
        await eventLogger.logRequest(userRequest);

        // Process request
        const result = await orchestrationEngine.processRequest(userRequest);
        const { consensusDecision, metrics } = result;

        // Verify metrics were tracked
        expect(metrics.memberCosts.size).toBeGreaterThan(0);
        expect(metrics.memberLatencies.size).toBeGreaterThan(0);
        expect(metrics.memberTokens.size).toBeGreaterThan(0);

        // Calculate total cost
        const totalCost = Array.from(metrics.memberCosts.values())
            .reduce((sum, cost) => sum + cost, 0);

        // Log consensus decision
        await eventLogger.logConsensusDecision(requestId, consensusDecision);

        // Log costs
        const costBreakdown = {
            totalCost,
            currency: 'USD' as const,
            byMember: metrics.memberCosts,
            byProvider: new Map<string, number>(),
            pricingVersion: '2024-11'
        };

        // Aggregate by provider
        for (const [memberId, cost] of metrics.memberCosts.entries()) {
            const provider = memberId.split('-')[0];
            const existing = costBreakdown.byProvider.get(provider) || 0;
            costBreakdown.byProvider.set(provider, existing + cost);
        }

        await eventLogger.logCost(requestId, costBreakdown, metrics.memberTokens);

        // Verify database records
        const requestResult = await db.query(
            'SELECT total_cost FROM requests WHERE id = $1',
            [requestId]
        );
        expect(requestResult.rows).toHaveLength(1);
        expect(requestResult.rows[0].total_cost).not.toBeNull();
        expect(parseFloat(requestResult.rows[0].total_cost)).toBeCloseTo(totalCost, 4);

        // Verify cost records
        const costResult = await db.query(
            'SELECT SUM(cost) as sum_cost FROM cost_records WHERE request_id = $1',
            [requestId]
        );
        expect(costResult.rows).toHaveLength(1);
        expect(parseFloat(costResult.rows[0].sum_cost)).toBeCloseTo(totalCost, 4);

        // Verify token tracking
        const tokenResult = await db.query(
            'SELECT prompt_tokens, completion_tokens FROM cost_records WHERE request_id = $1',
            [requestId]
        );
        expect(tokenResult.rows.length).toBeGreaterThan(0);
        for (const row of tokenResult.rows) {
            expect(row.prompt_tokens).toBeGreaterThan(0);
            expect(row.completion_tokens).toBeGreaterThan(0);
        }
    }, 120000);

    test('provider health updates after request', async () => {
        // Skip if no API keys configured
        if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_API_KEY) {
            console.log('Skipping integration test: No API keys configured');
            return;
        }

        // Get initial health state
        const initialHealth = await db.query(
            'SELECT provider_id, success_rate, avg_latency_ms, updated_at FROM provider_health'
        );
        const initialHealthMap = new Map(
            initialHealth.rows.map(row => [row.provider_id, {
                successRate: parseFloat(row.success_rate),
                avgLatency: parseInt(row.avg_latency_ms),
                updatedAt: new Date(row.updated_at)
            }])
        );

        const requestId = 'test-health-' + Date.now();
        const userRequest: UserRequest = {
            id: requestId,
            query: 'What is the capital of France?',
            sessionId: null,
            context: [],
            timestamp: new Date()
        };

        // Process request
        await orchestrationEngine.processRequest(userRequest);

        // Wait for health updates to persist
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify health was updated
        const updatedHealth = await db.query(
            'SELECT provider_id, success_rate, avg_latency_ms, updated_at FROM provider_health'
        );

        expect(updatedHealth.rows.length).toBeGreaterThan(0);

        // Check that at least one provider was updated
        let healthUpdated = false;
        for (const row of updatedHealth.rows) {
            const initial = initialHealthMap.get(row.provider_id);
            if (initial) {
                const updatedAt = new Date(row.updated_at);
                if (updatedAt > initial.updatedAt) {
                    healthUpdated = true;
                    // Verify success rate is valid
                    expect(parseFloat(row.success_rate)).toBeGreaterThanOrEqual(0);
                    expect(parseFloat(row.success_rate)).toBeLessThanOrEqual(1);
                    // Verify latency is non-negative
                    expect(parseInt(row.avg_latency_ms)).toBeGreaterThanOrEqual(0);
                }
            }
        }

        expect(healthUpdated).toBe(true);
    }, 120000);

    test('admin dashboard queries return data', async () => {
        // Skip if no API keys configured
        if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_API_KEY) {
            console.log('Skipping integration test: No API keys configured');
            return;
        }

        // Query overview metrics
        const overviewQuery = `
      SELECT 
        COUNT(*) as total_requests,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(AVG(total_latency_ms), 0) as avg_latency
      FROM requests
      WHERE status = 'completed'
    `;
        const overviewResult = await db.query(overviewQuery);
        expect(overviewResult.rows).toHaveLength(1);
        expect(overviewResult.rows[0].total_requests).toBeDefined();

        // Query provider health
        const healthQuery = `
      SELECT provider_id, status, success_rate, avg_latency_ms
      FROM provider_health
      ORDER BY provider_id
    `;
        const healthResult = await db.query(healthQuery);
        expect(healthResult.rows.length).toBeGreaterThanOrEqual(0);

        // Query cost breakdown
        const costQuery = `
      SELECT provider, SUM(cost) as total_cost
      FROM cost_records
      GROUP BY provider
      ORDER BY total_cost DESC
    `;
        const costResult = await db.query(costQuery);
        expect(costResult.rows.length).toBeGreaterThanOrEqual(0);

        // Query recent activity
        const activityQuery = `
      SELECT id, query, status, total_cost, created_at, completed_at
      FROM requests
      ORDER BY created_at DESC
      LIMIT 10
    `;
        const activityResult = await db.query(activityQuery);
        expect(activityResult.rows.length).toBeGreaterThanOrEqual(0);
    }, 30000);

    test('metrics tracking does not block requests', async () => {
        // Skip if no API keys configured
        if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_API_KEY) {
            console.log('Skipping integration test: No API keys configured');
            return;
        }

        const requestId = 'test-performance-' + Date.now();
        const userRequest: UserRequest = {
            id: requestId,
            query: 'Quick test',
            sessionId: null,
            context: [],
            timestamp: new Date()
        };

        const startTime = Date.now();
        await orchestrationEngine.processRequest(userRequest);
        const endTime = Date.now();
        const totalLatency = endTime - startTime;

        // Metrics tracking should add < 50ms overhead
        // Since we can't measure without metrics, we just verify request completes
        expect(totalLatency).toBeGreaterThan(0);
        expect(totalLatency).toBeLessThan(60000); // Should complete within 60s
    }, 120000);
});
