import type { Container, Instance } from './host.js';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// `height` may be undefined: Yoga then leaves the root's height auto, so the
// tree grows to fit its content instead of being stretched or clipped to a
// screen. That is how an unbounded surface is laid out — a backend whose
// `size()` reports a non-finite height (see the Backend interface) — and it is
// also what percent heights resolve against: nothing, so they fall back to auto.
export function computeLayout(container: Container, width: number, height: number | undefined): void {
  for (const root of container.children) {
    // 2-arg form: direction defaults to LTR. (Yoga enums are not on the instance.)
    root.yogaNode.calculateLayout(width, height);
  }
}

// How many rows the laid-out tree actually occupies: the lowest edge over all
// root instances, rounded up to a whole row. 0 for an empty container. Used to
// size the buffer when the surface has no height of its own — the frame is then
// as tall as its content.
export function contentHeight(container: Container): number {
  let bottom = 0;
  for (const root of container.children) {
    const { top, height } = layoutOf(root);
    // Yoga reports NaN for a node that was never laid out; it must not reach a
    // Buffer size, so treat anything non-finite as contributing nothing.
    const edge = top + height;
    if (Number.isFinite(edge) && edge > bottom) bottom = edge;
  }
  return Math.ceil(bottom);
}

// Absolute rect for an instance. Children accumulate parent offsets by passing
// the parent's resolved left/top down (the paint pass does this recursively).
export function layoutOf(inst: Instance, offsetX = 0, offsetY = 0): Rect {
  const n = inst.yogaNode;
  return {
    left: offsetX + n.getComputedLeft(),
    top: offsetY + n.getComputedTop(),
    width: n.getComputedWidth(),
    height: n.getComputedHeight(),
  };
}
