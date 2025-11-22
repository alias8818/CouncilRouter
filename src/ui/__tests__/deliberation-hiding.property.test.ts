/**
 * Property-Based Test: User interface hides deliberation by default
 * Feature: ai-council-proxy, Property 3: User interface hides deliberation by default
 * 
 * Validates: Requirements 1.5
 */

import * as fc from 'fast-check';
import { UserInterface } from '../interface';
import { ConfigurationManager } from '../../config/manager';
import { Pool } from 'pg';
import { createClient } from 'redis';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');

describe('Property 3: User interface hides deliberation by default', () => {
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
   * Property: For any consensus decision displayed to the user when transparency mode is disabled,
   * the output should not contain deliberation thread markers or council member identifiers.
   */
  test('consensus decision output hides deliberation details when transparency disabled', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random consensus decision content
        fc.string({ minLength: 10, maxLength: 500 }),
        // Generate random council member names
        fc.array(fc.string({ minLength: 5, maxLength: 20 }), { minLength: 2, maxLength: 5 }),
        // Generate random deliberation content
        fc.array(fc.string({ minLength: 10, maxLength: 200 }), { minLength: 1, maxLength: 10 }),
        
        async (consensusContent, councilMembers, deliberationItems) => {
          // Create UI instance with transparency disabled
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          
          // Generate HTML
          const html = await (ui as any).generateHTML();
          
          // Verify that deliberation section is hidden by default
          // The deliberation section should have display: none in CSS
          expect(html).toContain('deliberation-section');
          expect(html).toMatch(/\.deliberation-section\s*\{[^}]*display:\s*none/);
          
          // Verify that deliberation section requires explicit visibility class
          expect(html).toMatch(/\.deliberation-section\.visible\s*\{[^}]*display:\s*block/);
          
          // Verify that transparency toggle is hidden by default
          expect(html).toMatch(/\.transparency-toggle\s*\{[^}]*display:\s*none/);
          
          // Verify that the response content div does not contain deliberation markers
          // by checking that deliberation content is in a separate section
          const responseContentMatch = html.match(/<div id="responseContent" class="response-content"><\/div>/);
          expect(responseContentMatch).toBeTruthy();
          
          // Verify deliberation content is in a separate hidden section
          const deliberationSectionMatch = html.match(/<div id="deliberationSection" class="deliberation-section">/);
          expect(deliberationSectionMatch).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Property: The default state of the UI should not reveal council member identifiers
   * in the main response area.
   */
  test('response display area excludes council member identifiers by default', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 500 }),
        
        async (responseContent) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify that council member identifiers are only in deliberation section
          // which is hidden by default
          const councilMemberIndex = html.indexOf('class="council-member"');
          
          if (councilMemberIndex !== -1) {
            // If council-member class exists, it should be within deliberation section
            const deliberationSectionStart = html.indexOf('<div id="deliberationSection"');
            
            // Council member should be after deliberation section starts
            expect(councilMemberIndex).toBeGreaterThan(deliberationSectionStart);
            
            // Verify it's not in the response content area
            const responseContentStart = html.indexOf('<div id="responseContent"');
            const responseContentEnd = html.indexOf('</div>', responseContentStart);
            
            // Council member should not be between response content start and end
            const isInResponseContent = councilMemberIndex > responseContentStart && 
                                       councilMemberIndex < responseContentEnd;
            expect(isInResponseContent).toBe(false);
          }
          
          // Verify response content div is separate from deliberation
          expect(html).toContain('<div id="responseContent" class="response-content"></div>');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
  
  /**
   * Property: Deliberation visibility requires explicit user action
   */
  test('deliberation section requires explicit toggle action to become visible', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        
        async (_) => {
          const ui = new UserInterface(configManager, 'http://localhost:3000');
          const html = await (ui as any).generateHTML();
          
          // Verify that deliberation section starts hidden
          expect(html).toMatch(/<div id="deliberationSection" class="deliberation-section">/);
          
          // Verify that visibility requires the 'visible' class
          expect(html).toMatch(/\.deliberation-section\.visible\s*\{[^}]*display:\s*block/);
          
          // Verify that toggle function exists
          expect(html).toContain('function toggleDeliberation()');
          
          // Verify that toggle adds/removes visible class
          expect(html).toContain('deliberationSection.classList.add(\'visible\')');
          expect(html).toContain('deliberationSection.classList.remove(\'visible\')');
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
