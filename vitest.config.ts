import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts: the tests cover the server guards
// and pure game logic, so they need none of the React/Tailwind plugin chain.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx,mjs}'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
