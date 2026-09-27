# Mouse: onClick, hover, row picks — Design

**Issues:** flowtty #53 (onClick on Box), #57 (hover), #54 (a click picks the row). **Milestone:** 1.0.0-alpha.32. **Date:** 2026-09-27. **Status:** design approved in chat, spec under review.

## Problem

Mouse keys (`mousedown` / `mousedrag` / `mouseup` / wheel) reach components only
through `useInput`; a component that wants a click wires a `rectRef`, an
`onLayout` and `useClick(rectRef, handler)`, and `Button`, `Checkbox`,
`Select`, the fields and the lists each repeat that. Which box is on top is
decided by subscription order, not by what is painted. Motion with no button
held is never reported (`?1003h` is not enabled) and the key parser drops it,
so nothing can react to the pointer resting on it. A click on a list row only
focuses the list. flow-assist #90 waits on hover: a dim fold line that brightens
under the pointer.

Core already has `hitTest(container, x, y)` (`packages/core/src/host/hitTest.ts`):
the chain of boxes under a cell in paint order, with clips, z-index and scroll
offsets applied — used today for selection scopes. The selection controller
(`packages/core/src/host/selection.ts`) shows the shape of a core-side
controller that works on host instances and the last frame, created and fed by
`render.ts`.

## Goal

A box declares `onClick` and gets a click; a component asks `useHover()` and
re-renders only when its own hover state flips; a click on a list row does what
the keyboard would; the pointer resting on the screen costs the app nothing it
did not ask for. Success: in flow-assist a dim fold line brightens under the
pointer and opens on click without re-rendering the list on every move; a
click in a `ListSelect` moves its highlight, in a `Select` popup picks and
closes.

## Decisions taken in chat

- **Approach C: the dispatcher lives in core**, `MouseController` next to
  `SelectionController`, React-free, on host instances and the last frame.
  Rejected: a dispatcher inside `render.ts` (same code, worse layering) and
  per-component `useInput` subscriptions (N checks per move, paint order not
  respected).
- **A click on a `ListSelect` row only moves the highlight** (`onChange`).
  Confirmation is the business of a form or of whoever shows the list — a
  `Select` popup picks and closes on click because that is what a dropdown
  does; a bare list never submits on click.
- **Hover motion is coalesced twice**: per cell (no event while the pointer
  stays in a cell) and per frame (at most one event per ~16 ms, the last
  position wins). The per-frame part was chosen over "per cell only"; it is
  implemented without coupling the backend to the paint loop.
- Mouse keys keep arriving through `useInput` as documented; `onClick` and
  hover are delivered by the dispatcher on top, not through a separate channel.

## Non-goals

- Migrating `Button`, `Checkbox`, the fields and `useClick` itself to the new
  props. `useClick` stays; components move when convenient.
- Double-click on boxes (the selection controller already counts clicks for
  word / line selection), drag-and-drop, hover on `InlineTtyBackend`.
- A cursor-shape or tooltip API.
- The lone-ESC parser bug (a stdin chunk ending in `ESC` becomes Escape and
  the rest of the sequence becomes typed text): its own small change, before
  this branch.

## 1. `MouseController` in core

