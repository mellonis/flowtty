import { expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import { Buffer, type Backend } from '@flowtty/core';
import { FinalFrameBackend } from './FinalFrameBackend.js';
import { RESET } from './ansi.js';

// A stdout stand-in. `isTTY` defaults to false — the case this backend is for.
function makeStdoutStub({ isTTY = false, columns = 120 }: { isTTY?: boolean; columns?: number } = {}) {
  const writes: string[] = [];
  const stub = Object.assign(new EventEmitter(), {
    isTTY,
    columns,
    rows: 24,
    write(s: string) { writes.push(s); return true; },
  }) as unknown as NodeJS.WriteStream;
  return { stub, writes };
}

function frame(text: string): Buffer {
  const buffer = new Buffer(text.length, 1);
  for (let x = 0; x < text.length; x++) buffer.set(x, 0, text[x]!);
  return buffer;
}

test('it is not a full-screen surface, and it reads no keys', () => {
  const { stub } = makeStdoutStub();
  const backend = new FinalFrameBackend(stub);
  expect(backend.fullScreen).toBe(false);
  expect((backend as { onKey?: unknown }).onKey).toBeUndefined();
  expect((backend as { onResize?: unknown }).onResize).toBeUndefined();
});

test('size: 80 columns when the stream is not a terminal, and a height of Infinity', () => {
  const { stub } = makeStdoutStub();
  expect(new FinalFrameBackend(stub).size()).toEqual({ width: 80, height: Infinity });
});

test('size: the terminal width when there is a terminal', () => {
  const { stub } = makeStdoutStub({ isTTY: true, columns: 120 });
  expect(new FinalFrameBackend(stub).size().width).toBe(120);
});

test('size: explicit width and height win', () => {
  const { stub } = makeStdoutStub({ isTTY: true, columns: 120 });
  expect(new FinalFrameBackend(stub, { width: 40, height: 6 }).size()).toEqual({ width: 40, height: 6 });
});

test('it writes nothing while the app runs — only dispose prints', () => {
  const { stub, writes } = makeStdoutStub();
  const backend = new FinalFrameBackend(stub);
  backend.draw(frame('one'));
  backend.draw(frame('two'));
  expect(writes).toEqual([]);
  backend.dispose();
  expect(writes.join('')).toBe('two\n');
});

test('dispose is idempotent — the frame is printed once', () => {
  const { stub, writes } = makeStdoutStub();
  const backend = new FinalFrameBackend(stub);
  backend.draw(frame('done'));
  backend.dispose();
  backend.dispose();
  expect(writes.join('')).toBe('done\n');
});

test('dispose prints nothing when no frame was ever drawn', () => {
  const { stub, writes } = makeStdoutStub();
  new FinalFrameBackend(stub).dispose();
  expect(writes).toEqual([]);
});

test('no colors in a pipe, even when the styles carry them', () => {
  const { stub, writes } = makeStdoutStub();
  const backend = new FinalFrameBackend(stub);
  const buffer = new Buffer(2, 1);
  buffer.set(0, 0, 'o', { fg: 'green', bold: true });
  buffer.set(1, 0, 'k', { bg: 'red' });
  backend.draw(buffer);
  backend.dispose();
  expect(writes.join('')).toBe(`\x1b[1mo${RESET}k\n`);
  expect(writes.join('')).not.toContain('\x1b[32m');
});

test('FORCE_COLOR asks for color in a pipe too', () => {
  const { stub, writes } = makeStdoutStub();
  const saved = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = '1';
  try {
    const backend = new FinalFrameBackend(stub, { colorDepth: 4 });
    const buffer = new Buffer(1, 1);
    buffer.set(0, 0, 'x', { fg: 'green' });
    backend.draw(buffer);
    backend.dispose();
    expect(writes.join('')).toBe(`\x1b[32mx${RESET}\n`);
  } finally {
    if (saved === undefined) delete process.env.FORCE_COLOR; else process.env.FORCE_COLOR = saved;
  }
});

test('colors on a terminal, at the depth asked for', () => {
  const { stub, writes } = makeStdoutStub({ isTTY: true });
  const backend = new FinalFrameBackend(stub, { color: true, colorDepth: 24 });
  const buffer = new Buffer(1, 1);
  buffer.set(0, 0, 'x', { fg: '#ff8800' });
  backend.draw(buffer);
  backend.dispose();
  expect(writes.join('')).toBe(`\x1b[38;2;255;136;0mx${RESET}\n`);
});

test('color: false wins over a terminal', () => {
  const { stub, writes } = makeStdoutStub({ isTTY: true });
  const backend = new FinalFrameBackend(stub, { color: false });
  const buffer = new Buffer(1, 1);
  buffer.set(0, 0, 'x', { fg: 'red' });
  backend.draw(buffer);
  backend.dispose();
  expect(writes.join('')).toBe('x\n');
});

test('the printed frame is plain lines — no cursor addressing, no alt screen, one trailing newline', () => {
  const { stub, writes } = makeStdoutStub();
  const buffer = new Buffer(4, 2);
  buffer.set(0, 0, 'a'); buffer.set(0, 1, 'b');
  const backend = new FinalFrameBackend(stub);
  backend.draw(buffer);
  backend.dispose();
  const out = writes.join('');
  expect(out).toBe('a\nb\n');
  expect(out).not.toContain('\x1b[?1049h');
  expect(/\x1b\[\d+;\d+H/u.test(out)).toBe(false);
});

test('FinalFrameBackend offers neither bell nor notify — there is no live terminal to interrupt', () => {
  const backend: Backend = new FinalFrameBackend(makeStdoutStub().stub);
  expect(backend.bell).toBeUndefined();
  expect(backend.notify).toBeUndefined();
});
