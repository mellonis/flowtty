import { expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Buffer } from '../cells.js';
import { TtyBackend } from './tty.js';
import { HIDE_CURSOR, SHOW_CURSOR, CLEAR, RESET } from '../ansi.js';

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
  const stub = {
    columns: cols,
    rows,
    write(s: string) {
      writes.push(s);
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  return { stub, writes };
}

test('TtyBackend writes HIDE_CURSOR on construct and SHOW_CURSOR + RESET on dispose', () => {
  const { stub, writes } = makeStub();
  const b = new TtyBackend(stub);
  expect(writes[0]).toBe(HIDE_CURSOR);
  b.dispose();
  expect(writes.at(-1)).toBe(SHOW_CURSOR + RESET);
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
