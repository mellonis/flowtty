# flowtty Margin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add CSS-style margin to `<Box>` — `margin` (all four edges), `marginX`/`marginY` (axis), `marginTop`/`marginRight`/`marginBottom`/`marginLeft` (per-edge). Margin pushes the box away from its parent/siblings via Yoga's `setMargin(edge, n)`. Same precedence rule as padding (per-edge wins over axis wins over shorthand). Numbers only (cell counts; negative values allowed — Yoga supports them for pull-together/overlap layouts).

**Architecture:** mirrors padding exactly, but with `setMargin` instead of `setPadding`. `BoxProps` gets 7 new optional fields. `applyProps` resolves each edge with the precedence `per-edge ?? axis ?? all ?? 0` and calls `n.setMargin(Edge.X, value)` unconditionally. **No paint changes needed** — margin affects the box's OWN computed layout coordinates (`box.left` / `box.top`), so paint just reads what Yoga returns. Children, own-text, border, and padding all already work against the post-margin rect.

**Tech Stack:** Same as Padding — TypeScript ESM, Vitest 4, yoga-layout 3.2.1.

**Out of scope** (later / non-goals):
- `auto` margins (`setMarginAuto(edge)` — used for centering in CSS flexbox). Number only.
- Percentage margins (`setMarginPercent` — `'50%'` string). Number only.
- Negative-margin clipping logic — Yoga handles overlap; paint writes wherever Yoga places the box. If the box extends beyond the parent's rect, paint writes outside the parent (intentional — matches CSS).
- Margin collapse (CSS-specific concept where adjacent vertical margins merge into the larger). Flexbox doesn't collapse margins; Yoga doesn't either; we don't either.

---

## Scope check

Single independent feature: BoxProps additions + applyProps wiring + tests. **No paint changes.** One plan, **2 tasks**.

---

## File Structure

```
src/
  host.ts             # MODIFY — add 7 margin props to BoxProps; resolve + setMargin per edge in applyProps
  paint.test.ts       # MODIFY — tests for shorthand, axis, per-edge specificity, sibling separation, negative margin
README.md             # MODIFY — document margin props
```

Responsibilities:
- **`host.ts`** owns the prop type + Yoga margin edge calls. Pattern is identical to the just-merged padding block.
- **`paint.test.ts`** — tests assert positioning of bg-color-filled children inside a parent (cheapest way to read post-layout coordinates from the buffer).

---

### Task 1: BoxProps + setMargin + tests

**Files:**
- Modify: `src/host.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/host.ts` to confirm the just-merged padding block shape (Step 2 mirrors it), and `src/paint.test.ts` to match the test helper pattern.

- [ ] **Step 2: Modify `src/host.ts`** — add the 7 props + resolution + setMargin.

Add to `BoxProps` interface, after the existing padding fields:

```ts
  // Margin (cells). Per-edge wins over axis wins over shorthand.
  // Negative values are allowed (Yoga supports overlap layouts).
  margin?: number;
  marginX?: number;
  marginY?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
```

In `applyProps`, after the existing padding block, add:

```ts
  // Margin edge reservation — per-edge ?? axis ?? all ?? 0.
  // Always set (including 0) so removing the prop re-renders correctly.
  const marTop    = props.marginTop    ?? props.marginY ?? props.margin ?? 0;
  const marRight  = props.marginRight  ?? props.marginX ?? props.margin ?? 0;
  const marBottom = props.marginBottom ?? props.marginY ?? props.margin ?? 0;
  const marLeft   = props.marginLeft   ?? props.marginX ?? props.margin ?? 0;
  n.setMargin(Edge.Top, marTop);
  n.setMargin(Edge.Right, marRight);
  n.setMargin(Edge.Bottom, marBottom);
  n.setMargin(Edge.Left, marLeft);
```

(`Edge` is already imported at `host.ts:1`.)

- [ ] **Step 3: Append failing tests to `src/paint.test.ts`** — match the existing pattern (`getYoga` + `createRoot` + `createElement` + `computeLayout` + `paint`):

