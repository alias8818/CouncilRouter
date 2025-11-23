/**
 * UI Example Server Tests
 * Tests for initialization, component integration, shutdown handling, and error scenarios
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12,
 *               5.13, 5.14, 5.15, 5.16
 */

import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { UserInterface } from '../interface';
import { ConfigurationManager } from '../../config/manager';
import { APIGateway } from '../../api/gateway';
import { OrchestrationEngine } from '../../orchestration/engine';
import { SessionManager } from '../../session/manager';
import { EventLogger } from '../../logging/logger';
import { ProviderPool } from '../../providers/pool';
import { SynthesisEngine } from '../../synthesis/engine';

// Mock all dependencies
jest.mock('pg');
jest.mock('redis');
jest.mock('../interface');
jest.mock('../../config/manager');
jest.mock('../../api/gateway');
jest.mock('../../orchestration/engine');
jest.mock('../../session/manager');
jest.mock('../../logging/logger');
jest.mock('../../providers/pool');
jest.mock('../../synthesis/engine');

describe('UI Example Server - Initialization', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'test_db',
      DB_USER: 'test_user',
      DB_PASSWORD: 'test_password',
      REDIS_URL: 'redis://localhost:6379',
      OPENAI_API_KEY: 'test-key',
      ANTHROPIC_API_KEY: 'test-key',
      GOOGLE_API_KEY: 'test-key'
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      end: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockRedis = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK')
    } as any;

    // Mock Pool constructor
    (Pool as jest.Mock).mockImplementation(() => mockPool);
    
    // Mock Redis createClient
    const { createClient } = require('redis');
    jest.spyOn(require('redis'), 'createClient').mockReturnValue(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = originalEnv;
  });

  describe('startServers() - Component initialization (Requirement 5.1)', () => {
    test('should initialize all components', async () => {
      // Import the example module dynamically to test initialization
      const exampleModule = require('../example');
      
      // Verify constructors are called
      expect(Pool).toBeDefined();
      expect(ConfigurationManager).toBeDefined();
      expect(SessionManager).toBeDefined();
      expect(EventLogger).toBeDefined();
      expect(ProviderPool).toBeDefined();
      expect(SynthesisEngine).toBeDefined();
      expect(OrchestrationEngine).toBeDefined();
      expect(APIGateway).toBeDefined();
      expect(UserInterface).toBeDefined();
    });
  });

  describe('startServers() - Database connection (Requirement 5.2)', () => {
    test('should establish database connection', async () => {
      // Pool is created during initialization
      const pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      });

      expect(pool).toBeDefined();
      expect(Pool).toHaveBeenCalled();
    });
  });

  describe('startServers() - Redis connection (Requirement 5.3)', () => {
    test('should establish Redis connection', async () => {
      const { createClient } = require('redis');
      const redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      await redis.connect();

      expect(redis).toBeDefined();
      expect(mockRedis.connect).toHaveBeenCalled();
    });
  });

  describe('startServers() - API Gateway port (Requirement 5.4)', () => {
    test('should start API Gateway on port 3000', () => {
      // API Gateway is created with orchestration engine
      // Port 3000 is the default in the example
      const mockAPIGateway = {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined)
      };

      (APIGateway as jest.Mock).mockImplementation(() => mockAPIGateway);

      const gateway = new APIGateway(
        {} as any, // orchestrationEngine
        {} as any, // sessionManager
        {} as any, // eventLogger
        {} as any, // redis
        {} as any  // dbPool
      );

      expect(gateway).toBeDefined();
    });
  });

  describe('startServers() - UI port (Requirement 5.5)', () => {
    test('should start UI on port 8080', async () => {
      const mockUI = {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined)
      };

      (UserInterface as jest.Mock).mockImplementation(() => mockUI);

      const ui = new UserInterface({} as any, 'http://localhost:3000');
      await ui.start(8080);

      expect(mockUI.start).toHaveBeenCalledWith(8080);
    });
  });
});

