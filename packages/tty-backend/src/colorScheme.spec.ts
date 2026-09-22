import { expect, test } from 'vitest';
import { createColorSchemeTracker } from './colorScheme.js';
import { BACKGROUND_QUERY, COLOR_SCHEME_REPORTS_OFF, COLOR_SCHEME_REPORTS_ON } from './ansi.js';

function tracker() {
  const writes: string[] = [];
  const t = createColorSchemeTracker((b) => writes.push(b));
  return { t, writes };
}

test('unknown until the terminal answers; start() asks once, as one write', () => {
  const { t, writes } = tracker();
  expect(t.current()).toEqual({ scheme: 'unknown' });
  t.start();
  t.start();
  expect(writes).toEqual([COLOR_SCHEME_REPORTS_ON + BACKGROUND_QUERY]);
});

test('a background reply decides light or dark and keeps the color', () => {
  const { t } = tracker();
  const heard: unknown[] = [];
  t.subscribe((s) => heard.push(s));
  t.handle([{ type: 'background', color: { r: 0xfd, g: 0xf6, b: 0xe3 } }]);
  expect(t.current()).toEqual({ scheme: 'light', background: '#fdf6e3' });
  expect(heard).toEqual([{ scheme: 'light', background: '#fdf6e3' }]);
});

test('the same answer twice is one change; a different one is another', () => {
  const { t } = tracker();
  let changes = 0;
  t.subscribe(() => { changes++; });
  const light = { type: 'background', color: { r: 255, g: 255, b: 255 } } as const;
  t.handle([light]);
  t.handle([light]);
  expect(changes).toBe(1);
  t.handle([{ type: 'background', color: { r: 0, g: 0, b: 0 } }]);
  expect(changes).toBe(2);
  expect(t.current()).toEqual({ scheme: 'dark', background: '#000000' });
});

test('a 2031 notification sets the scheme at once and asks for the background again', () => {
  const { t, writes } = tracker();
  t.start();
  t.handle([{ type: 'background', color: { r: 255, g: 255, b: 255 } }]);
  writes.length = 0;
  const heard: unknown[] = [];
  t.subscribe((s) => heard.push(s));
  t.handle([{ type: 'colorScheme', scheme: 'dark' }]);
  expect(t.current()).toEqual({ scheme: 'dark', background: '#ffffff' }); // the old ground, until the reply
  expect(heard).toEqual([{ scheme: 'dark', background: '#ffffff' }]);
  expect(writes).toEqual([BACKGROUND_QUERY]);
  t.handle([{ type: 'background', color: { r: 0, g: 0, b: 0 } }]);
  expect(t.current()).toEqual({ scheme: 'dark', background: '#000000' });
});

test('a focus-in asks for the background again; a focus-out does nothing', () => {
  const { t, writes } = tracker();
  t.start();
  writes.length = 0;
  t.handle([{ type: 'focus', focused: false }]);
  expect(writes).toEqual([]);
  t.handle([{ type: 'focus', focused: true }]);
  expect(writes).toEqual([BACKGROUND_QUERY]);
});

test('stop() turns the reports off, writes nothing more, and keeps the last answer', () => {
  const { t, writes } = tracker();
  t.start();
  t.handle([{ type: 'background', color: { r: 0, g: 0, b: 0 } }]);
  t.stop();
  expect(writes.at(-1)).toBe(COLOR_SCHEME_REPORTS_OFF);
  writes.length = 0;
  t.handle([{ type: 'focus', focused: true }, { type: 'colorScheme', scheme: 'light' }]);
  expect(writes).toEqual([]);
  expect(t.current().scheme).toBe('light'); // still heard, in case the reports keep coming
  t.stop();
  expect(writes).toEqual([]);
});

test('before start(), a report is understood but nothing is written back', () => {
  const { t, writes } = tracker();
  t.handle([{ type: 'colorScheme', scheme: 'light' }, { type: 'focus', focused: true }]);
  expect(t.current()).toEqual({ scheme: 'light' });
  expect(writes).toEqual([]);
});
