# flowtty M1f — Overlay Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make `<Box>` position-aware (Yoga `position: 'absolute'` + edge offsets + percentage sizes + flexbox `justifyContent` / `alignItems`), have the paint pass render stack-flow children first and absolutely-positioned children **on top** (second pass), and use that to render `<DialogHost>`'s dialog as a centered overlay rather than as a sibling below the host content. Acceptance: the M1c.4 MultiSelect-with-add-new demo runs with the TextInput dialog centered on top of the MultiSelect rows, not pushed below them.

**Architecture:** Yoga already supports `setPositionType(PositionType.Absolute)` and per-edge `setPosition(Edge, value)`; the plumbing is just `applyProps` plumbing. Percentage sizes use `setWidthPercent` / `setHeightPercent`. Centering uses Yoga's flexbox (`setJustifyContent(Justify.Center)` + `setAlignItems(Align.Center)` on a full-screen absolute container). The paint change is a two-pass split in `paintInstance`: pass 1 walks `position: 'static'` (default) children in tree order; pass 2 walks `position: 'absolute'` children in tree order — so absolutes always paint after their stack-flow siblings at the same depth. Multiple absolutes at the same depth paint in tree order (later siblings overlay earlier — that's basic z-ordering for free).

**Tech Stack:** Same as M1c.4 — TypeScript ESM, React 19, `react-reconciler@0.31.0`, `yoga-layout@3.2.1`, Vitest 4.

**Out of scope** (later milestones): explicit `zIndex` prop for cross-depth stacking order (tree order is enough for M1f's single-dialog use case); `position: 'relative'` with edge offsets (only `absolute` matters for overlays; relative is mostly a CSS quirk we don't need yet); `position: 'fixed'` (no scroll concept in a TTY anyway); auto-sizing absolute boxes whose width depends on percentages of an ancestor that isn't the immediate parent (Yoga's absolute positioning is relative to the nearest non-static ancestor; M1f assumes that ancestor is the root for full-screen overlays).

---

## Scope check

Independent layer addition: positioning + paint ordering + a single DialogHost rewrite. **One plan, 4 tasks.**

---

## File Structure

```
src/
  host.ts                # MODIFY — BoxProps extensions + applyProps wires Yoga position/edges/justify/align/percent
  host.test.ts           # ADD — applyProps semantics for the new props (computed layout assertions)
  yoga.ts                # MODIFY — re-export PositionType, Edge, Justify, Align (named from yoga-layout/load)
  paint.ts               # MODIFY — paintInstance does two passes: stack-flow children, then absolute children
  paint.test.ts          # ADD — absolute-positioned overlay paints ON TOP of stack-flow content
  dialog-host.ts         # MODIFY — wrap dialog element in a centered-overlay Box
  dialog.test.ts         # ADD — dialog frame shows the dialog text overlaying the host content (cell-level)
  index.ts               # MODIFY — re-export BoxProps unchanged (it now carries more fields; no new top-level exports needed)
  README.md              # MODIFY — M1f status + the resolved visual caveat
```

Responsibilities:
- **`host.ts`** — props/Yoga wiring is the only mechanical layer change.
- **`paint.ts`** — paint ordering change is the only correctness-critical change for overlay semantics.
- **`dialog-host.ts`** — adopts the new positioning to fix the M1c.4 visual caveat.

---

### Task 1: Box positioning + alignment + percentage props (Yoga wiring)

**Files:**
- Modify: `src/yoga.ts`
- Modify: `src/host.ts`
- Modify: `src/host.test.ts`

- [ ] **Step 1: Update `src/yoga.ts`** — re-export the additional enums needed (named exports from `yoga-layout/load`, same pattern as `FlexDirection` / `MeasureMode`). Find the existing re-export line and update it:
```ts
export { FlexDirection, MeasureMode, PositionType, Edge, Justify, Align } from 'yoga-layout/load';
```

