// Post-build guard: the dist must acquire React through static ESM imports only.
// A runtime `require('react')` (or a createRequire shim that enables one) gives
// bundlers such as `bun build` a second React instance — see tsup.config.ts.
import { readFile } from 'node:fs/promises';

const dist = new URL('../dist/index.js', import.meta.url);
const src = await readFile(dist, 'utf8');
const offenders = [/\brequire\((["'])react\1\)/, /\bcreateRequire\b/].filter((re) => re.test(src));
if (offenders.length > 0) {
  console.error(`dist/index.js still reaches React at runtime: ${offenders.map(String).join(', ')}`);
  process.exit(1);
}
