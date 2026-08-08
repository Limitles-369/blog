import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Gates shell out to git and contentlayer; the default 5s is too tight.
    testTimeout: 30_000,
  },
})
