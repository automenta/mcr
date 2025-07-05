/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm', // Use ESM preset for ts-jest
  testEnvironment: 'node',
  moduleNameMapper: {
    // Handle module paths, especially if using path aliases in tsconfig.json (none specified for now)
    // '^@App/(.*)$': '<rootDir>/src/$1',
  },
  // Jest will automatically look for files in __tests__ folders or files with .test.ts or .spec.ts extensions.
  // We have files in aethelred/tests/, so we need to specify roots or testMatch.
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
  ],
  // Collect coverage from src directory
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageProvider: 'v8', // or 'babel'
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/interfaces/**/*.ts', // Often interfaces don't need coverage
    '!src/types/**/*.ts',     // Nor simple type definitions
    '!src/api/index.ts',      // Index files are usually just re-exports
    '!src/core/index.ts',
    '!src/core/**/index.ts',
    '!src/providers/index.ts',
    '!src/strategies/index.ts',
    '!src/index.ts',          // Entry point might be mostly setup
  ],
  // Needed for ES Modules if your code or dependencies use them
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true, // Tells ts-jest to output ESM
        // tsconfig: 'tsconfig.jest.json', // Optional: if you have a separate tsconfig for tests
      },
    ],
  },
  // If your project uses ES modules and has dependencies that are still CJS,
  // you might need to specify them in transformIgnorePatterns for Jest to transform them.
  // transformIgnorePatterns: [
  //   '/node_modules/(?!(module-that-needs-transpiling)/)',
  // ],
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,
};
