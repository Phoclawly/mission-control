import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/__tests__/**/*.test.ts'],
    // forks = separate worker process per file → full isolation for native modules (better-sqlite3)
    pool: 'forks',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: [
        'src/app/api/tasks/route.ts',
        'src/app/api/tasks/[id]/dispatch/route.ts',
        'src/app/api/workspaces/activate/route.ts',
        'src/middleware.ts',
        'src/lib/validation.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
      },
    },
    testTimeout: 15000,
  },
});
