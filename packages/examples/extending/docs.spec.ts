import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

// The "writing a …" pages print these files verbatim. If a page and its file
// drift apart, the docs are showing code nobody has compiled or run.
const here = new URL('.', import.meta.url);
const file = (name: string) => readFileSync(new URL(name, here), 'utf8').trimEnd();
const page = (name: string) => readFileSync(new URL(`../../../docs/${name}`, here), 'utf8');

test('docs/writing-a-component.md shows Stepper.tsx and its spec as they are', () => {
  expect(page('writing-a-component.md')).toContain(file('Stepper.tsx'));
  expect(page('writing-a-component.md')).toContain(file('Stepper.spec.tsx'));
});

test('docs/writing-a-backend.md shows FinalFrameBackend.ts and its spec as they are', () => {
  expect(page('writing-a-backend.md')).toContain(file('FinalFrameBackend.ts'));
  expect(page('writing-a-backend.md')).toContain(file('FinalFrameBackend.spec.tsx'));
});