- [ ] **Step 2: Extend `BoxProps` in `src/host.ts`** — find the existing interface and add positioning + alignment + percent-aware sizing fields. Replace the `BoxProps` interface with:
```ts
export interface BoxProps {
  /** Fixed size in cells. Strings like '100%' use Yoga's percentage sizing. */
  width?: number | string;
  height?: number | string;
  flexDirection?: 'row' | 'column';
  /** Default 'static' (Yoga's stack flow). 'absolute' positions via top/left/right/bottom relative to the nearest non-static ancestor. */
  position?: 'static' | 'absolute';
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  /** Main-axis alignment of children (flexbox). */
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  /** Cross-axis alignment of children. */
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch';

  // Text wrap mode for direct text children (default: 'none' — preserves current behavior).
  wrap?: 'wrap' | 'truncate' | 'none';
  // Text styling applied to direct text children:
  color?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
  // Box background fill:
  backgroundColor?: string;
}
```

- [ ] **Step 3: Update `applyProps` in `src/host.ts`** to wire the new props into the Yoga node. Add imports (next to the existing `FlexDirection` import):
```ts
import { Align, Edge, FlexDirection, Justify, MeasureMode, PositionType, type Yoga, type YogaNode } from './yoga.js';
```

And update `applyProps` body. The pattern for each new prop: read prop → call the Yoga setter (or reset to default if undefined):
```ts
export function applyProps(inst: Instance, props: BoxProps, _Yoga: Yoga): void {
  inst.props = props;
  const n = inst.yogaNode;

  // Size — number OR percentage string ('50%', '100%').
  if (typeof props.width === 'number') n.setWidth(props.width);
  else if (typeof props.width === 'string' && props.width.endsWith('%')) {
    n.setWidthPercent(parseFloat(props.width));
  } else n.setWidthAuto();

  if (typeof props.height === 'number') n.setHeight(props.height);
  else if (typeof props.height === 'string' && props.height.endsWith('%')) {
    n.setHeightPercent(parseFloat(props.height));
  } else n.setHeightAuto();

  n.setFlexDirection(
    props.flexDirection === 'row' ? FlexDirection.Row : FlexDirection.Column,
  );

  // Position type + edge offsets.
  n.setPositionType(props.position === 'absolute' ? PositionType.Absolute : PositionType.Static);
  // Apply per-edge offsets ONLY when defined; clearing is fine via Yoga default (0/unset).
  if (props.top !== undefined) n.setPosition(Edge.Top, props.top);
  if (props.left !== undefined) n.setPosition(Edge.Left, props.left);
  if (props.right !== undefined) n.setPosition(Edge.Right, props.right);
  if (props.bottom !== undefined) n.setPosition(Edge.Bottom, props.bottom);

  // Alignment.
  n.setJustifyContent(jcMap(props.justifyContent));
  n.setAlignItems(aiMap(props.alignItems));
}

function jcMap(v: BoxProps['justifyContent']): number {
  switch (v) {
    case 'center': return Justify.Center;
    case 'flex-end': return Justify.FlexEnd;
    case 'space-between': return Justify.SpaceBetween;
    case 'space-around': return Justify.SpaceAround;
    case 'space-evenly': return Justify.SpaceEvenly;
    default: return Justify.FlexStart;
  }
}

function aiMap(v: BoxProps['alignItems']): number {
  switch (v) {
    case 'center': return Align.Center;
    case 'flex-end': return Align.FlexEnd;
    case 'stretch': return Align.Stretch;
    default: return Align.FlexStart;
  }
}
```

(Note: `setPositionType` switches between `Static` and `Absolute` on every apply — that's correct because a future re-render could change the prop. Per-edge `setPosition` only runs when the prop is defined; Yoga's default for unset edges is undefined position, which absolute layout handles correctly.)

