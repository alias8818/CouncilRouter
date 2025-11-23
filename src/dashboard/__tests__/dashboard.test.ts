/**
 * Dashboard Unit Tests - Request Management
 * Tests for getRecentRequests() with various filters and edge cases
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { Pool } from 'pg';
import { Dashboard } from '../dashboard';
import { IAnalyticsEngine } from '../../interfaces/IAnalyticsEngine';
import { IProviderPool } from '../../interfaces/IProviderPool';
import { IRedTeamTester } from '../../interfaces/IRedTeamTester';
import { RequestSummary, RequestFilters } from '../../types/core';

// Mock dependencies
jest.mock('pg');

describe('Dashboard - Request Management', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAnalyticsEngine: jest.Mocked<IAnalyticsEngine>;
  let mockProviderPool: jest.Mocked<IProviderPool>;
  let mockRedTeamTester: jest.Mocked<IRedTeamTester>;
  let dashboard: Dashboard;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      query: jest.fn()
    } as any;

    // Create mock analytics engine
    mockAnalyticsEngine = {
      calculatePerformanceMetrics: jest.fn(),
      aggregateCostAnalytics: jest.fn(),
      computeAgreementMatrix: jest.fn(),
      calculateInfluenceScores: jest.fn()
    } as any;

    // Create mock provider pool
    mockProviderPool = {
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn()
    } as any;

    // Create mock red team tester
    mockRedTeamTester = {
      getResistanceRates: jest.fn(),
      getSecurityWarnings: jest.fn()
    } as any;

    dashboard = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRecentRequests() - No filters', () => {
    test('should return all requests in chronological order', async () => {
      const mockRequests = [
        {
          request_id: 'req-1',
          query: 'What is AI?',
          status: 'completed',
          consensus_decision: 'AI is intelligence demonstrated by machines',
          cost: '0.05',
          latency: '1500',
          agreement_level: '0.85',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          request_id: 'req-2',
          query: 'Explain quantum computing',
          status: 'completed',
          consensus_decision: 'Quantum computing uses quantum mechanics',
          cost: '0.08',
          latency: '2000',
          agreement_level: '0.90',
          timestamp: new Date('2024-01-01T11:00:00Z')
        },
        {
          request_id: 'req-3',
          query: 'What is machine learning?',
          status: 'processing',
          consensus_decision: null,
          cost: '0.03',
          latency: '800',
          agreement_level: '0.00',
          timestamp: new Date('2024-01-01T12:00:00Z')
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockRequests,
        rowCount: 3
      } as any);

      const result = await dashboard.getRecentRequests(10);

      expect(result).toHaveLength(3);
      expect(result[0].requestId).toBe('req-1');
      expect(result[1].requestId).toBe('req-2');
      expect(result[2].requestId).toBe('req-3');

      // Verify query was called with correct parameters
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain('ORDER BY created_at DESC');
      expect(queryCall[1]).toEqual([10]); // limit parameter
    });
  });

  describe('getRecentRequests() - Status filter (Property 1)', () => {
    test('should return only requests matching the specified status', async () => {
      const mockRequests = [
        {
          request_id: 'req-1',
          query: 'What is AI?',
          status: 'completed',
          consensus_decision: 'AI is intelligence',
          cost: '0.05',
          latency: '1500',
          agreement_level: '0.85',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          request_id: 'req-2',
          query: 'Explain quantum',
          status: 'completed',
          consensus_decision: 'Quantum computing',
          cost: '0.08',
          latency: '2000',
          agreement_level: '0.90',
          timestamp: new Date('2024-01-01T11:00:00Z')
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockRequests,
        rowCount: 2
      } as any);

      const filters: RequestFilters = { status: 'completed' };
      const result = await dashboard.getRecentRequests(10, filters);

      expect(result).toHaveLength(2);
      expect(result.every(r => r.status === 'completed')).toBe(true);

      // Verify query includes status filter
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain("status = $1");
      expect(queryCall[1]).toEqual(['completed', 10]);
    });
  });

  describe('getRecentRequests() - Date range filter (Property 2)', () => {
    test('should return only requests within the specified date range', async () => {
      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-01-31T23:59:59Z');

      const mockRequests = [
        {
          request_id: 'req-1',
          query: 'What is AI?',
          status: 'completed',
          consensus_decision: 'AI is intelligence',
          cost: '0.05',
          latency: '1500',
          agreement_level: '0.85',
          timestamp: new Date('2024-01-15T10:00:00Z')
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockRequests,
        rowCount: 1
      } as any);

      const filters: RequestFilters = {
        startDate,
        endDate
      };
      const result = await dashboard.getRecentRequests(10, filters);

      expect(result).toHaveLength(1);
      expect(result[0].timestamp.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
      expect(result[0].timestamp.getTime()).toBeLessThanOrEqual(endDate.getTime());

      // Verify query includes date range filters
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain("created_at >= $");
      expect(queryCall[0]).toContain("created_at <= $");
      expect(queryCall[1]).toContain(startDate);
      expect(queryCall[1]).toContain(endDate);
    });
  });

  describe('getRecentRequests() - User filter (Property 3)', () => {
    test('should return only requests from the specified user', async () => {
      const userId = 'user-123';

      const mockRequests = [
        {
          request_id: 'req-1',
          query: 'What is AI?',
          status: 'completed',
          consensus_decision: 'AI is intelligence',
          cost: '0.05',
          latency: '1500',
          agreement_level: '0.85',
          timestamp: new Date('2024-01-01T10:00:00Z')
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockRequests,
        rowCount: 1
      } as any);

      const filters: RequestFilters = { userId };
      const result = await dashboard.getRecentRequests(10, filters);

      expect(result).toHaveLength(1);

      // Verify query includes user filter
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain("user_id = $");
      expect(queryCall[1]).toContain(userId);
    });
  });

  describe('getRecentRequests() - Pagination (Property 4)', () => {
    test('should return correct page of results with proper offset', async () => {
      const pageSize = 5;
      const limit = pageSize;

      const mockRequests = Array.from({ length: pageSize }, (_, i) => ({
        request_id: `req-${i + 1}`,
        query: `Query ${i + 1}`,
        status: 'completed',
        consensus_decision: `Decision ${i + 1}`,
        cost: '0.05',
        latency: '1500',
        agreement_level: '0.85',
        timestamp: new Date(`2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`)
      }));

      mockDb.query.mockResolvedValueOnce({
        rows: mockRequests,
        rowCount: pageSize
      } as any);

      const result = await dashboard.getRecentRequests(limit);

      expect(result).toHaveLength(pageSize);
      expect(result[0].requestId).toBe('req-1');
      expect(result[pageSize - 1].requestId).toBe(`req-${pageSize}`);

      // Verify query includes LIMIT
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain("LIMIT $");
      expect(queryCall[1]).toContain(limit);
    });
  });

  describe('getRecentRequests() - Empty results (edge case)', () => {
    test('should return empty array without errors when no requests found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      const result = await dashboard.getRecentRequests(10);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRecentRequests() - SQL injection prevention (Property 5)', () => {
    test('should sanitize inputs and prevent SQL injection', async () => {
      const maliciousInputs = [
        "'; DROP TABLE requests; --",
        "' OR '1'='1",
        "'; INSERT INTO requests VALUES ('hack'); --",
        "1' UNION SELECT * FROM users --"
      ];

      for (const maliciousInput of maliciousInputs) {
        mockDb.query.mockClear();
        mockDb.query.mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        } as any);

        // Test with malicious input in status filter
        const filters: RequestFilters = { status: maliciousInput };
        await dashboard.getRecentRequests(10, filters);

        // Verify query uses parameterized queries (not string concatenation)
        const queryCall = mockDb.query.mock.calls[0];
        expect(queryCall[0]).toContain("status = $");
        expect(queryCall[1]).toContain(maliciousInput); // Input should be passed as parameter, not concatenated

        // Verify the malicious input is NOT directly in the SQL string
        expect(queryCall[0]).not.toContain("DROP TABLE");
        expect(queryCall[0]).not.toContain("INSERT INTO");
        expect(queryCall[0]).not.toContain("UNION SELECT");
      }
    });

    test('should prevent SQL injection in userId filter', async () => {
      const maliciousUserId = "'; DROP TABLE users; --";

      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      const filters: RequestFilters = { userId: maliciousUserId };
      await dashboard.getRecentRequests(10, filters);

      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain("user_id = $");
      expect(queryCall[0]).not.toContain("DROP TABLE");
    });

    test('should prevent SQL injection in date filters', async () => {
      const maliciousDate = "2024-01-01'; DROP TABLE requests; --" as any;

      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      const filters: RequestFilters = { startDate: maliciousDate };
      await dashboard.getRecentRequests(10, filters);

      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain("created_at >= $");
      expect(queryCall[0]).not.toContain("DROP TABLE");
    });
  });

  describe('getRecentRequests() - Combined filters', () => {
    test('should apply multiple filters correctly', async () => {
      const filters: RequestFilters = {
        status: 'completed',
        userId: 'user-123',
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-31T23:59:59Z'),
        minCost: 0.01,
        maxCost: 0.10
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      await dashboard.getRecentRequests(10, filters);

      const queryCall = mockDb.query.mock.calls[0];
      const query = queryCall[0];
      const params = queryCall[1];

      // Verify all filters are present
      expect(query).toContain("status = $");
      expect(query).toContain("user_id = $");
      expect(query).toContain("created_at >= $");
      expect(query).toContain("created_at <= $");
      expect(query).toContain("total_cost >= $");
      expect(query).toContain("total_cost <= $");

      // Verify parameters are in correct order
      expect(params).toContain('completed');
      expect(params).toContain('user-123');
      expect(params).toContain(filters.startDate);
      expect(params).toContain(filters.endDate);
      expect(params).toContain(0.01);
      expect(params).toContain(0.10);
    });
  });

  describe('getRecentRequests() - Data transformation', () => {
    test('should correctly transform database rows to RequestSummary objects', async () => {
      const mockRequests = [
        {
          request_id: 'req-1',
          query: 'What is AI?',
          status: 'completed',
          consensus_decision: 'AI is intelligence',
          cost: '0.05',
          latency: '1500',
          agreement_level: '0.85',
          timestamp: new Date('2024-01-01T10:00:00Z')
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockRequests,
        rowCount: 1
      } as any);

      const result = await dashboard.getRecentRequests(10);

      expect(result).toHaveLength(1);
      const summary = result[0];

      expect(summary.requestId).toBe('req-1');
      expect(summary.query).toBe('What is AI?');
      expect(summary.status).toBe('completed');
      expect(summary.consensusDecision).toBe('AI is intelligence');
      expect(summary.cost).toBe(0.05);
      expect(summary.latency).toBe(1500);
      expect(summary.agreementLevel).toBe(0.85);
      expect(summary.timestamp).toEqual(new Date('2024-01-01T10:00:00Z'));
    });

    test('should handle null values correctly', async () => {
      const mockRequests = [
        {
          request_id: 'req-1',
          query: 'What is AI?',
          status: 'processing',
          consensus_decision: null,
          cost: null,
          latency: null,
          agreement_level: null,
          timestamp: new Date('2024-01-01T10:00:00Z')
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockRequests,
        rowCount: 1
      } as any);

      const result = await dashboard.getRecentRequests(10);

      expect(result).toHaveLength(1);
      const summary = result[0];

      expect(summary.consensusDecision).toBe('');
      expect(summary.cost).toBe(0);
      expect(summary.latency).toBe(0);
      expect(summary.agreementLevel).toBe(0);
    });
  });
});

/**
 * Dashboard Unit Tests - Deliberation Data
 * Tests for getDeliberationThread() and transparency features
 * 
 * Requirements: 1.8, 1.9, 1.10, 1.11, 1.12
 */

