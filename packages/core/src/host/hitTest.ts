// Which box is under a cell of the committed frame. The walk mirrors paint's
// traversal exactly — the same two passes, the same zIndex sort, the same clip
// intersections and scroll offsets — so "the box under the pointer" is the box
// whose pixels the person is actually looking at. `hitTest.spec.ts` paints a
// tree and asserts that agreement cell by cell; that cross-check is what keeps
// the two copies honest. They are not one shared traversal because they want
// opposite things from it: paint has to descend into every subtree (an
// off-screen row still fires `onLayout`, and a child can overflow into view),
// while this walk is on the mouse path and prunes whatever it can.
// See docs/input.md (selection).
import { layoutOf, type Rect } from './layout.js';
import {
  contentRectOf, intersectRects, isScrollViewport, paddingRectOf, rectContains, scrollStateOf,
} from './geometry.js';
import type { Container, Instance } from './host.js';

/** One box of a hit chain, with the paint-time context a selection needs: where
 *  it landed and the clip its own cells were drawn against. Its content rect is
 *  `contentRectOf(inst, rect)` — computed by the two callers that want one
 *  rather than for every box the walk passes. */
export interface HitBox {
  inst: Instance;
  /** Absolute rect, scroll offsets of every ancestor already applied. */
  rect: Rect;
  /** Intersection of every clipping ancestor, or null when nothing clips. */
  clip: Rect | null;
  /** Position in paint order. A box with a higher `order` was painted later —
   *  over this one, wherever the two overlap. */
  order: number;
}

/** A region a `selectable={false}` box takes out of a selection: what is
 *  visible of it, and where it fell in paint order — which is how a scope tells
 *  whether the region is painted over it or buried under it. */
export interface UnselectableRegion {
  rect: Rect;
  order: number;
}

interface Probe {
  /** The cell being looked for, or -1,-1 when the caller only wants regions. */
  x: number;
  y: number;
  /** Ancestor-or-self chain of the topmost box over that cell, outermost first. */
  path: HitBox[];
  regions: UnselectableRegion[] | null;
  /** Boxes visited so far — the paint-order stamp on each entry. */
  order: number;
}

// Visit every painted box in paint order (earliest first, so the LAST box to
// claim a cell is the one on top). One `stack` for the whole walk, pushed and
// popped — the chain is only copied where it is actually needed.
function walk(
  inst: Instance,
  offsetX: number,
  offsetY: number,
  clip: Rect | null,
  unselectable: boolean,
  stack: HitBox[],
  probe: Probe,
): void {
  if (inst.props.display === 'none') return;

  const rect = layoutOf(inst, offsetX, offsetY);
  const order = probe.order++;
  stack.push({ inst, rect, clip, order });

  if (rectContains(rect, probe.x, probe.y) && (clip === null || rectContains(clip, probe.x, probe.y))) {
    probe.path = [...stack];
  }
  // Inherited: a box inside an opted-out one is opted out whatever it says.
  // Each box is listed in its own right because `overflow: 'visible'` lets it
  // paint outside its parent's rect.
  const off = unselectable || inst.props.selectable === false;
  if (off && probe.regions !== null) {
    const visible = intersectRects(clip, rect);
    if (visible.width > 0 && visible.height > 0) probe.regions.push({ rect: visible, order });
  }

  const scrolls = isScrollViewport(inst);
  const clipsChildren = inst.props.overflow === 'hidden' || scrolls;
  // Content rects cost eight Yoga calls each — only the boxes that clip, scroll
  // or end up under the pointer need one.
  const childClip = clipsChildren ? intersectRects(clip, contentRectOf(inst, rect)) : clip;
  // Overlays of a scroll viewport may sit in its padding (a scrollbar in the
  // column reserved by paddingRight), so they clip to the padding box instead.
  const overlayClip = scrolls ? intersectRects(clip, paddingRectOf(inst, rect)) : childClip;
  const empty = (r: Rect | null): boolean => r !== null && (r.width <= 0 || r.height <= 0);
  // Nothing under this box can reach the frame: no descendant can paint outside
  // the clip it inherits. (A subtree merely OUTSIDE the pointer is not pruned —
  // an absolutely positioned or overflowing descendant can land anywhere inside
  // the clip.)
  if (empty(childClip) && empty(overlayClip)) { stack.pop(); return; }

  const scrollTop = scrolls ? scrollStateOf(inst, rect).scrollTop : 0;

  let plain = true; // no absolutes, no zIndex: paint order IS child order
  for (const child of inst.children) {
    if (child.type !== 'box') continue;
    if (child.props.position === 'absolute' || child.props.zIndex !== undefined) { plain = false; break; }
  }
  if (plain) {
    for (const child of inst.children) {
      if (child.type === 'box') walk(child, rect.left, rect.top - scrollTop, childClip, off, stack, probe);
    }
    stack.pop();
    return;
  }

  const stackFlow: Instance[] = [];
  const absolutes: Instance[] = [];
  for (const child of inst.children) {
    if (child.type !== 'box') continue;
    (child.props.position === 'absolute' ? absolutes : stackFlow).push(child);
  }
  const byZ = (a: Instance, b: Instance): number => (a.props.zIndex ?? 0) - (b.props.zIndex ?? 0);
  stackFlow.sort(byZ);
  absolutes.sort(byZ);

  for (const child of stackFlow) walk(child, rect.left, rect.top - scrollTop, childClip, off, stack, probe);
  for (const child of absolutes) walk(child, rect.left, rect.top, overlayClip, off, stack, probe);
  stack.pop();
}

function probeFrame(container: Container, x: number, y: number, regions: boolean): Probe {
  const probe: Probe = { x, y, path: [], regions: regions ? [] : null, order: 0 };
  for (const root of container.children) walk(root, 0, 0, null, false, [], probe);
  return probe;
}

/**
 * The chain of boxes — outermost first — ending at the topmost one painted over
 * cell (x, y). Empty when no box covers that cell, which is what a selection
 * outside every root sees. A cell a clipping ancestor threw away is not hittable:
 * nothing of that box is on screen there.
 */
export function hitTest(container: Container, x: number, y: number): HitBox[] {
  return probeFrame(container, x, y, false).path;
}

/**
 * Both halves of what a press needs, from ONE walk of the tree: the chain of
 * boxes under the cell, and every on-screen region a `selectable={false}` box
 * takes out of a selection.
 */
export function unselectableProbe(container: Container, x: number, y: number): {
  path: HitBox[];
  regions: UnselectableRegion[];
} {
  const probe = probeFrame(container, x, y, true);
  return { path: probe.path, regions: probe.regions ?? [] };
}

/**
 * Every on-screen rect that `selectable={false}` takes out of a selection — the
 * opted-out box itself plus its descendants, each clipped to what is visible of
 * it. A descendant is listed in its own right because `overflow: 'visible'` lets
 * it paint outside its parent's rect.
 */
export function unselectableRects(container: Container): Rect[] {
  return probeFrame(container, -1, -1, true).regions!.map((r) => r.rect);
}
