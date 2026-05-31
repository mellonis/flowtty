import type { Container, Instance } from './host.js';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function computeLayout(container: Container, width: number, height: number): void {
  for (const root of container.children) {
    // 2-arg form: direction defaults to LTR. (Yoga enums are not on the instance.)
    root.yogaNode.calculateLayout(width, height);
  }
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
