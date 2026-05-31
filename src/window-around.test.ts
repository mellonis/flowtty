import { describe, test, expect } from 'vitest';
import { windowAround } from './window-around.js';

describe('windowAround', () => {
  const items = Array.from({ length: 20 }, (_, i) => i); // 0..19

  test('centers cursor when there is room on both sides', () => {
    const { start, items: w } = windowAround(items, 10, 5);
    expect(start).toBe(8);          // 10 - floor(5/2) = 8
    expect(w).toEqual([8, 9, 10, 11, 12]);
  });

  test('sticks to the top when cursor is near the start', () => {
    const { start, items: w } = windowAround(items, 1, 5);
    expect(start).toBe(0);
    expect(w).toEqual([0, 1, 2, 3, 4]);
  });

  test('sticks to the bottom when cursor is near the end', () => {
    const { start, items: w } = windowAround(items, 19, 5);
    expect(start).toBe(15);         // length(20) - visible(5) = 15
    expect(w).toEqual([15, 16, 17, 18, 19]);
  });

  test('window larger than list — shows everything from start 0', () => {
    const { start, items: w } = windowAround(items, 5, 100);
    expect(start).toBe(0);
    expect(w).toEqual(items);
  });

  test('visible <= 0 clamps to a 1-row window', () => {
    const { start, items: w } = windowAround(items, 5, 0);
    expect(start).toBe(5);
    expect(w).toEqual([5]);
  });

  test('empty list returns empty window', () => {
    const { start, items: w } = windowAround([], 0, 10);
    expect(start).toBe(0);
    expect(w).toEqual([]);
  });
});
