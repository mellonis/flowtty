import { expect, test } from 'vitest';
import {
  createAttention,
  detectNotificationProtocol,
  notificationSequence,
  sanitizeNotificationText,
} from './notification.js';

const ESC = '\x1b';
const ST = `${ESC}\\`;

// ── sanitizeNotificationText ───────────────────────────────────────────────

test('sanitize strips C0 controls, DEL and C1 controls', () => {
  expect(sanitizeNotificationText('a\x1b]b\x07c')).toBe('a]bc');
  expect(sanitizeNotificationText('a\x00\x01b\x7fc')).toBe('abc');
  // 0x9c is ST in the C1 set — it would close the sequence just like ESC \.
  expect(sanitizeNotificationText('a\x9cb\x80c')).toBe('abc');
});

test('sanitize turns newlines and tabs into a single space and trims', () => {
  expect(sanitizeNotificationText('  build\n\n  failed\t\tbadly  ')).toBe('build failed badly');
  expect(sanitizeNotificationText('a\r\nb')).toBe('a b');
});

test('sanitize caps the length without splitting a surrogate pair', () => {
  expect(sanitizeNotificationText('x'.repeat(300))).toHaveLength(256);
  expect(sanitizeNotificationText('abcdef', 3)).toBe('abc');
  // 4 astral code points = 8 UTF-16 units; a cap of 2 must keep 2 whole emoji.
  expect(sanitizeNotificationText('😀😀😀😀', 2)).toBe('😀😀');
  // Cutting mid-word can leave a trailing space; it must not survive.
  expect(sanitizeNotificationText('ab cd', 3)).toBe('ab');
});

test('sanitize leaves ordinary text alone', () => {
  expect(sanitizeNotificationText('Build finished: 3 passed')).toBe('Build finished: 3 passed');
});

// ── notificationSequence ───────────────────────────────────────────────────

test('osc9 joins title and body into one field, terminated by ST', () => {
  expect(notificationSequence('Build', 'done', 'osc9')).toBe(`${ESC}]9;Build: done${ST}`);
  expect(notificationSequence('Build', undefined, 'osc9')).toBe(`${ESC}]9;Build${ST}`);
});

test('osc9 neutralizes a leading <digits>; so it cannot read as a ConEmu sub-command', () => {
  expect(notificationSequence('4;x', undefined, 'osc9')).toBe(`${ESC}]9; 4;x${ST}`);
  expect(notificationSequence('9;4;50', undefined, 'osc9')).toBe(`${ESC}]9; 9;4;50${ST}`);
  // Only a numeric first field collides; ordinary text is untouched.
  expect(notificationSequence('done; ok', undefined, 'osc9')).toBe(`${ESC}]9;done; ok${ST}`);
});

test('osc9 sanitizes both parts before joining', () => {
  expect(notificationSequence('4;x', 'a\x1b]b\x07c', 'osc9')).toBe(`${ESC}]9; 4;x: a]bc${ST}`);
});

test('osc777 keeps title and body as separate fields', () => {
  expect(notificationSequence('Build', 'done', 'osc777')).toBe(`${ESC}]777;notify;Build;done${ST}`);
  expect(notificationSequence('Build', undefined, 'osc777')).toBe(`${ESC}]777;notify;Build${ST}`);
});

test('osc777 replaces a semicolon so it cannot split a field', () => {
  expect(notificationSequence('a;b', 'c;d', 'osc777')).toBe(`${ESC}]777;notify;a,b;c,d${ST}`);
});

test('a protocol of none, or nothing left to say, produces no bytes', () => {
  expect(notificationSequence('Build', 'done', 'none')).toBe('');
  expect(notificationSequence('\x07\x1b', '  ', 'osc9')).toBe('');
  expect(notificationSequence('', '', 'osc777')).toBe('');
});

// ── detectNotificationProtocol ─────────────────────────────────────────────

