import { readFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

// react-reconciler is CJS and does `require('react')`. Left alone, that call
// survives into the ESM dist as a *runtime* require — a second way of acquiring
// React next to the package's own `import ... from 'react'`. Node resolves both
// to the same module instance, but a bundler that inlines the ESM import (e.g.
// `bun build`, with or without `--compile`) ends up with its bundled React plus
// whatever the runtime require finds on disk: two dispatchers, "Invalid hook
// call". So the reconciler's require is rewritten to a shim module that
// re-exports the default ESM import — every React reference in the dist goes
// through one static `import ... from 'react'`, and no runtime require is left.
const SHIM = 'flowtty-react-shim';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  // Bundle react-reconciler into the dist so consumers don't get a second React
  // instance via node_modules resolution. React itself stays external (peer dep)
  // so the consumer's React is the one used.
  external: ['@flowtty/core'],
  noExternal: ['react-reconciler'],
  esbuildPlugins: [
    {
      name: 'single-react-import',
      setup(build) {
        build.onLoad({ filter: /react-reconciler[\\/]cjs[\\/].*\.js$/ }, async (args) => ({
          contents: (await readFile(args.path, 'utf8'))
            .replace(/\brequire\((["'])react\1\)/g, `require("${SHIM}").default`),
          loader: 'js',
        }));
        build.onResolve({ filter: new RegExp(`^${SHIM}$`) }, () => ({ path: SHIM, namespace: SHIM }));
        build.onLoad({ filter: /.*/, namespace: SHIM }, () => ({
          contents: `import React from 'react';\nexport default React;`,
          loader: 'js',
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
