module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.spec.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/src/__tests__/jest.setup.ts', '/src/__tests__/test-helpers.ts'],
  testTimeout: 60000,
  // Use more workers for faster parallel execution (use 100% of CPU cores)
  // In CI, this can be overridden with --maxWorkers flag
  maxWorkers: process.env.CI ? '100%' : '75%',
  // Enable test result caching for faster re-runs
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.ts'],
  // Only collect coverage when explicitly requested (speeds up CI)
  collectCoverage: process.env.COLLECT_COVERAGE === 'true',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Enable isolated modules for faster compilation (skips type checking in tests)
        // Type checking happens in the build step, so we can skip it here for speed
        isolatedModules: true
      }
    ]
  },
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '.',
      outputName: 'junit.xml'
    }]
  ],
  // Fail fast on first error in CI (saves time)
  bail: process.env.CI ? 1 : false,
  // Show more useful output
  verbose: false
};