test('detect returns osc9 by default and for unknown terminals', () => {
  expect(detectNotificationProtocol({})).toBe('osc9');
  expect(detectNotificationProtocol({ TERM: 'xterm-256color' })).toBe('osc9');
  expect(detectNotificationProtocol({ TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' })).toBe('osc9');
  expect(detectNotificationProtocol({ TERM_PROGRAM: 'iTerm.app' })).toBe('osc9');
  expect(detectNotificationProtocol({ WT_SESSION: 'abc' })).toBe('osc9');
});

test('detect returns osc777 where it is the terminal\'s own protocol', () => {
  expect(detectNotificationProtocol({ TERM: 'foot' })).toBe('osc777');
  expect(detectNotificationProtocol({ TERM: 'foot-extra' })).toBe('osc777');
  expect(detectNotificationProtocol({ TERM: 'rxvt-unicode-256color' })).toBe('osc777');
});

test('detect returns none where nothing can be notified', () => {
  expect(detectNotificationProtocol({ TERM: 'dumb' })).toBe('none');
  expect(detectNotificationProtocol({ TERM: 'linux' })).toBe('none');
});

test('detect returns none under tmux and screen', () => {
  expect(detectNotificationProtocol({ TMUX: '/tmp/tmux-501/default,1,0', TERM: 'xterm-256color' })).toBe('none');
  expect(detectNotificationProtocol({ TERM: 'tmux-256color' })).toBe('none');
  expect(detectNotificationProtocol({ TERM: 'screen.xterm-256color' })).toBe('none');
  expect(detectNotificationProtocol({ STY: '123.pts-0.host' })).toBe('none');
});

// ── createAttention ────────────────────────────────────────────────────────

function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('bell writes BEL once per second; the calls in between are dropped', () => {
  const writes: string[] = [];
  const { now, advance } = clock();
  const attention = createAttention((s) => writes.push(s), { now, env: {} });

  attention.bell();          // the first one is never dropped
  attention.bell();
  advance(999);
  attention.bell();
  expect(writes).toEqual(['\x07']);
  advance(1);
  attention.bell();
  expect(writes).toEqual(['\x07', '\x07']);
});

test('notify writes the whole sequence as one write', () => {
  const writes: string[] = [];
  const attention = createAttention((s) => writes.push(s), { env: { TERM: 'xterm-256color' } });
  attention.notify('Build', 'done');
  expect(writes).toEqual([`${ESC}]9;Build: done${ST}`]);
});

test('an explicitly requested protocol overrides the environment', () => {
  const writes: string[] = [];
  const attention = createAttention((s) => writes.push(s), { notifications: 'osc777', env: { TERM: 'xterm-256color' } });
  expect(attention.protocol).toBe('osc777');
  attention.notify('Build', 'done');
  expect(writes).toEqual([`${ESC}]777;notify;Build;done${ST}`]);
});

test('an explicit none stays silent — no sequence, no bell', () => {
  const writes: string[] = [];
  const attention = createAttention((s) => writes.push(s), { notifications: 'none', env: {} });
  attention.notify('Build', 'done');
  expect(writes).toEqual([]);
});

test('an auto-detected none rings the bell instead of notifying', () => {
  const writes: string[] = [];
  const { now } = clock();
  const attention = createAttention((s) => writes.push(s), { now, env: { TMUX: '/tmp/tmux/default,1,0' } });
  expect(attention.protocol).toBe('none');
  attention.notify('Build', 'done');
  expect(writes).toEqual(['\x07']);
});

test('a protocol forced under tmux is wrapped in the passthrough sequence', () => {
  const writes: string[] = [];
  const attention = createAttention((s) => writes.push(s), {
    notifications: 'osc9',
    env: { TMUX: '/tmp/tmux/default,1,0', TERM: 'screen-256color' },
  });
  // Every ESC inside the payload is doubled, as tmux's DCS passthrough requires.
  expect(writes).toEqual([]);
  attention.notify('Build', 'done');
  expect(writes).toEqual([`${ESC}Ptmux;${ESC}${ESC}]9;Build: done${ESC}${ESC}\\${ST}`]);
});

test('screen is not wrapped — its passthrough is a different, size-limited form', () => {
  const writes: string[] = [];
  const attention = createAttention((s) => writes.push(s), {
    notifications: 'osc9',
    env: { STY: '1.pts-0.host', TERM: 'screen-256color' },
  });
  attention.notify('Build', 'done');
  expect(writes).toEqual([`${ESC}]9;Build: done${ST}`]);
});
