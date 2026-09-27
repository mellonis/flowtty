# Mouse: onClick, hover, row picks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a box declares `onClick` and gets a click; a component asks `useHover()` and re-renders only when its own hover state flips; a click on a list row does what the keyboard would.

**Architecture:** a React-free `MouseController` in core, next to `SelectionController`, resolves the box under a cell with the existing `hitTest` once per mouse key and delivers `onClick` / `onHoverChange` to host-instance props, skipping boxes whose input scope is muted (`inert`, an open dialog). The TTY backend gains an opt-in `?1003h` that turns buttonless motion into a coalesced `mousemove` key and a focus-out into `mouseleave`. React wires the controller in `render.ts`, renders boxes with mouse props through a scope component, and adds `useHover`. The lists put `onClick` on their row boxes.

**Tech Stack:** TypeScript ESM, React 18 reconciler, Yoga (wasm), Vitest (fake timers for the throttle). No new dependencies.

**Spec:** `docs/internal/plans/mouse.md` (design approved 2026-09-27). The plan argues from it; read both.

## Global Constraints

- **No commits by the executor.** The person commits; every task ends with the gate green and the changes in the working tree.
- Gates: `npm test` and `npm run typecheck` from the repo root. Single file: `npx vitest run <path>`.
- `core` imports no react, no node globals. The controller depends on `hitTest` and host instances only.
- Exported functions carry explicit return types; exported consts explicit annotations (oxc dts). `.tsx` files import React.
- Published pages and comments cite `docs/*.md` only — never this plan, the spec, or an issue number.
- Mouse keys keep arriving through `useInput` as documented; the controller delivers on top. A delivered click's `mousedown` and `mouseup` are withheld from subscribers, as `useClick` does by consuming them.
- Default off: an app without `mouse: { hover: true }` sees no `mousemove`; an app with no `onClick` anywhere sees no change in key delivery.
- Commits are the person's: `Ruslan Gilmullin <mellonis@yandex.ru>`. Comments and specs in English.

## Review Focus

1. **A press over an `onClick` box followed by a drag off it and a release elsewhere**: no click, and the `mouseup` (but not the withheld `mousedown`) reaches subscribers, so a drag-selection over a clickable region still copies. (Task 1, Task 4.)
2. **The pointer resting on a row while the list scrolls under it** (wheel, streaming): the hover moves to the new row without any motion report — `observe(frame)` after the paint. (Task 1, Task 4.)
3. **A click on a `Select` option while another `Select`'s popup is open**: closes the open popup without picking, and does not open the second one with the same press. (Task 5.)
4. **Hover on and a terminal that never reports focus-out**: leaving the window leaves a row highlighted until the next move; documented, and `mouseleave` on hover-off clears it. (Task 3.)
5. **Two `onHoverChange` boxes nested (a row inside a panel)**: both are hovered at once; moving from the row to the panel's padding flips the row off and leaves the panel on — no flicker of the panel. (Task 1.)
6. **A `mousemove` key while a button is held**: never produced (that is `mousedrag`); a `mousedrag` does not update hover. (Task 2, Task 1.)

---

## File Structure

```
packages/core/src/keys.ts                                  # MODIFY — 'mousemove', 'mouseleave'
packages/core/src/host/host.ts                             # MODIFY — BoxProps.onClick, onHoverChange, mouseScope
packages/core/src/host/mouse.ts                            # CREATE — MouseController
packages/core/src/host/mouse.spec.ts                       # CREATE
packages/core/src/host/index.ts                            # MODIFY — export
packages/core/src/testing/test-backend.ts                  # MODIFY — mouse('move' | 'leave')
packages/tty-backend/src/key-parser.ts                     # MODIFY — mousemove
packages/tty-backend/src/key-parser.spec.ts                # MODIFY
packages/tty-backend/src/ansi.ts                           # MODIFY — MOUSE_HOVER_ON / OFF
packages/tty-backend/src/tty.ts                            # MODIFY — hover option, coalescing, mouseleave
packages/tty-backend/src/tty.spec.ts                       # MODIFY
packages/react/src/context/inputContext.ts                 # MODIFY — InputSource.isMuted
packages/react/src/components/base/mouseScope.ts           # CREATE — hostBox(): the scope component
packages/react/src/components/base/Box.tsx                 # MODIFY — via hostBox
packages/react/src/components/base/Text.tsx                # MODIFY — via hostBox
packages/react/src/hooks/useHover.ts                       # CREATE
packages/react/src/hooks/useHover.spec.tsx                 # CREATE
packages/react/src/internal/render.ts                      # MODIFY — controller wiring, RenderOptions.mouse
packages/react/src/internal/mouse.spec.tsx                 # CREATE — onClick through render, withholding, muting
packages/react/src/index.ts                                # MODIFY — export useHover
packages/react/src/components/ListSelect.tsx (+spec)       # MODIFY — row onClick
packages/react/src/components/ListMultiSelect.tsx (+spec)  # MODIFY — row onClick
packages/react/src/components/Table.tsx (+spec)            # MODIFY — onRowClick
packages/react/src/components/ScrollList.tsx (+spec)       # MODIFY — onRowClick
packages/react/src/components/Select.tsx (+spec)           # MODIFY — row onClick instead of y arithmetic
docs/input.md, docs/components.md, docs/writing-a-backend.md, docs/testing.md, README.md, CHANGELOG.md
```

---

### Task 1: `MouseController` in core, the props, the key names

**Files:**
- Create: `packages/core/src/host/mouse.ts`, `packages/core/src/host/mouse.spec.ts`
- Modify: `packages/core/src/host/host.ts` (BoxProps, next to `onLayout`), `packages/core/src/keys.ts:10-16`, `packages/core/src/host/index.ts`, `packages/core/src/testing/test-backend.ts:157-175`

**Interfaces:**
- Consumes: `hitTest(container, x, y): HitBox[]` (outermost first, topmost last), `Instance.props`, `Key`.
- Produces:
  - `BoxProps.onClick?: (key: Key) => void`, `BoxProps.onHoverChange?: (hovered: boolean) => void`, `BoxProps.mouseScope?: { isMuted(): boolean }` (adapter-internal).
  - `NAMED_KEYS` gains `'mousemove'`, `'mouseleave'`.
  - `class MouseController { constructor(host: MouseHost); handle(key: Key): boolean; observe(): void; dispose(): void }` with `interface MouseHost { container: Container }`.
  - `TestBackend.mouse(kind: 'down' | 'drag' | 'up' | 'move' | 'leave', x?, y?, options?)`.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/host/mouse.spec.ts`:

```ts
import { expect, test } from 'vitest';
import type { Key } from '../keys.js';
import { getYoga } from './yoga.js';
import { createInstance, appendChild, type BoxProps, type Container, type Instance } from './host.js';
import { computeLayout } from './layout.js';
import { MouseController } from './mouse.js';

async function newContainer(): Promise<Container> {
  const Yoga = await getYoga();
  return { children: [], Yoga };
}
function box(c: Container, props: BoxProps, parent?: Instance): Instance {
  const inst = createInstance('flowtty-box', props, c.Yoga);
  if (parent) appendChild(parent, inst, c.Yoga);
  else c.children.push(inst);
  return inst;
}
const key = (name: string, x: number, y: number, extra: Partial<Key> = {}): Key =>
  ({ name, sequence: '', ctrl: false, meta: false, shift: false, x, y, button: 'left', ...extra });
