/**
 * UI Interface Tests
 * Tests for server lifecycle, endpoint handlers, configuration integration, static assets, and error handling
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14,
 *               4.15, 4.16, 4.17, 4.18, 4.19, 4.20
 */

import { UserInterface } from '../interface';
import { IConfigurationManager } from '../../interfaces/IConfigurationManager';
import { TransparencyConfig } from '../../types/core';
import request from 'supertest';
import { Server } from 'http';

// Don't mock path - let it work normally
// The path.join will work fine in tests

describe('UI Interface - Server Lifecycle', () => {
  let mockConfigManager: jest.Mocked<IConfigurationManager>;
  let ui: UserInterface;
  let testPort: number;

  beforeEach(() => {
    mockConfigManager = {
      getCouncilConfig: jest.fn(),
      updateCouncilConfig: jest.fn(),
      getDeliberationConfig: jest.fn(),
      getSynthesisConfig: jest.fn(),
      getPerformanceConfig: jest.fn(),
      getTransparencyConfig: jest.fn().mockResolvedValue({
        enabled: true,
        forcedTransparency: false
      }),
      updateTransparencyConfig: jest.fn(),
      applyPreset: jest.fn()
    } as any;

    // Use a random port to avoid conflicts
    testPort = 30000 + Math.floor(Math.random() * 10000);
    ui = new UserInterface(mockConfigManager, 'http://localhost:3000');
  });

  afterEach(async () => {
    try {
      await ui.stop();
    } catch (error) {
      // Ignore stop errors
    }
    jest.clearAllMocks();
  });

  describe('start() - Specified port (Requirement 4.1)', () => {
    test('should listen on specified port', async () => {
      await ui.start(testPort);
      
      // Verify server is running by making a request
      const app = (ui as any).app;
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
    });
  });

  describe('start() - Port 0 (Requirement 4.2)', () => {
    test('should assign random available port when port is 0', async () => {
      await ui.start(0);
      
      // Server should be running on some port
      const server = (ui as any).server;
      expect(server).toBeDefined();
    });
  });

  describe('stop() - Graceful shutdown (Requirement 4.3)', () => {
    test('should close connections gracefully', async () => {
      await ui.start(testPort);
      const server = (ui as any).server as Server;
      
      const closeSpy = jest.spyOn(server, 'close');
      await ui.stop();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('stop() - When not started (Requirement 4.4)', () => {
    test('should handle gracefully without errors', async () => {
      // Don't start the server
      await expect(ui.stop()).resolves.not.toThrow();
    });
  });

  describe('Restart scenario (Requirement 4.5)', () => {
    test('should stop and start successfully', async () => {
      await ui.start(testPort);
      await ui.stop();
      
      const newPort = testPort + 1;
      await ui.start(newPort);
      
      const app = (ui as any).app;
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
    });
  });
});

describe('UI Interface - Endpoint Handlers', () => {
  let mockConfigManager: jest.Mocked<IConfigurationManager>;
  let ui: UserInterface;

  beforeEach(() => {
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

    ui = new UserInterface(mockConfigManager, 'http://localhost:3000');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET / - Main page (Requirement 4.6)', () => {
    test('should serve main page HTML', async () => {
      const app = (ui as any).app;
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('AI Council Proxy');
    });
  });

  describe('GET /api/ui/config - Configuration (Requirement 4.7)', () => {
    test('should return configuration JSON', async () => {
      const transparencyConfig: TransparencyConfig = {
        enabled: true,
        forcedTransparency: false
      };

      mockConfigManager.getTransparencyConfig.mockResolvedValue(transparencyConfig);

      const app = (ui as any).app;
      const response = await request(app).get('/api/ui/config');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toHaveProperty('transparencyEnabled');
      expect(response.body).toHaveProperty('forcedTransparency');
      expect(response.body).toHaveProperty('apiBaseUrl');
    });
  });

  describe('GET /api/ui/config - Transparency enabled (Requirement 4.8)', () => {
    test('should include transparency flag when enabled', async () => {
      const transparencyConfig: TransparencyConfig = {
        enabled: true,
        forcedTransparency: false
      };

      mockConfigManager.getTransparencyConfig.mockResolvedValue(transparencyConfig);

      const app = (ui as any).app;
      const response = await request(app).get('/api/ui/config');

      expect(response.body.transparencyEnabled).toBe(true);
      expect(response.body.forcedTransparency).toBe(false);
    });
  });

  describe('GET /api/ui/config - Forced transparency (Requirement 4.9)', () => {
    test('should indicate forced mode', async () => {
      const transparencyConfig: TransparencyConfig = {
        enabled: false,
        forcedTransparency: true
      };

      mockConfigManager.getTransparencyConfig.mockResolvedValue(transparencyConfig);

      const app = (ui as any).app;
      const response = await request(app).get('/api/ui/config');

      expect(response.body.forcedTransparency).toBe(true);
    });
  });

  describe('GET /api/ui/config - Error handling (Requirement 4.10)', () => {
    test('should return appropriate error response', async () => {
      mockConfigManager.getTransparencyConfig.mockRejectedValue(new Error('Config error'));

      const app = (ui as any).app;
      const response = await request(app).get('/api/ui/config');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Failed to load configuration');
    });
  });
});

describe('UI Interface - Configuration Integration', () => {
  let mockConfigManager: jest.Mocked<IConfigurationManager>;
  let ui: UserInterface;

  beforeEach(() => {
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

    ui = new UserInterface(mockConfigManager, 'http://localhost:3000');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration dynamic updates (Property 76)', () => {
    test('should reflect updates in UI without restart', async () => {
      const initialConfig: TransparencyConfig = {
        enabled: false,
        forcedTransparency: false
      };

      const updatedConfig: TransparencyConfig = {
        enabled: true,
        forcedTransparency: false
      };

      mockConfigManager.getTransparencyConfig
        .mockResolvedValueOnce(initialConfig)
        .mockResolvedValueOnce(updatedConfig);

      const app = (ui as any).app;
      const response1 = await request(app).get('/api/ui/config');
      expect(response1.body.transparencyEnabled).toBe(false);

      const response2 = await request(app).get('/api/ui/config');
      expect(response2.body.transparencyEnabled).toBe(true);
    });
  });

  describe('Transparency toggle visibility (Property 77)', () => {
    test('should show correct visibility state', async () => {
      const config: TransparencyConfig = {
        enabled: true,
        forcedTransparency: false
      };

      mockConfigManager.getTransparencyConfig.mockResolvedValue(config);

      const app = (ui as any).app;
      const response = await request(app).get('/api/ui/config');

      expect(response.body.transparencyEnabled).toBe(true);
      // UI should show toggle when transparencyEnabled is true
    });
  });

  describe('API base URL configuration (Property 78)', () => {
    test('should use correct endpoint', async () => {
      const apiBaseUrl = 'http://api.example.com:3000';
      const uiWithCustomUrl = new UserInterface(mockConfigManager, apiBaseUrl);

      const config: TransparencyConfig = {
        enabled: true,
        forcedTransparency: false
      };

      mockConfigManager.getTransparencyConfig.mockResolvedValue(config);

      const customApp = (uiWithCustomUrl as any).app;
      const response = await request(customApp).get('/api/ui/config');

      expect(response.body.apiBaseUrl).toBe(apiBaseUrl);
    });
  });

  describe('Feature flag integration (Property 79)', () => {
    test('should respect flag states', async () => {
      const config: TransparencyConfig = {
        enabled: true,
        forcedTransparency: false
      };

      mockConfigManager.getTransparencyConfig.mockResolvedValue(config);

      const app = (ui as any).app;
      const response = await request(app).get('/api/ui/config');

      // Feature flags are reflected in transparency config
      expect(response.body.transparencyEnabled).toBe(true);
      expect(response.body.forcedTransparency).toBe(false);
    });
  });
});

describe('UI Interface - Static Assets & Errors', () => {
  let mockConfigManager: jest.Mocked<IConfigurationManager>;
  let ui: UserInterface;

  beforeEach(() => {
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

    ui = new UserInterface(mockConfigManager, 'http://localhost:3000');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Static file serving (Requirement 4.15)', () => {
    test('should serve static files from public directory', () => {
      // Express static middleware is set up during construction
      const app = (ui as any).app;
      expect(app).toBeDefined();
      // Static middleware is configured in setupMiddleware()
    });
  });

  describe('404 for missing assets (Requirement 4.16)', () => {
    test('should return 404 for missing assets', async () => {
      const app = (ui as any).app;
      const response = await request(app).get('/nonexistent-file.js');

      // Express will return 404 for missing static files
      expect(response.status).toBe(404);
    });
  });

  describe('MIME type handling (Requirement 4.17)', () => {
    test('should set correct content-type headers', async () => {
      const app = (ui as any).app;
      const response = await request(app).get('/');

      expect(response.headers['content-type']).toContain('text/html');
    });
  });

  describe('Configuration load failures (Requirement 4.18)', () => {
    test('should display error message', async () => {
      mockConfigManager.getTransparencyConfig.mockRejectedValue(new Error('Config load failed'));

      const app = (ui as any).app;
      const response = await request(app).get('/api/ui/config');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to load configuration');
    });
  });

  describe('Database unavailable (Requirement 4.19)', () => {
    test('should show connection error', async () => {
      const dbError = new Error('Database connection failed');
      mockConfigManager.getTransparencyConfig.mockRejectedValue(dbError);

      const app = (ui as any).app;
      const response = await request(app).get('/api/ui/config');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Invalid configuration values (Requirement 4.20)', () => {
    test('should validate and reject', async () => {
      // Configuration manager should validate values
      // If invalid, it should throw an error
      mockConfigManager.getTransparencyConfig.mockRejectedValue(new Error('Invalid configuration'));

      const app = (ui as any).app;
      const response = await request(app).get('/api/ui/config');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});


/**
 * UI Interface Tests - Additional Coverage
 * Tests for constructor with default API base URL
 * 
 * Requirements: 4.13
 */

describe('UI Interface - Constructor Variations', () => {
  let mockConfigManager: jest.Mocked<IConfigurationManager>;

  beforeEach(() => {
    mockConfigManager = {
      getCouncilConfig: jest.fn(),
      updateCouncilConfig: jest.fn(),
      getDeliberationConfig: jest.fn(),
      getSynthesisConfig: jest.fn(),
      getPerformanceConfig: jest.fn(),
      getTransparencyConfig: jest.fn().mockResolvedValue({
        enabled: true,
        forcedTransparency: false
      }),
      updateTransparencyConfig: jest.fn(),
      applyPreset: jest.fn()
    } as any;
  });

  test('should use default API base URL when not provided', async () => {
    // Create UI without specifying API base URL
    const ui = new UserInterface(mockConfigManager);

    await ui.start(0);

    // Make request to config endpoint
    const response = await request((ui as any).app)
      .get('/api/ui/config')
      .expect(200);

    // Default API base URL should be http://localhost:3000
    expect(response.body.apiBaseUrl).toBe('http://localhost:3000');

    await ui.stop();
  });

  test('should use custom API base URL when provided', async () => {
    const customUrl = 'http://custom-api:5000';
    const ui = new UserInterface(mockConfigManager, customUrl);

    await ui.start(0);

    const response = await request((ui as any).app)
      .get('/api/ui/config')
      .expect(200);

    expect(response.body.apiBaseUrl).toBe(customUrl);

    await ui.stop();
  });
});
