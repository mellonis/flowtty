import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  // Bundle react-reconciler into the dist so consumers don't get a second React
  // instance via node_modules resolution. React itself stays external (peer dep)
  // so the consumer's React is the one used; reconciler binds to whichever React
  // is loaded at runtime — which, with bundled reconciler + external react, is
  // unambiguously the consumer's.
  noExternal: ['react-reconciler'],
});