```ts
describe('Box margin', () => {
  test('margin shorthand offsets the child away from the parent edges on all four sides', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 5×3; single child with margin:1 and width:3 height:1 (= 5-2 × 3-2).
    root.render(
      createElement('flowtty-box', { width: 5, height: 3 },
        createElement('flowtty-box', { margin: 1, width: 3, height: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Child landed at (1, 1) (margin offset on each side)
    expect(buf.get(1, 1).style.bg).toBe('red');
    expect(buf.get(3, 1).style.bg).toBe('red');
    // Outside the child — no bg
    expect(buf.get(0, 0).style.bg).toBeUndefined();
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // left margin column
    expect(buf.get(4, 1).style.bg).toBeUndefined(); // right margin column
  });

  test('marginX shorthand: only left/right offset; top/bottom flush', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { width: 5, height: 3 },
        createElement('flowtty-box', { marginX: 1, width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 3);
    const buf = paint(container, 5, 3);
    // Child at (1, 0) — marginX=1 offsets left; marginY=undefined keeps top flush
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(3, 2).style.bg).toBe('red');
    // Left/right margin columns are blank
    expect(buf.get(0, 0).style.bg).toBeUndefined();
    expect(buf.get(4, 0).style.bg).toBeUndefined();
  });

  test('marginY shorthand: only top/bottom offset; left/right flush', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    root.render(
      createElement('flowtty-box', { width: 3, height: 5 },
        createElement('flowtty-box', { marginY: 1, width: 3, height: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 3, 5);
    const buf = paint(container, 3, 5);
    // Child at (0, 1)
    expect(buf.get(0, 1).style.bg).toBe('red');
    expect(buf.get(2, 3).style.bg).toBe('red');
    expect(buf.get(0, 0).style.bg).toBeUndefined();
  });

  test('per-edge margin overrides axis and shorthand', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // margin: 2 for all edges, marginTop: 0 wins on top.
    root.render(
      createElement('flowtty-box', { width: 5, height: 5 },
        createElement('flowtty-box', { margin: 2, marginTop: 0, width: 1, height: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 5);
    const buf = paint(container, 5, 5);
    // Child at (2, 0): marginLeft=2, marginTop=0
    expect(buf.get(2, 0).style.bg).toBe('red');
  });

  test('marginRight separates row siblings', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // flex row, first child marginRight:2 — second child starts at x = 1 + 2 = 3
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 5, height: 1 },
        createElement('flowtty-box', { marginRight: 2, width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 5, 1);
    const buf = paint(container, 5, 1);
    // First child at x=0 (red)
    expect(buf.get(0, 0).style.bg).toBe('red');
    // Margin gap at x=1, x=2 (no bg)
    expect(buf.get(1, 0).style.bg).toBeUndefined();
    expect(buf.get(2, 0).style.bg).toBeUndefined();
    // Second child at x=3 (blue)
    expect(buf.get(3, 0).style.bg).toBe('blue');
  });

  test('negative margin pulls child outside parent rect (overlap layout)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 5×3 with another sibling, plus a 3-wide child with marginLeft: -1
    // pulled left from its row-flow position.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 5, height: 1 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { marginLeft: -1, width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 5, 1);
    const buf = paint(container, 5, 1);
    // First child at x=0..1 (red); second child shifted left by -1 to x=1..2 (blue overwrites red at x=1)
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('blue'); // overlapped
    expect(buf.get(2, 0).style.bg).toBe('blue');
  });
});
```

- [ ] **Step 4: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 6 new).
  - `npx vitest run` — full suite green (213 + 6 = 219).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **`??` precedence with `0`**: `marginTop: 0` must override `margin: 2`. `??` only short-circuits on null/undefined, not 0. The "per-edge overrides" test pins this. Don't accidentally write `||`.
- **"sibling separation" test fails**: verify `flexDirection: 'row'` is being set (default is 'column'). Without row direction, the second child would stack below the first, not beside it.
- **"negative margin" test fails because second child stays at x=2**: Yoga should accept negative margins. If `setMargin(Edge.Left, -1)` throws or is ignored, the test will fail. Check Yoga's behavior — typescript binding accepts `number` so it should pass through.
- **Pre-existing tests fail after the change**: extremely unlikely (margin defaults to 0, which is a no-op `setMargin` call). If one fails, the test was depending on `setMargin` NOT being called — investigate. Don't weaken tests.

- [ ] **Step 5: Commit**
```bash
git add src/host.ts src/paint.test.ts
git commit -m "feat: Box margin — shorthand + axis + per-edge"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Padding subsection).

- [ ] **Step 2: Add a `### Margin` subsection** under `## Status`, after `### Padding`:

```md
### Margin

`<Box>` accepts CSS-style margin props. Same precedence as padding (per-edge > axis > shorthand).

- `margin={n}` — all four edges
- `marginX={n}` — left + right
- `marginY={n}` — top + bottom
- `marginTop`, `marginRight`, `marginBottom`, `marginLeft` — per-edge override

Values are integer cell counts. Negative values are allowed — Yoga supports them for overlap layouts (a child with `marginLeft={-1}` shifts one cell into its preceding sibling's space).
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (219)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box margin props"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- `margin` shorthand → Task 1 (test).
- `marginX` / `marginY` → Task 1 (two tests).
- Per-edge + precedence → Task 1 (specificity test).
- Sibling separation (the practical case) → Task 1 (row-flex test).
- Negative margin (overlap) → Task 1 (negative test).
- README → Task 2.

**2. Placeholder scan:** none.

**3. Type consistency:**
- All 7 margin props typed `number | undefined`. No string/percent/auto variant.

**Risks worth flagging for the implementer:**

1. **`??` vs `||`** — same trap as padding. `marginTop: 0` over `margin: 2` requires `??`.

2. **No paint changes are needed** — this is the deliberate design. Margin pushes the box's OWN `box.left`/`box.top` (Yoga computes this), so paint, content-rect, border, bg-fill all already work. If the implementer is tempted to add paint-side logic for margin, STOP — it's wrong. Verify by checking that the "sibling separation" test passes against the unchanged paint code.

3. **Negative margin overlap semantics** — the test asserts that a negative `marginLeft` causes overlap (second child's blue overwrites first child's red at x=1). This is correct because paint walks children in tree order and later siblings overwrite earlier ones in shared cells. This is the same overlap mechanism M1f's two-pass paint uses for absolutes; for stack-flow with negative margin, it's first-pass-only and tree-order determines who wins. Document if needed.

4. **`refreshMeasure` and margin** — text-only boxes use a measure func. Margin doesn't affect the measure func's constraint (it's about positioning the box, not measuring its content). Should be a no-op for text-bearing boxes. If a test using text + margin fails, investigate whether the recently-merged `markDirty()` (in `refreshMeasure`) is interacting weirdly — unlikely, but worth being aware of.

5. **Pre-existing tests with implicit margin: 0 behavior** — Yoga's default margin is 0, and `setMargin(edge, 0)` is a no-op. Adding the always-call should not break any existing test.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/margin.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `margin`, and dispatch Task 1 (Sonnet — pattern is the same as padding/borders), then Task 2 (Haiku — README + build).
