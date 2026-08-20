import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    pool: 'forks',
    // Browser E2E specs spawn `next dev`; two dev servers on the same repo
    // contend over the shared `.next` dir, so test files must not run in
    // parallel. Cost: unit tests serialize too (~30-60s), worth it for a
    // deterministic release gate.
    fileParallelism: false,
    exclude: ['.worktrees/**', '.netlify/**', '.opencode/**', 'node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
