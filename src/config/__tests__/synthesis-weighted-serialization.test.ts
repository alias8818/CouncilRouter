// @ts-nocheck

/**
 * Unit Test: Weighted-Fusion Synthesis Config Serialization
 * Ensures strategy weights survive the update/get round trip.
 */

import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { ConfigurationManager } from '../manager';
import { SynthesisConfig } from '../../types/core';

jest.mock('pg');
jest.mock('redis');

describe('ConfigurationManager synthesis serialization', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let configManager: ConfigurationManager;
  let configStorage: Map<string, any>;

  beforeEach(() => {
    configStorage = new Map();

    const queryMock = jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('INSERT INTO configurations')) {
        const configData = params?.[0];
        const version = params?.[1];
        configStorage.set('synthesis', {
          config_data: configData,
          version,
          active: true
        });
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('MAX(version)')) {
        const stored = configStorage.get('synthesis');
        return { rows: [{ max_version: stored?.version || 0 }], rowCount: 1 };
      }

      if (sql.includes('SELECT config_data FROM configurations')) {
        const stored = configStorage.get('synthesis');
        if (stored) {
          return { rows: [{ config_data: stored.config_data }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('UPDATE configurations SET active = false')) {
        return { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    });

    mockDb = ({ query: queryMock } as unknown) as jest.Mocked<Pool>;

    const redisCache = new Map<string, string>();
    const redisImpl = {
      get: jest.fn().mockImplementation(async (key: string) => redisCache.get(key) ?? null),
      set: jest.fn().mockImplementation(async (key: string, value: string) => {
        redisCache.set(key, value);
        return 'OK';
      }),
      del: jest.fn().mockImplementation(async (key: string) => {
        redisCache.delete(key);
        return 1;
      })
    };

    mockRedis = (redisImpl as unknown) as jest.Mocked<RedisClientType>;

    configManager = new ConfigurationManager(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
    configStorage.clear();
  });

  it('round-trips weighted-fusion strategy weights through persistence', async () => {
    const strategyWeights = new Map<string, number>([
      ['member-a', 0.6],
      ['member-b', 0.4]
    ]);

    const synthesisWeights = new Map<string, number>([
      ['member-a', 1.2],
      ['member-b', 0.8]
    ]);

    const config: SynthesisConfig = {
      strategy: { type: 'weighted-fusion', weights: strategyWeights },
      weights: synthesisWeights
    };

    await configManager.updateSynthesisConfig(config);

    const retrieved = await configManager.getSynthesisConfig();

    if (retrieved.strategy.type !== 'weighted-fusion') {
      throw new Error('Expected weighted-fusion strategy');
    }
    expect(retrieved.strategy.weights).toBeInstanceOf(Map);
    expect(Array.from(retrieved.strategy.weights.entries())).toEqual(
      Array.from(strategyWeights.entries())
    );

    expect(retrieved.weights).toBeInstanceOf(Map);
    expect(Array.from(retrieved.weights!.entries())).toEqual(Array.from(synthesisWeights.entries()));
  });
});
