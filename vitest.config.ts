import { defineConfig, coverageConfigDefaults, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
    },
    testTimeout: 10_000,
    hookTimeout: 60_000,
    reporters: ['verbose'],

    exclude: [...configDefaults.exclude, 'var/**'],

    coverage: {
      exclude: [...coverageConfigDefaults.exclude, '**/var/**', 'src/server.ts', 'src/presentation/cli/cli.ts'],
      include: ['src/**'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'var/reports/coverage',
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