const down = (x: number, y: number, extra: Partial<Key> = {}) => key('mousedown', x, y, extra);
const up = (x: number, y: number) => key('mouseup', x, y);
const drag = (x: number, y: number) => key('mousedrag', x, y);
const move = (x: number, y: number) => key('mousemove', x, y);

test('a press and a release in one cell over a box with onClick deliver one click to it, and both keys are withheld', async () => {
  const c = await newContainer();
  const clicks: Key[] = [];
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  box(c, { width: 6, height: 2, onClick: (k) => clicks.push(k) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  expect(m.handle(down(3, 1))).toBe(true);
  expect(m.handle(up(3, 1))).toBe(true);
  expect(clicks.map((k) => [k.name, k.x, k.y])).toEqual([['mouseup', 3, 1]]);
});

test('the nearest ancestor with onClick gets the click; a box without one does not stop the walk', async () => {
  const c = await newContainer();
  const got: string[] = [];
  const outer = box(c, { width: 20, height: 5, onClick: () => got.push('outer') });
  const inner = box(c, { width: 10, height: 3 }, outer);
  box(c, { width: 4, height: 1 }, inner);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(down(1, 0)); m.handle(up(1, 0));
  expect(got).toEqual(['outer']);
});

test('where boxes overlap, the one painted on top wins', async () => {
  const c = await newContainer();
  const got: string[] = [];
  const root = box(c, { width: 20, height: 5 });
  box(c, { position: 'absolute', left: 0, top: 0, width: 10, height: 2, onClick: () => got.push('under') }, root);
  box(c, { position: 'absolute', left: 0, top: 0, width: 10, height: 2, zIndex: 1, onClick: () => got.push('over') }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(down(2, 1)); m.handle(up(2, 1));
  expect(got).toEqual(['over']);
});

test('a drag between press and release cancels the click; the release is then passed on', async () => {
  const c = await newContainer();
  let clicks = 0;
  const root = box(c, { width: 20, height: 5 });
  box(c, { width: 6, height: 2, onClick: () => { clicks += 1; } }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  expect(m.handle(down(1, 0))).toBe(true);
  expect(m.handle(drag(2, 0))).toBe(false);
  expect(m.handle(up(2, 0))).toBe(false);
  expect(clicks).toBe(0);
});

test('a press with another button, or on a cell with no onClick, delivers nothing and withholds nothing', async () => {
  const c = await newContainer();
  let clicks = 0;
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  box(c, { width: 6, height: 2, onClick: () => { clicks += 1; } }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  expect(m.handle(down(1, 0, { button: 'right' }))).toBe(false);
  expect(m.handle(up(1, 0))).toBe(false);
  expect(m.handle(down(1, 4))).toBe(false);
  expect(m.handle(up(1, 4))).toBe(false);
  expect(clicks).toBe(0);
});

test('a box whose scope is muted is skipped, and so are its ancestors in the same scope', async () => {
  const c = await newContainer();
  const got: string[] = [];
  let muted = true;
  const scope = { isMuted: () => muted };
  const page = box(c, { width: 20, height: 5, onClick: () => got.push('page'), mouseScope: scope });
  box(c, { width: 6, height: 2, onClick: () => got.push('row'), mouseScope: scope }, page);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  expect(m.handle(down(1, 0))).toBe(false);
  expect(m.handle(up(1, 0))).toBe(false);
  expect(got).toEqual([]);
  muted = false;
  m.handle(down(1, 0)); m.handle(up(1, 0));
  expect(got).toEqual(['row']);
});

test('hover: entering a box calls onHoverChange(true) once, leaving it calls false once; moving inside it calls nothing', async () => {
  const c = await newContainer();
  const calls: boolean[] = [];
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  box(c, { width: 6, height: 2, onHoverChange: (h) => calls.push(h) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(1, 0));
  m.handle(move(2, 0));
  m.handle(move(5, 1));
  expect(calls).toEqual([true]);
  m.handle(move(10, 4));
  expect(calls).toEqual([true, false]);
});

test('hover: nested boxes are hovered together; leaving the inner one keeps the outer one on', async () => {
  const c = await newContainer();
  const calls: string[] = [];
  const panel = box(c, { width: 20, height: 5, padding: 1, onHoverChange: (h) => calls.push(`panel:${h}`) });
  box(c, { width: 6, height: 1, onHoverChange: (h) => calls.push(`row:${h}`) }, panel);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(2, 1));
  expect(calls).toEqual(['panel:true', 'row:true']);
  m.handle(move(2, 3));
  expect(calls).toEqual(['panel:true', 'row:true', 'row:false']);
});

test('hover: a mouseleave clears every hovered box, and a drag does not move the hover', async () => {
  const c = await newContainer();
  const calls: boolean[] = [];
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  box(c, { width: 6, height: 2, onHoverChange: (h) => calls.push(h) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(1, 0));
  m.handle(drag(10, 4));
  expect(calls).toEqual([true]);
  m.handle(key('mouseleave', -1, -1, { x: undefined, y: undefined }));
  expect(calls).toEqual([true, false]);
});

test('hover: observe() after a paint re-evaluates the last cell — content that moved under a resting pointer updates', async () => {
  const c = await newContainer();
  const calls: string[] = [];
  const root = box(c, { width: 20, height: 5, flexDirection: 'column' });
  const a = box(c, { width: 6, height: 1, onHoverChange: (h) => calls.push(`a:${h}`) }, root);
  const b = box(c, { width: 6, height: 1, onHoverChange: (h) => calls.push(`b:${h}`) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(1, 0));
  expect(calls).toEqual(['a:true']);
  // The rows swap places (a re-render reordered them); the pointer did not move.
  root.children.splice(0, 2, b, a);
  computeLayout(c, 20, 5);
  m.observe();
  expect(calls).toEqual(['a:true', 'a:false', 'b:true']);
});

test('dispose() clears the hover without further callbacks after it', async () => {
  const c = await newContainer();
  const calls: boolean[] = [];
  const root = box(c, { width: 20, height: 5 });
  box(c, { width: 6, height: 2, onHoverChange: (h) => calls.push(h) }, root);
  computeLayout(c, 20, 5);
  const m = new MouseController({ container: c });
  m.handle(move(1, 0));
  m.dispose();
  expect(calls).toEqual([true, false]);
  m.observe();
  expect(calls).toEqual([true, false]);
});
```

Note on the reorder test: `root.children.splice` reorders the instance array directly; if `appendChild` / `insertBefore` keep Yoga children in sync (see `host.ts`), use `removeChild(root, a, Yoga); appendChild(root, a, Yoga)` instead so the layout follows.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/host/mouse.spec.ts` → FAIL: cannot resolve `./mouse.js`.

- [ ] **Step 3: The props and the key names**

`packages/core/src/keys.ts:14-15`:

```ts
  'paste', 'wheelup', 'wheeldown',
  'mousedown', 'mousedrag', 'mouseup', 'mousemove', 'mouseleave',
```

and in the `Key` doc comment (lines 35-37, 48-50) add: "`mousemove` is motion with no button held (only when the backend was asked for hover) and `mouseleave` the pointer leaving the window; `mouseleave` carries no `x` / `y`."

`packages/core/src/host/host.ts`, after `onLayout` in `BoxProps`:

```ts
  /** A click on this box: the left button pressed and released in one cell
   *  over it, with no drag between. The nearest box with a handler up the
   *  chain from the topmost box under the cell gets it, once, with the mouse
   *  key; the press and the release are then withheld from `useInput`. A
   *  click does not focus the box: call `focus()` in the handler if it
   *  should. See docs/input.md (clicks and hover). */
  onClick?: (key: Key) => void;
  /** The pointer entered (`true`) or left (`false`) this box — only on a
   *  change. Needs the backend's `mouse: { hover: true }`; `useHover()` wraps
   *  it. See docs/input.md (clicks and hover). */
  onHoverChange?: (hovered: boolean) => void;
  /** Adapter-internal: the input scope the box was rendered in. The mouse
   *  controller skips a box whose scope is muted (`inert`, an open dialog).
   *  The React adapter sets it; app code never does. */
  mouseScope?: { isMuted(): boolean };
```

(`Key` is imported into host.ts if it is not already: `import type { Key } from '../keys.js';`.)

- [ ] **Step 4: Write `mouse.ts`**

```ts
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
    const chain = liveChain(hitTest(this.host.container, key.x, key.y));
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i]!.props.onClick !== undefined) {
        this.armed = { x: key.x, y: key.y, target: chain[i]! };
        return true;
      }
    }
    return false;
  }

  private release(key: Key): boolean {
    const armed = this.armed;
    this.armed = null;
    if (armed === null || key.x !== armed.x || key.y !== armed.y) return false;
    // The handler is read again at release: a re-render between the two keys
    // may have replaced it (or removed it, in which case there is no click).
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
```

- [ ] **Step 5: Export and the test backend**

`packages/core/src/host/index.ts`, after the selection exports:

```ts
// Clicks and hover over the committed frame. See docs/input.md (clicks and hover).
export { MouseController } from './mouse.js';
export type { MouseHost } from './mouse.js';
```

`packages/core/src/testing/test-backend.ts`, `mouse()`:

```ts
  mouse(
    kind: 'down' | 'drag' | 'up' | 'move' | 'leave',
    x = 0,
    y = 0,
    options: { button?: MouseButton; shift?: boolean; meta?: boolean; ctrl?: boolean; clicks?: number } = {},
  ): void {
    const mods = { shift: options.shift ?? false, meta: options.meta ?? false, ctrl: options.ctrl ?? false };
    if (kind === 'leave') { this.press({ name: 'mouseleave', ...mods }); return; }
    if (kind === 'move') { this.press({ name: 'mousemove', x, y, ...mods }); return; }
    this.press({
      name: kind === 'down' ? 'mousedown' : kind === 'drag' ? 'mousedrag' : 'mouseup',
      button: options.button ?? 'left',
      ...(kind === 'down' ? { clicks: options.clicks ?? 1 } : {}),
      x,
      y,
      ...mods,
    });
  }
```

(`press()` fills `sequence`; check its signature at the top of the file and adapt the object if it needs one.)

- [ ] **Step 6: Run the tests and the gate**

Run: `npx vitest run packages/core/src/host/mouse.spec.ts packages/core/src/host/hitTest.spec.ts` → PASS. `npm run typecheck && npm test` → green.

---

### Task 2: `mousemove` in the key parser

**Files:**
- Modify: `packages/tty-backend/src/key-parser.ts:84-95` (`decodeSgrMouse`), `packages/tty-backend/src/key-parser.spec.ts:306-310`

**Interfaces:**
- Produces: `decodeKeys` yields `{ name: 'mousemove', x, y, ctrl, meta, shift }` for an SGR report with button code 3 and final `M`.

- [ ] **Step 1: Rewrite the pinned test**

Replace the test `'motion with NO button held is dropped — it is noise unless 1003 is on'` with:

```ts
test('motion with no button held is mousemove: the terminal sends it only when 1003 is on', () => {
  const { keys } = decodeKeys('a\x1b[<35;5;6Mb');
  expect(keys.map((k) => [k.name, k.x, k.y, k.button])).toEqual([['a', undefined, undefined, undefined], ['mousemove', 4, 5, undefined], ['b', undefined, undefined, undefined]]);
});

test('mousemove carries the modifiers of the report', () => {
  const [k] = decodeKeys('\x1b[<39;5;6M').keys; // 3 + 4 (shift) + 32 (motion)
  expect([k!.name, k!.shift, k!.meta, k!.ctrl]).toEqual(['mousemove', true, false, false]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/tty-backend/src/key-parser.spec.ts` → the two FAIL (motion dropped).

- [ ] **Step 3: Implement**

In `decodeSgrMouse`, replace the `if (code > 2) return final === 'm' && code === 3 ? … : null;` block with:

```ts
  if (code === 3) {
    // A release names its button under SGR 1006 — except in the X10-shaped
    // form "no button", which a few terminals still send. Surfacing it as a
    // buttonless 'mouseup' is deliberate: dropping it would leave a drag open
    // forever, which is worse than an absent field.
    if (final === 'm') return { name: 'mouseup', ...at };
    // Motion with nothing held: a terminal sends it only under 1003, which the
    // backend asks for when the app wants hover. The motion bit is set on
    // these reports; without it a "press of no button" is not a key at all.
    return motion ? { name: 'mousemove', ...at } : null;
  }
  // 66/67 (the horizontal wheel) and 128+ are buttons flowtty does not name.
  if (code > 3) return null;
```

Update the header comment of the parser (line 41) to list `mousemove`.

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/tty-backend/src/key-parser.spec.ts` → PASS. `npm run typecheck` green.

---

### Task 3: hover in `TtyBackend`: the option, coalescing, `mouseleave`

**Files:**
- Modify: `packages/tty-backend/src/ansi.ts:16-17`, `packages/tty-backend/src/tty.ts` (options 27-32, `inputDataHandler` 98-125, the three `MOUSE_ON` / `MOUSE_OFF` writes, `dispose`, `suspend`), `packages/tty-backend/src/tty.spec.ts`

**Interfaces:**
- Consumes: `decodeKeys` (Task 2), `TerminalReport { type: 'focus'; focused }`.
- Produces: `TtyBackendOptions.mouse?: boolean | { hover?: boolean }`; `MOUSE_HOVER_ON = '\x1b[?1003h'`, `MOUSE_HOVER_OFF = '\x1b[?1003l'` exported from `ansi.ts`; subscribers receive `mousemove` at most once per 16 ms with the last position, never twice for one cell, and `mouseleave` on a focus-out.

- [ ] **Step 1: Write the failing tests** (append to `tty.spec.ts`; `makeStub` is defined there; enable fake timers per test with `vi.useFakeTimers()` / `vi.useRealTimers()` — `vi` is imported from vitest at the top, add it if missing)

```ts
function hoverBackend(cols = 20) {
  const { stub: out, writes } = makeStub(cols, 4);
  const stdin = Object.assign(new EventEmitter(), { isTTY: true, setRawMode() {}, resume() {}, pause() {} }) as unknown as NodeJS.ReadStream;
  const back = new TtyBackend(out, stdin, { mouse: { hover: true } });
  const seen: string[] = [];
  back.onKey((k) => { seen.push(k.name === 'mousemove' ? `move ${k.x},${k.y}` : k.name); });
  return { back, writes, stdin, seen };
}

test('mouse: { hover: true } asks for any-event tracking and undoes it on dispose', () => {
  const { back, writes } = hoverBackend();
  expect(writes.join('')).toContain('\x1b[?1003h');
  back.dispose();
  expect(writes[writes.length - 1]).toContain('\x1b[?1003l');
});

test('mouse: true alone asks for no motion reports', () => {
  const { stub: out, writes } = makeStub(20, 4);
  const stdin = Object.assign(new EventEmitter(), { isTTY: true, setRawMode() {}, resume() {}, pause() {} }) as unknown as NodeJS.ReadStream;
  const back = new TtyBackend(out, stdin, { mouse: true });
  back.onKey(() => {});
  expect(writes.join('')).not.toContain('?1003h');
  back.dispose();
});

test('a burst of moves in one chunk is one mousemove with the last position', () => {
  vi.useFakeTimers();
  try {
    const { stdin, seen, back } = hoverBackend();
    stdin.emit('data', '\x1b[<35;2;2M\x1b[<35;3;2M\x1b[<35;4;2M');
    expect(seen).toEqual(['move 3,1']);
    back.dispose();
  } finally { vi.useRealTimers(); }
});

test('moves within 16 ms are held; the last position goes out when the timer fires; the same cell is not repeated', () => {
  vi.useFakeTimers();
  try {
    const { stdin, seen, back } = hoverBackend();
    stdin.emit('data', '\x1b[<35;2;2M');
    stdin.emit('data', '\x1b[<35;3;2M');
    stdin.emit('data', '\x1b[<35;4;2M');
    expect(seen).toEqual(['move 1,1']);
    vi.advanceTimersByTime(16);
    expect(seen).toEqual(['move 1,1', 'move 3,1']);
    vi.advanceTimersByTime(16);
    stdin.emit('data', '\x1b[<35;4;2M');
    expect(seen).toEqual(['move 1,1', 'move 3,1']);
    back.dispose();
  } finally { vi.useRealTimers(); }
});

test('a press flushes a held move first, so a click never precedes its position', () => {
  vi.useFakeTimers();
  try {
    const { stdin, seen, back } = hoverBackend();
    stdin.emit('data', '\x1b[<35;2;2M');
    stdin.emit('data', '\x1b[<35;6;2M');
    stdin.emit('data', '\x1b[<0;6;2M');
    expect(seen).toEqual(['move 1,1', 'move 5,1', 'mousedown']);
    back.dispose();
  } finally { vi.useRealTimers(); }
});

test('a focus-out becomes mouseleave when hover is on, and a held move is dropped with it', () => {
  vi.useFakeTimers();
  try {
    const { stdin, seen, back } = hoverBackend();
    stdin.emit('data', '\x1b[<35;2;2M');
    stdin.emit('data', '\x1b[<35;3;2M');
    stdin.emit('data', '\x1b[O');
    expect(seen).toEqual(['move 1,1', 'mouseleave']);
    vi.advanceTimersByTime(20);
    expect(seen).toEqual(['move 1,1', 'mouseleave']);
    back.dispose();
  } finally { vi.useRealTimers(); }
});

test('suspend() turns motion reports off and resume() on again', () => {
  const { back, writes } = hoverBackend();
  back.suspend();
  expect(writes[writes.length - 1]).toContain('\x1b[?1003l');
  back.resume();
  expect(writes[writes.length - 1]).toContain('\x1b[?1003h');
  back.dispose();
});
```

(Check how the existing spec builds a stdin stub — there may be a helper already; reuse it instead of the inline `Object.assign`. The `CSI O` focus-out must reach `decodeKeys` as a report; `key-parser.spec` has a case for it, confirm the exact bytes there.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/tty-backend/src/tty.spec.ts` → the new tests FAIL (no `?1003h`, moves undelivered).

- [ ] **Step 3: Implement**

`ansi.ts`, after `MOUSE_OFF`:

```ts
// Any-event tracking: motion reports with no button held, for hover. Asked for
// on top of MOUSE_ON only when the app wants it — it is a report per pointer
// move. See docs/input.md (clicks and hover).
export const MOUSE_HOVER_ON = '\x1b[?1003h';
export const MOUSE_HOVER_OFF = '\x1b[?1003l';
```

`tty.ts` option:

```ts
  /**
   * Report the mouse: the wheel as 'wheelup' / 'wheeldown', buttons as
   * 'mousedown' / 'mousedrag' / 'mouseup'. `{ hover: true }` also reports
   * motion with no button held, as 'mousemove' (coalesced: one per cell, at
   * most one per ~16 ms) and the pointer leaving the window as 'mouseleave'.
   * Off by default: while mouse reporting is on, the terminal hands
   * drag-to-select to the app, so users lose native text selection (most
   * terminals restore it with Shift or Option held); hover adds a report per
   * pointer move, which a slow link feels. See docs/input.md (clicks and hover).
   */
  mouse?: boolean | { hover?: boolean };
```

Two private getters in the class:

```ts
  private get mouseOn(): boolean { return this.options.mouse !== undefined && this.options.mouse !== false; }
  private get hoverOn(): boolean { return typeof this.options.mouse === 'object' && this.options.mouse.hover === true; }
  private mouseSequence(on: boolean): string {
    if (!this.mouseOn) return '';
    if (on) return MOUSE_ON + (this.hoverOn ? MOUSE_HOVER_ON : '');
    return (this.hoverOn ? MOUSE_HOVER_OFF : '') + MOUSE_OFF;
  }
```

and replace every `(this.options.mouse ? MOUSE_ON : '')` with `this.mouseSequence(true)` and every `(this.options.mouse ? MOUSE_OFF : '')` with `this.mouseSequence(false)` (the writes at lines 386, 432, 453 and any in `suspend`).

Coalescing state and delivery. Extract the per-key body of `inputDataHandler` (from `const key = this.clicks.count(raw)` to the end of the loop) into `private deliver(raw: Key): void`. Then:

```ts
  // Hover coalescing: the last move of a chunk is the one that counts, and
  // between chunks a move is held for up to 16 ms so a sweep across the screen
  // is one key per frame, not one per cell. See docs/input.md (clicks and hover).
  private lastMoveAt = -Infinity;
  private lastMoveCell: { x: number; y: number } | null = null;
  private heldMove: Key | null = null;
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly MOVE_INTERVAL_MS = 16;

  private readonly inputDataHandler = (chunk: NodeBuffer | string): void => {
    const s = this.pendingInput + (typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
    const { keys, rest, reports } = decodeKeys(s);
    this.pendingInput = rest;
    if (reports.length > 0) this.scheme.handle(reports);
    // The pointer left the window: whatever it hovered is no longer under it.
    if (this.hoverOn && reports.some((r) => r.type === 'focus' && !r.focused)) {
      this.dropHeldMove();
      this.deliver({ name: 'mouseleave', sequence: '', ctrl: false, meta: false, shift: false });
    }
    // Only the last move of the chunk matters; every other key goes out as it is.
    let lastMove: Key | null = null;
    for (const raw of keys) {
      if (raw.name === 'mousemove') { lastMove = raw; continue; }
      this.flushHeldMove();
      this.deliver(raw);
    }
    if (lastMove !== null) this.move(lastMove);
  };

  private move(key: Key): void {
    if (this.lastMoveCell !== null && this.lastMoveCell.x === key.x && this.lastMoveCell.y === key.y) return;
    const now = Date.now();
    if (now - this.lastMoveAt >= TtyBackend.MOVE_INTERVAL_MS) { this.emitMove(key, now); return; }
    this.heldMove = key;
    if (this.moveTimer === null) {
      this.moveTimer = setTimeout(() => { this.moveTimer = null; this.flushHeldMove(); }, TtyBackend.MOVE_INTERVAL_MS - (now - this.lastMoveAt));
    }
  }

  private flushHeldMove(): void {
    const held = this.heldMove;
    this.dropHeldMove();
    if (held !== null && !(this.lastMoveCell !== null && this.lastMoveCell.x === held.x && this.lastMoveCell.y === held.y)) this.emitMove(held, Date.now());
  }

  private dropHeldMove(): void {
    this.heldMove = null;
    if (this.moveTimer !== null) { clearTimeout(this.moveTimer); this.moveTimer = null; }
  }

  private emitMove(key: Key, at: number): void {
    this.lastMoveAt = at;
    this.lastMoveCell = { x: key.x!, y: key.y! };
    this.deliver(key);
  }
```

`dispose()` and `suspend()` call `this.dropHeldMove()` and reset `lastMoveCell = null` (a resumed app starts from nothing). `deliver()` is the old loop body: `clicks.count`, subscribers, the Ctrl-C / Ctrl-Z defaults. Note `Date.now()` is what `vi.useFakeTimers()` fakes, so the tests' timing holds.

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/tty-backend` → PASS. `npm run typecheck && npm test` → green.

---

### Task 4: React: the scope, `render.ts` wiring, `useHover`

**Files:**
- Modify: `packages/react/src/context/inputContext.ts:20-40`, `packages/react/src/components/base/Box.tsx`, `packages/react/src/components/base/Text.tsx:57,68`, `packages/react/src/internal/render.ts` (RenderOptions, `draw`, `makeKeySource`, the controller), `packages/react/src/index.ts`
- Create: `packages/react/src/components/base/mouseScope.ts`, `packages/react/src/hooks/useHover.ts`, `packages/react/src/hooks/useHover.spec.tsx`, `packages/react/src/internal/mouse.spec.tsx`

**Interfaces:**
- Consumes: `MouseController` (Task 1), `TestBackend.mouse('move' | 'leave')` (Task 1).
- Produces: `InputSource.isMuted?(): boolean`; `hostBox(props, children): ReactNode` (renders `'flowtty-box'`, through `MouseScope` when `onClick` / `onHoverChange` is set); `useHover(): [boolean, { onHoverChange: (h: boolean) => void }]`; `RenderOptions.mouse?: boolean`.

- [ ] **Step 1: Write the failing tests**

`packages/react/src/internal/mouse.spec.tsx`:

```tsx
import React from 'react';
import { createElement, useState, type ReactNode } from 'react';
import { expect, test } from 'vitest';
import type { Key } from '@flowtty/core';
import { TestBackend, flush, flushAsync } from '@flowtty/core/testing';
import { render } from './render.js';
import { Box } from '../components/base/Box.js';
import { Text } from '../components/base/Text.js';
import { DialogHost } from '../components/DialogHost.js';
import { useDialogHost } from '../hooks/useDialog.js';
import { useInput } from '../hooks/useInput.js';

test('onClick on a Box fires on press + release in one cell, and neither key reaches useInput', async () => {
  const backend = new TestBackend(20, 4);
  const clicks: string[] = [];
  const seen: string[] = [];
  function App() {
    useInput((k) => { seen.push(k.name); });
    return (
      <Box flexDirection="column">
        <Text onClick={(k: Key) => clicks.push(`row1@${k.x},${k.y}`)}>row 1</Text>
        <Text>row 2</Text>
      </Box>
    );
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  backend.mouse('down', 2, 0); backend.mouse('up', 2, 0);
  await flush();
  expect(clicks).toEqual(['row1@2,0']);
  expect(seen).toEqual([]);
  backend.mouse('down', 2, 1); backend.mouse('up', 2, 1);
  await flush();
  expect(clicks).toEqual(['row1@2,0']);
  expect(seen).toEqual(['mousedown', 'mouseup']);
  r.unmount();
});

test('a drag off the box cancels the click; the release reaches useInput', async () => {
  const backend = new TestBackend(20, 4);
  const clicks: number[] = [];
  const seen: string[] = [];
  function App() {
    useInput((k) => { seen.push(k.name); });
    return <Text onClick={() => clicks.push(1)}>row 1</Text>;
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  backend.mouse('down', 1, 0); backend.mouse('drag', 3, 0); backend.mouse('up', 3, 0);
  await flush();
  expect(clicks).toEqual([]);
  expect(seen).toEqual(['mousedrag', 'mouseup']);
  r.unmount();
});

test('a box under inert gets no click; the keys go on to useInput', async () => {
  const backend = new TestBackend(20, 4);
  const clicks: number[] = [];
  const seen: string[] = [];
  function App() {
    useInput((k) => { seen.push(k.name); });
    return <Box inert><Text onClick={() => clicks.push(1)}>row 1</Text></Box>;
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  backend.mouse('down', 1, 0); backend.mouse('up', 1, 0);
  await flush();
  expect(clicks).toEqual([]);
  expect(seen).toEqual(['mousedown', 'mouseup']);
  r.unmount();
});

test('the page under an open dialog gets no click', async () => {
  const backend = new TestBackend(20, 6);
  const clicks: number[] = [];
  let open!: () => void;
  function Page() {
    const host = useDialogHost();
    open = () => { void host.openDialog(<Text>dialog</Text>, { floating: true, anchor: { left: 10, top: 3, width: 8, height: 1 } }); };
    return <Text onClick={() => clicks.push(1)}>row 1</Text>;
  }
  const r = await render(<DialogHost><Page /></DialogHost>, backend);
  await flushAsync(backend);
  open();
  await flushAsync(backend);
  backend.mouse('down', 1, 0); backend.mouse('up', 1, 0);
  await flush();
  expect(clicks).toEqual([]);
  r.unmount();
});

test('render({ mouse: false }) delivers no clicks at all', async () => {
  const backend = new TestBackend(20, 4);
  const clicks: number[] = [];
  const r = await render(<Text onClick={() => clicks.push(1)}>row 1</Text>, backend, { mouse: false });
  await flushAsync(backend);
  backend.mouse('down', 1, 0); backend.mouse('up', 1, 0);
  await flush();
  expect(clicks).toEqual([]);
  r.unmount();
});

test('hover follows content that scrolls under a resting pointer', async () => {
  const backend = new TestBackend(20, 4);
  const calls: string[] = [];
  let setOrder!: (o: string[]) => void;
  function App() {
    const [order, set] = useState(['a', 'b']);
    setOrder = set;
    return (
      <Box flexDirection="column">
        {order.map((id) => <Text key={id} onHoverChange={(h: boolean) => calls.push(`${id}:${h}`)}>{id}</Text>)}
      </Box>
    );
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  backend.mouse('move', 0, 0);
  await flush();
  expect(calls).toEqual(['a:true']);
  setOrder(['b', 'a']);
  await flushAsync(backend);
  expect(calls).toEqual(['a:true', 'a:false', 'b:true']);
  r.unmount();
});
```

`packages/react/src/hooks/useHover.spec.tsx`:

```tsx
import React from 'react';
import { expect, test } from 'vitest';
import { TestBackend, flush, flushAsync } from '@flowtty/core/testing';
import { render } from '../internal/render.js';
import { Box } from '../components/base/Box.js';
import { Text } from '../components/base/Text.js';
import { useHover } from './useHover.js';

test('useHover flips on enter and leave, and the component renders once per flip', async () => {
  const backend = new TestBackend(20, 4);
  let renders = 0;
  function Row({ label }: { label: string }) {
    const [hovered, hover] = useHover();
    renders += 1;
    return <Text {...hover} dim={!hovered}>{label}</Text>;
  }
  const r = await render(<Box flexDirection="column"><Row label="one" /><Row label="two" /></Box>, backend);
  await flushAsync(backend);
  const after = renders;
  backend.mouse('move', 1, 0);
  await flush();
  expect(backend.lastBuffer!.get(0, 0).style.dim).toBeUndefined();
  expect(backend.lastBuffer!.get(0, 1).style.dim).toBe(true);
  backend.mouse('move', 2, 0);
  await flush();
  expect(renders).toBe(after + 1);
  backend.mouse('move', 2, 1);
  await flush();
  expect(backend.lastBuffer!.get(0, 0).style.dim).toBe(true);
  expect(backend.lastBuffer!.get(0, 1).style.dim).toBeUndefined();
  expect(renders).toBe(after + 3);
  backend.mouse('leave');
  await flush();
  expect(backend.lastBuffer!.get(0, 1).style.dim).toBe(true);
  r.unmount();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/react/src/internal/mouse.spec.tsx packages/react/src/hooks/useHover.spec.tsx` → FAIL (no `useHover`; clicks undelivered; typecheck errors on `onClick` are expected until Task 1's props exist — Task 1 is done first).

- [ ] **Step 3: `InputSource.isMuted`**

`inputContext.ts`:

```ts
export interface InputSource {
  subscribe(handler: KeySubscriber, options?: SubscribeOptions): () => void;
  /** Whether keys are currently withheld from this scope (`inert`, the page
   *  under an open dialog). Absent on a source that never mutes. */
  isMuted?(): boolean;
}

export function createMutedSource(outer: InputSource, isMuted: () => boolean): InputSource {
  return {
    subscribe: (handler, options) => outer.subscribe((key) => (isMuted() ? undefined : handler(key)), options),
    isMuted: () => isMuted() || (outer.isMuted?.() ?? false),
  };
}
```

(If `InputSource` is declared with a different shape, keep its members and add `isMuted`.)

- [ ] **Step 4: The scope component and `hostBox`**

`packages/react/src/components/base/mouseScope.ts`:

```ts
import { createElement, useContext, useMemo, type ReactNode } from 'react';
import type { BoxProps } from '@flowtty/core';
import { InputContext } from '../../context/inputContext.js';

// A box with `onClick` / `onHoverChange` carries the input scope it was
// rendered in, so the mouse controller can skip it while that scope is muted
// (`inert`, the page under an open dialog) — the same rule `useInput`
// subscriptions follow. Plain boxes never come through here and stay
// hook-free. See docs/input.md (clicks and hover).
function MouseScope({ props, children }: { props: BoxProps; children?: ReactNode }): ReactNode {
  const source = useContext(InputContext);
  const mouseScope = useMemo(() => ({ isMuted: () => source.isMuted?.() ?? false }), [source]);
  return createElement('flowtty-box', { ...props, mouseScope }, children);
}

/** The host element for a box: through the mouse scope when it takes clicks or hover, bare otherwise. */
export function hostBox(props: BoxProps, children?: ReactNode): ReactNode {
  if (props.onClick !== undefined || props.onHoverChange !== undefined) return createElement(MouseScope, { props }, children);
  return createElement('flowtty-box', props, children);
}
```

`Box.tsx`: `const node = hostBox(rest, children);` (import `hostBox`). `Text.tsx`: both `createElement('flowtty-box', …)` calls become `hostBox(…)` with the same props and children.

- [ ] **Step 5: `useHover`**

`packages/react/src/hooks/useHover.ts`:

```ts
import { useCallback, useState } from 'react';

/**
 * Whether the pointer is over the box the returned props are spread on, and
 * the props to spread: `const [hovered, hover] = useHover();
 * <Text {...hover} dim={!hovered}>`. The component re-renders on enter and
 * on leave, never on a move inside. Needs the backend's `mouse: { hover:
 * true }`; without it `hovered` stays false. See docs/input.md (clicks and hover).
 */
export function useHover(): [boolean, { onHoverChange: (hovered: boolean) => void }] {
  const [hovered, setHovered] = useState(false);
  const onHoverChange = useCallback((next: boolean) => { setHovered((prev) => (prev === next ? prev : next)); }, []);
  return [hovered, { onHoverChange }];
}
```

`packages/react/src/index.ts`, next to `useClick`: `export { useHover } from './hooks/useHover.js';`.

- [ ] **Step 6: `render.ts`**

`RenderOptions`, after `selection`:

```ts
  /** Deliver clicks to `onClick` and hover to `onHoverChange` / `useHover`
   *  from the committed frame. Default true, and inert until the backend
   *  delivers mouse keys. Set false to leave the mouse entirely to
   *  `useInput`. See docs/input.md (clicks and hover). */
  mouse?: boolean;
```

`makeKeySource`: `beforeDispatch?: (key: Key) => boolean | void` — when it returns `true`, the key is not dispatched to subscribers and `consumed` is `true`:

```ts
        detachBackend = backend.onKey((key) => {
          if (beforeDispatch?.(key) === true) { afterDispatch?.(); return true; }
          let consumed = false;
          root.flushSync(() => { … });
          afterDispatch?.();
          return consumed;
        });
```

The controller, next to the selection one (after `createRoot`):

```ts
  let mouse: MouseController | null = null;
  if (options.mouse !== false) mouse = new MouseController({ container });
```

`draw()`: after `selection?.observe(frame)`, `mouse?.observe();`. The key source: `beforeDispatch` is `(key) => { selection?.handleKey(key); return mouse?.handle(key) ?? false; }` when either exists; `afterDispatch` unchanged. On unmount / teardown (where the selection is dropped), `mouse?.dispose()`. Import `MouseController` from `@flowtty/core/host`.

Note: `mouse.handle()` calls `onClick` / `onHoverChange` outside `flushSync`; a `setState` in them (as `useHover` does) is batched by React and committed on its own schedule, which is what the tests' `flush()` waits for. If a test shows the hover paint lagging one flush, wrap the two calls in `root.flushSync` inside `beforeDispatch`.

- [ ] **Step 7: Run the tests and the gate**

Run: `npx vitest run packages/react/src/internal/mouse.spec.tsx packages/react/src/hooks/useHover.spec.tsx packages/react/src/internal/selection.spec.tsx packages/react/src/internal/input-dispatch.spec.tsx packages/react/src/components/Button.spec.tsx` → PASS. `npm run typecheck && npm test` → green.

---

### Task 5: row picks in the components

**Files:**
- Modify: `packages/react/src/components/ListSelect.tsx:62-77` (+ `ListSelect.spec.tsx`), `ListMultiSelect.tsx:74-129` (+ spec), `Table.tsx:36-72, 223-262` (+ `Table.spec.tsx`), `ScrollList.tsx:7-20, 116-125` (+ `ScrollList.spec.tsx`), `Select.tsx:284-292, 313-325` (+ `Select.spec.tsx`)

**Interfaces:**
- Consumes: `BoxProps.onClick` (Task 1), delivery through `render` (Task 4).
- Produces: `TableProps.onRowClick?: (index: number, key: Key) => void`; `ScrollListProps.onRowClick?: (index: number, key: Key) => void`.

- [ ] **Step 1: Write the failing tests**

`ListSelect.spec.tsx` (append; it renders with `createElement` and `TestBackend`, `flush`):

```ts
test('a click on a row moves the highlight to it and reports onChange; nothing is submitted', async () => {
  const changes: string[] = [];
  const submits: string[] = [];
  function App() {
    const [v, setV] = useState('a');
    return createElement(ListSelect, {
      items: [{ label: 'apple', value: 'a' }, { label: 'banana', value: 'b' }, { label: 'cherry', value: 'c' }],
      value: v,
      onChange: (x: string) => { changes.push(x); setV(x); },
      onSubmit: (x: string) => submits.push(x),
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.mouse('down', 3, 2); backend.mouse('up', 3, 2);
  await flush();
  expect(changes).toEqual(['c']);
  expect(submits).toEqual([]);
  expect(backend.lastFrame).toBe('  apple\n  banana\n▸ cherry');
});
```

(In this file the list is focused by default when alone; if the frame shows a dim marker, wrap in the pattern the file's other focus tests use, or pass `isFocused: true`.)

`ListMultiSelect` (append to the same spec file, which imports it):

```ts
test('a click on a row toggles it', async () => {
  const changes: string[][] = [];
  function App() {
    const [v, setV] = useState<string[]>([]);
    return createElement(ListMultiSelect, {
      items: [{ label: 'apple', value: 'a' }, { label: 'banana', value: 'b' }],
      value: v,
      onChange: (x: string[]) => { changes.push(x); setV(x); },
      onSubmit: () => {},
      isFocused: true,
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.mouse('down', 4, 1); backend.mouse('up', 4, 1);
  await flush();
  expect(changes).toEqual([['b']]);
  backend.mouse('down', 4, 1); backend.mouse('up', 4, 1);
  await flush();
  expect(changes).toEqual([['b'], []]);
});
```

`Table.spec.tsx` (inside the describe):

```tsx
  test('a click on a data row reports its index; the header reports nothing', async () => {
    const backend = new TestBackend(30, 8);
    const clicked: number[] = [];
    const columns: TableColumn<Person>[] = [{ accessor: 'name', header: 'Name' }, { accessor: 'age', header: 'Age' }];
    const data: Person[] = [{ name: 'Ann', age: 30 }, { name: 'Bo', age: 7 }];
    const r = await render(<Table data={data} columns={columns} width={30} onRowClick={(i) => clicked.push(i)} />, backend);
    await flushAsync(backend);
    const rows = backend.lastFrame.split('\n');
    const bo = rows.findIndex((l) => l.includes('Bo'));
    const header = rows.findIndex((l) => l.includes('Name'));
    backend.mouse('down', 3, bo); backend.mouse('up', 3, bo);
    backend.mouse('down', 3, header); backend.mouse('up', 3, header);
    await flush();
    expect(clicked).toEqual([1]);
    r.unmount();
  });
```

`ScrollList.spec.tsx` (inside the describe, with its `mount` and `lines` helpers):

```tsx
  test('a click on a row reports the row index, scroll offset included', async () => {
    const clicked: number[] = [];
    const { backend, frame, unmount } = await mount(<ScrollList height={4} anchor="bottom" items={lines(10)} renderItem={row} onRowClick={(i) => clicked.push(i)} />);
    expect(await frame()).toEqual(['row 6', 'row 7', 'row 8', 'row 9']);
    backend.mouse('down', 1, 2); backend.mouse('up', 1, 2);
    await frame();
    expect(clicked).toEqual([8]);
    unmount();
  });
```

`Select.spec.tsx`, inside `describe('Select — mouse')`, next to the existing press test (which keeps passing unchanged — it is the behaviour being moved onto `onClick`). `mount`, `Single`, `row` and `PLANS` are the file's own fixtures; `Single` renders one `Select`, so this test renders two through a small `Pair` beside it:

```tsx
  function Pair(): ReactNode {
    const [a, setA] = useState('hobby');
    const [b, setB] = useState('hobby');
    return (
      <DialogHost>
        <FocusGroup>
          <Box flexDirection="column">
            <Select items={PLANS} value={a} onChange={setA} label="First" />
            <Select items={PLANS} value={b} onChange={setB} label="Second" />
          </Box>
        </FocusGroup>
      </DialogHost>
    );
  }

  test('a press outside the open popup closes it without picking, and does not open the other Select', async () => {
    const { backend, frame, unmount } = await mount(<Pair />, 40, 14);
    backend.mouse('down', 3, 0); backend.mouse('up', 3, 0);   // open the first
    let lines = await frame();
    expect(row(lines, 'Team')).toBeDefined();
    const second = lines.findIndex((l) => l.includes('Second'));
    backend.mouse('down', 3, second); backend.mouse('up', 3, second); // a press on the second field, outside the popup
    lines = await frame();
    expect(row(lines, 'Team')).toBeUndefined();               // the first popup closed…
    expect(lines.filter((l) => l.includes('Business')).length).toBe(0); // …and no popup is open at all
    unmount();
  });
```

(Adapt the `label` prop name and the `mount` signature to what the file's fixtures use; the two assertions are the point: closed, and nothing else opened by the same press.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/react/src/components/ListSelect.spec.tsx packages/react/src/components/Table.spec.tsx packages/react/src/components/ScrollList.spec.tsx` → the new tests FAIL (no `onRowClick`; clicks change nothing).

- [ ] **Step 3: Implement**

`ListSelect.tsx`: a `pick` next to the `useInput`:

```ts
  // A click on a row: the highlight moves there and the value follows, as an
  // arrow key would. Confirming is not the list's business (Enter still is).
  const pick = (row: number) => {
    focus();
    if (row === cursorClamped) return;
    setState({ cursor: row, filter: state.filter });
    const item = items[visible[row]!]!;
    if (item.value !== value) onChange(item.value);
  };
```

and on the row: `<Box key={origIdx} flexDirection="row" onClick={() => pick(row)}>`.

`ListMultiSelect.tsx`: extract the toggle from the `useInput` branch into `const toggleAt = (index: number) => { … onChange(next); }` and use it there; the `row` helper takes an `onClick`: `row(isCursor, label, key, onClick)` → `<Box key={key} flexDirection="row" onClick={onClick}>`; item rows: `() => { focus(); setState({ cursor: i }); toggleAt(i); }`; the add row: `() => { focus(); setState({ cursor: items.length }); addNew(); }`.

`Table.tsx`: `onRowClick?: (index: number, key: Key) => void;` on `TableProps` (doc: "A click on a data row, with its index into `data`. The header and the rules report nothing."); `renderRow` gains a parameter `onClick?: (key: Key) => void` and puts it on its `<Box flexDirection="row" onClick={onClick}>`; the data-row call passes `onRowClick === undefined ? undefined : (k) => onRowClick(abs, k)` where `abs` is the row's index into `data` (line 262 has it); the header call passes nothing.

`ScrollList.tsx`: `onRowClick?: (index: number, key: Key) => void;` on `ScrollListProps` (doc: "A click on a row, with its index into `items`."); the rendered item box: `<Box key={…} height={rowHeight} flexShrink={0} flexGrow={0} onClick={onRowClick === undefined ? undefined : (k) => onRowClick(i, k)}>`.

`Select.tsx`: the popup rows get `onClick={() => { setCursor(rowIndex); choose(rowIndex); }}`; in the `useInput`, the `mousedown` branch keeps only the outside case:

```ts
    if (key.name === 'mousedown') {
      // Inside the popup a row's own onClick picks; a press anywhere else closes.
      if (!inside(rectRef.current, key.x, key.y)) cancel();
      return true;
    }
```

(`return true` on an inside press keeps the popup's own consumption of presses the controller did not withhold — a press on the filter line or blank rows.)

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/react/src/components/` → PASS. `npm run typecheck && npm test` → green.

---

### Task 6: end to end, docs, CHANGELOG, README

**Files:**
- Modify: `packages/react/src/internal/render.spec.ts`, `docs/input.md` (the "Paste and the mouse" section and a new "Clicks and hover" section after it), `docs/components.md` (ListSelect 151, ListMultiSelect 165, Table 286, Select 114, ScrollList), `docs/writing-a-backend.md` (the `onKey` bullet), `docs/testing.md:100-118`, `README.md:95-97`, `CHANGELOG.md`

- [ ] **Step 1: The end-to-end test** (append to `render.spec.ts`)

```ts
test('a click lands in the box painted on top where two onClick boxes overlap', async () => {
  const backend = new TestBackend(12, 3);
  const got: string[] = [];
  const handle = await render(
    createElement(Box, { width: 12, height: 3 },
      createElement(Box, { position: 'absolute', left: 0, top: 0, width: 6, height: 1, onClick: () => got.push('under') }, createElement(Text, null, 'under')),
      createElement(Box, { position: 'absolute', left: 0, top: 0, width: 6, height: 1, zIndex: 1, onClick: () => got.push('over') }, createElement(Text, null, 'over')),
    ),
    backend,
  );
  await flushAsync(backend);
  backend.mouse('down', 1, 0); backend.mouse('up', 1, 0);
  await flush();
  expect(got).toEqual(['over']);
  handle.unmount();
});
```

Run: `npx vitest run packages/react/src/internal/render.spec.ts` → PASS.

- [ ] **Step 2: docs/input.md**

In "Paste and the mouse": the "Buttons" bullet's sentence "Motion with no button held is never reported." becomes "Motion with no button held is reported as `mousemove` only when the backend was asked for hover (`mouse: { hover: true }`), coalesced to one key per cell and at most one per ~16 ms; the pointer leaving the window is `mouseleave`, with no coordinates." Add to the code sample: `if (key.name === 'mousemove') hoverAt(key.x!, key.y!);`. Then a new section after it:

```markdown
## Clicks and hover

A box takes a click by declaring it, and a component asks whether the pointer
is over it:

```tsx
<Text onClick={() => open(id)}>▸ {title}</Text>

function FoldLine({ title }) {
  const [hovered, hover] = useHover();
  return <Text {...hover} dim={!hovered} onClick={toggle}>{title}</Text>;
}
```

- **`onClick(key)`** fires on a left press and release in the same cell over
  the box, with no drag between (a drag is a selection). The box painted on
  top wins where boxes overlap, and the nearest box with a handler up from it
  gets the click — once. Its press and release are withheld from `useInput`,
  the way `useClick` consumes them; a press that reaches no handler goes on to
  subscribers as before. A click does not focus the box: call `focus()` in the
  handler when it should, as `Button` does. `useClick(rectRef, handler)` still
  works for a component that wants its own rect logic.
- **`useHover()`** returns `[hovered, props]`; spread the props on one box.
  The component re-renders when the pointer enters or leaves that box, never
  on a move inside it. Nested boxes can be hovered together. When the content
  under a resting pointer changes — a list scrolled, a row appeared — the
  hover follows without any motion. `onHoverChange(hovered)` is the prop the
  hook wraps.
- **`inert` and dialogs.** A box under an `inert` ancestor, or on the page
  under an open dialog, gets neither clicks nor hover, and does not shield
  what is under it: the click reaches nothing and the keys go on to
  subscribers (which is how a `Select` popup closes on a press outside it).
- **Hover needs asking for.** `new TtyBackend(stdout, stdin, { mouse:
  { hover: true } })` turns on any-event tracking (`?1003h`): the terminal
  reports every pointer move, which a slow SSH link feels. Without it
  `useHover` stays false and `onHoverChange` never fires. A terminal that
  reports window focus (most do) clears the hover when the pointer leaves
  the window; one that does not leaves the last box hovered until the next
  move. `render(…, { mouse: false })` turns the whole dispatch off.
```

- [ ] **Step 3: docs/components.md**

- ListSelect: "A click on a row moves the highlight there and reports `onChange`; it never submits."
- ListMultiSelect: "A click on a row toggles it; a click on the add row is Enter on it."
- Table: "`onRowClick(index, key)` — a click on a data row; the header and the rules report nothing. The table still handles no keys itself."
- ScrollList: "`onRowClick(index, key)` — a click on a row, with its index into `items`; hover inside a row is the item's own `useHover`."
- Select: "In the open popup a click on an option picks it (or toggles it, with `multiple`) and closes; a press outside closes without picking and reaches nothing else."

- [ ] **Step 4: docs/writing-a-backend.md, docs/testing.md, README, CHANGELOG**

writing-a-backend.md, the `onKey` bullet: "…plus `mousemove` (motion with no button, only when the app asked for hover — coalesce it: one per cell, at most one per frame) and `mouseleave` (the pointer left the window, no cell)." testing.md, after the `mouse('up', …)` line: "`backend.mouse('move', x, y)` moves the pointer with no button held (what `{ hover: true }` reports); `backend.mouse('leave')` takes it out of the window." README: drop "an `onClick` prop on a box (…)" and "a click that picks a list row" from "Not there yet", leaving the Kitty keyboard protocol. CHANGELOG, a new `## Unreleased` above `## 1.0.0-alpha.31`:

```markdown
## Unreleased

### Added

- **Clicks and hover from the committed frame.** `onClick` on any box (the
  box painted on top wins, the nearest handler up from it gets the click,
  the press and release are withheld from `useInput`), `onHoverChange` and
  `useHover()` (a component re-renders only when the pointer enters or leaves
  its box), delivered by a `MouseController` in `@flowtty/core/host` next to
  the selection controller. A box under `inert` or under an open dialog gets
  neither. `render(…, { mouse: false })` turns it off. See docs/input.md
  (clicks and hover).
- `TtyBackend` `mouse: { hover: true }`: any-event tracking; motion with no
  button held arrives as `mousemove`, coalesced to one per cell and at most
  one per ~16 ms; a focus-out arrives as `mouseleave`. `TestBackend.mouse`
  takes `'move'` and `'leave'`.
- A click picks the row: `ListSelect` moves its highlight (`onChange`, never
  `onSubmit`), `ListMultiSelect` toggles, `Table` and `ScrollList` report
  `onRowClick(index, key)`, the `Select` popup picks and closes.
```

- [ ] **Step 5: Final gate**

Run: `npm test && npm run typecheck && npm run build` → green. Run `npm run wide-glyphs` or `npm run showcase` in a real terminal with `{ mouse: { hover: true } }` on one `useHover` box if one is at hand, and report what was seen. Leave everything uncommitted for the person.