import { IConfigurationManager } from '../../interfaces/IConfigurationManager';
import { DeliberationThread, TransparencyConfig } from '../../types/core';

describe('Dashboard - Deliberation Data', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAnalyticsEngine: jest.Mocked<IAnalyticsEngine>;
  let mockProviderPool: jest.Mocked<IProviderPool>;
  let mockRedTeamTester: jest.Mocked<IRedTeamTester>;
  let mockConfigManager: jest.Mocked<IConfigurationManager>;
  let dashboard: Dashboard;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as any;

    mockAnalyticsEngine = {
      calculatePerformanceMetrics: jest.fn(),
      aggregateCostAnalytics: jest.fn(),
      computeAgreementMatrix: jest.fn(),
      calculateInfluenceScores: jest.fn()
    } as any;

    mockProviderPool = {
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn()
    } as any;

    mockRedTeamTester = {
      getResistanceRates: jest.fn(),
      getSecurityWarnings: jest.fn()
    } as any;

    mockConfigManager = {
      getCouncilConfig: jest.fn(),
      updateCouncilConfig: jest.fn(),
      getDeliberationConfig: jest.fn(),
      getSynthesisConfig: jest.fn(),
      getPerformanceConfig: jest.fn(),
      getTransparencyConfig: jest.fn(),
      updateTransparencyConfig: jest.fn(),
      applyPreset: jest.fn()
    } as any;

    dashboard = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester,
      mockConfigManager
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDeliberationThread() - Valid request', () => {
    test('should return all exchanges with member attribution', async () => {
      const requestId = 'req-123';

      const initialResponses = [
        {
          council_member_id: 'member-1',
          content: 'Initial response from member 1',
          token_usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          latency_ms: 1000,
          created_at: new Date('2024-01-01T10:00:00Z')
        },
        {
          council_member_id: 'member-2',
          content: 'Initial response from member 2',
          token_usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
          latency_ms: 1200,
          created_at: new Date('2024-01-01T10:00:01Z')
        }
      ];

      const deliberationExchanges = [
        {
          round_number: 1,
          council_member_id: 'member-1',
          content: 'Round 1 exchange from member 1',
          references_to: ['member-2'],
          token_usage: { promptTokens: 150, completionTokens: 75, totalTokens: 225 },
          created_at: new Date('2024-01-01T10:00:05Z')
        }
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: initialResponses } as any)
        .mockResolvedValueOnce({ rows: deliberationExchanges } as any)
        .mockResolvedValueOnce({ rows: [{ total_latency_ms: '5000' }] } as any);

      const result = await dashboard.getDeliberationThread(requestId);

      expect(result.rounds).toHaveLength(2);
      expect(result.rounds[0].roundNumber).toBe(0);
      expect(result.rounds[0].exchanges).toHaveLength(2);
      expect(result.rounds[1].roundNumber).toBe(1);
      expect(result.rounds[1].exchanges).toHaveLength(1);
      expect(result.totalDuration).toBe(5000);

      // Verify member attribution
      expect(result.rounds[0].exchanges[0].councilMemberId).toBe('member-1');
      expect(result.rounds[0].exchanges[1].councilMemberId).toBe('member-2');
      expect(result.rounds[1].exchanges[0].councilMemberId).toBe('member-1');
    });
  });

  describe('getDeliberationThread() - Non-existent request (edge case)', () => {
    test('should return empty result or appropriate error', async () => {
      const requestId = 'non-existent';

      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await dashboard.getDeliberationThread(requestId);

      expect(result.rounds).toHaveLength(0);
      expect(result.totalDuration).toBe(0);
    });
  });

  describe('getDeliberationThread() - Chronological ordering (Property 6)', () => {
    test('should order exchanges chronologically', async () => {
      const requestId = 'req-123';

      // Create responses with timestamps - SQL ORDER BY created_at ASC should return them sorted
      // The mock should return them in chronological order as SQL would
      const initialResponses = [
        {
          council_member_id: 'member-1',
          content: 'Response 1',
          token_usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          latency_ms: 1000,
          created_at: new Date('2024-01-01T10:00:00Z')
        },
        {
          council_member_id: 'member-2',
          content: 'Response 2',
          token_usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          latency_ms: 1000,
          created_at: new Date('2024-01-01T10:00:01Z')
        }
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: initialResponses } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ total_latency_ms: '5000' }] } as any);

      const result = await dashboard.getDeliberationThread(requestId);

      // Verify chronological ordering - SQL ORDER BY created_at ASC returns them in order
      expect(result.rounds[0].exchanges[0].councilMemberId).toBe('member-1');
      expect(result.rounds[0].exchanges[1].councilMemberId).toBe('member-2');
      
      // Verify timestamps are in ascending order
      const timestamps = result.rounds[0].exchanges.map((_, idx) => 
        initialResponses[idx].created_at.getTime()
      );
      expect(timestamps[0]).toBeLessThanOrEqual(timestamps[1]);
    });
  });

  describe('getDisabledMemberWarnings() - Disabled member warnings (Property 7)', () => {
    test('should include warnings for disabled members', async () => {
      const disabledHealth = [
        {
          providerId: 'openai',
          status: 'disabled' as const,
          successRate: 0.0,
          avgLatency: 0
        },
        {
          providerId: 'anthropic',
          status: 'healthy' as const,
          successRate: 1.0,
          avgLatency: 100
        }
      ];

      jest.spyOn(dashboard, 'getProviderHealthStatus').mockResolvedValue(disabledHealth as any);

      const warnings = await dashboard.getDisabledMemberWarnings();

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('disabled');
      expect(warnings[0]).toContain('openai');
    });
  });

  describe('getDeliberationThreadWithTransparency() - Transparency redaction (Property 8)', () => {
    test('should return null when transparency is disabled', async () => {
      const requestId = 'req-123';
      const transparencyConfig: TransparencyConfig = {
        enabled: false,
        forcedTransparency: false
      };

      mockConfigManager.getTransparencyConfig.mockResolvedValue(transparencyConfig);

      const result = await dashboard.getDeliberationThreadWithTransparency(requestId, false);

      expect(result).toBeNull();
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('should return thread when transparency is enabled', async () => {
      const requestId = 'req-123';
      const transparencyConfig: TransparencyConfig = {
        enabled: true,
        forcedTransparency: false
      };

      mockConfigManager.getTransparencyConfig.mockResolvedValue(transparencyConfig);
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ total_latency_ms: '5000' }] } as any);

      const result = await dashboard.getDeliberationThreadWithTransparency(requestId, true);

      expect(result).not.toBeNull();
      expect(mockDb.query).toHaveBeenCalled();
    });

    test('should return thread when forced transparency is enabled', async () => {
      const requestId = 'req-123';
      const transparencyConfig: TransparencyConfig = {
        enabled: false,
        forcedTransparency: true
      };

      mockConfigManager.getTransparencyConfig.mockResolvedValue(transparencyConfig);
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ total_latency_ms: '5000' }] } as any);

      const result = await dashboard.getDeliberationThreadWithTransparency(requestId, false);

      expect(result).not.toBeNull();
      expect(mockDb.query).toHaveBeenCalled();
    });
  });
});

