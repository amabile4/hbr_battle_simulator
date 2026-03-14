import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.js'
      ]
    }
  },
  resolve: {
    alias: {
      '@': new URL('./js', import.meta.url).pathname,
      '@tests': new URL('./tests', import.meta.url).pathname
    }
  }
});