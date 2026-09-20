import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'host/index': 'src/host/index.ts',
    'testing/index': 'src/testing/index.ts',
  },
  format: ['esm'],
  // Declarations come from oxc: it transforms each file on its own, with no type
  // checker, so the dts step does not depend on the TypeScript version (the
  // TypeScript 7 generator is still experimental). The price is that every
  // exported declaration carries an explicit type; leave one out and this build
  // fails with TS9007 / TS9010, naming the spot.
  dts: { generator: 'oxc' },
  clean: true,
  platform: 'neutral',
});
