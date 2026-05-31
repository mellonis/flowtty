import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  // Bundle react-reconciler into the dist so consumers don't get a second React
  // instance via node_modules resolution. React itself stays external (peer dep)
  // so the consumer's React is the one used; reconciler binds to whichever React
  // is loaded at runtime — which, with bundled reconciler + external react, is
  // unambiguously the consumer's.
  external: ['@flowtty/core'],
  noExternal: ['react-reconciler'],
  // react-reconciler is CJS and contains `require('react')`. In ESM output, tsup's
  // require shim throws "Dynamic require not supported". Inject a real require via
  // createRequire so the shim's `typeof require !== "undefined"` branch succeeds.
  banner: {
    js: `import { createRequire as __flowtty_createRequire__ } from 'node:module';\nvar require = __flowtty_createRequire__(import.meta.url);`,
  },
});