- [ ] **Step 4: Append failing tests to `src/host.test.ts`** (existing imports for `getYoga`, `createInstance`, etc. already in place):
```ts
test('position absolute + top/left positions the node at fixed coords inside its parent', async () => {
  const Yoga = await getYoga();
  const parent = createInstance('flowtty-box', { width: 20, height: 10 }, Yoga);
  const child = createInstance('flowtty-box', { position: 'absolute', top: 3, left: 5, width: 4, height: 2 }, Yoga);
  appendChild(parent, child, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(child.yogaNode.getComputedTop()).toBe(3);
  expect(child.yogaNode.getComputedLeft()).toBe(5);
  expect(child.yogaNode.getComputedWidth()).toBe(4);
  expect(child.yogaNode.getComputedHeight()).toBe(2);
});

test('width: "100%" sizes child to parent width', async () => {
  const Yoga = await getYoga();
  const parent = createInstance('flowtty-box', { width: 30, height: 5 }, Yoga);
  const child = createInstance('flowtty-box', { width: '100%', height: 2 }, Yoga);
  appendChild(parent, child, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(child.yogaNode.getComputedWidth()).toBe(30);
});

test('justifyContent center + alignItems center centers a child in its parent', async () => {
  const Yoga = await getYoga();
  // 20x10 parent, child 4x2 → centered should be at top=4, left=8
  const parent = createInstance('flowtty-box', {
    width: 20, height: 10,
    justifyContent: 'center', alignItems: 'center',
  }, Yoga);
  const child = createInstance('flowtty-box', { width: 4, height: 2 }, Yoga);
  appendChild(parent, child, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(child.yogaNode.getComputedTop()).toBe(4);
  expect(child.yogaNode.getComputedLeft()).toBe(8);
});

test('back-compat: a box without new props lays out exactly as before (auto size, static, FlexStart)', async () => {
  const Yoga = await getYoga();
  const parent = createInstance('flowtty-box', { width: 10, height: 3 }, Yoga);
  const child = createInstance('flowtty-box', { width: 5, height: 2 }, Yoga);
  appendChild(parent, child, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  // Default: top=0 left=0 (static at start)
  expect(child.yogaNode.getComputedTop()).toBe(0);
  expect(child.yogaNode.getComputedLeft()).toBe(0);
  expect(child.yogaNode.getComputedWidth()).toBe(5);
  expect(child.yogaNode.getComputedHeight()).toBe(2);
});
```

- [ ] **Step 5: Verify** — `npx vitest run src/host.test.ts` → all (existing + 4 new) pass. Full suite green (160 + 4 = 164). `npm run typecheck` clean.

   **If `PositionType` / `Edge` / `Justify` / `Align` imports fail** at typecheck: confirm `yoga-layout/load` exports them under those names by inspecting `node_modules/yoga-layout/dist/load.d.ts`. The verified pattern from M1b T4 + M1d T3 is named exports; if the names differ (e.g. capitalized differently), adjust the re-export line and the import.

   **If the "100%" width test fails with 0:** the parent must have an explicit width for percentage to resolve. Confirm `parent: width: 30`. If still 0, try `n.setWidthPercent(100)` directly (the parseFloat path may be the issue — log the parsed value).

- [ ] **Step 6: Commit**
```bash
git add src/yoga.ts src/host.ts src/host.test.ts
git commit -m "feat: BoxProps positioning (absolute + edges) + alignment + percentage sizes"
```

---

### Task 2: Paint two-pass — absolute children render on top

**Files:**
- Modify: `src/paint.ts`
- Modify: `src/paint.test.ts`

`paintInstance` currently recurses through children in tree order. Change: at each level, paint **stack-flow** children first (recurse), then paint **absolute-positioned** children (recurse). This guarantees absolutes always overlay the stack-flow content at their depth.

