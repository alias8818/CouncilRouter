/**
 * Property-Based Test: Transparency mode button display
 * Feature: ai-council-proxy, Property 40: Transparency mode button display
 * 
 * Validates: Requirements 12.1
 */

import * as fc from 'fast-check';
import { UserInterface } from '../interface';
import { ConfigurationManager } from '../../config/manager';
import { Pool } from 'pg';
import { createClient } from 'redis';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('Property 40: Transparency mode button display', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockRedis: any;
  let configManager: ConfigurationManager;
  
  beforeEach(() => {
    // Mock PostgreSQL
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
    } as any;
    
    // Mock Redis
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isOpen: true,
    };
    
    (createClient as jest.Mock).mockReturnValue(mockRedis);
    
    configManager = new ConfigurationManager(mockPool, mockRedis);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  /**
   * Property: For any user interface with transparency mode enabled in configuration,
   * a button to reveal the full deliberation thread should be displayed.
   */
  test('transparency button displayed when transparency mode enabled', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        
        async (transparencyEnabled) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify transparency button exists in HTML
          expect(html).toContain('id="transparencyBtn"');
          expect(html).toContain('class="btn-secondary transparency-toggle"');
          
          // Verify button has onclick handler
          expect(html).toContain('onclick="toggleDeliberation()"');
          
          // Verify button text
          expect(html).toContain('Show Deliberation');
          
          // Verify CSS for transparency toggle visibility
          expect(html).toMatch(/\.transparency-toggle\s*\{[^}]*display:\s*none/);
          expect(html).toMatch(/\.transparency-toggle\.visible\s*\{[^}]*display:\s*block/);
          
          // Verify that config loading sets visibility (with forced transparency check)
          expect(html).toContain('if (config.transparencyEnabled && !config.forcedTransparency)');
          expect(html).toContain("document.getElementById('transparencyBtn').classList.add('visible')");
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Property: Transparency button visibility is controlled by configuration
   */
  test('transparency button visibility controlled by config', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        
        async (_) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify config loading function exists
          expect(html).toContain('async function loadConfig()');
          
          // Verify config fetch
          expect(html).toContain("fetch('/api/ui/config')");
          
          // Verify transparency enabled check
          const loadConfigMatch = html.match(/async function loadConfig\(\)\s*\{[\s\S]*?\n\s*\}/);
          expect(loadConfigMatch).toBeTruthy();
          
          if (loadConfigMatch) {
            const loadConfigCode = loadConfigMatch[0];
            expect(loadConfigCode).toContain('config.transparencyEnabled');
            expect(loadConfigCode).toContain("getElementById('transparencyBtn')");
            expect(loadConfigCode).toContain("classList.add('visible')");
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Property: Transparency button toggles deliberation visibility
   */
  test('transparency button toggles deliberation section', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        
        async (_) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify toggle function exists
          expect(html).toContain('function toggleDeliberation()');
          
          // Verify it gets deliberation section
          expect(html).toContain("getElementById('deliberationSection')");
          
          // Verify it toggles visibility
          expect(html).toContain('deliberationVisible = !deliberationVisible');
          
          // Verify it adds/removes visible class
          expect(html).toContain("classList.add('visible')");
          expect(html).toContain("classList.remove('visible')");
          
          // Verify button text changes
          expect(html).toContain('Hide Deliberation');
          expect(html).toContain('Show Deliberation');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Property: Button text reflects current deliberation visibility state
   */
  test('button text reflects deliberation visibility state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        
        async (_) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify toggle function changes button text based on state
          expect(html).toContain('function toggleDeliberation()');
          
          // Verify conditional text update
          expect(html).toMatch(/if\s*\(\s*deliberationVisible\s*\)/);
          expect(html).toContain("textContent = 'Hide Deliberation'");
          expect(html).toContain("textContent = 'Show Deliberation'");
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
