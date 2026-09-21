# flowtty Padding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add CSS-style padding to `<Box>` — `padding` (all four edges), `paddingX`/`paddingY` (axis), `paddingTop`/`paddingRight`/`paddingBottom`/`paddingLeft` (per-edge). Padding reserves cells inside the box via Yoga's `setPadding(edge, n)`, so children and own-text are inset automatically. Per-edge wins over axis wins over shorthand. Numbers only (cell counts) — percentages out of scope for now. Bonus: a pre-existing edge case where own-text in a bordered box painted over its own border is fixed by computing a content rect that subtracts both `getComputedPadding(edge)` and `getComputedBorder(edge)`.

**Architecture:** `BoxProps` gets 7 new optional fields. `applyProps` resolves each edge with the precedence `per-edge ?? axis ?? all ?? 0` and calls `n.setPadding(Edge.X, value)` unconditionally (so removing the prop resets to 0). `paint.ts` introduces a `contentRectOf(inst, box)` helper that reads Yoga's computed padding + border per edge and returns the inner rect; own-text paint loop uses the content rect for both position AND wrap width. Child boxes don't need any change — Yoga already positions children inside the parent's content area (border+padding subtracted).

**Tech Stack:** Same as Borders — TypeScript ESM, Vitest 4, yoga-layout 3.2.1.

**Out of scope** (later / non-goals):
- Percentage padding (`padding: '50%'`). Yoga supports it via `setPadding(edge, '${number}%')`, but the resolution helper handles only numbers for now; document.
- `margin` / `marginX` / per-edge margin — separate concept (outer spacing between siblings), separate plan.
- Array shorthand (`padding: [t, r, b, l]`) — Ink doesn't use it either; user-facing API stays one-value-per-field.
- Negative padding — Yoga clamps anyway; not a documented feature.

---

## Scope check

Single independent feature: BoxProps additions + applyProps wiring + paint content-rect helper + tests. One plan, **2 tasks**.

---

## File Structure

```
src/
  host.ts             # MODIFY — add 7 padding props to BoxProps; resolve + setPadding per edge in applyProps
  paint.ts            # MODIFY — add contentRectOf helper; own-text uses contentRect.left/top + contentRect.width for wrap
  paint.test.ts       # MODIFY — tests for shorthand, axis, per-edge, specificity, padding + border combine, own-text inside bordered box (regression)
README.md             # MODIFY — document padding props
```