- [ ] **Step 1: Append failing tests to `src/paint.test.ts`** (existing imports preserved):
```ts
test('absolute-positioned child paints ON TOP of stack-flow content (overlays correctly)', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  // 10x2 parent: a stack-flow text fills the first row; an absolute box overlays row 0 cols 2..5 with "XX"
  root.render(
    createElement('flowtty-box', { width: 10, height: 2 },
      createElement('flowtty-box', { width: 10, height: 1 }, 'abcdefghij'),
      createElement('flowtty-box', { position: 'absolute', top: 0, left: 2, width: 2, height: 1 }, 'XX'),
    ),
  );
  computeLayout(container, 10, 2);
  const buf = paint(container, 10, 2);
  // Row 0: 'ab' (positions 0-1) + 'XX' overlay (2-3) + 'efghij' (4-9)
  expect(buf.toString().split('\n')[0]).toBe('abXXefghij');
});

test('multiple absolute siblings paint in tree order (later overlays earlier)', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 6, height: 1 },
      createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 4, height: 1 }, 'AAAA'),
      createElement('flowtty-box', { position: 'absolute', top: 0, left: 2, width: 4, height: 1 }, 'BBBB'),
    ),
  );
  computeLayout(container, 6, 1);
  const buf = paint(container, 6, 1);
  // 'AAAA' painted first (cols 0-3); 'BBBB' painted second (cols 2-5) → overlays 'AAAA' at 2,3
  expect(buf.toString()).toBe('AABBBB');
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Modify `src/paint.ts` `paintInstance`** — split the children recursion into two passes. Read the current file first; only the children loop changes. Replace it:

```ts
// Replace the existing single-pass children loop at the bottom of paintInstance:
//
//   for (const child of inst.children) {
//     if (child.type === 'box') paintInstance(child, buffer, box.left, box.top, effectiveBg);
//   }
//
// with a two-pass split:

const stackFlow: Instance[] = [];
const absolutes: Instance[] = [];
for (const child of inst.children) {
  if (child.type !== 'box') continue;
  (child.props.position === 'absolute' ? absolutes : stackFlow).push(child);
}
for (const child of stackFlow) paintInstance(child, buffer, box.left, box.top, effectiveBg);
for (const child of absolutes) paintInstance(child, buffer, box.left, box.top, effectiveBg);
```

(Leave the rest of `paintInstance` unchanged — bg fill, ownText paint, layoutOf, all the M1d code.)

- [ ] **Step 4: Verify** — `npx vitest run src/paint.test.ts` → both new + existing pass. Full suite green (164 + 2 = 166). `npm run typecheck` clean.

  If existing paint tests break (M0/M1d): the two-pass change only affects children whose `props.position === 'absolute'`. Nothing in the existing tests sets `position`, so all existing children continue to be classified as stack-flow and the order is identical to before. If a test breaks, the most likely cause is a parent painting its bg-fill at the wrong moment — verify the bg-fill loop runs BEFORE both child passes.

- [ ] **Step 5: Commit**
```bash
git add src/paint.ts src/paint.test.ts
git commit -m "feat: paint two-pass — absolute-positioned children render on top of stack-flow"
```

---

### Task 3: `<DialogHost>` wraps dialog in a centered overlay + acceptance test

**Files:**
- Modify: `src/dialog-host.ts`
- Modify: `src/dialog.test.ts`

DialogHost currently renders the dialog element as a sibling under an `InputContext.Provider`. With overlay positioning available, wrap that in a full-screen absolute `<Box>` with `justifyContent: 'center', alignItems: 'center', backgroundColor`-optional (skip for M1f — the dialog stands alone visually). The dialog's content gets centered.

- [ ] **Step 1: Append a failing acceptance test to `src/dialog.test.ts`** (reuse existing imports + `NamePromptDialog` helper):
```ts
test('M1f acceptance: dialog renders as a centered overlay ON TOP of the host content', async () => {
  function HostApp() {
    const host = useDialogHost();
    useInput((key) => {
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog));
    });
    // Fill the host area with recognizable text so we can see the overlay sits on top.
    return createElement(Box, { width: 30, height: 5 },
      createElement(Text, null, 'HOST CONTENT ROW 1'),
      createElement(Text, null, 'HOST CONTENT ROW 2'),
      createElement(Text, null, 'HOST CONTENT ROW 3'),
      createElement(Text, null, 'HOST CONTENT ROW 4'),
      createElement(Text, null, 'HOST CONTENT ROW 5'),
    );
  }
  const backend = new TestBackend(30, 5);
  await render(createElement(DialogHost, null, createElement(HostApp)), backend);
  await flushAsync();
  backend.press({ name: 'o' });
  await flushAsync();
  // Now dialog is open and overlays the host. The frame should show the
  // dialog's "name: " prompt somewhere in the middle (NOT below row 5,
  // which is what M1c.4 did). Specifically: the overlay sits on top of
  // host content, so 'name: ' should appear inside the 30x5 frame —
  // not on a 6th row that doesn't exist.
  expect(backend.lastFrame.split('\n').length).toBeLessThanOrEqual(5);
  expect(backend.lastFrame).toContain('name:');
});
```

- [ ] **Step 2: Run, verify FAIL.** With the current DialogHost (no overlay wrapping), the dialog renders below the host content → 6+ rows in `lastFrame.split('\n')` → assertion fails.

- [ ] **Step 3: Modify `src/dialog-host.ts`** — wrap the dialog subtree in a centered-overlay Box. Find the existing block that renders the dialog (currently `createElement(InputContext.Provider, { value: outerSource }, ...dialog element...)` ) and wrap it:

```ts
import { Box } from './components.js';
// Add to existing imports at the top.

