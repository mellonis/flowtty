import { readFile } from 'node:fs/promises';
import { defineConfig } from 'tsdown';

// react-reconciler is CJS and does `require('react')`. Left alone, that call
// survives into the ESM dist as a *runtime* require — a second way of acquiring
// React next to the package's own `import ... from 'react'`. Node resolves both
// to the same module instance, but a bundler that inlines the ESM import (e.g.
// `bun build`, with or without `--compile`) ends up with its bundled React plus
// whatever the runtime require finds on disk: two dispatchers, "Invalid hook
// call". So the reconciler's require is rewritten to a shim module that
// re-exports the default ESM import — every React reference in the dist goes
// through one static `import ... from 'react'`, and no runtime require is left.
// `scripts/checkDist.mjs` fails the build if one ever comes back.
const SHIM = 'flowtty-react-shim';
const RECONCILER_CJS = /react-reconciler[\\/]cjs[\\/].*\.js$/;

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  // Declarations come from oxc: it transforms each file on its own, with no type
  // checker, so the dts step does not depend on the TypeScript version (the
  // TypeScript 7 generator is still experimental). The price is that every
  // exported declaration carries an explicit type; leave one out and this build
  // fails with TS9007 / TS9010, naming the spot.
  dts: { generator: 'oxc' },
  clean: true,
  platform: 'node',
  // `type: module` package: plain .js / .d.ts, as `exports` and the publish flip expect.
  fixedExtension: false,
  // Bundle react-reconciler (and its scheduler) into the dist so consumers don't
  // get a second React instance via node_modules resolution. React itself stays
  // external (peer dep) so the consumer's React is the one used.
  deps: { alwaysBundle: ['react-reconciler', 'scheduler'], onlyBundle: ['react-reconciler', 'scheduler'] },
  plugins: [
    {
      name: 'single-react-import',
      resolveId(id) {
        return id === SHIM ? `\0${SHIM}` : null;
      },
      async load(id) {
        if (id === `\0${SHIM}`) return `import React from 'react';\nexport default React;`;
        if (RECONCILER_CJS.test(id)) {
          const code = await readFile(id, 'utf8');
          return code.replace(/\brequire\((["'])react\1\)/g, `require("${SHIM}").default`);
        }
        return null;
      },
    },
  ],
});