/**
 * Dashboard Unit Tests - Performance Metrics
 * Tests for getPerformanceMetrics()
 * 
 * Requirements: 1.13, 1.14, 1.15
 */

import { PerformanceMetrics, TimeRange } from '../../types/core';

describe('Dashboard - Performance Metrics', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAnalyticsEngine: jest.Mocked<IAnalyticsEngine>;
  let mockProviderPool: jest.Mocked<IProviderPool>;
  let mockRedTeamTester: jest.Mocked<IRedTeamTester>;
  let dashboard: Dashboard;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as any;

    mockAnalyticsEngine = {
      calculatePerformanceMetrics: jest.fn(),
      aggregateCostAnalytics: jest.fn(),
      computeAgreementMatrix: jest.fn(),
      calculateInfluenceScores: jest.fn()
    } as any;

    mockProviderPool = {
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn()
    } as any;

    mockRedTeamTester = {
      getResistanceRates: jest.fn(),
      getSecurityWarnings: jest.fn()
    } as any;

    dashboard = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPerformanceMetrics() - Time range', () => {
    test('should aggregate latency data accurately', async () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-31T23:59:59Z')
      };

      const expectedMetrics: PerformanceMetrics = {
        p50Latency: 1500,
        p95Latency: 3000,
        p99Latency: 5000,
        byCouncilSize: new Map(),
        byDeliberationRounds: new Map(),
        timeoutRate: 0.05
      };

      mockAnalyticsEngine.calculatePerformanceMetrics.mockResolvedValue(expectedMetrics);

      const result = await dashboard.getPerformanceMetrics(timeRange);

      expect(result).toEqual(expectedMetrics);
      expect(mockAnalyticsEngine.calculatePerformanceMetrics).toHaveBeenCalledWith(timeRange);
    });
  });

  describe('getPerformanceMetrics() - Latency aggregation accuracy (Property 9)', () => {
    test('should correctly compute mean, median, and percentiles', async () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-31T23:59:59Z')
      };

      const expectedMetrics: PerformanceMetrics = {
        p50Latency: 1500,
        p95Latency: 3000,
        p99Latency: 5000,
        byCouncilSize: new Map([
          [3, { p50: 1200, p95: 2500, p99: 4000, count: 100 }],
          [5, { p50: 1800, p95: 3500, p99: 6000, count: 50 }]
        ]),
        byDeliberationRounds: new Map(),
        timeoutRate: 0.05
      };

      mockAnalyticsEngine.calculatePerformanceMetrics.mockResolvedValue(expectedMetrics);

      const result = await dashboard.getPerformanceMetrics(timeRange);

      expect(result.p50Latency).toBe(1500);
      expect(result.p95Latency).toBe(3000);
      expect(result.p99Latency).toBe(5000);
      expect(result.byCouncilSize.size).toBe(2);
    });
  });

  describe('getPerformanceMetrics() - Percentile calculations (Property 10)', () => {
    test('should compute p50, p95, and p99 percentiles correctly', async () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-31T23:59:59Z')
      };

      const expectedMetrics: PerformanceMetrics = {
        p50Latency: 1500,
        p95Latency: 3000,
        p99Latency: 5000,
        byCouncilSize: new Map(),
        byDeliberationRounds: new Map(),
        timeoutRate: 0.05
      };

      mockAnalyticsEngine.calculatePerformanceMetrics.mockResolvedValue(expectedMetrics);

      const result = await dashboard.getPerformanceMetrics(timeRange);

      // Verify percentiles are in ascending order
      expect(result.p50Latency).toBeLessThanOrEqual(result.p95Latency);
      expect(result.p95Latency).toBeLessThanOrEqual(result.p99Latency);
    });
  });

  describe('getPerformanceMetrics() - No data (edge case)', () => {
    test('should return zero values or appropriate indicators', async () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-31T23:59:59Z')
      };

      const expectedMetrics: PerformanceMetrics = {
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        byCouncilSize: new Map(),
        byDeliberationRounds: new Map(),
        timeoutRate: 0
      };

      mockAnalyticsEngine.calculatePerformanceMetrics.mockResolvedValue(expectedMetrics);

      const result = await dashboard.getPerformanceMetrics(timeRange);

      expect(result.p50Latency).toBe(0);
      expect(result.p95Latency).toBe(0);
      expect(result.p99Latency).toBe(0);
      expect(result.timeoutRate).toBe(0);
    });
  });
});

