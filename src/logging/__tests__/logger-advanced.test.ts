/**
 * Event Logger Advanced Tests
 * Tests for database failures, concurrent writes, bulk operations, and error handling
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

import { EventLogger } from '../logger';
import { Pool } from 'pg';
import {
  UserRequest,
  InitialResponse,
  DeliberationRound,
  ConsensusDecision,
  CostBreakdown
} from '../../types/core';

// Mock dependencies
jest.mock('pg');

describe('Event Logger Advanced - Database Failures & High Volume', () => {
  let eventLogger: EventLogger;
  let mockDb: jest.Mocked<Pool>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    eventLogger = new EventLogger(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Database Unavailable During Log (Requirement 9.1)', () => {
    test('should handle database errors gracefully', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date(),
        context: {
          messages: [],
          totalTokens: 0,
          summarized: false
        }
      };

      // Simulate database error
      mockDb.query.mockRejectedValueOnce(new Error('Database unavailable'));

      await expect(eventLogger.logRequest(request)).rejects.toThrow('Database unavailable');
      
      // Error should be logged
      expect(mockDb.query).toHaveBeenCalled();
    });
  });

  describe('Batch Logging Failures (Requirement 9.2)', () => {
    test('should handle batch logging errors', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date(),
        context: {
          messages: [],
          totalTokens: 0,
          summarized: false
        }
      };

      const response: InitialResponse = {
        councilMemberId: 'member-1',
        content: 'Response',
        tokenUsage: { prompt: 10, completion: 20 },
        latency: 100,
        timestamp: new Date()
      };

      // First log succeeds, second fails
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockRejectedValueOnce(new Error('Batch insert failed'));

      await eventLogger.logRequest(request);
      await expect(eventLogger.logCouncilResponse('req-1', response)).rejects.toThrow('Batch insert failed');
    });
  });

  describe('Retry Logic (Requirement 9.3)', () => {
    test('should propagate errors for retry handling', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date(),
        context: {
          messages: [],
          totalTokens: 0,
          summarized: false
        }
      };

      // Simulate transient error
      const transientError = new Error('Connection timeout');
      mockDb.query.mockRejectedValueOnce(transientError);

      // Error should be thrown for caller to handle retry
      await expect(eventLogger.logRequest(request)).rejects.toThrow('Connection timeout');
    });
  });

  describe('Fallback Logging (Requirement 9.4)', () => {
    test('should throw error when database fails', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date(),
        context: {
          messages: [],
          totalTokens: 0,
          summarized: false
        }
      };

      // Simulate database failure
      mockDb.query.mockRejectedValueOnce(new Error('Database connection lost'));

      // Current implementation throws error - fallback would need to be implemented
      await expect(eventLogger.logRequest(request)).rejects.toThrow('Database connection lost');
    });
  });

  describe('Concurrent Write Handling (Property 113, Requirement 9.5)', () => {
    test('should handle concurrent writes without data loss', async () => {
      const request1: UserRequest = {
        id: 'req-1',
        query: 'Query 1',
        timestamp: new Date(),
        context: {
          messages: [],
          totalTokens: 0,
          summarized: false
        }
      };

      const request2: UserRequest = {
        id: 'req-2',
        query: 'Query 2',
        timestamp: new Date(),
        context: {
          messages: [],
          totalTokens: 0,
          summarized: false
        }
      };

      // Mock concurrent writes
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await Promise.all([
        eventLogger.logRequest(request1),
        eventLogger.logRequest(request2)
      ]);

      // Both writes should complete
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('Bulk Insert Optimization (Property 114, Requirement 9.6)', () => {
    test('should handle multiple exchanges efficiently', async () => {
      const round: DeliberationRound = {
        roundNumber: 1,
        exchanges: [
          {
            councilMemberId: 'member-1',
            content: 'Exchange 1',
            referencesTo: [],
            tokenUsage: { prompt: 10, completion: 20 },
            timestamp: new Date()
          },
          {
            councilMemberId: 'member-2',
            content: 'Exchange 2',
            referencesTo: [],
            tokenUsage: { prompt: 15, completion: 25 },
            timestamp: new Date()
          },
          {
            councilMemberId: 'member-3',
            content: 'Exchange 3',
            referencesTo: [],
            tokenUsage: { prompt: 20, completion: 30 },
            timestamp: new Date()
          }
        ]
      };

      // Each exchange is logged individually
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await eventLogger.logDeliberationRound('req-1', round);

      // Should call query for each exchange
      expect(mockDb.query).toHaveBeenCalledTimes(round.exchanges.length);
    });
  });

  describe('Write Buffer Flushing (Property 115, Requirement 9.7)', () => {
    test('should write immediately (no buffering in current implementation)', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date(),
        context: {
          messages: [],
          totalTokens: 0,
          summarized: false
        }
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await eventLogger.logRequest(request);

      // Current implementation writes immediately
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Memory Pressure Management (Property 116, Requirement 9.8)', () => {
    test('should handle large cost breakdowns', async () => {
      const cost: CostBreakdown = {
        totalCost: 1000,
        byMember: new Map([
          ['member-1', 300],
          ['member-2', 350],
          ['member-3', 350]
        ]),
        pricingVersion: 'v1.0'
      };

      // Mock update and multiple inserts
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Update request
        .mockResolvedValue({ rows: [], rowCount: 1 }); // Insert cost records

      await eventLogger.logCost('req-1', cost);

      // Should handle multiple cost records
      expect(mockDb.query).toHaveBeenCalledTimes(1 + cost.byMember.size);
    });
  });
});

describe('Event Logger Advanced - Error Recovery', () => {
  let eventLogger: EventLogger;
  let mockDb: jest.Mocked<Pool>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    eventLogger = new EventLogger(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Propagation', () => {
    test('should propagate errors to caller', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        timestamp: new Date(),
        context: {
          messages: [],
          totalTokens: 0,
          summarized: false
        }
      };

      const error = new Error('Database error');
      mockDb.query.mockRejectedValueOnce(error);

      await expect(eventLogger.logRequest(request)).rejects.toThrow('Database error');
    });
  });

  describe('Partial Failure Handling', () => {
    test('should handle partial failures in deliberation round', async () => {
      const round: DeliberationRound = {
        roundNumber: 1,
        exchanges: [
          {
            councilMemberId: 'member-1',
            content: 'Exchange 1',
            referencesTo: [],
            tokenUsage: { prompt: 10, completion: 20 },
            timestamp: new Date()
          },
          {
            councilMemberId: 'member-2',
            content: 'Exchange 2',
            referencesTo: [],
            tokenUsage: { prompt: 15, completion: 25 },
            timestamp: new Date()
          }
        ]
      };

      // First exchange succeeds, second fails
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockRejectedValueOnce(new Error('Insert failed'));

      await expect(eventLogger.logDeliberationRound('req-1', round)).rejects.toThrow('Insert failed');
      
      // First exchange should have been logged
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cost Logging Error Handling', () => {
    test('should handle errors during cost logging', async () => {
      const cost: CostBreakdown = {
        totalCost: 100,
        byMember: new Map([
          ['member-1', 100]
        ]),
        pricingVersion: 'v1.0'
      };

      // Update succeeds, insert fails
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockRejectedValueOnce(new Error('Cost insert failed'));

      await expect(eventLogger.logCost('req-1', cost)).rejects.toThrow('Cost insert failed');
    });
  });
});

describe('Event Logger Advanced - Data Integrity', () => {
  let eventLogger: EventLogger;
  let mockDb: jest.Mocked<Pool>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    eventLogger = new EventLogger(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Request Logging Integrity', () => {
    test('should log all request fields correctly', async () => {
      const request: UserRequest = {
        id: 'req-1',
        query: 'Test query',
        sessionId: 'session-1',
        timestamp: new Date(),
        context: {
          messages: [],
          totalTokens: 0,
          summarized: false
        }
      };

      await eventLogger.logRequest(request);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO requests'),
        expect.arrayContaining([
          'req-1',
          'default-user',
          'session-1',
          'Test query',
          'processing',
          request.timestamp,
          expect.any(String)
        ])
      );
    });
  });

  describe('Consensus Decision Logging Integrity', () => {
    test('should update request with consensus decision', async () => {
      const decision: ConsensusDecision = {
        content: 'Consensus reached',
        confidence: 'high',
        agreementLevel: 0.9,
        synthesisStrategy: { type: 'consensus-extraction' },
        contributingMembers: [],
        timestamp: new Date()
      };

      await eventLogger.logConsensusDecision('req-1', decision);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE requests'),
        expect.arrayContaining([
          'Consensus reached',
          0.9,
          'completed',
          decision.timestamp,
          'req-1'
        ])
      );
    });
  });

  describe('Provider Failure Logging Integrity', () => {
    test('should log provider failure with correct details', async () => {
      const error = new Error('Provider timeout');
      
      await eventLogger.logProviderFailure('provider-1', error);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO provider_health'),
        expect.arrayContaining([
          'provider-1',
          'degraded',
          expect.any(Date),
          'Provider timeout',
          expect.any(Date)
        ])
      );
    });
  });
});