// Find the existing dialog render block:
//   dialog
//     ? createElement(
//         InputContext.Provider,
//         { value: outerSource },
//         createElement(DialogResultContext.Provider, { value: dialogApi }, dialog.element),
//       )
//     : null,
//
// Replace with an overlay-positioned wrap:

dialog
  ? createElement(
      Box,
      {
        position: 'absolute',
        top: 0, left: 0,
        width: '100%', height: '100%',
        justifyContent: 'center', alignItems: 'center',
      },
      createElement(
        InputContext.Provider,
        { value: outerSource },
        createElement(DialogResultContext.Provider, { value: dialogApi }, dialog.element),
      ),
    )
  : null,
```

Update the inline-position caveat comment near the top of `paintInstance`-adjacent code OR delete the old "renders below host" comment in DialogHost — overlay positioning resolves it. Be explicit in the new comment that the dialog now centers via flexbox on a full-screen absolute container.

- [ ] **Step 4: Verify**
- `npx vitest run src/dialog.test.ts` → all 5 existing + 1 new acceptance pass.
- `npx vitest run` → full suite green (166 + 1 = 167).
- `npm run typecheck` → clean.

  If existing dialog tests break (e.g., the "Enter on done resolves" test): the overlay wrap shouldn't change behavior — keys still flow through the outer source via the inner Provider. If a test fails because frame contents shifted (now centered rather than top-aligned), update the relevant assertions to reflect centered rendering, OR if the test asserted exact-position content of the dialog text, it was implicitly relying on the old below-host behavior — update to a `toContain` check.

- [ ] **Step 5: Commit**
```bash
git add src/dialog-host.ts src/dialog.test.ts
git commit -m "feat: DialogHost renders dialog as centered overlay (resolves M1c.4 visual caveat)"
```

---

### Task 4: README + final build

**Files:**
- Modify: `README.md`

No new top-level exports — `BoxProps` already exported, and the new fields are additive on the existing type.

- [ ] **Step 1: Update `README.md`** — find the existing `## Status` section, replace its content with (use REAL triple-backtick fences):