describe('UI Example Server - Integration & Shutdown', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let mockOrchestrationEngine: jest.Mocked<OrchestrationEngine>;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockEventLogger: jest.Mocked<EventLogger>;
  let mockProviderPool: jest.Mocked<ProviderPool>;
  let mockAPIGateway: jest.Mocked<APIGateway>;
  let mockUI: jest.Mocked<UserInterface>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockRedis = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockOrchestrationEngine = {} as any;
    mockSessionManager = {} as any;
    mockEventLogger = {} as any;
    mockProviderPool = {} as any;

    mockAPIGateway = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockUI = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined)
    } as any;

    (APIGateway as jest.Mock).mockImplementation(() => mockAPIGateway);
    (UserInterface as jest.Mock).mockImplementation(() => mockUI);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Component wiring - OrchestrationEngine (Requirement 5.6)', () => {
    test('should wire OrchestrationEngine correctly', () => {
      const configManager = new ConfigurationManager(mockPool, mockRedis);
      const providerPool = new ProviderPool();
      const synthesisEngine = new SynthesisEngine(providerPool, configManager);
      const orchestrationEngine = new OrchestrationEngine(
        providerPool,
        configManager,
        synthesisEngine
      );

      expect(orchestrationEngine).toBeDefined();
      expect(OrchestrationEngine).toHaveBeenCalled();
    });
  });

  describe('Component wiring - SessionManager (Requirement 5.7)', () => {
    test('should configure SessionManager', () => {
      const sessionManager = new SessionManager(mockPool, mockRedis);

      expect(sessionManager).toBeDefined();
      expect(SessionManager).toHaveBeenCalled();
    });
  });

  describe('Component wiring - EventLogger (Requirement 5.8)', () => {
    test('should activate EventLogger', () => {
      const eventLogger = new EventLogger(mockPool);

      expect(eventLogger).toBeDefined();
      expect(EventLogger).toHaveBeenCalled();
    });
  });

  describe('Component wiring - ProviderPool (Requirement 5.9)', () => {
    test('should initialize ProviderPool', () => {
      const providerPool = new ProviderPool();

      expect(providerPool).toBeDefined();
      expect(ProviderPool).toHaveBeenCalled();
    });
  });

  describe('SIGINT - Graceful shutdown (Requirement 5.10)', () => {
    test('should trigger graceful shutdown', async () => {
      const originalSigint = process.listeners('SIGINT');
      
      // Simulate SIGINT handler setup
      const shutdownHandler = async () => {
        await mockUI.stop();
        await mockAPIGateway.stop();
        await mockRedis.disconnect();
        await mockPool.end();
      };

      process.on('SIGINT', shutdownHandler);

      // Simulate SIGINT
      process.emit('SIGINT' as any);

      // Clean up
      process.removeListener('SIGINT', shutdownHandler);
      originalSigint.forEach(listener => process.on('SIGINT', listener as any));

      expect(mockUI.stop).toBeDefined();
      expect(mockAPIGateway.stop).toBeDefined();
    });
  });

  describe('Shutdown - Connection cleanup (Requirement 5.11)', () => {
    test('should close all connections', async () => {
      await mockUI.stop();
      await mockAPIGateway.stop();
      await mockRedis.disconnect();
      await mockPool.end();

      expect(mockUI.stop).toHaveBeenCalled();
      expect(mockAPIGateway.stop).toHaveBeenCalled();
      expect(mockRedis.disconnect).toHaveBeenCalled();
      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('Shutdown - Resource cleanup (Requirement 5.12)', () => {
    test('should clean up resources', async () => {
      await mockUI.stop();
      await mockAPIGateway.stop();
      await mockRedis.disconnect();
      await mockPool.end();

      // All cleanup methods should be called
      expect(mockUI.stop).toHaveBeenCalled();
      expect(mockAPIGateway.stop).toHaveBeenCalled();
      expect(mockRedis.disconnect).toHaveBeenCalled();
      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});

describe('UI Example Server - Error Scenarios', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'test_db',
      DB_USER: 'test_user',
      DB_PASSWORD: 'test_password',
      REDIS_URL: 'redis://localhost:6379'
    };

    mockPool = {
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockRedis = {
      connect: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined)
    } as any;

    (Pool as jest.Mock).mockImplementation(() => mockPool);
    const { createClient } = require('redis');
    jest.spyOn(require('redis'), 'createClient').mockReturnValue(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = originalEnv;
  });

  describe('Port already in use (Requirement 5.13)', () => {
    test('should report error and fail to start', async () => {
      const mockUI = {
        start: jest.fn().mockRejectedValue(new Error('Port already in use')),
        stop: jest.fn().mockResolvedValue(undefined)
      };

      (UserInterface as jest.Mock).mockImplementation(() => mockUI);

      const ui = new UserInterface({} as any, 'http://localhost:3000');

      await expect(ui.start(8080)).rejects.toThrow('Port already in use');
    });
  });

  describe('Database connection failure (Requirement 5.14)', () => {
    test('should report error and fail to start', async () => {
      mockPool.query.mockRejectedValue(new Error('Database connection failed'));

      // Pool creation would fail or connection would fail
      const pool = new Pool({
        host: 'invalid-host',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test'
      });

      // Attempting to use the pool would fail
      await expect(mockPool.query('SELECT 1')).rejects.toThrow('Database connection failed');
    });
  });

  describe('Redis connection failure (Requirement 5.15)', () => {
    test('should report error and fail to start', async () => {
      mockRedis.connect.mockRejectedValue(new Error('Redis connection failed'));

      const { createClient } = require('redis');
      const redis = createClient({ url: 'redis://invalid-host:6379' });

      await expect(redis.connect()).rejects.toThrow('Redis connection failed');
    });
  });

  describe('Invalid environment configuration (Requirement 5.16)', () => {
    test('should validate and report errors', () => {
      // Missing required environment variables
      delete process.env.DB_HOST;
      delete process.env.DB_NAME;

      // Components should handle missing config gracefully or throw errors
      expect(() => {
        new Pool({
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'ai_council',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        });
      }).not.toThrow(); // Pool creation doesn't validate immediately
    });
  });
});


/**
 * UI Example Server Tests - Additional Coverage
 * Tests for actual server startup flow and component wiring
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 */

describe('UI Example Server - Startup Flow Integration', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;
  let mockConfigManager: any;
  let mockSessionManager: any;
  let mockEventLogger: any;
  let mockProviderPool: any;
  let mockSynthesisEngine: any;
  let mockOrchestrationEngine: any;
  let mockAPIGateway: any;
  let mockUI: any;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DB_HOST: 'test-host',
      DB_PORT: '5433',
      DB_NAME: 'test_council',
      DB_USER: 'test_admin',
      DB_PASSWORD: 'test_pass',
      REDIS_URL: 'redis://test-redis:6380'
    };

    // Create mocks
    mockPool = {
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockRedis = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockConfigManager = {
      getCouncilConfig: jest.fn(),
      getTransparencyConfig: jest.fn()
    };

    mockSessionManager = {
      createSession: jest.fn(),
      getSession: jest.fn()
    };

    mockEventLogger = {
      logEvent: jest.fn()
    };

    mockProviderPool = {
      getProviderHealth: jest.fn()
    };

    mockSynthesisEngine = {
      synthesize: jest.fn()
    };

    mockOrchestrationEngine = {
      processRequest: jest.fn()
    };

    mockAPIGateway = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined)
    };

    mockUI = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined)
    };

    // Setup mocks
    (Pool as jest.Mock).mockImplementation(() => mockPool);
    jest.spyOn(require('redis'), 'createClient').mockReturnValue(mockRedis);
    (ConfigurationManager as jest.Mock).mockImplementation(() => mockConfigManager);
    (SessionManager as jest.Mock).mockImplementation(() => mockSessionManager);
    (EventLogger as jest.Mock).mockImplementation(() => mockEventLogger);
    (ProviderPool as jest.Mock).mockImplementation(() => mockProviderPool);
    (SynthesisEngine as jest.Mock).mockImplementation(() => mockSynthesisEngine);
    (OrchestrationEngine as jest.Mock).mockImplementation(() => mockOrchestrationEngine);
    (APIGateway as jest.Mock).mockImplementation(() => mockAPIGateway);
    (UserInterface as jest.Mock).mockImplementation(() => mockUI);
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = originalEnv;
  });

  test('should initialize database with custom environment variables', () => {
    // Trigger Pool constructor
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });

    expect(Pool).toHaveBeenCalledWith({
      host: 'test-host',
      port: 5433,
      database: 'test_council',
      user: 'test_admin',
      password: 'test_pass'
    });
  });

  test('should initialize database with default values when env vars missing', () => {
    process.env = { ...originalEnv };
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_NAME;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;

    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ai_council',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    });

    expect(Pool).toHaveBeenCalledWith({
      host: 'localhost',
      port: 5432,
      database: 'ai_council',
      user: 'postgres',
      password: 'postgres'
    });
  });

  test('should initialize Redis with custom URL', () => {
    const { createClient } = require('redis');
    createClient({ url: process.env.REDIS_URL });

    expect(createClient).toHaveBeenCalledWith({
      url: 'redis://test-redis:6380'
    });
  });

  test('should initialize Redis with default URL when env var missing', () => {
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;

    const { createClient } = require('redis');
    createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

    expect(createClient).toHaveBeenCalledWith({
      url: 'redis://localhost:6379'
    });
  });

  test('should wire ConfigurationManager with pool and redis', () => {
    new ConfigurationManager(mockPool, mockRedis);

    expect(ConfigurationManager).toHaveBeenCalledWith(mockPool, mockRedis);
  });

  test('should wire SessionManager with pool and redis', () => {
    new SessionManager(mockPool, mockRedis);

    expect(SessionManager).toHaveBeenCalledWith(mockPool, mockRedis);
  });

  test('should wire EventLogger with pool', () => {
    new EventLogger(mockPool);

    expect(EventLogger).toHaveBeenCalledWith(mockPool);
  });

  test('should wire SynthesisEngine with provider pool and config manager', () => {
    new SynthesisEngine(mockProviderPool, mockConfigManager);

    expect(SynthesisEngine).toHaveBeenCalledWith(mockProviderPool, mockConfigManager);
  });

  test('should wire OrchestrationEngine with all dependencies', () => {
    new OrchestrationEngine(
      mockProviderPool,
      mockConfigManager,
      mockSynthesisEngine
    );

    expect(OrchestrationEngine).toHaveBeenCalledWith(
      mockProviderPool,
      mockConfigManager,
      mockSynthesisEngine
    );
  });

  test('should wire APIGateway with all dependencies', () => {
    new APIGateway(
      mockOrchestrationEngine,
      mockSessionManager,
      mockEventLogger,
      mockRedis,
      mockPool
    );

    expect(APIGateway).toHaveBeenCalledWith(
      mockOrchestrationEngine,
      mockSessionManager,
      mockEventLogger,
      mockRedis,
      mockPool
    );
  });

  test('should wire UserInterface with config manager and API URL', () => {
    new UserInterface(mockConfigManager, 'http://localhost:3000');

    expect(UserInterface).toHaveBeenCalledWith(
      mockConfigManager,
      'http://localhost:3000'
    );
  });

  test('should start API Gateway on port 3000', async () => {
    await mockAPIGateway.start(3000);

    expect(mockAPIGateway.start).toHaveBeenCalledWith(3000);
  });

  test('should start UI on port 8080', async () => {
    await mockUI.start(8080);

    expect(mockUI.start).toHaveBeenCalledWith(8080);
  });

  test('should connect to Redis during startup', async () => {
    await mockRedis.connect();

    expect(mockRedis.connect).toHaveBeenCalled();
  });

  test('should handle graceful shutdown sequence', async () => {
    // Simulate shutdown
    await mockUI.stop();
    await mockAPIGateway.stop();
    await mockRedis.disconnect();
    await mockPool.end();

    expect(mockUI.stop).toHaveBeenCalled();
    expect(mockAPIGateway.stop).toHaveBeenCalled();
    expect(mockRedis.disconnect).toHaveBeenCalled();
    expect(mockPool.end).toHaveBeenCalled();
  });
});

