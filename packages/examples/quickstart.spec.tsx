import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

// The quick start in the README is this file, minus its header comment. If they
// drift apart the README is showing code nobody has compiled.
test('the README quick start is packages/examples/quickstart.tsx', () => {
  const here = new URL('.', import.meta.url);
  const example = readFileSync(new URL('quickstart.tsx', here), 'utf8').split('\n').filter((l) => !l.startsWith('//')).join('\n').trim();
  const readme = readFileSync(new URL('../../README.md', here), 'utf8');
  expect(readme).toContain(example);
});