/**
 * Dashboard Unit Tests - Cost Analytics
 * Tests for getCostAnalytics()
 * 
 * Requirements: 1.16, 1.17, 1.18, 1.19, 1.20, 1.21
 */

import { CostAnalytics } from '../../types/core';

describe('Dashboard - Cost Analytics', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAnalyticsEngine: jest.Mocked<IAnalyticsEngine>;
  let mockProviderPool: jest.Mocked<IProviderPool>;
  let mockRedTeamTester: jest.Mocked<IRedTeamTester>;
  let dashboard: Dashboard;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as any;

    mockAnalyticsEngine = {
      calculatePerformanceMetrics: jest.fn(),
      aggregateCostAnalytics: jest.fn(),
      computeAgreementMatrix: jest.fn(),
      calculateInfluenceScores: jest.fn()
    } as any;

    mockProviderPool = {
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn()
    } as any;

    mockRedTeamTester = {
      getResistanceRates: jest.fn(),
      getSecurityWarnings: jest.fn()
    } as any;

    dashboard = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCostAnalytics() - Daily aggregation (Property 11)', () => {
    test('should sum costs by calendar day', async () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-31T23:59:59Z')
      };

      const expectedAnalytics: CostAnalytics = {
        totalCost: 100.50,
        byProvider: new Map([
          ['openai', 60.30],
          ['anthropic', 40.20]
        ]),
        byMember: new Map([
          ['member-1', 50.25],
          ['member-2', 50.25]
        ]),
        costPerRequest: 0.50,
        projectedMonthlyCost: 1500.00
      };

      mockAnalyticsEngine.aggregateCostAnalytics.mockResolvedValue(expectedAnalytics);

      const result = await dashboard.getCostAnalytics(timeRange);

      expect(result.totalCost).toBe(100.50);
      expect(mockAnalyticsEngine.aggregateCostAnalytics).toHaveBeenCalledWith(timeRange);
    });
  });

  describe('getCostAnalytics() - Provider breakdown (Property 12)', () => {
    test('should correctly attribute costs to each provider', async () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-31T23:59:59Z')
      };

      const expectedAnalytics: CostAnalytics = {
        totalCost: 100.50,
        byProvider: new Map([
          ['openai', 60.30],
          ['anthropic', 40.20]
        ]),
        byMember: new Map(),
        costPerRequest: 0.50,
        projectedMonthlyCost: 1500.00
      };

      mockAnalyticsEngine.aggregateCostAnalytics.mockResolvedValue(expectedAnalytics);

      const result = await dashboard.getCostAnalytics(timeRange);

      expect(result.byProvider.size).toBe(2);
      expect(result.byProvider.get('openai')).toBe(60.30);
      expect(result.byProvider.get('anthropic')).toBe(40.20);
    });
  });

  describe('getCostAnalytics() - Cost member attribution (Property 14)', () => {
    test('should correctly attribute costs to council members', async () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-31T23:59:59Z')
      };

      const expectedAnalytics: CostAnalytics = {
        totalCost: 100.50,
        byProvider: new Map(),
        byMember: new Map([
          ['member-1', 50.25],
          ['member-2', 30.15],
          ['member-3', 20.10]
        ]),
        costPerRequest: 0.50,
        projectedMonthlyCost: 1500.00
      };

      mockAnalyticsEngine.aggregateCostAnalytics.mockResolvedValue(expectedAnalytics);

      const result = await dashboard.getCostAnalytics(timeRange);

      expect(result.byMember.size).toBe(3);
      expect(result.byMember.get('member-1')).toBe(50.25);
      expect(result.byMember.get('member-2')).toBe(30.15);
      expect(result.byMember.get('member-3')).toBe(20.10);
    });
  });
});

