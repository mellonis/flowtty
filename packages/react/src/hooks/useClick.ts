import { useRef, type RefObject } from 'react';
import type { Key } from '@flowtty/core';
import type { Rect } from '@flowtty/core/host';
import { useInput } from './useInput.js';

/**
 * Act on a click inside a rect — the one `onLayout` hands the component: a
 * press and a release both on it, with no drag between (a drag that starts
 * on it is a selection, not a click). Both the press and the release are
 * consumed, so nothing behind sees them. The fields use it to take focus on a
 * click; any component can, to open a collapsed item or press a custom
 * button. See docs/input.md (the mouse).
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
