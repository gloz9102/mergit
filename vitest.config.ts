import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main/index.ts', 'src/preload/index.ts', 'src/renderer/src/main.tsx'],
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 40,
        lines: 50
      }
    }
  }
})