```md
## Status

M1f (overlay positioning). `<Box>` is now position-aware:

- `position: 'absolute'` + `top` / `left` / `right` / `bottom` (cells) — takes a
  box out of stack flow and positions it relative to the nearest non-static
  ancestor (typically the root, for full-screen overlays).
- `width` / `height` accept percentage strings (`'100%'`, `'50%'`) in addition
  to cell counts.
- `justifyContent` (`'flex-start'` | `'center'` | `'flex-end'` | `'space-between'`
  | `'space-around'` | `'space-evenly'`) and `alignItems` (`'flex-start'` |
  `'center'` | `'flex-end'` | `'stretch'`) for Yoga-flexbox alignment.

The paint pass now renders stack-flow children first and absolutely-positioned
children **on top**, so overlays composite correctly. **`<DialogHost>` uses
this to render dialogs as centered overlays** on top of the host content,
resolving M1c.4's inline-position caveat.

### Usage

\`\`\`tsx
import { Box, Text, render, TtyBackend } from 'flowtty';

await render(
  <Box width={40} height={10}>
    <Text>host content here</Text>
    <Box position="absolute" top={0} left={0} width="100%" height="100%"
         justifyContent="center" alignItems="center">
      <Box width={20} height={3} backgroundColor="blue">
        <Text color="white">CENTERED OVERLAY</Text>
      </Box>
    </Box>
  </Box>,
  new TtyBackend(),
);
\`\`\`

### Still deferred (later milestones)

- Explicit `zIndex` prop for cross-depth stacking order (tree order is the
  current implicit z; later siblings overlay earlier siblings at the same depth).
- `position: 'relative'` with edge offsets.
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`).
- Bracketed paste, mouse, Kitty keyboard protocol, modifier-encoded arrows.
```

Leave everything ELSE in the README unchanged.

- [ ] **Step 2: Final verification + commit (authorized):**
```bash
npx vitest run        # all 167 still pass
npm run typecheck     # clean
npm run build         # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: M1f — overlay positioning + centered dialogs"
```

## Report:
- **Status:** DONE | BLOCKED
- Test + typecheck + build output (paste tails)
- Commit SHA

---

## Self-Review

**1. Spec coverage** (M1f):
- Box positioning (`position` + edges) → Task 1.
- Percentage sizes → Task 1.
- `justifyContent` / `alignItems` for centering → Task 1.
- Paint two-pass for overlay → Task 2.
- DialogHost uses centered overlay → Task 3.
- README + final build → Task 4.
- Out-of-scope items (zIndex, position relative, position fixed) named in plan header.

**2. Placeholder scan:** no "TBD"/"implement later". The percentage parsing uses `parseFloat` on `'100%'` etc. — straightforward; documented Yoga setter usage.

**3. Type consistency:** `BoxProps`'s new fields (`position`, `top`/`left`/`right`/`bottom`, `justifyContent`, `alignItems`, `width`/`height` accepting `string`) are read uniformly in `applyProps` (host.ts) and partitioned in `paint.ts`'s two-pass children loop. Yoga enums (`PositionType`, `Edge`, `Justify`, `Align`) follow the M1b/M1d pattern (named exports from `yoga-layout/load`, re-exported via `src/yoga.ts`).

**Risks worth flagging for the implementer (not blockers):**

1. **`setPositionType` always called** in `applyProps` — `Static` is Yoga's default but calling `setPositionType(Static)` on every render is a no-op and fine. If Yoga emits warnings for redundant settings, the spec is unchanged; ignore.

2. **`parseFloat('100%')` returns `100`** — correct for `setWidthPercent(100)`. If a user passes `'1.5em'` or other CSS-like values, parseFloat returns `1.5` (wrong). For M1f the contract is "ends with %" only; document that other strings are unsupported (silently behave as `setWidthAuto` because the `endsWith('%')` check fails). If a test author accidentally passes `'10px'`, it'll auto-size — minor footgun, document.

3. **DialogHost overlay wrap width/height = '100%'** depends on `<DialogHost>` itself filling the screen. If a consumer wraps `<DialogHost>` in a smaller Box, the overlay sizes to that smaller container, not the full terminal. For M1f the assumption is DialogHost is at the root (standard pattern); document.

4. **`width: 'auto'` previously implicit via `setWidthAuto()` when prop is undefined** — preserved (the new code falls through to `setWidthAuto` when width is neither number nor `%` string). If existing tests broke around auto sizing, the fall-through path is wrong — debug by logging the prop value at apply time.

5. **Existing dialog tests rely on visual position** — the `M1f acceptance` test asserts the frame fits in 5 rows (overlay sits inside, not below). Existing M1c.4 tests check `'[x] cherry'` and `'+ add new'` via `toContain` — those should survive (the host text is still in the frame; the dialog overlay just overlaps with one row of host content, replacing those cells). If a test fails because the overlay covered the assertion text, adjust the test to render at a different row OR scale the backend size to give more room.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/m1f-overlay-positioning.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task; same flow as prior milestones.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
