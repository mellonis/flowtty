import { afterEach, expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import { setWidthPolicy, widthPolicy } from '@flowtty/core';
import { detectWidthPolicy } from './widthPolicy.js';
import { TtyBackend } from './tty.js';

afterEach(() => setWidthPolicy('cluster'));

test('macOS Terminal.app measures per code point; other terminals by cluster', () => {
  expect(detectWidthPolicy({ TERM_PROGRAM: 'Apple_Terminal' })).toBe('codepoint');
  expect(detectWidthPolicy({ TERM_PROGRAM: 'iTerm.app' })).toBe('cluster');
  expect(detectWidthPolicy({})).toBe('cluster');
});

test('inside a multiplexer the multiplexer measures, whatever the outer terminal', () => {
  expect(detectWidthPolicy({ TERM_PROGRAM: 'Apple_Terminal', TMUX: '/tmp/tmux-1/default,1,0' })).toBe('cluster');
  expect(detectWidthPolicy({ TERM_PROGRAM: 'Apple_Terminal', HERDR_SESSION: 'main' })).toBe('cluster');
  expect(detectWidthPolicy({ TERM_PROGRAM: 'Apple_Terminal', HERDR_ENV: '1' })).toBe('cluster');
  expect(detectWidthPolicy({ TERM_PROGRAM: 'Apple_Terminal', HERDR_PANE_ID: 'p1' })).toBe('cluster');
  expect(detectWidthPolicy({ TERM_PROGRAM: 'Apple_Terminal', STY: '123.pts-0' })).toBe('cluster');
  expect(detectWidthPolicy({ TERM_PROGRAM: 'Apple_Terminal', ZELLIJ: '0' })).toBe('cluster');
});

test('TtyBackend sets the policy it is told, and detects it when told "auto"', () => {
  const stub = Object.assign(new EventEmitter(), { isTTY: true, columns: 20, rows: 4, write: () => true }) as unknown as NodeJS.WriteStream;
  const explicit = new TtyBackend(stub, undefined, { widths: 'codepoint' });
  expect(widthPolicy()).toBe('codepoint');
  explicit.dispose();
  const detected = new TtyBackend(stub, undefined, { widths: 'auto', env: { TERM_PROGRAM: 'iTerm.app' } });
  expect(widthPolicy()).toBe('cluster');
  detected.dispose();
});