Responsibilities:
- **`host.ts`** owns the prop type + Yoga padding edge calls.
- **`paint.ts`** owns the content-rect computation (queries Yoga at paint time, NOT at applyProps time — Yoga's computed values are only valid after `computeLayout`).
- Existing tests cover children inside padded boxes implicitly (Yoga handles child layout); the new tests focus on the visible cases — own-text position, content rect against border interaction.

---

### Task 1: BoxProps + setPadding + contentRectOf + tests

**Files:**
- Modify: `src/host.ts`
- Modify: `src/paint.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/paint.test.ts` to see the test pattern in use (it's the low-level `getYoga()` + `createRoot` + `computeLayout` + `paint(container, w, h)` pattern from the borders work — match that, NOT the TestBackend/render/flush pattern).

- [ ] **Step 2: Modify `src/host.ts`** — add the 7 props + resolution + setPadding.

Add to `BoxProps` interface, after the existing `borderColor` field:

```ts
  // Padding (cells). Per-edge wins over axis wins over shorthand.
  // E.g. paddingTop overrides paddingY which overrides padding.
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
```

In `applyProps`, after the existing border block, add:

```ts
  // Padding edge reservation — per-edge ?? axis ?? all ?? 0.
  // Always set (including 0) so removing the prop re-renders correctly.
  const padTop    = props.paddingTop    ?? props.paddingY ?? props.padding ?? 0;
  const padRight  = props.paddingRight  ?? props.paddingX ?? props.padding ?? 0;
  const padBottom = props.paddingBottom ?? props.paddingY ?? props.padding ?? 0;
  const padLeft   = props.paddingLeft   ?? props.paddingX ?? props.padding ?? 0;
  n.setPadding(Edge.Top, padTop);
  n.setPadding(Edge.Right, padRight);
  n.setPadding(Edge.Bottom, padBottom);
  n.setPadding(Edge.Left, padLeft);
```

(`Edge` is already imported at `host.ts:1`.)

- [ ] **Step 3: Modify `src/paint.ts`** — add `contentRectOf` helper + use it for own-text.

At the top, add `Edge` to the yoga imports (likely not currently imported in paint.ts — check first):

```ts
import { Edge } from './yoga.js';
```

Add the helper above `paintInstance`:

```ts
// Inner content rect (padding + border subtracted). Yoga's computed values are
// only valid AFTER computeLayout, so this must be called inside paintInstance,
// not at applyProps time. Border cells and padding cells are reserved by Yoga
// in the LAYOUT phase (so children land inside the content rect automatically),
// but own-text painting still needs the inset coordinates explicitly.
function contentRectOf(inst: Instance, box: Rect): Rect {
  const n = inst.yogaNode;
  const padT = n.getComputedPadding(Edge.Top)    + n.getComputedBorder(Edge.Top);
  const padR = n.getComputedPadding(Edge.Right)  + n.getComputedBorder(Edge.Right);
  const padB = n.getComputedPadding(Edge.Bottom) + n.getComputedBorder(Edge.Bottom);
  const padL = n.getComputedPadding(Edge.Left)   + n.getComputedBorder(Edge.Left);
  return {
    left:   box.left + padL,
    top:    box.top  + padT,
    width:  Math.max(0, box.width  - padL - padR),
    height: Math.max(0, box.height - padT - padB),
  };
}
```

Replace the own-text paint block in `paintInstance` (currently around lines 89-101) so it uses `contentRectOf`:

```ts
  // 2. Paint own text (wrapped if wrap prop set) inside the content area
  //    (rect with padding + border subtracted).
  const text = ownText(inst);
  if (text) {
    const content = contentRectOf(inst, box);
    const mode = (inst.props.wrap ?? 'none') as WrapMode;
    const lines = mode === 'none' ? text.split('\n') : wrapText(text, content.width, mode);
    const textStyle = textStyleOf(inst);
    if (textStyle.bg === undefined && effectiveBg !== undefined) {
      textStyle.bg = effectiveBg;
    }
    for (let row = 0; row < lines.length; row++) {
      if (row >= content.height) break; // clip vertically against content area
      const chars = [...(lines[row] ?? '')];
      for (let col = 0; col < chars.length; col++) {
        if (col >= content.width) break; // clip horizontally
        buffer.set(content.left + col, content.top + row, chars[col]!, textStyle);
      }
    }
  }
```

(`Rect` is already imported as `type Rect` from `./layout.js` at paint.ts:2 — verify in the file.)

- [ ] **Step 4: Append failing tests to `src/paint.test.ts`** — match the existing pattern (likely `getYoga`, `createRoot`, `createElement`, `computeLayout`, `paint`). Adapt the test helpers to the actual pattern in the file:

```ts
describe('Box padding', () => {
  test('padding shorthand applies to all four edges (child inset by 1 on each side)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { padding: 1, width: 5, height: 5 },
        createElement('flowtty-box', { width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 5);
    const buf = paint(container, 5, 5);
    // Child (3×3 red bg) should land at (1,1) — inset by padding=1 on all sides
    expect(buf.get(1, 1).style.bg).toBe('red');
    expect(buf.get(3, 3).style.bg).toBe('red');
    // Outermost ring (padding cells) has no bg
    expect(buf.get(0, 0).style.bg).toBeUndefined();
    expect(buf.get(4, 4).style.bg).toBeUndefined();
  });

  test('paddingX shorthand: only left/right inset; top/bottom flush', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { paddingX: 1, width: 5, height: 3 },
        createElement('flowtty-box', { width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Child at (1, 0) — paddingX=1 insets left, paddingY=undefined keeps top flush
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(3, 2).style.bg).toBe('red');
    expect(buf.get(0, 0).style.bg).toBeUndefined();
  });

  test('paddingY shorthand: only top/bottom inset; left/right flush', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { paddingY: 1, width: 3, height: 5 },
        createElement('flowtty-box', { width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 3, 5);
    const buf = paint(container, 3, 5);
    expect(buf.get(0, 1).style.bg).toBe('red');
    expect(buf.get(2, 3).style.bg).toBe('red');
    expect(buf.get(0, 0).style.bg).toBeUndefined();
  });

  test('per-edge padding overrides axis and shorthand', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // padding: 2 (shorthand) for ALL edges, paddingTop: 0 wins on top edge
    root.render(
      createElement('flowtty-box', { padding: 2, paddingTop: 0, width: 5, height: 5 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 5);
    const buf = paint(container, 5, 5);
    // Child at (2, 0): paddingLeft=2, paddingTop=0
    expect(buf.get(2, 0).style.bg).toBe('red');
  });

  test('own text inset by padding (text-only box with padding)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { padding: 1, width: 5, height: 3 }, 'hi'),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Text 'hi' starts at (1, 1) — inset by padding=1 from outer (0,0)
    expect(buf.get(1, 1).char).toBe('h');
    expect(buf.get(2, 1).char).toBe('i');
    // Padding cells are blank
    expect(buf.get(0, 0).char).toBe(' ');
    expect(buf.get(0, 1).char).toBe(' ');
  });

  test('own text inside a bordered box lands inside the border (regression — content rect subtracts border)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { border: 'single', width: 5, height: 3 }, 'hi'),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Border drawn on outer ring
    expect(buf.get(0, 0).char).toBe('┌');
    expect(buf.get(4, 0).char).toBe('┐');
    expect(buf.get(0, 2).char).toBe('└');
    expect(buf.get(4, 2).char).toBe('┘');
    // Text inside the border (NOT painted over the top-left corner)
    expect(buf.get(1, 1).char).toBe('h');
    expect(buf.get(2, 1).char).toBe('i');
  });

  test('padding + border combine: text inset by both', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { border: 'single', padding: 1, width: 7, height: 5 }, 'hi'),
    );
    computeLayout(container, 7, 5);
    const buf = paint(container, 7, 5);
    // Border on outer ring (0..6 wide, 0..4 tall)
    expect(buf.get(0, 0).char).toBe('┌');
    expect(buf.get(6, 4).char).toBe('┘');
    // Text inside border+padding — at (2, 2)
    expect(buf.get(2, 2).char).toBe('h');
    expect(buf.get(3, 2).char).toBe('i');
  });

  test('backgroundColor fills padding cells too (not just content area)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { padding: 1, backgroundColor: 'blue', width: 3, height: 3 }, 'x'),
    );
    computeLayout(container, 3, 3);
    const buf = paint(container, 3, 3);
    // All 9 cells have blue bg (including the padding ring)
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(buf.get(x, y).style.bg).toBe('blue');
      }
    }
    // Text 'x' at content (1, 1)
    expect(buf.get(1, 1).char).toBe('x');
  });
});
```

- [ ] **Step 5: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 8 new).
  - `npx vitest run` — full suite green (205 + 8 = 213).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **"per-edge overrides shorthand" test fails because per-edge value of 0 falls through `??`**: `0 ?? next` is `0` (because `??` only checks null/undefined), not `next`. The intended semantics are correct: `paddingTop: 0` SHOULD win over `padding: 2`. Verify the chain `props.paddingTop ?? props.paddingY ?? props.padding ?? 0` — with `paddingTop=0`, `paddingY=undefined`, `padding=2`, this evaluates to `0`. Correct.
- **`getComputedPadding` returns 0 even when padding is set**: this happens if `getComputedPadding` is called before `computeLayout`. The helper is called inside `paintInstance`, which only runs from `paint(container, w, h)` AFTER computeLayout — safe.
- **"text inside bordered box at (1, 1)" regression test fails**: means `contentRectOf` isn't being called for own-text paint, OR `getComputedBorder` is returning 0 (verify the borders task's `setBorder` calls are still in `applyProps`). Read host.ts to confirm.
- **"padding shorthand" test fails because child lands at (0, 0)**: Yoga's `setPadding` not being called — verify the import + the `n.setPadding` line.

