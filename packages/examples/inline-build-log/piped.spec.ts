import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, expect } from 'vitest';

// The example as a real process with its stdout piped — what `| tee log` or a CI
// runner sees. The same code that shows a spinner under a growing log in a
// terminal must leave a clean log here: every permanent line, in order, and not
// one control sequence.
test('inline-build-log piped: a clean plain-text log, no control sequences', async () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const tsx = `${root}node_modules/.bin/tsx`;
  const entry = fileURLToPath(new URL('index.tsx', import.meta.url));
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(tsx, [entry], { cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 20000 }, (err, out) => (err ? reject(err) : resolve(out)));
  });
  expect(stdout).toBe([0, 1, 2, 3, 4].map((n) => `[${n}] compiled module\n`).join(''));
  expect(stdout).not.toContain('\x1b');
}, 30000);
