import { describe, test, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Buffer } from '@flowtty/core';
import { InlineTtyBackend } from './InlineTtyBackend.js';

// Build a mock NodeJS.WriteStream that captures writes and supports .columns
// + a 'resize' event emitter shape.
function mockStdout(columns = 40) {
  const e: any = new EventEmitter();
  e.isTTY = true; // the mock stands in for a terminal
  e.columns = columns;
  e.rows = 24;
  e.writes = [] as string[];
  e.write = (s: string) => { e.writes.push(s); return true; };
  e.captured = () => (e.writes as string[]).join('');
  return e as NodeJS.WriteStream & { writes: string[]; captured: () => string };
}

function mockStdin() {
  const e: any = new EventEmitter();
  e.isTTY = false;
  e.setRawMode = () => e;
  e.resume = () => {};
  e.pause = () => {};
  return e as NodeJS.ReadStream;
}

function newBuffer(w: number, h: number, text: string) {
  const b = new Buffer(w, h);
  for (let i = 0; i < text.length && i < w; i++) b.set(i, 0, text[i]!, {});
  return b;
}

describe('InlineTtyBackend', () => {
  test('size() reflects liveHeight option and stdout columns', () => {
    const out = mockStdout(80);
    const b = new InlineTtyBackend({ out, in: mockStdin(), liveHeight: 6 });
    expect(b.size()).toEqual({ width: 80, height: 6 });
  });

  test('size() defaults liveHeight to 10', () => {
    const out = mockStdout();
    const b = new InlineTtyBackend({ out, in: mockStdin() });
    expect(b.size().height).toBe(10);
  });

  test('first draw() hides the cursor and writes the serialized buffer', () => {
    const out = mockStdout(10);
    const b = new InlineTtyBackend({ out, in: mockStdin(), liveHeight: 3 });
    b.draw(newBuffer(10, 3, 'hello'));
    const text = out.captured();
    // Cursor hidden once.
    expect(text).toContain('\x1b[?25l');
    // Contains the text characters.
    expect(text).toContain('hello');
    // No CPL erase on the first draw (nothing to erase yet).
    expect(text).not.toContain('\x1b[3F');
  });

  test('second draw() erases the previous live region before redrawing (N=2)', () => {
    const out = mockStdout(10);
    const b = new InlineTtyBackend({ out, in: mockStdin(), liveHeight: 2 });
    b.draw(newBuffer(10, 2, 'one'));
    out.writes.length = 0; // reset capture
    b.draw(newBuffer(10, 2, 'two'));
    const text = out.captured();
    // For N=2: \r + cursor up 1 + erase. Lands at start of top live row.
    expect(text).toContain('\r\x1b[1A\x1b[J');
    expect(text).toContain('two');
  });

  test('erase for N=1 uses \\r + \\x1b[J only (no CUU — would overshoot into scrollback)', () => {
    const out = mockStdout(10);
    const b = new InlineTtyBackend({ out, in: mockStdin(), liveHeight: 1 });
    b.draw(newBuffer(10, 1, 'one'));
    out.writes.length = 0;
    b.draw(newBuffer(10, 1, 'two'));
    const text = out.captured();
    expect(text).toContain('\r\x1b[J');
    // Crucially: NO cursor-up sequence (would erase a scrollback row).
    expect(text).not.toContain('\x1b[1A');
    expect(text).not.toContain('\x1b[1F');
  });

  test('printStatic([]) is a no-op (no writes)', () => {
    const out = mockStdout();
    const b = new InlineTtyBackend({ out, in: mockStdin() });
    b.printStatic([]);
    expect(out.writes).toHaveLength(0);
  });

  test('printStatic emits the lines AND redraws the live region beneath', () => {
    const out = mockStdout(20);
    const b = new InlineTtyBackend({ out, in: mockStdin(), liveHeight: 2 });
    b.draw(newBuffer(20, 2, 'spinner'));
    out.writes.length = 0;
    b.printStatic(['[0] log line', '[1] log line']);
    const text = out.captured();
    // Static lines appear, separated by newlines, with a trailing newline.
    expect(text).toContain('[0] log line\n[1] log line\n');
    // Then the live region is re-emitted.
    expect(text).toContain('spinner');
    // Static text comes before the redrawn live region in the byte stream.
    expect(text.indexOf('[0] log line')).toBeLessThan(text.lastIndexOf('spinner'));
  });

  test('printStatic before any draw simply appends the lines', () => {
    const out = mockStdout();
    const b = new InlineTtyBackend({ out, in: mockStdin() });
    b.printStatic(['hello', 'world']);
    const text = out.captured();
    expect(text).toContain('hello\nworld\n');
    // No erase sequence (nothing to erase).
    expect(text).not.toContain('\x1b[J');
  });

  test('dispose() shows the cursor and resets the pen', () => {
    const out = mockStdout();
    const b = new InlineTtyBackend({ out, in: mockStdin() });
    b.draw(newBuffer(10, 1, 'x'));
    out.writes.length = 0;
    b.dispose();
    const text = out.captured();
    expect(text).toContain('\x1b[?25h'); // SHOW_CURSOR
    expect(text).toContain('\x1b[0m');   // RESET
  });

  test('dispose() is idempotent', () => {
    const out = mockStdout();
    const b = new InlineTtyBackend({ out, in: mockStdin() });
    b.draw(newBuffer(5, 1, 'x'));
    b.dispose();
    out.writes.length = 0;
    b.dispose();
    expect(out.writes).toHaveLength(0);
  });

  test('onResize subscribes to stdout resize events', () => {
    const out = mockStdout();
    const b = new InlineTtyBackend({ out, in: mockStdin() });
    const handler = vi.fn();
    const unsub = b.onResize(handler);
    (out as any).emit('resize');
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
    (out as any).emit('resize');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('onKey delivers parsed key events from the input stream', () => {
    const stdin = mockStdin();
    const out = mockStdout();
    const b = new InlineTtyBackend({ out, in: stdin });
    const seen: string[] = [];
    b.onKey((k) => seen.push(k.name));
    // Simulate a key press — single 'a' character.
    (stdin as any).emit('data', 'a');
    expect(seen).toEqual(['a']);
    b.dispose();
  });

  test('serializeBuffer backs cursor one column after a wide glyph, not after ASCII', () => {
    const out = mockStdout(10);
    const b = new InlineTtyBackend({ out, in: mockStdin(), liveHeight: 1 });
    const buf = new Buffer(3, 1);
    buf.set(0, 0, '日', {}); // East Asian Wide → stringWidth 2
    buf.set(1, 0, 'x', {});
    buf.set(2, 0, 'y', {});
    b.draw(buf);
    const text = out.captured();
    expect(text).toContain('日\b');
    expect(text).not.toContain('x\b');
    b.dispose();
  });

  test('enables bracketed paste with input, disables it on dispose, and delivers a paste as one key', () => {
    const out = mockStdout();
    const stdin = mockStdin();
    const b = new InlineTtyBackend({ out, in: stdin });
    expect(out.captured()).not.toContain('\x1b[?2004h');

    const received: Array<[string, string | undefined]> = [];
    b.onKey((k) => received.push([k.name, k.text]));
    expect(out.captured()).toContain('\x1b[?2004h');

    stdin.emit('data', '\x1b[200~a\nb\x1b[201~');
    expect(received).toEqual([['paste', 'a\nb']]);

    b.dispose();
    expect(out.captured()).toContain('\x1b[?2004l');
  });

  test('color: false drops color codes and keeps bold', () => {
    const out = mockStdout();
    const b = new InlineTtyBackend({ out, in: mockStdin(), liveHeight: 1, color: false });
    const buf = new Buffer(10, 1);
    buf.set(0, 0, 'x', { fg: 'red', bold: true });
    b.draw(buf);
    expect(out.captured()).toContain('\x1b[1m');
    expect(out.captured()).not.toContain('31m');
    b.dispose();
  });

  // Not a terminal (a pipe, a file, CI): the app already separates what is
  // permanent (<Static> lines) from what is live, so the log still makes sense —
  // print the permanent lines as plain text and skip the live region entirely.
  test('stdout is not a terminal: static lines print as plain text, the live region is skipped, no control codes at all', () => {
    const out = mockStdout();
    (out as unknown as { isTTY: boolean }).isTTY = false;
    const b = new InlineTtyBackend({ out, in: mockStdin(), liveHeight: 3 });
    expect(b.logOnly).toBe(true);
    b.onKey(() => {});
    b.draw(newBuffer(10, 3, 'live'));
    b.printStatic(['built a.ts', 'built b.ts']);
    b.draw(newBuffer(10, 3, 'live2'));
    b.dispose();
    expect(out.captured()).toBe('built a.ts\nbuilt b.ts\n');
  });

  test('a terminal is not log-only', () => {
    const b = new InlineTtyBackend({ out: mockStdout(), in: mockStdin() });
    expect(b.logOnly).toBe(false);
    b.dispose();
  });

  test('bell and notify each write once, and nothing after dispose', () => {
    const out = mockStdout();
    const b = new InlineTtyBackend({ out, in: mockStdin(), notifications: 'osc777' });
    out.writes.length = 0;
    b.bell();
    b.notify('4;x', 'a\x1b]b\x07c');
    expect(out.writes).toEqual(['\x07', '\x1b]777;notify;4,x;a]bc\x1b\\']);
    b.dispose();
    out.writes.length = 0;
    b.bell();
    b.notify('Build', 'done');
    expect(out.writes).toEqual([]);
  });

  test('log-only: bell and notify write nothing at all', () => {
    const out = mockStdout();
    (out as unknown as { isTTY: boolean }).isTTY = false;
    const b = new InlineTtyBackend({ out, in: mockStdin(), notifications: 'osc9' });
    b.bell();
    b.notify('Build', 'done');
    b.dispose();
    expect(out.captured()).toBe('');
  });

  test('a notification between two frames leaves the next live-region write unchanged', () => {
    const quietOut = mockStdout();
    const quiet = new InlineTtyBackend({ out: quietOut, in: mockStdin(), liveHeight: 1 });
    quiet.draw(newBuffer(4, 1, 'aaa'));
    quietOut.writes.length = 0;
    quiet.draw(newBuffer(4, 1, 'bbb'));
    const quietFrame = quietOut.captured();
    quiet.dispose();

    const noisyOut = mockStdout();
    const noisy = new InlineTtyBackend({ out: noisyOut, in: mockStdin(), liveHeight: 1, notifications: 'osc9' });
    noisy.draw(newBuffer(4, 1, 'aaa'));
    noisyOut.writes.length = 0;
    noisy.bell();
    noisy.notify('Build', 'done');
    noisyOut.writes.length = 0;
    noisy.draw(newBuffer(4, 1, 'bbb'));
    const noisyFrame = noisyOut.captured();
    noisy.dispose();

    expect(noisyFrame).toBe(quietFrame);
  });
});
