import { expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Buffer } from '@flowtty/core';
import { TtyBackend } from './tty.js';
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, HIDE_CURSOR, SHOW_CURSOR, CLEAR, RESET, OSC8_CLOSE, osc8Open } from './ansi.js';

function makeStdinStub() {
  const emitter = new EventEmitter() as EventEmitter & {
    isTTY: boolean;
    setRawMode: (b: boolean) => unknown;
    resume: () => unknown;
    pause: () => unknown;
  };
  emitter.isTTY = true;
  let rawMode = false;
  emitter.setRawMode = (b: boolean) => { rawMode = b; return emitter; };
  emitter.resume = () => emitter;
  emitter.pause = () => emitter;
  (emitter as unknown as { __rawMode(): boolean }).__rawMode = () => rawMode;
  return emitter as unknown as NodeJS.ReadStream & { __rawMode(): boolean };
}

function makeStub(cols = 6, rows = 1) {
  const writes: string[] = [];
  const emitter = new EventEmitter();
  const stub = Object.assign(emitter, {
    columns: cols,
    rows,
    write(s: string) {
      writes.push(s);
      return true;
    },
  }) as unknown as NodeJS.WriteStream & EventEmitter;
  return { stub, writes };
}

test('TtyBackend enters alt-screen + hides cursor on construct; restores on dispose', () => {
  const { stub, writes } = makeStub();
  const b = new TtyBackend(stub);
  expect(writes[0]).toBe(ALT_SCREEN_ON + HIDE_CURSOR);
  b.dispose();
  expect(writes.at(-1)).toBe(SHOW_CURSOR + RESET + ALT_SCREEN_OFF);
});

test('TtyBackend.draw emits CLEAR then per-line text, opening with RESET and ending each line with RESET', () => {
  const { stub, writes } = makeStub(3, 1);
  const back = new TtyBackend(stub);
  const buf = new Buffer(3, 1);
  buf.set(0, 0, 'a');
  buf.set(1, 0, 'b');
  buf.set(2, 0, 'c');
  back.draw(buf);
  // The draw call produces a single .write with: CLEAR + RESET + 'abc' + RESET (one row, no trailing newline).
  const drawWrite = writes[1]!;
  expect(drawWrite.startsWith(CLEAR)).toBe(true);
  expect(drawWrite).toContain('abc');
  expect(drawWrite.endsWith(RESET)).toBe(true);
});

test('TtyBackend.draw emits SGR when a styled cell appears, and RESET between style changes', () => {
  const { stub, writes } = makeStub(2, 1);
  const back = new TtyBackend(stub);
  const buf = new Buffer(2, 1);
  buf.set(0, 0, 'X', { fg: 'red', bold: true });
  buf.set(1, 0, 'Y', {}); // style change forces a RESET before plain Y
  back.draw(buf);
  const out = writes[1]!;
  // SGR for fg red + bold appears, then a RESET before the next cell's empty-style transition
  expect(out).toContain('\x1b[1;31m'); // bold + red
  expect(out).toContain('Y');
});

test('TtyBackend.onKey: flips raw mode on first subscribe and parses incoming bytes', () => {
  const { stub: out } = makeStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const received: string[] = [];

  const unsubscribe = back.onKey((k) => received.push(k.name));
  expect((stdin as unknown as { __rawMode(): boolean }).__rawMode()).toBe(true);

  // Simulate input: 'a' then ESC[C (right arrow)
  stdin.emit('data', 'a\x1b[C');
  expect(received).toEqual(['a', 'right']);

  unsubscribe();
  back.dispose();
  // After dispose: raw mode restored to cooked.
  expect((stdin as unknown as { __rawMode(): boolean }).__rawMode()).toBe(false);
});

test('TtyBackend.onKey: multiple subscribers each get every key', () => {
  const { stub: out } = makeStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const a: string[] = [];
  const b: string[] = [];
  back.onKey((k) => a.push(k.name));
  back.onKey((k) => b.push(k.name));
  stdin.emit('data', 'x');
  expect(a).toEqual(['x']);
  expect(b).toEqual(['x']);
  back.dispose();
});

test('TtyBackend.dispose: idempotent (calling twice does not throw)', () => {
  const { stub: out } = makeStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  back.onKey(() => {});
  expect(() => { back.dispose(); back.dispose(); }).not.toThrow();
});

test('TtyBackend.onKey: meta-prefix ESC + char produces meta-modified Key', () => {
  const { stub: out } = makeStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const captured: Array<{ name: string; meta: boolean }> = [];
  back.onKey((k) => captured.push({ name: k.name, meta: k.meta }));

  stdin.emit('data', '\x1bb');     // Option+b
  stdin.emit('data', '\x1b ');     // Option+Space

  expect(captured).toEqual([
    { name: 'b', meta: true },
    { name: ' ', meta: true },
  ]);
  back.dispose();
});

