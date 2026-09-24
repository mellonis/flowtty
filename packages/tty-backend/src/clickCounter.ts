import type { Key } from '@flowtty/core';

/** Presses this close together on the same cell count as one multi-click. */
export const DOUBLE_CLICK_MS = 500;

export interface ClickCounter {
  /** A 'mousedown' comes back with `clicks` set; any other key comes back as is. */
  count(key: Key): Key;
}

/**
 * Count presses the way a terminal does for its own double- and triple-click:
 * the same button on the same cell within `DOUBLE_CLICK_MS` of the previous
 * press raises the count, 1 → 2 → 3, and a fourth starts over. Anything else —
 * another cell, another button, a pause — is a first press. `now` is
 * injectable for tests. See docs/input.md (selection).
 */
export function createClickCounter(now: () => number = Date.now): ClickCounter {
  let last: { x: number; y: number; button: Key['button']; at: number; clicks: number } | null = null;
  return {
    count(key) {
      if (key.name !== 'mousedown' || key.x === undefined || key.y === undefined) return key;
      const at = now();
      const again = last !== null && last.x === key.x && last.y === key.y && last.button === key.button
        && at - last.at <= DOUBLE_CLICK_MS && last.clicks < 3;
      const clicks = again ? last!.clicks + 1 : 1;
      last = { x: key.x, y: key.y, button: key.button, at, clicks };
      return { ...key, clicks };
    },
  };
}
