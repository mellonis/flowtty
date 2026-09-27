// Clicks and hover on the committed frame, delivered to host instances — the
// mouse's counterpart of the selection controller. One `hitTest` per mouse
// key; a click goes to the nearest box with `onClick` up the chain from the
// topmost box under the cell, hover to every box with `onHoverChange` the
// chain passes through, only on change. Boxes whose input scope is muted
// (`inert`, the page under an open dialog) are skipped. React-free: the
// adapter creates one, feeds it every key before its own subscribers, and
// calls `observe()` after each paint. See docs/input.md (clicks and hover).
import type { Key } from '../keys.js';
import { hitTest, type HitBox } from './hitTest.js';
import type { Container, Instance } from './host.js';

export interface MouseHost {
  /** The laid-out tree, hit-tested when a key arrives. */
  container: Container;
}

// A hit chain with the muted boxes taken out — and everything under a muted
// box with them: a muted box is part of a muted subtree.
function liveChain(chain: readonly HitBox[]): Instance[] {
  const out: Instance[] = [];
  for (const { inst } of chain) {
    if (inst.props.mouseScope?.isMuted() === true) break;
    out.push(inst);
  }
  return out;
}

// The nearest box with `onClick` up the chain from the topmost box under the
// cell — a click's target, at either end of it. Null when nothing in the
// chain wants one.
function topmostClickable(chain: readonly Instance[]): Instance | null {
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i]!.props.onClick !== undefined) return chain[i]!;
  }
  return null;
}

export class MouseController {
  private readonly host: MouseHost;
  /** The press that may become a click: its cell, and the box that would get it. */
  private armed: { x: number; y: number; target: Instance } | null = null;
  /** Where the pointer was last seen, for `observe()`. */
  private cell: { x: number; y: number } | null = null;
  /** The boxes told they are hovered, outermost first. */
  private hovered: Instance[] = [];

  constructor(host: MouseHost) {
    this.host = host;
  }

  /**
   * Feed one key, before any `useInput` subscriber sees it. Returns true when
   * the key belongs to a click this controller delivers (the press that arms
   * it, the release that fires it): the caller withholds it from subscribers.
   */
  handle(key: Key): boolean {
    switch (key.name) {
      case 'mousedown': return this.press(key);
      case 'mousedrag': this.armed = null; return false;
      case 'mouseup': return this.release(key);
      case 'mousemove': this.moveTo(key.x!, key.y!); return false;
      case 'mouseleave': this.cell = null; this.setHovered([]); return false;
      default: return false;
    }
  }

  /** A frame was painted: what is under the resting pointer may have changed. */
  observe(): void {
    if (this.cell !== null) this.moveTo(this.cell.x, this.cell.y);
  }

  /** Clear the hover; nothing is delivered after this. */
  dispose(): void {
    this.cell = null;
    this.armed = null;
    this.setHovered([]);
  }

  private press(key: Key): boolean {
    this.armed = null;
    if (key.button !== 'left' || key.x === undefined || key.y === undefined) return false;
    const target = topmostClickable(liveChain(hitTest(this.host.container, key.x, key.y)));
    if (target === null) return false;
    this.armed = { x: key.x, y: key.y, target };
    return true;
  }

  private release(key: Key): boolean {
    const armed = this.armed;
    this.armed = null;
    if (armed === null || key.x !== armed.x || key.y !== armed.y) return false;
    // The cell is hit-tested again, from scratch: a key between the press and
    // the release may have muted the target's scope (a dialog opened), removed
    // it from the tree (a list refreshed), or put a different box on top of the
    // same cell — the click must go only to the box that is still exactly what
    // the press armed, read fresh in case a re-render replaced its handler.
    if (topmostClickable(liveChain(hitTest(this.host.container, key.x, key.y))) !== armed.target) return false;
    const onClick = armed.target.props.onClick;
    if (onClick === undefined) return false;
    onClick(key);
    return true;
  }

  private moveTo(x: number, y: number): void {
    this.cell = { x, y };
    this.setHovered(liveChain(hitTest(this.host.container, x, y)).filter((inst) => inst.props.onHoverChange !== undefined));
  }

  // Tell the boxes that left, then the ones that entered. An instance that
  // lost its handler since it was told `true` is dropped without a callback:
  // it is no longer listening.
  private setHovered(next: Instance[]): void {
    const prev = this.hovered;
    this.hovered = next;
    for (const inst of prev) {
      if (!next.includes(inst)) inst.props.onHoverChange?.(false);
    }
    for (const inst of next) {
      if (!prev.includes(inst)) inst.props.onHoverChange?.(true);
    }
  }
}
