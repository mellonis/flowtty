import { expect, test } from 'vitest';
import { Buffer as NodeBuffer } from 'node:buffer';
import {
  DEFAULT_CLIPBOARD_LIMIT, clipboardSequence, createClipboard, detectClipboardSupport,
} from './clipboard.js';

const ESC = '\x1b';
const ST = `${ESC}\\`;

// The one shape a clipboard write may ever have: OSC 52, selection `c`, a
// base64 payload. Nothing else — in particular nothing that could be read as
// the `?` query form, which asks the terminal to hand the clipboard BACK.
const WRITE_ONLY = /^\x1b\]52;c;[A-Za-z0-9+/]*={0,2}\x1b\\$/u;

test('clipboardSequence carries the UTF-8 text as base64 inside OSC 52', () => {
  expect(clipboardSequence('hello')).toBe(`${ESC}]52;c;aGVsbG8=${ST}`);
  expect(clipboardSequence('héllo 🌍')).toBe(
    `${ESC}]52;c;${NodeBuffer.from('héllo 🌍', 'utf8').toString('base64')}${ST}`,
  );
});

test('clipboardSequence refuses an empty text — there is nothing to put anywhere', () => {
  expect(clipboardSequence('')).toBe('');
});

test('clipboardSequence refuses the whole text over the cap, never a truncated one', () => {
  const big = 'a'.repeat(DEFAULT_CLIPBOARD_LIMIT);
  expect(clipboardSequence(big)).toBe('');
  // Right at the cap it still goes: the limit is on the base64, not the input.
  const fits = 'a'.repeat(Math.floor(DEFAULT_CLIPBOARD_LIMIT / 4) * 3);
  expect(clipboardSequence(fits)).not.toBe('');
  expect(clipboardSequence(fits).length).toBeLessThan(DEFAULT_CLIPBOARD_LIMIT + 16);
  expect(clipboardSequence('abcdef', 4)).toBe('');
});

test('no input, on any path, can make a clipboard write emit the READ query form', () => {
  const inputs = [
    '?', '?;c', 'c;?', '', ' ', '\x1b]52;c;?\x1b\\', 'a'.repeat(100_000),
    'héllo 🌍', ';;;', '\x07', '\u0000\u009c', '52;c;?',
  ];
  // Both paths that reach a terminal: the bare sequence, and the one wrapped in
  // tmux's DCS passthrough (where every ESC is doubled).
  const wrapped: string[] = [];
  const tmux = createClipboard((b) => wrapped.push(b), {
    env: { TMUX: '/tmp/tmux-501/default,1,0', TERM: 'tmux-256color' },
    clipboard: 'osc52',
  });
  for (const input of inputs) {
    const sequence = clipboardSequence(input);
    if (sequence !== '') {
      expect(sequence).toMatch(WRITE_ONLY);
      expect(sequence).not.toContain(';?');
    }
    wrapped.length = 0;
    tmux.copy(input);
    for (const bytes of wrapped) {
      expect(bytes).toMatch(/^\x1bPtmux;\x1b\x1b\]52;c;[A-Za-z0-9+/]*={0,2}\x1b\x1b\\\x1b\\$/u);
      expect(bytes).not.toContain(';?');
    }
  }
});

// ─── detection ───────────────────────────────────────────────────────────────

test('Apple Terminal is not attempted — it has no OSC 52', () => {
  expect(detectClipboardSupport({ TERM_PROGRAM: 'Apple_Terminal', TERM: 'xterm-256color' })).toBe('none');
});

test('GNU screen is not attempted; tmux is, because it understands OSC 52 itself', () => {
  expect(detectClipboardSupport({ STY: '1234.pts-0.host', TERM: 'screen' })).toBe('none');
  expect(detectClipboardSupport({ TERM: 'screen-256color' })).toBe('none');
  expect(detectClipboardSupport({ TMUX: '/tmp/tmux-501/default,1,0', TERM: 'tmux-256color' })).toBe('osc52');
});

test('a console with no escape handling and no desktop is not attempted', () => {
  expect(detectClipboardSupport({ TERM: 'dumb' })).toBe('none');
  expect(detectClipboardSupport({ TERM: 'linux' })).toBe('none');
});

test('everything else is attempted — a terminal that does not know OSC 52 swallows it', () => {
  expect(detectClipboardSupport({ TERM: 'xterm-256color' })).toBe('osc52');
  expect(detectClipboardSupport({})).toBe('osc52');
});

// ─── createClipboard ─────────────────────────────────────────────────────────

test('copy writes the whole sequence in ONE write and says it delivered', () => {
  const writes: string[] = [];
  const clipboard = createClipboard((b) => writes.push(b), { env: { TERM: 'xterm-256color' } });
  expect(clipboard.copy('hello')).toBe(true);
  expect(writes).toEqual([`${ESC}]52;c;aGVsbG8=${ST}`]);
});

test('copy writes nothing and reports false where no protocol reaches the terminal', () => {
  const writes: string[] = [];
  const clipboard = createClipboard((b) => writes.push(b), { env: { TERM_PROGRAM: 'Apple_Terminal' } });
  expect(clipboard.protocol).toBe('none');
  expect(clipboard.copy('hello')).toBe(false);
  expect(writes).toEqual([]);
});

test('copy writes nothing and reports false over the cap', () => {
  const writes: string[] = [];
  const clipboard = createClipboard((b) => writes.push(b), { env: { TERM: 'xterm' }, limit: 8 });
  expect(clipboard.copy('a long piece of text')).toBe(false);
  expect(writes).toEqual([]);
});

test('an explicitly forced protocol inside tmux is wrapped in the DCS passthrough', () => {
  const writes: string[] = [];
  const env = { TMUX: '/tmp/tmux-501/default,1,0', TERM: 'tmux-256color' };
  const forced = createClipboard((b) => writes.push(b), { env, clipboard: 'osc52' });
  expect(forced.copy('hi')).toBe(true);
  // Every ESC of the payload doubled — the inner ST's included.
  expect(writes[0]).toBe(`${ESC}Ptmux;${ESC}${ESC}]52;c;aGk=${ESC}${ESC}\\${ST}`);

  // Auto-detected, it goes out plain: tmux reads OSC 52 itself when
  // `set-clipboard` is on, and passthrough needs a per-pane opt-in.
  const auto: string[] = [];
  expect(createClipboard((b) => auto.push(b), { env }).copy('hi')).toBe(true);
  expect(auto[0]).toBe(`${ESC}]52;c;aGk=${ST}`);
});

test('clipboard: none stays silent whatever the environment says', () => {
  const writes: string[] = [];
  const clipboard = createClipboard((b) => writes.push(b), { env: { TERM: 'xterm' }, clipboard: 'none' });
  expect(clipboard.copy('hello')).toBe(false);
  expect(writes).toEqual([]);
});