test('TtyBackend.onKey: Ctrl-C default-handled as dispose + process.exit(130) (raw mode swallows SIGINT)', () => {
  const { stub: out } = makeStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const subscriberCalled: string[] = [];
  back.onKey((k) => subscriberCalled.push(k.name));

  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);

  expect(() => stdin.emit('data', '\x03')).toThrow('exit:130');
  expect(exitSpy).toHaveBeenCalledWith(130);
  // dispose ran: raw mode restored before exit
  expect((stdin as unknown as { __rawMode(): boolean }).__rawMode()).toBe(false);
  // Ctrl-C was NOT delivered to subscribers (default-handled before dispatch)
  expect(subscriberCalled).toEqual([]);

  exitSpy.mockRestore();
});

test('TtyBackend.onResize: subscribers receive notifications on stdout "resize" events', () => {
  const { stub: out } = makeStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  let calls = 0;
  const unsubscribe = back.onResize(() => { calls++; });
  (out as unknown as EventEmitter).emit('resize');
  (out as unknown as EventEmitter).emit('resize');
  expect(calls).toBe(2);
  unsubscribe();
  (out as unknown as EventEmitter).emit('resize');
  expect(calls).toBe(2); // no event after unsubscribe
  back.dispose();
});

test('TtyBackend.dispose: detaches the resize listener (no notification after dispose)', () => {
  const { stub: out } = makeStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  let calls = 0;
  back.onResize(() => { calls++; });
  back.dispose();
  (out as unknown as EventEmitter).emit('resize');
  expect(calls).toBe(0);
});

test('TtyBackend.onKey: Ctrl-D default-handled as dispose + process.exit(130)', () => {
  const { stub: out } = makeStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  back.onKey(() => {});

  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);

  // Ctrl-D = 0x04
  expect(() => stdin.emit('data', '\x04')).toThrow('exit:130');
  expect(exitSpy).toHaveBeenCalledWith(130);

  exitSpy.mockRestore();
});

