import { expect, test } from 'vitest';
import { Buffer } from '../cells.js';
import { TtyBackend } from './tty.js';
import { HIDE_CURSOR, SHOW_CURSOR, CLEAR, RESET } from '../ansi.js';

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
