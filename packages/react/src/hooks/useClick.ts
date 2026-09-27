import { useRef, type RefObject } from 'react';
import type { Key } from '@flowtty/core';
import type { Rect } from '@flowtty/core/host';
import { useInput } from './useInput.js';

/**
 * Act on a click inside a rect — the one `onLayout` hands the component: a
 * press and a release both on it, with no drag between (a drag that starts
 * on it is a selection, not a click). Both the press and the release are
 * consumed, so nothing behind sees them. For a hit area that is a box of its
 * own, `onClick` on the box is the simpler way and the one the built-in
 * components use; this hook is for a region inside a bigger box. It listens
 * through `useInput`, so a press an `onClick` box above it has taken never
 * reaches it. See docs/input.md (clicks and hover).
 */
export function useClick(rectRef: RefObject<Rect | null>, onClick: (key: Key) => void): void {
  // A press landed on the rect and nothing has moved since.
  const armed = useRef(false);
  useInput((key) => {
    if (key.name === 'mousedrag') { armed.current = false; return; }
    if (key.name !== 'mousedown' && key.name !== 'mouseup') return;
    const r = rectRef.current;
    const inside = r !== null && key.x !== undefined && key.y !== undefined
      && key.x >= r.left && key.x < r.left + r.width && key.y >= r.top && key.y < r.top + r.height;
    if (key.name === 'mousedown') {
      armed.current = inside;
      return inside ? true : undefined;
    }
    const click = armed.current && inside;
    armed.current = false;
    if (!click) return;
    onClick(key);
    return true;
  });
}
