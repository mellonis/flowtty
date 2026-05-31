import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve @flowtty/* package names to their source entrypoints. Mirrors the
// `paths` mapping in tsconfig.base.json so vitest can run tests across the
// workspace without requiring a prior `npm run build`.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: { globals: true, environment: 'node' },
  resolve: {
    alias: {
      '@flowtty/core/testing': here('./packages/core/src/testing/index.ts'),
      '@flowtty/core':         here('./packages/core/src/index.ts'),
      '@flowtty/react':        here('./packages/react/src/index.ts'),
      '@flowtty/tty-backend':  here('./packages/tty-backend/src/index.ts'),
    },
  },
});
