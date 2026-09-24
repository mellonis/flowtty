import { expect, test, vi } from 'vitest';
import { captureConsole } from './consoleCapture.js';

test('captures every console level as a formatted line and restores the originals on release', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const capture = captureConsole();
    console.log('hello %s', 'world', 42);
    console.error(new Error('boom').message, { a: 1 });
    console.warn('careful');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const entries = capture.release();
    expect(entries).toEqual([
      { level: 'log', line: 'hello world 42' },
      { level: 'error', line: 'boom { a: 1 }' },
      { level: 'warn', line: 'careful' },
    ]);
    console.log('after');
    expect(log).toHaveBeenCalledWith('after');
    expect(capture.release()).toEqual([]); // a second release is a no-op
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
});

test('an onEntry sink sees each line as it happens', () => {
  const seen: string[] = [];
  const capture = captureConsole((e) => seen.push(`${e.level}:${e.line}`));
  console.info('one');
  console.debug('two');
  expect(seen).toEqual(['info:one', 'debug:two']);
  capture.release();
});

test('a console method someone replaced during the capture is left as it is on release', () => {
  const original = console.warn;
  const capture = captureConsole();
  const replacement = (): void => {};
  console.warn = replacement; // a logger, a test spy — installed after the capture
  capture.release();
  expect(console.warn).toBe(replacement);
  console.warn = original;
});