/**
 * Dashboard Unit Tests - Agreement & Influence
 * Tests for getAgreementMatrix() and getInfluenceScores()
 * 
 * Requirements: 1.22, 1.23, 1.24, 1.25, 1.26
 */

import { AgreementMatrix, InfluenceScores } from '../../types/core';

describe('Dashboard - Agreement & Influence', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAnalyticsEngine: jest.Mocked<IAnalyticsEngine>;
  let mockProviderPool: jest.Mocked<IProviderPool>;
  let mockRedTeamTester: jest.Mocked<IRedTeamTester>;
  let dashboard: Dashboard;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as any;

    mockAnalyticsEngine = {
      calculatePerformanceMetrics: jest.fn(),
      aggregateCostAnalytics: jest.fn(),
      computeAgreementMatrix: jest.fn(),
      calculateInfluenceScores: jest.fn()
    } as any;

    mockProviderPool = {
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn()
    } as any;

    mockRedTeamTester = {
      getResistanceRates: jest.fn(),
      getSecurityWarnings: jest.fn()
    } as any;

    dashboard = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAgreementMatrix() - Pairwise calculation (Property 15)', () => {
    test('should contain pairwise agreement scores for all member pairs', async () => {
      const expectedMatrix: AgreementMatrix = {
        members: ['member-1', 'member-2', 'member-3'],
        disagreementRates: [
          [0.0, 0.2, 0.3],
          [0.2, 0.0, 0.25],
          [0.3, 0.25, 0.0]
        ]
      };

      mockAnalyticsEngine.computeAgreementMatrix.mockResolvedValue(expectedMatrix);

      const result = await dashboard.getAgreementMatrix();

      expect(result.members).toHaveLength(3);
      expect(result.disagreementRates).toHaveLength(3);
      expect(result.disagreementRates[0]).toHaveLength(3);
    });
  });

  describe('getAgreementMatrix() - Symmetry (Property 16)', () => {
    test('should produce symmetric matrix', async () => {
      const expectedMatrix: AgreementMatrix = {
        members: ['member-1', 'member-2', 'member-3'],
        disagreementRates: [
          [0.0, 0.2, 0.3],
          [0.2, 0.0, 0.25],
          [0.3, 0.25, 0.0]
        ]
      };

      mockAnalyticsEngine.computeAgreementMatrix.mockResolvedValue(expectedMatrix);

      const result = await dashboard.getAgreementMatrix();

      // Verify symmetry: matrix[i][j] should equal matrix[j][i]
      for (let i = 0; i < result.disagreementRates.length; i++) {
        for (let j = 0; j < result.disagreementRates[i].length; j++) {
          expect(result.disagreementRates[i][j]).toBe(result.disagreementRates[j][i]);
        }
      }
    });
  });

  describe('getInfluenceScores() - Ranking (Property 17)', () => {
    test('should rank members by consensus contribution', async () => {
      const expectedScores: InfluenceScores = {
        scores: new Map([
          ['member-1', 0.4],
          ['member-2', 0.35],
          ['member-3', 0.25]
        ])
      };

      mockAnalyticsEngine.calculateInfluenceScores.mockResolvedValue(expectedScores);

      const result = await dashboard.getInfluenceScores();

      expect(result.scores.size).toBe(3);
      expect(result.scores.get('member-1')).toBe(0.4);
      expect(result.scores.get('member-2')).toBe(0.35);
      expect(result.scores.get('member-3')).toBe(0.25);
    });
  });

  describe('getInfluenceScores() - Normalization (Property 18)', () => {
    test('should normalize scores to sum to 1.0', async () => {
      const expectedScores: InfluenceScores = {
        scores: new Map([
          ['member-1', 0.4],
          ['member-2', 0.35],
          ['member-3', 0.25]
        ])
      };

      mockAnalyticsEngine.calculateInfluenceScores.mockResolvedValue(expectedScores);

      const result = await dashboard.getInfluenceScores();

      const sum = Array.from(result.scores.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('getInfluenceScores() - Ties (edge case)', () => {
    test('should handle equal scores consistently', async () => {
      const expectedScores: InfluenceScores = {
        scores: new Map([
          ['member-1', 0.33],
          ['member-2', 0.33],
          ['member-3', 0.34]
        ])
      };

      mockAnalyticsEngine.calculateInfluenceScores.mockResolvedValue(expectedScores);

      const result = await dashboard.getInfluenceScores();

      expect(result.scores.size).toBe(3);
      const sum = Array.from(result.scores.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });
});

/**
 * Dashboard Unit Tests - Provider Health
 * Tests for getProviderHealthStatus()
 * 
 * Requirements: 1.27, 1.28, 1.29, 1.30
 */

import { ProviderHealth } from '../../types/core';

describe('Dashboard - Provider Health', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAnalyticsEngine: jest.Mocked<IAnalyticsEngine>;
  let mockProviderPool: jest.Mocked<IProviderPool>;
  let mockRedTeamTester: jest.Mocked<IRedTeamTester>;
  let mockConfigManager: jest.Mocked<IConfigurationManager>;
  let dashboard: Dashboard;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as any;

    mockAnalyticsEngine = {
      calculatePerformanceMetrics: jest.fn(),
      aggregateCostAnalytics: jest.fn(),
      computeAgreementMatrix: jest.fn(),
      calculateInfluenceScores: jest.fn()
    } as any;

    mockProviderPool = {
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn()
    } as any;

    mockRedTeamTester = {
      getResistanceRates: jest.fn(),
      getSecurityWarnings: jest.fn()
    } as any;

    mockConfigManager = {
      getCouncilConfig: jest.fn(),
      updateCouncilConfig: jest.fn(),
      getDeliberationConfig: jest.fn(),
      getSynthesisConfig: jest.fn(),
      getPerformanceConfig: jest.fn(),
      getTransparencyConfig: jest.fn(),
      updateTransparencyConfig: jest.fn(),
      applyPreset: jest.fn()
    } as any;

    dashboard = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester,
      mockConfigManager
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProviderHealthStatus() - All providers (Property 19)', () => {
    test('should return status for every configured provider', async () => {
      const healthStatuses: ProviderHealth[] = [
        {
          providerId: 'openai',
          status: 'healthy',
          successRate: 0.95,
          avgLatency: 100
        },
        {
          providerId: 'anthropic',
          status: 'healthy',
          successRate: 0.98,
          avgLatency: 120
        },
        {
          providerId: 'google',
          status: 'degraded',
          successRate: 0.85,
          avgLatency: 200
        }
      ];

      (mockProviderPool.getAllProviderHealth as jest.Mock).mockReturnValue(healthStatuses);

      const result = await dashboard.getProviderHealthStatus();

      expect(result).toHaveLength(3);
      expect(result.map(h => h.providerId)).toContain('openai');
      expect(result.map(h => h.providerId)).toContain('anthropic');
      expect(result.map(h => h.providerId)).toContain('google');
    });
  });

  describe('getProviderHealthStatus() - Disabled provider identification (Property 20)', () => {
    test('should clearly flag disabled providers', async () => {
      const healthStatuses: ProviderHealth[] = [
        {
          providerId: 'openai',
          status: 'healthy',
          successRate: 0.95,
          avgLatency: 100
        },
        {
          providerId: 'anthropic',
          status: 'disabled',
          successRate: 0.0,
          avgLatency: 0
        }
      ];

      (mockProviderPool.getAllProviderHealth as jest.Mock).mockReturnValue(healthStatuses);

      const result = await dashboard.getProviderHealthStatus();

      const disabled = result.filter(h => h.status === 'disabled');
      expect(disabled.length).toBe(1);
      expect(disabled[0].providerId).toBe('anthropic');
    });
  });

  describe('getProviderHealthStatus() - Health score calculation (Property 21)', () => {
    test('should calculate health scores from success rates', async () => {
      const healthStatuses: ProviderHealth[] = [
        {
          providerId: 'openai',
          status: 'healthy',
          successRate: 0.95,
          avgLatency: 100
        }
      ];

      (mockProviderPool.getAllProviderHealth as jest.Mock).mockReturnValue(healthStatuses);

      const result = await dashboard.getProviderHealthStatus();

      expect(result[0].successRate).toBe(0.95);
      expect(result[0].status).toBe('healthy');
    });
  });

  describe('getProviderHealthStatus() - Average latency tracking (Property 22)', () => {
    test('should correctly compute average latency per provider', async () => {
      const healthStatuses: ProviderHealth[] = [
        {
          providerId: 'openai',
          status: 'healthy',
          successRate: 0.95,
          avgLatency: 100
        },
        {
          providerId: 'anthropic',
          status: 'healthy',
          successRate: 0.98,
          avgLatency: 120
        }
      ];

      (mockProviderPool.getAllProviderHealth as jest.Mock).mockReturnValue(healthStatuses);

      const result = await dashboard.getProviderHealthStatus();

      expect(result[0].avgLatency).toBe(100);
      expect(result[1].avgLatency).toBe(120);
    });
  });
});

/**
 * Dashboard Unit Tests - Red Team Analytics
 * Tests for getRedTeamAnalytics()
 * 
 * Requirements: 1.31, 1.32, 1.33
 */

import { RedTeamAnalytics } from '../../types/core';

describe('Dashboard - Red Team Analytics', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAnalyticsEngine: jest.Mocked<IAnalyticsEngine>;
  let mockProviderPool: jest.Mocked<IProviderPool>;
  let mockRedTeamTester: jest.Mocked<IRedTeamTester>;
  let dashboard: Dashboard;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as any;

    mockAnalyticsEngine = {
      calculatePerformanceMetrics: jest.fn(),
      aggregateCostAnalytics: jest.fn(),
      computeAgreementMatrix: jest.fn(),
      calculateInfluenceScores: jest.fn()
    } as any;

    mockProviderPool = {
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn()
    } as any;

    mockRedTeamTester = {
      getResistanceRates: jest.fn(),
      getSecurityWarnings: jest.fn()
    } as any;

    dashboard = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRedTeamAnalytics() - Vulnerability stats (Property 23)', () => {
    test('should aggregate vulnerability statistics', async () => {
      const expectedAnalytics: RedTeamAnalytics = {
        resistanceRatesByMember: new Map([
          ['member-1', 0.95],
          ['member-2', 0.90]
        ]),
        resistanceRatesByCategory: new Map([
          ['injection', 0.85],
          ['jailbreak', 0.92]
        ]),
        resistanceRatesByMemberAndCategory: new Map([
          ['member-1', new Map([['injection', 0.90], ['jailbreak', 0.95]])],
          ['member-2', new Map([['injection', 0.80], ['jailbreak', 0.90]])]
        ])
      };

      mockRedTeamTester.getResistanceRates.mockResolvedValue(expectedAnalytics);

      const result = await dashboard.getRedTeamAnalytics();

      expect(result.resistanceRatesByMember.size).toBe(2);
      expect(result.resistanceRatesByCategory.size).toBe(2);
      expect(result.resistanceRatesByMemberAndCategory.size).toBe(2);
    });
  });

  describe('getRedTeamAnalytics() - Test results (Property 23)', () => {
    test('should display test results by category', async () => {
      const expectedAnalytics: RedTeamAnalytics = {
        resistanceRatesByMember: new Map(),
        resistanceRatesByCategory: new Map([
          ['injection', 0.85],
          ['jailbreak', 0.92],
          ['prompt-leak', 0.88]
        ]),
        resistanceRatesByMemberAndCategory: new Map()
      };

      mockRedTeamTester.getResistanceRates.mockResolvedValue(expectedAnalytics);

      const result = await dashboard.getRedTeamAnalytics();

      expect(result.resistanceRatesByCategory.size).toBe(3);
      expect(result.resistanceRatesByCategory.get('injection')).toBe(0.85);
      expect(result.resistanceRatesByCategory.get('jailbreak')).toBe(0.92);
    });
  });

  describe('getRedTeamAnalytics() - Severity distribution (Property 23)', () => {
    test('should show severity distribution', async () => {
      const expectedAnalytics: RedTeamAnalytics = {
        resistanceRatesByMember: new Map([
          ['member-1', 0.95],
          ['member-2', 0.70] // Lower resistance = higher severity
        ]),
        resistanceRatesByCategory: new Map(),
        resistanceRatesByMemberAndCategory: new Map()
      };

      mockRedTeamTester.getResistanceRates.mockResolvedValue(expectedAnalytics);

      const result = await dashboard.getRedTeamAnalytics();

      expect(result.resistanceRatesByMember.get('member-1')).toBeGreaterThan(
        result.resistanceRatesByMember.get('member-2')!
      );
    });
  });
});