test('TtyBackend.draw: second frame with NO changes writes nothing (no-op diff)', () => {
  const { stub: out, writes } = makeStub(4, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf = new Buffer(4, 1);
  buf.set(0, 0, 'a'); buf.set(1, 0, 'b'); buf.set(2, 0, 'c'); buf.set(3, 0, 'd');
  back.draw(buf);
  const beforeLen = writes.length;
  // Draw the SAME buffer again
  back.draw(buf);
  // No additional writes (zero changes)
  expect(writes.length).toBe(beforeLen);
  back.dispose();
});

test('TtyBackend.draw: second frame with ONE cell changed writes a single cursor-positioned char', () => {
  const { stub: out, writes } = makeStub(4, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf1 = new Buffer(4, 1);
  buf1.set(0, 0, 'a'); buf1.set(1, 0, 'b'); buf1.set(2, 0, 'c'); buf1.set(3, 0, 'd');
  back.draw(buf1);
  const beforeLen = writes.length;
  const buf2 = new Buffer(4, 1);
  buf2.set(0, 0, 'a'); buf2.set(1, 0, 'X'); buf2.set(2, 0, 'c'); buf2.set(3, 0, 'd');
  back.draw(buf2);
  // One new write for the diff
  expect(writes.length).toBe(beforeLen + 1);
  const diff = writes[writes.length - 1]!;
  // Should contain cursorTo(1, 0) = '\x1b[1;2H' and the char 'X'
  expect(diff).toContain('\x1b[1;2H');
  expect(diff).toContain('X');
  // Should NOT contain 'a', 'b', 'c', 'd' as new chars — only X is rewritten
  expect(diff).not.toContain('abcd');
  back.dispose();
});

test('TtyBackend.draw: adjacent changes share one cursor move (run is written contiguously)', () => {
  const { stub: out, writes } = makeStub(6, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf1 = new Buffer(6, 1);
  for (let i = 0; i < 6; i++) buf1.set(i, 0, 'a');
  back.draw(buf1);
  const buf2 = new Buffer(6, 1);
  buf2.set(0, 0, 'a'); buf2.set(1, 0, 'X'); buf2.set(2, 0, 'Y'); buf2.set(3, 0, 'Z'); buf2.set(4, 0, 'a'); buf2.set(5, 0, 'a');
  back.draw(buf2);
  const diff = writes[writes.length - 1]!;
  // ONE cursor move to (1,0) = '\x1b[1;2H', then 'XYZ' contiguously
  expect(diff).toContain('\x1b[1;2HXYZ');
  // (Should NOT contain a second cursor move within the run — only the leading one.)
  // Count CSI H sequences:
  const cursorMoves = diff.match(/\x1b\[\d+;\d+H/g) ?? [];
  expect(cursorMoves.length).toBe(1);
  back.dispose();
});

test('TtyBackend.draw: style change emits SGR before the char', () => {
  const { stub: out, writes } = makeStub(3, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf1 = new Buffer(3, 1);
  buf1.set(0, 0, 'a'); buf1.set(1, 0, 'b'); buf1.set(2, 0, 'c');
  back.draw(buf1);
  const buf2 = new Buffer(3, 1);
  buf2.set(0, 0, 'a'); buf2.set(1, 0, 'b', { bold: true, fg: 'red' }); buf2.set(2, 0, 'c');
  back.draw(buf2);
  const diff = writes[writes.length - 1]!;
  // Cursor to (1,0); SGR for bold + red (1;31); 'b'; reset trailing
  expect(diff).toContain('\x1b[1;2H');
  expect(diff).toContain('\x1b[1;31m');
  expect(diff).toContain('b');
  back.dispose();
});

test('TtyBackend.draw: first frame still does a full redraw (CLEAR + full content)', () => {
  const { stub: out, writes } = makeStub(3, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const before = writes.length;
  const buf = new Buffer(3, 1);
  buf.set(0, 0, 'a'); buf.set(1, 0, 'b'); buf.set(2, 0, 'c');
  back.draw(buf);
  const drawWrite = writes[before]!;
  // Existing M0 contract: CLEAR + content + RESET
  expect(drawWrite.startsWith(CLEAR)).toBe(true);
  expect(drawWrite).toContain('abc');
  expect(drawWrite.endsWith(RESET)).toBe(true);
  back.dispose();
});

test('TtyBackend.hyperlinks reflects detected terminal support (override)', () => {
  const { stub } = makeStub();
  const prev = process.env.FORCE_HYPERLINKS;
  try {
    process.env.FORCE_HYPERLINKS = '1';
    expect(new TtyBackend(stub).hyperlinks).toBe(true);
    process.env.FORCE_HYPERLINKS = '0';
    expect(new TtyBackend(stub).hyperlinks).toBe(false);
  } finally {
    if (prev === undefined) delete process.env.FORCE_HYPERLINKS;
    else process.env.FORCE_HYPERLINKS = prev;
  }
});

test('TtyBackend.draw (full): wraps a linked cell in OSC 8 open/close', () => {
  const { stub: out, writes } = makeStub(3, 1);
  const back = new TtyBackend(out);
  const buf = new Buffer(3, 1);
  buf.set(0, 0, 'a');
  buf.set(1, 0, 'b', { link: 'http://x' });
  buf.set(2, 0, 'c');
  back.draw(buf);
  const drawWrite = writes[1]!;
  expect(drawWrite).toContain(osc8Open('http://x') + 'b');
  // The link is closed before the next (unlinked) cell and again at line end.
  expect(drawWrite).toContain(OSC8_CLOSE);
  back.dispose();
});

test('TtyBackend.draw (full): does not leave a hyperlink open past end of line', () => {
  const { stub: out, writes } = makeStub(2, 1);
  const back = new TtyBackend(out);
  const buf = new Buffer(2, 1);
  buf.set(0, 0, 'a');
  buf.set(1, 0, 'b', { link: 'http://x' }); // link runs to the last cell
  back.draw(buf);
  const drawWrite = writes[1]!;
  // Must close the link before the trailing RESET that ends the row.
  expect(drawWrite.endsWith(OSC8_CLOSE + RESET)).toBe(true);
  back.dispose();
});

test('TtyBackend.draw (diff): emits OSC 8 open/close around a newly-linked cell', () => {
  const { stub: out, writes } = makeStub(3, 1);
  const back = new TtyBackend(out);
  const buf1 = new Buffer(3, 1);
  buf1.set(0, 0, 'a'); buf1.set(1, 0, 'b'); buf1.set(2, 0, 'c');
  back.draw(buf1);
  const buf2 = new Buffer(3, 1);
  buf2.set(0, 0, 'a'); buf2.set(1, 0, 'b', { link: 'http://x' }); buf2.set(2, 0, 'c');
  back.draw(buf2);
  const diff = writes[writes.length - 1]!;
  expect(diff).toContain(osc8Open('http://x'));
  // The diff ends by closing the link (before the trailing RESET).
  expect(diff.endsWith(OSC8_CLOSE + RESET)).toBe(true);
  back.dispose();
});

test('TtyBackend: resize invalidates previousBuffer → next draw is a full redraw', () => {
  const { stub: out, writes } = makeStub(4, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf1 = new Buffer(4, 1);
  buf1.set(0, 0, 'a'); buf1.set(1, 0, 'b'); buf1.set(2, 0, 'c'); buf1.set(3, 0, 'd');
  back.draw(buf1);  // first frame: full
  // Subscribe to onResize to attach the resize listener; then emit the resize event
  // The resize handler invalidates previousBuffer before notifying subscribers.
  back.onResize(() => {});
  (out as unknown as EventEmitter).emit('resize');
  // Second draw of the SAME contents — diff would write nothing; but we just resized,
  // so a full redraw fires (CLEAR + 'abcd' + RESET).
  const before = writes.length;
  back.draw(buf1);
  const drawWrite = writes[before];
  expect(drawWrite).toBeDefined();
  expect(drawWrite!.startsWith(CLEAR)).toBe(true);
  expect(drawWrite).toContain('abcd');
  back.dispose();
});
