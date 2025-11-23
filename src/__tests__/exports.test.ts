/**
 * Export Verification Tests
 * Tests to ensure all public APIs are properly exported from src/index.ts
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Export Verification', () => {
  const indexFilePath = path.join(__dirname, '../../src/index.ts');
  let indexFileContent: string;

  beforeAll(() => {
    indexFileContent = fs.readFileSync(indexFilePath, 'utf-8');
  });

  describe('Core Types Exported (Requirement 10.1)', () => {
    test('should export core types', () => {
      // Verify export * from './types/core' exists
      expect(indexFileContent).toContain("export * from './types/core'");
    });

    test('should have TypeScript type availability', () => {
      // Types are validated at compile time
      // This test verifies the export statement exists
      expect(indexFileContent).toContain("export * from './types/core'");
    });
  });

  describe('Interfaces Exported (Requirement 10.2)', () => {
    test('should export all interface definitions', () => {
      // Verify interface exports
      expect(indexFileContent).toContain("export * from './interfaces/IOrchestrationEngine'");
      expect(indexFileContent).toContain("export * from './interfaces/IProviderPool'");
      expect(indexFileContent).toContain("export * from './interfaces/ISynthesisEngine'");
      expect(indexFileContent).toContain("export * from './interfaces/ISessionManager'");
      expect(indexFileContent).toContain("export * from './interfaces/IConfigurationManager'");
      expect(indexFileContent).toContain("export * from './interfaces/IEventLogger'");
      expect(indexFileContent).toContain("export * from './interfaces/IDashboard'");
      expect(indexFileContent).toContain("export * from './interfaces/ICostCalculator'");
      expect(indexFileContent).toContain("export * from './interfaces/IAPIGateway'");
      expect(indexFileContent).toContain("export * from './interfaces/IAnalyticsEngine'");
      expect(indexFileContent).toContain("export * from './interfaces/IRedTeamTester'");
    });
  });

  describe('Implementations Exported (Requirement 10.3)', () => {
    test('should export all class implementations', () => {
      // Check for implementation class exports
      expect(indexFileContent).toContain("export { OrchestrationEngine }");
      expect(indexFileContent).toContain("export { ProviderPool }");
      expect(indexFileContent).toContain("export { SynthesisEngine }");
      expect(indexFileContent).toContain("export { SessionManager }");
      expect(indexFileContent).toContain("export { ConfigurationManager }");
      expect(indexFileContent).toContain("export { EventLogger }");
      expect(indexFileContent).toContain("export { Dashboard }");
      expect(indexFileContent).toContain("export { AnalyticsEngine }");
      expect(indexFileContent).toContain("export { APIGateway }");
      expect(indexFileContent).toContain("export { RedTeamTester }");
    });
  });

  describe('Provider Adapters Exported (Requirement 10.4)', () => {
    test('should export all adapter classes', () => {
      expect(indexFileContent).toContain("export { BaseProviderAdapter }");
      expect(indexFileContent).toContain("export { OpenAIAdapter }");
      expect(indexFileContent).toContain("export { AnthropicAdapter }");
      expect(indexFileContent).toContain("export { GoogleAdapter }");
    });
  });

  describe('Cost Calculator Exports (Requirement 10.5)', () => {
    test('should export cost calculator utilities', () => {
      expect(indexFileContent).toContain("export { CostCalculator }");
      expect(indexFileContent).toContain("PricingConfig");
      expect(indexFileContent).toContain("CostCalculation");
    });
  });

  describe('UI Exports (Requirement 10.6)', () => {
    test('should export UI components', () => {
      expect(indexFileContent).toContain("export { UserInterface }");
    });
  });

  describe('No Undefined Exports (Requirement 10.7)', () => {
    test('should have no undefined exports', () => {
      // Verify all expected exports are present in the file
      const expectedExports = [
        'OrchestrationEngine',
        'ProviderPool',
        'SynthesisEngine',
        'SessionManager',
        'ConfigurationManager',
        'EventLogger',
        'Dashboard',
        'AnalyticsEngine',
        'APIGateway',
        'RedTeamTester',
        'BaseProviderAdapter',
        'OpenAIAdapter',
        'AnthropicAdapter',
        'GoogleAdapter',
        'CostCalculator',
        'UserInterface'
      ];

      for (const exportName of expectedExports) {
        expect(indexFileContent).toContain(`export { ${exportName} }`);
      }
    });
  });

  describe('TypeScript Type Availability (Requirement 10.8)', () => {
    test('should provide type definitions for all exports', () => {
      // TypeScript types are compile-time only
      // The export statements verify types are available
      expect(indexFileContent).toContain("export * from './types/core'");
    });

    test('should export types from cost calculator', () => {
      // Cost calculator types are exported as type exports
      expect(indexFileContent).toContain("export type");
      expect(indexFileContent).toContain("PricingConfig");
    });
  });

  describe('Export Completeness', () => {
    test('should export all major components', () => {
      const components = [
        'OrchestrationEngine',
        'ProviderPool',
        'SynthesisEngine',
        'SessionManager',
        'ConfigurationManager',
        'EventLogger',
        'Dashboard',
        'AnalyticsEngine',
        'APIGateway',
        'RedTeamTester'
      ];

      for (const component of components) {
        expect(indexFileContent).toContain(`export { ${component} }`);
      }
    });

    test('should export all provider adapters', () => {
      const adapters = [
        'BaseProviderAdapter',
        'OpenAIAdapter',
        'AnthropicAdapter',
        'GoogleAdapter'
      ];

      for (const adapter of adapters) {
        expect(indexFileContent).toContain(`export { ${adapter} }`);
      }
    });

    test('should export utility classes', () => {
      expect(indexFileContent).toContain("export { CostCalculator }");
      expect(indexFileContent).toContain("export { UserInterface }");
    });
  });

  describe('Export Structure', () => {
    test('should have consistent export structure', () => {
      // Verify file has export statements
      const exportStatements = indexFileContent.match(/export\s+\{/g);
      expect(exportStatements).not.toBeNull();
      expect(exportStatements!.length).toBeGreaterThan(0);
    });
  });
});