- [ ] **Step 6: Commit**
```bash
git add src/host.ts src/paint.ts src/paint.test.ts
git commit -m "feat: Box padding — shorthand + axis + per-edge; fix own-text inset for border/padding"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Borders subsection).

- [ ] **Step 2: Add a `### Padding` subsection** under `## Status`, after `### Borders`:

```md
### Padding

`<Box>` accepts CSS-style padding props. Per-edge wins over axis wins over shorthand.

- `padding={n}` — all four edges
- `paddingX={n}` — left + right
- `paddingY={n}` — top + bottom
- `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` — per-edge override

Values are integer cell counts. Padding and border combine — a `<Box border="single" padding={1}>` insets content by 2 cells on each side (1 border + 1 padding). `backgroundColor` fills the full rect including padding cells.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (213)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box padding props"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- `padding` shorthand → Task 1 (test).
- `paddingX` / `paddingY` axis → Task 1 (two tests).
- Per-edge props → Task 1 (specificity test).
- Precedence rule (per-edge > axis > shorthand) → Task 1 (specificity test).
- Padding + border combine → Task 1 (combine test).
- Bonus: own-text in bordered box regression → Task 1 (regression test).
- Background fills padding cells → Task 1 (bg test).
- README → Task 2.

**2. Placeholder scan:** none. All test asserts name specific glyphs/coords/colors; all code blocks are complete.

**3. Type consistency:**
- All seven padding props typed `number | undefined`. No string/percent variant.
- `contentRectOf(inst: Instance, box: Rect): Rect` — `Rect` from `./layout.js`, `Instance` from `./host.js`.

**Risks worth flagging for the implementer:**

1. **`??` precedence with `0`**: `paddingTop: 0` should override `padding: 2` on the top edge. The chain `props.paddingTop ?? props.paddingY ?? props.padding ?? 0` evaluates correctly because `??` only short-circuits on `null` / `undefined`, NOT `0`. The "per-edge overrides shorthand" test pins this. If the implementer accidentally writes `||` instead of `??`, `0` would fall through and the test would fail correctly.

2. **`getComputedPadding` / `getComputedBorder` valid only post-layout**: `contentRectOf` is called inside `paintInstance` which only runs after `computeLayout`. Safe. If the implementer extracts the helper to applyProps or createInstance, the values will all be 0 (layout hasn't computed yet) — DO NOT move it.

3. **Vertical/horizontal clipping in the own-text loop**: the new `if (row >= content.height) break;` and `if (col >= content.width) break;` clips are additions over the previous behavior — previously text could spill into border cells (the now-fixed bug). The clip is safe: content.width/height is `Math.max(0, ...)` so it's never negative; if a content area is 0 wide, the inner loop never enters.

4. **Pre-existing test that may now behave differently**: any existing paint test that paints own-text on a non-padded, non-bordered box was painting at `box.left + col`, which equals `content.left + col` when padding=0 and border=undefined. Same coordinates → same behavior. Should be a no-op for existing tests. If something breaks, the test was implicitly relying on the bug; update it.

5. **`Edge` not currently imported in paint.ts**: the helper needs `Edge` from `./yoga.js`. Add the import. If the import block uses named-only `{ Buffer, type Style }` from cells, add a separate `import { Edge } from './yoga.js';` line.

6. **Percentage padding**: Yoga's `setPadding` accepts `${number}%` strings. If the user writes `padding: '50%'`, the resolution helper would type-error (`number | undefined` vs `string`). Either widen the prop type (deferred — explicit YAGNI), or just let TypeScript reject. Current plan: number-only; documented in "Out of scope."

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/padding.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `padding`, and dispatch Task 1 (Sonnet — paint helper + tests), then Task 2 (Haiku — README + build).
