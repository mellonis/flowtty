import { describe, test, expect, vi } from 'vitest';
import { makeDemoSource } from './logSource.js';
import { pickSource } from './logSource.js';

describe('makeDemoSource', () => {
  test('listContainers returns the demo set including a stopped container', async () => {
    const src = makeDemoSource();
    const list = await src.listContainers();
    expect(list.map((c) => c.name)).toContain('poetry-mysql');
    expect(list.some((c) => c.state === 'exited')).toBe(true);
  });

  test('streamLogs seeds tail lines synchronously, then streams; stop() halts it', () => {
    vi.useFakeTimers();
    try {
      const src = makeDemoSource();
      const got: string[] = [];
      const stop = src.streamLogs('c2', { tail: 3 }, (l) => got.push(l));
      expect(got).toHaveLength(3);          // seeded synchronously
      vi.advanceTimersByTime(900);           // two more at 400ms each
      expect(got).toHaveLength(5);
      stop();
      vi.advanceTimersByTime(2000);
      expect(got).toHaveLength(5);           // nothing after stop()
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pickSource', () => {
  test('--demo forces the synthetic source and the demo banner', async () => {
    const { source, demo } = pickSource(['--demo']);
    expect(demo).toBe(true);
    const list = await source.listContainers();
    expect(list.length).toBeGreaterThan(0);
  });
});
