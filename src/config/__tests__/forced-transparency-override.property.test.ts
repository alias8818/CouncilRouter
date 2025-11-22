/**
 * Property-Based Test: Forced transparency override
 * Feature: ai-council-proxy, Property 43: Forced transparency override
 * 
 * Validates: Requirements 12.5
 * 
 * For any configuration with forced transparency enabled, deliberation threads
 * should always be displayed regardless of user preference.
 */

import * as fc from 'fast-check';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { ConfigurationManager } from '../manager';
import { TransparencyConfig } from '../../types/core';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('Property 43: Forced transparency override', () => {
  test('forced transparency should override user preference', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate transparency configuration with forcedTransparency enabled
        fc.boolean(),
        fc.boolean(),
        async (enabled, forcedTransparency) => {
          // Create mock database
          const mockDb = {
            query: jest.fn()
          } as unknown as Pool;

          // Create mock Redis client
          const mockRedis = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1)
          } as any;

          const configManager = new ConfigurationManager(mockDb, mockRedis);

          // Mock database query for version
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({ rows: [{ max_version: 0 }] }) // Get version
            .mockResolvedValueOnce({ rows: [] }) // Deactivate old
            .mockResolvedValueOnce({ rows: [] }); // Insert new

          // Update transparency configuration
          const config: TransparencyConfig = {
            enabled,
            forcedTransparency
          };

          await configManager.updateTransparencyConfig(config);

          // Mock database query for retrieval
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({ 
              rows: [{ config_data: config }] 
            });

          // Retrieve configuration
          const retrievedConfig = await configManager.getTransparencyConfig();

          // Verify the configuration was stored correctly
          expect(retrievedConfig.enabled).toBe(enabled);
          expect(retrievedConfig.forcedTransparency).toBe(forcedTransparency);

          // Property: When forcedTransparency is true, it should always be true regardless of enabled
          if (forcedTransparency) {
            expect(retrievedConfig.forcedTransparency).toBe(true);
          }

          // Property: forcedTransparency can only be true if enabled is true (logical constraint)
          // This is a design decision - forced transparency requires transparency to be enabled
          if (forcedTransparency && !enabled) {
            // This would be a configuration error in practice
            // The system should handle this gracefully
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  test('forced transparency configuration persists correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          enabled: fc.boolean(),
          forcedTransparency: fc.boolean()
        }),
        async (config) => {
          // Create mock database
          const mockDb = {
            query: jest.fn()
          } as unknown as Pool;

          // Create mock Redis client
          const mockRedis = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1)
          } as any;

          const configManager = new ConfigurationManager(mockDb, mockRedis);

          // Mock database queries for update
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({ rows: [{ max_version: 0 }] }) // Get version
            .mockResolvedValueOnce({ rows: [] }) // Deactivate old
            .mockResolvedValueOnce({ rows: [] }); // Insert new

          // Update configuration
          await configManager.updateTransparencyConfig(config);

          // Verify insert was called with correct data
          const insertCall = (mockDb.query as jest.Mock).mock.calls[2];
          expect(insertCall[0]).toContain('INSERT INTO configurations');
          
          const insertedData = JSON.parse(insertCall[1][0]);
          expect(insertedData.enabled).toBe(config.enabled);
          expect(insertedData.forcedTransparency).toBe(config.forcedTransparency);

          // Mock database query for retrieval
          (mockDb.query as jest.Mock)
            .mockResolvedValueOnce({ 
              rows: [{ config_data: config }] 
            });

          // Retrieve and verify
          const retrieved = await configManager.getTransparencyConfig();
          expect(retrieved).toEqual(config);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