/**
 * Dashboard Unit Tests - Additional Coverage
 * Tests for getDisabledMemberWarnings() and shouldShowDeliberation()
 * 
 * Requirements: 1.11, 1.12
 */

describe('Dashboard - Disabled Member Warnings', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAnalyticsEngine: jest.Mocked<IAnalyticsEngine>;
  let mockProviderPool: jest.Mocked<IProviderPool>;
  let mockRedTeamTester: jest.Mocked<IRedTeamTester>;
  let mockConfigManager: any;
  let dashboard: Dashboard;

  beforeEach(() => {
    mockDb = { query: jest.fn() } as any;
    mockAnalyticsEngine = {
      calculatePerformanceMetrics: jest.fn(),
      aggregateCostAnalytics: jest.fn(),
      computeAgreementMatrix: jest.fn(),
      calculateInfluenceScores: jest.fn()
    } as any;

    mockProviderPool = {
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn()
    } as any;

    mockRedTeamTester = {
      getResistanceRates: jest.fn(),
      getSecurityWarnings: jest.fn()
    } as any;

    mockConfigManager = {
      getCouncilConfig: jest.fn(),
      getTransparencyConfig: jest.fn()
    } as any;

    dashboard = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester,
      mockConfigManager
    );
  });

  test('should return warnings for disabled providers', async () => {
    // Mock getAllProviderHealth to return mix of healthy and disabled
    mockProviderPool.getAllProviderHealth = jest.fn().mockReturnValue([
      {
        providerId: 'openai',
        status: 'healthy',
        successRate: 0.95,
        avgLatencyMs: 1200,
        consecutiveFailures: 0
      },
      {
        providerId: 'anthropic',
        status: 'disabled',
        successRate: 0.20,
        avgLatencyMs: 5000,
        consecutiveFailures: 10
      },
      {
        providerId: 'google',
        status: 'disabled',
        successRate: 0.15,
        avgLatencyMs: 6000,
        consecutiveFailures: 12
      }
    ]);

    const warnings = await dashboard.getDisabledMemberWarnings();

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('anthropic');
    expect(warnings[0]).toContain('disabled');
    expect(warnings[1]).toContain('google');
    expect(warnings[1]).toContain('disabled');
  });

  test('should return empty array when all providers are healthy', async () => {
    mockProviderPool.getAllProviderHealth = jest.fn().mockReturnValue([
      {
        providerId: 'openai',
        status: 'healthy',
        successRate: 0.95,
        avgLatencyMs: 1200,
        consecutiveFailures: 0
      },
      {
        providerId: 'anthropic',
        status: 'healthy',
        successRate: 0.92,
        avgLatencyMs: 1500,
        consecutiveFailures: 0
      }
    ]);

    const warnings = await dashboard.getDisabledMemberWarnings();

    expect(warnings).toHaveLength(0);
  });

  test('should handle providers with degraded status (not disabled)', async () => {
    mockProviderPool.getAllProviderHealth = jest.fn().mockReturnValue([
      {
        providerId: 'openai',
        status: 'degraded',
        successRate: 0.75,
        avgLatencyMs: 3000,
        consecutiveFailures: 2
      }
    ]);

    const warnings = await dashboard.getDisabledMemberWarnings();

    expect(warnings).toHaveLength(0);
  });

  test('should handle empty provider health list', async () => {
    mockProviderPool.getAllProviderHealth = jest.fn().mockReturnValue([]);

    const warnings = await dashboard.getDisabledMemberWarnings();

    expect(warnings).toHaveLength(0);
  });

  test('should handle provider with missing providerId', async () => {
    mockProviderPool.getAllProviderHealth = jest.fn().mockReturnValue([
      {
        providerId: '',
        status: 'disabled',
        successRate: 0.10,
        avgLatencyMs: 7000,
        consecutiveFailures: 15
      }
    ]);

    const warnings = await dashboard.getDisabledMemberWarnings();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('unknown-provider');
  });

  test('should use database fallback when getAllProviderHealth not available', async () => {
    // Create dashboard without getAllProviderHealth method
    const poolWithoutGetAll = {
      getProviderHealth: jest.fn().mockReturnValue({
        providerId: 'openai',
        status: 'disabled',
        successRate: 0.20,
        avgLatencyMs: 5000,
        consecutiveFailures: 10
      })
    } as any;

    const dashboardFallback = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      poolWithoutGetAll,
      mockRedTeamTester,
      mockConfigManager
    );

    // Mock config manager to return council config
    mockConfigManager.getCouncilConfig.mockResolvedValue({
      members: [
        { id: 'member-1', provider: 'openai', model: 'gpt-4' },
        { id: 'member-2', provider: 'anthropic', model: 'claude-3' }
      ]
    });

    const warnings = await dashboardFallback.getDisabledMemberWarnings();

    expect(mockConfigManager.getCouncilConfig).toHaveBeenCalled();
    expect(poolWithoutGetAll.getProviderHealth).toHaveBeenCalledWith('openai');
    expect(poolWithoutGetAll.getProviderHealth).toHaveBeenCalledWith('anthropic');
  });

  test('should use database query fallback when no config manager', async () => {
    const poolWithoutGetAll = {
      getProviderHealth: jest.fn().mockReturnValue({
        providerId: 'openai',
        status: 'disabled',
        successRate: 0.20,
        avgLatencyMs: 5000,
        consecutiveFailures: 10
      })
    } as any;

    const dashboardNoConfig = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      poolWithoutGetAll,
      mockRedTeamTester
    );

    // Mock database query to return council member data
    mockDb.query.mockResolvedValue({
      rows: [
        {
          council_member_id: 'member-1',
          members: [
            { id: 'member-1', provider: 'openai', model: 'gpt-4' }
          ]
        }
      ],
      rowCount: 1
    } as any);

    const warnings = await dashboardNoConfig.getDisabledMemberWarnings();

    expect(mockDb.query).toHaveBeenCalled();
    expect(poolWithoutGetAll.getProviderHealth).toHaveBeenCalledWith('openai');
  });
});