`packages/core/src/host/mouse.ts`, exported from `@flowtty/core/host` for
adapters. Constructed like the selection controller: `{ container, frame }`
where `frame()` is the last painted buffer (coordinates are the screen's).

- `handle(key): boolean` — takes `mousedown`, `mousedrag`, `mouseup`,
  `mousemove`, `mouseleave`; ignores every other key. Returns `true` when it
  delivered a click, so the caller can withhold that `mousedown` / `mouseup`
  from `useInput` subscribers (what `useClick` does by consuming both).
- **Click.** On a left `mousedown`: `hitTest` at the cell, remember the chain
  and the cell (armed). A `mousedrag` to another cell disarms. On `mouseup` in
  the same cell while armed: walk the chain from the topmost box towards the
  root, stop at the first instance with `onClick` that is not under an `inert`
  instance, call it with the key. One delivery per click, no further bubbling.
  Any other button, or a release elsewhere, delivers nothing (returns `false`),
  and the keys go on to subscribers as today.
- **Hover.** On `mousemove`: `hitTest` at the cell, cut the chain at the
  nearest `inert` ancestor (everything under it is out), compare the set of
  instances with `onHoverChange` in the chain against the previous set: call
  `false` on those that left, `true` on those that entered. Never the same
  value twice in a row for one instance. `mouseleave` (and `dispose()`) call
  `false` on every hovered instance and forget the cell.
- **`observe(frame)`** after every paint, like the selection controller's:
  re-run the hover comparison at the last known cell without a new key, so
  content that scrolled under a resting pointer updates, and an instance that
  unmounted is dropped from the hovered set without a callback.
- Paints nothing, holds no React state; `hitTest` is the only core dependency.

## 2. Props and `inert`

Two props on `BoxProps` (host.ts), beside `onLayout`; `Text` inherits them
because it is the same box:

- `onClick?: (key: Key) => void` — a left press and release in one cell over
  this box with no drag between. The nearest box with a handler up the chain
  from the topmost box under the cell gets it; one call per click.
- `onHoverChange?: (hovered: boolean) => void` — the pointer entered or left
  the box; only on change.

`inert` today is a React scope (`InertScope` in `Box.tsx`) around `useInput`
subscriptions, and `DialogHost` mutes the page under an open dialog the same
way, through a muted `InputSource`; the host instance knows nothing of either.
So the muting is asked, not copied: `InputSource` gains `isMuted?(): boolean`
(a muted source answers for itself and its outer source), and a box that
declares `onClick` or `onHoverChange` is rendered through a small scope
component that reads the current `InputSource` and puts `mouseScope:
{ isMuted }` on the host instance. The controller skips an instance whose
scope is muted at delivery time — a click on the page under an open dialog or
inside an `inert` subtree reaches nothing, and the keys go on to subscribers
(which is how a `Select` popup's "press outside closes" keeps working). Plain
boxes stay hook-free; only boxes with mouse props pay the context read.

Order with the rest of input: the selection controller sees the key first
(drag-selection works over everything), then the mouse controller, then
`useInput` subscribers — minus the `mousedown` / `mouseup` of a delivered
click. A click does not focus a box by itself; a handler that wants focus calls
`focus()`, as `Button` does now.

## 3. Hover in the backend

- `TtyBackend` option `mouse: boolean | { hover?: boolean }`. `true` is today's
  behaviour; `{ hover: true }` adds `?1003h` to `MOUSE_ON` and `?1003l` to
  `MOUSE_OFF`, in every place mouse reporting is turned on and off (start,
  exit, suspend / resume, the signal and error paths). `InlineTtyBackend`
  never enables the mouse; nothing changes there.
- **Parser.** An SGR report with button code 3 and final `M` (motion, no button
  held) becomes the key `mousemove` with `x` / `y` and modifiers instead of
  being dropped. A terminal sends it only under `?1003h`, so apps without the
  option see nothing new. Window focus reports (`?1004h`) are already enabled
  for the colour-scheme tracker and arrive as `TerminalReport { type: 'focus' }`;
  the backend turns a focus-out into the key `mouseleave` (no coordinates) when
  hover is on.
- **Coalescing.** Consecutive `mousemove` keys decoded from one stdin chunk
  collapse to the last one (a fast sweep arrives in bursts). Between chunks a
  16 ms throttle: the first move after a quiet period goes out at once, later
  ones are held and the last position goes out when the timer fires. A move
  into the cell already reported is not reported. A `mousedown` / `mouseup` /
  wheel flushes a held move first, so a click never precedes its position. The
  timer is cleared on dispose and suspend.
- `Key` gains the names `mousemove` and `mouseleave`; `TestBackend.mouse()`
  gains `'move'` and `'leave'`.

## 4. React

- `Box` and `Text` render a box with `onClick` / `onHoverChange` through the
  mouse-scope component (section 2); everything else is unchanged.
- `useHover(): [hovered: boolean, hoverProps: { onHoverChange }]` — a
  `useState(false)` and a stable callback that calls `setState` only on change:
  `const [hovered, hover] = useHover(); <Text {...hover} dim={!hovered}>`.
  No instance ref is needed: the controller reaches the box through the
  `hitTest` chain and the hook only supplies the callback.
- `render.ts` creates the `MouseController` next to the `SelectionController`,
  calls it from `beforeDispatch` after the selection, withholds a delivered
  click's `mousedown` / `mouseup` from subscribers, and calls `observe(frame)`
  after each paint. `render(..., { mouse: false })` disables the dispatcher,
  the way `selection: false` disables the other.
- Exports: `useHover` from `@flowtty/react`; `MouseController` from
  `@flowtty/core/host`.

## 5. Row picks in the components

Every list row is already its own `Box`; it gets an `onClick` that applies the
key's action plus focus. No `y` arithmetic: the controller finds the row box,
scroll and windowing included.

- `ListSelect`: click on a row → `focus()`, `onChange(value)`. No `onSubmit`.
- `ListMultiSelect`: click on a row → `focus()`, toggle it, `onChange` with
  the new array; the add-new row behaves as Enter on it.
- `Table`: the table handles no keys itself (the app passes `selectedIndex`),
  so a click on a data row is reported to the app as `onRowClick?(index, key)`;
  the header and the rules report nothing.
- `ScrollList`: renders the app's items, so a click is reported as
  `onRowClick?(index, key)`; hover inside a row is the app's `useHover` in
  `renderItem` (flow-assist #90).
- `Select`: the popup already picks or toggles on a press on a row through its
  own `y` arithmetic and closes on a press outside; the row press moves to
  `onClick` on the row boxes (same behaviour, no arithmetic), the outside press
  stays as it is and is consumed so it never reaches the page.
- The lists' `useClick(rectRef, focus)` stays: a click on blank space in a list
  still focuses it.

## 6. Tests, docs, order

**Tests.**
- core `mouse.spec.ts`, on a bare instance tree like `hitTest.spec`: the click
  reaches the nearest box with `onClick` in the chain; the higher z-index wins
  where boxes overlap; a drag between press and release cancels; a muted
  scope skips the box; hover fires `true` / `false` exactly once per
  transition; `mouseleave` clears every hovered box; `observe(frame)` clears a
  box that scrolled from under a resting pointer; a right-button click delivers
  nothing.
- `key-parser.spec`: code 3 + `M` → `mousemove`; everything else unchanged.
- `tty.spec`: `{ hover: true }` writes `?1003h` and undoes it on dispose and
  suspend; a burst of moves in one chunk yields one key with the last position;
  a move into the reported cell yields nothing; the 16 ms throttle emits the
  last held position on the timer (fake timers); a press flushes a held move
  first; focus-out with hover on yields `mouseleave`.
- react: `useHover.spec` (render count: one on enter, one on leave, none in
  between), `Box` `onClick` through `render` and `TestBackend.mouse`,
  `input-dispatch.spec` (a delivered click is withheld from `useInput`, an
  undelivered press is not), `ListSelect`, `ListMultiSelect`, `Table`,
  `ScrollList`, `Select` by click; `render.spec` end to end: two overlapping
  boxes with `onClick`, the click lands in the one painted on top.

**Docs.** docs/input.md: a "Clicks and hover" section (`onClick`, `useHover`,
`mouse: { hover: true }` and its cost — a report per pointer move, felt over a
slow link —, `inert`), the "Buttons" bullet and the key table updated.
docs/components.md: click lines for the lists, the table, `Select`,
`ScrollList`. docs/writing-a-backend.md: `mousemove` / `mouseleave`.
docs/testing.md: `mouse('move')` / `mouse('leave')`. README: drop `onClick` and
the row pick from "Not there yet". CHANGELOG under Unreleased.

**Order.** core (controller, props, key names) → parser and
backend (hover, coalescing) → React (`render.ts`, `useHover`, `Box`) →
components (#54, `Select`) → docs and CHANGELOG. One branch `mouse`, one PR,
milestone alpha.32. The lone-ESC bug goes first, in its own small change.