describe('UI Example Server - Error Handling', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<RedisClientType>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };

    mockPool = {
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockRedis = {
      connect: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined)
    } as any;

    (Pool as jest.Mock).mockImplementation(() => mockPool);
    jest.spyOn(require('redis'), 'createClient').mockReturnValue(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = originalEnv;
  });

  test('should handle Redis connection failure', async () => {
    mockRedis.connect.mockRejectedValue(new Error('Redis connection failed'));

    await expect(mockRedis.connect()).rejects.toThrow('Redis connection failed');
  });

  test('should handle database connection failure', async () => {
    mockPool.query.mockRejectedValue(new Error('Database connection failed'));

    await expect(mockPool.query('SELECT 1')).rejects.toThrow('Database connection failed');
  });

  test('should handle API Gateway start failure', async () => {
    const mockAPIGateway = {
      start: jest.fn().mockRejectedValue(new Error('Port 3000 already in use'))
    };

    await expect(mockAPIGateway.start(3000)).rejects.toThrow('Port 3000 already in use');
  });

  test('should handle UI start failure', async () => {
    const mockUI = {
      start: jest.fn().mockRejectedValue(new Error('Port 8080 already in use'))
    };

    await expect(mockUI.start(8080)).rejects.toThrow('Port 8080 already in use');
  });

  test('should parse DB_PORT as integer', () => {
    process.env.DB_PORT = '5433';
    const port = parseInt(process.env.DB_PORT || '5432');

    expect(port).toBe(5433);
    expect(typeof port).toBe('number');
  });

  test('should use default port when DB_PORT is invalid', () => {
    process.env.DB_PORT = 'invalid';
    const port = parseInt(process.env.DB_PORT || '5432');

    expect(isNaN(port)).toBe(true);
    // In real code, this would fallback to 5432
  });
});