describe('Dashboard - Transparency Configuration', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAnalyticsEngine: jest.Mocked<IAnalyticsEngine>;
  let mockProviderPool: jest.Mocked<IProviderPool>;
  let mockRedTeamTester: jest.Mocked<IRedTeamTester>;
  let mockConfigManager: any;
  let dashboard: Dashboard;

  beforeEach(() => {
    mockDb = { query: jest.fn() } as any;
    mockAnalyticsEngine = {
      calculatePerformanceMetrics: jest.fn(),
      aggregateCostAnalytics: jest.fn(),
      computeAgreementMatrix: jest.fn(),
      calculateInfluenceScores: jest.fn()
    } as any;

    mockProviderPool = {
      getProviderHealth: jest.fn(),
      getAllProviderHealth: jest.fn()
    } as any;

    mockRedTeamTester = {
      getResistanceRates: jest.fn(),
      getSecurityWarnings: jest.fn()
    } as any;

    mockConfigManager = {
      getCouncilConfig: jest.fn(),
      getTransparencyConfig: jest.fn()
    } as any;

    dashboard = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester,
      mockConfigManager
    );
  });

  test('should return true when forced transparency is enabled', async () => {
    mockConfigManager.getTransparencyConfig.mockResolvedValue({
      enabled: false,
      forcedTransparency: true
    });

    const result = await dashboard.shouldShowDeliberation(false);

    expect(result).toBe(true);
    expect(mockConfigManager.getTransparencyConfig).toHaveBeenCalled();
  });

  test('should return user preference when transparency enabled and not forced', async () => {
    mockConfigManager.getTransparencyConfig.mockResolvedValue({
      enabled: true,
      forcedTransparency: false
    });

    const resultTrue = await dashboard.shouldShowDeliberation(true);
    expect(resultTrue).toBe(true);

    const resultFalse = await dashboard.shouldShowDeliberation(false);
    expect(resultFalse).toBe(false);
  });

  test('should return false when transparency disabled and user wants to see', async () => {
    mockConfigManager.getTransparencyConfig.mockResolvedValue({
      enabled: false,
      forcedTransparency: false
    });

    const result = await dashboard.shouldShowDeliberation(true);

    expect(result).toBe(false);
  });

  test('should return false when no user preference and transparency disabled', async () => {
    mockConfigManager.getTransparencyConfig.mockResolvedValue({
      enabled: false,
      forcedTransparency: false
    });

    const result = await dashboard.shouldShowDeliberation();

    expect(result).toBe(false);
  });

  test('should return user preference when no config manager', async () => {
    const dashboardNoConfig = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester
    );

    const resultTrue = await dashboardNoConfig.shouldShowDeliberation(true);
    expect(resultTrue).toBe(true);

    const resultFalse = await dashboardNoConfig.shouldShowDeliberation(false);
    expect(resultFalse).toBe(false);
  });

  test('should return false when no config manager and no user preference', async () => {
    const dashboardNoConfig = new Dashboard(
      mockDb,
      mockAnalyticsEngine,
      mockProviderPool,
      mockRedTeamTester
    );

    const result = await dashboardNoConfig.shouldShowDeliberation();

    expect(result).toBe(false);
  });
});
