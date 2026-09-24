import { expect, test } from 'vitest';
import type { Key } from '@flowtty/core';
import { createClickCounter } from './clickCounter.js';

const down = (x: number, y: number, button: Key['button'] = 'left'): Key =>
  ({ name: 'mousedown', x, y, button, sequence: '', ctrl: false, meta: false, shift: false });

test('presses on the same cell within the interval count 1, 2, 3, then start over', () => {
  let t = 0;
  const counter = createClickCounter(() => t);
  expect(counter.count(down(3, 1)).clicks).toBe(1);
  t += 200;
  expect(counter.count(down(3, 1)).clicks).toBe(2);
  t += 200;
  expect(counter.count(down(3, 1)).clicks).toBe(3);
  t += 200;
  expect(counter.count(down(3, 1)).clicks).toBe(1);
});

test('another cell, another button, or too long a pause is a first press again', () => {
  let t = 0;
  const counter = createClickCounter(() => t);
  counter.count(down(3, 1));
  t += 100;
  expect(counter.count(down(4, 1)).clicks).toBe(1);
  t += 100;
  expect(counter.count(down(4, 1, 'right')).clicks).toBe(1);
  t += 600;
  expect(counter.count(down(4, 1, 'right')).clicks).toBe(1);
});

test('keys other than mousedown pass through untouched', () => {
  const counter = createClickCounter(() => 0);
  const up: Key = { ...down(3, 1), name: 'mouseup' };
  expect(counter.count(up)).toBe(up);
  expect(counter.count(up).clicks).toBeUndefined();
});
