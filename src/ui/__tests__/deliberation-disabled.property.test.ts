/**
 * Property-Based Test: Deliberation hiding when disabled
 * Feature: ai-council-proxy, Property 42: Deliberation hiding when disabled
 * 
 * Validates: Requirements 12.4
 */

import * as fc from 'fast-check';
import { UserInterface } from '../interface';
import { ConfigurationManager } from '../../config/manager';
import { Pool } from 'pg';
import { createClient } from 'redis';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('Property 42: Deliberation hiding when disabled', () => {
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
   * Property: For any user interface with transparency mode disabled,
   * the output should contain only the consensus decision without deliberation details.
   */
  test('output contains only consensus when transparency disabled', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 500 }),
        fc.array(fc.string({ minLength: 10, maxLength: 200 }), { minLength: 1, maxLength: 10 }),
        
        async (consensusContent, deliberationItems) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify that when transparency is disabled, deliberation section is hidden
          // Check CSS rules
          expect(html).toMatch(/\.deliberation-section\s*\{[^}]*display:\s*none/);
          
          // Verify transparency toggle is also hidden by default
          expect(html).toMatch(/\.transparency-toggle\s*\{[^}]*display:\s*none/);
          
          // Verify that response content is in a separate div from deliberation
          expect(html).toContain('<div id="responseContent" class="response-content"></div>');
          expect(html).toContain('<div id="deliberationSection" class="deliberation-section">');
          
          // Verify they are separate elements
          const responseContentIndex = html.indexOf('id="responseContent"');
          const deliberationSectionIndex = html.indexOf('id="deliberationSection"');
          
          expect(responseContentIndex).toBeGreaterThan(0);
          expect(deliberationSectionIndex).toBeGreaterThan(0);
          expect(responseContentIndex).not.toBe(deliberationSectionIndex);
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Property: When transparency is disabled, deliberation data is not displayed
   * even if it exists
   */
  test('deliberation data not displayed when transparency disabled', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        
        async (_) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify that deliberation section requires explicit visible class
          expect(html).toMatch(/\.deliberation-section\.visible\s*\{[^}]*display:\s*block/);
          
          // Verify that without the visible class, it's hidden
          const deliberationSectionMatch = html.match(/<div id="deliberationSection" class="deliberation-section">/);
          expect(deliberationSectionMatch).toBeTruthy();
          
          // Verify the class does not include 'visible' by default
          if (deliberationSectionMatch) {
            expect(deliberationSectionMatch[0]).not.toContain('deliberation-section visible');
            expect(deliberationSectionMatch[0]).toContain('deliberation-section">');
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Property: Response display function only shows consensus content
   */
  test('displayResponse function only updates consensus content area', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 500 }),
        
        async (content) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify displayResponse function exists
          expect(html).toContain('function displayResponse(content)');
          
          // Verify it updates responseContent, not deliberationContent directly
          const displayResponseMatch = html.match(/function displayResponse\(content\)\s*\{[\s\S]*?\n\s*\}/);
          expect(displayResponseMatch).toBeTruthy();
          
          if (displayResponseMatch) {
            const displayResponseCode = displayResponseMatch[0];
            
            // Verify it sets responseContent
            expect(displayResponseCode).toContain("getElementById('responseContent')");
            expect(displayResponseCode).toContain('responseContent.textContent = content');
            
            // Verify it makes response section visible
            expect(displayResponseCode).toContain("classList.add('visible')");
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Property: Deliberation loading is conditional on transparency being enabled
   */
  test('deliberation loading conditional on transparency enabled', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        
        async (_) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify displayResponse checks transparency before loading deliberation
          const displayResponseMatch = html.match(/function displayResponse\(content\)\s*\{[\s\S]*?\n\s*\}/);
          expect(displayResponseMatch).toBeTruthy();
          
          if (displayResponseMatch) {
            const displayResponseCode = displayResponseMatch[0];
            
            // Verify conditional deliberation loading
            expect(displayResponseCode).toContain('if (config.transparencyEnabled');
            expect(displayResponseCode).toContain('loadDeliberationData');
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Property: New request resets deliberation visibility
   */
  test('new request hides deliberation section', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        
        async (_) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify newRequest function hides deliberation
          const newRequestMatch = html.match(/function newRequest\(\)\s*\{[\s\S]*?\n\s*\}/);
          expect(newRequestMatch).toBeTruthy();
          
          if (newRequestMatch) {
            const newRequestCode = newRequestMatch[0];
            
            // Verify it removes visible class from deliberation section
            expect(newRequestCode).toContain("getElementById('deliberationSection')");
            expect(newRequestCode).toContain("classList.remove('visible')");
            
            // Verify it resets deliberation visibility flag
            expect(newRequestCode).toContain('deliberationVisible = false');
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
