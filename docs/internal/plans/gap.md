# flowtty Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add CSS-style `gap` / `rowGap` / `columnGap` to `<Box>` for evenly-spaced flex children (alternative to per-child `marginRight`/`marginBottom` in lists). Wired via Yoga's `setGap(Gutter.{Row,Column}, n)`. Per-axis wins over shorthand. Gap applies BETWEEN siblings only — no extra space at the parent's leading or trailing edge.

**Architecture:** `BoxProps` gets 3 new optional fields (`gap`, `rowGap`, `columnGap`). `applyProps` resolves each axis with `rowGap ?? gap ?? 0` and `columnGap ?? gap ?? 0`, then calls `n.setGap(Gutter.Row, rowGap)` and `n.setGap(Gutter.Column, columnGap)` unconditionally (no `Gutter.All` call needed — explicit per-axis calls cover both cases and avoid Yoga's internal precedence ambiguity). `Gutter` enum is re-exported from `src/yoga.ts` alongside the existing enums. **No paint changes** — Yoga's computed `box.left`/`box.top` for each child already incorporates the gap.

**CSS naming note:** `rowGap` is the gap BETWEEN ROWS — vertical spacing in a column-flex layout. `columnGap` is the gap BETWEEN COLUMNS — horizontal spacing in a row-flex layout. Yoga's enum follows the same convention.

**Tech Stack:** Same as Margin — TypeScript ESM, Vitest 4, yoga-layout 3.2.1.

**Out of scope** (later / non-goals):
- Percentage gap (`gap: '50%'`). Number only.
- Gap interactions with `flex-wrap` (Yoga supports wrap, but flowtty doesn't expose `flexWrap` yet — separate plan).
- Negative gap (Yoga clamps to 0; we just pass through).

---

## Scope check

Single independent feature: 3 prop additions + `Gutter` re-export + applyProps wiring + tests. **No paint changes.** One plan, **2 tasks**.

---

## File Structure

```
src/
  yoga.ts             # MODIFY — add `Gutter` to the existing re-export line
  host.ts             # MODIFY — add gap/rowGap/columnGap to BoxProps; resolve + setGap per axis in applyProps
  paint.test.ts       # MODIFY — tests for shorthand (row + column flex), rowGap, columnGap, axis specificity, no leading/trailing gap
README.md             # MODIFY — document gap props + CSS naming convention
```

Responsibilities:
- **`yoga.ts`** owns enum re-exports — `Gutter` joins `FlexDirection, MeasureMode, PositionType, Edge, Justify, Align`.
- **`host.ts`** owns the prop type + Yoga gap calls.
- **`paint.test.ts`** asserts post-layout coordinates via bg-color-filled children.

---

### Task 1: `Gutter` re-export + BoxProps + setGap + tests

**Files:**
- Modify: `src/yoga.ts`
- Modify: `src/host.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/yoga.ts` to see the existing re-export shape (one-line `export { … } from 'yoga-layout/load';`), `src/host.ts` to see the margin block (yours mirrors it), `src/paint.test.ts` to confirm the test helper pattern.

- [ ] **Step 2: Modify `src/yoga.ts`** — add `Gutter` to the existing re-export at line 16:

Find:
```ts
export { FlexDirection, MeasureMode, PositionType, Edge, Justify, Align } from 'yoga-layout/load';
```

Replace with:
```ts
export { FlexDirection, MeasureMode, PositionType, Edge, Justify, Align, Gutter } from 'yoga-layout/load';
```

- [ ] **Step 3: Modify `src/host.ts`** — import `Gutter` and add the props + applyProps block.

At line 1, add `Gutter` to the existing yoga import:
```ts
import { Align, Edge, FlexDirection, Gutter, Justify, MeasureMode, PositionType, type Yoga, type YogaNode } from './yoga.js';
```

Add to `BoxProps` interface, after the existing margin fields:
```ts
  // Gap between flex children (cells). Per-axis wins over shorthand.
  // CSS convention: rowGap = gap BETWEEN rows (vertical spacing in column flex);
  // columnGap = gap BETWEEN columns (horizontal spacing in row flex).
  gap?: number;
  rowGap?: number;
  columnGap?: number;
```

In `applyProps`, after the existing margin block, add:
```ts
  // Gap between siblings — per-axis ?? shorthand ?? 0.
  // Always set so removing the prop re-renders correctly.
  const rGap = props.rowGap    ?? props.gap ?? 0;
  const cGap = props.columnGap ?? props.gap ?? 0;
  n.setGap(Gutter.Row, rGap);
  n.setGap(Gutter.Column, cGap);
```

- [ ] **Step 4: Append failing tests to `src/paint.test.ts`** — match the existing pattern:

```ts
describe('Box gap', () => {
  test('gap shorthand: row flex spaces siblings horizontally', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Three 1×1 children in a 5×1 row flex with gap:1 → x positions 0, 2, 4
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', gap: 1, width: 5, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 5, 1);
    const buf = paint(container, 5, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBeUndefined(); // gap
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(3, 0).style.bg).toBeUndefined(); // gap
    expect(buf.get(4, 0).style.bg).toBe('blue');
  });

  test('gap shorthand: column flex spaces siblings vertically', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Three 1×1 children in a 1×5 column flex with gap:1 → y positions 0, 2, 4
    root.render(
      createElement('flowtty-box', { gap: 1, width: 1, height: 5 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 1, 5);
    const buf = paint(container, 1, 5);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // gap
    expect(buf.get(0, 2).style.bg).toBe('green');
    expect(buf.get(0, 3).style.bg).toBeUndefined(); // gap
    expect(buf.get(0, 4).style.bg).toBe('blue');
  });

  test('rowGap controls vertical spacing in column flex', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // rowGap:2 between two 1×1 children in a column flex → y positions 0 and 3
    root.render(
      createElement('flowtty-box', { rowGap: 2, width: 1, height: 4 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 1, 4);
    const buf = paint(container, 1, 4);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(0, 1).style.bg).toBeUndefined();
    expect(buf.get(0, 2).style.bg).toBeUndefined();
    expect(buf.get(0, 3).style.bg).toBe('blue');
  });

  test('columnGap controls horizontal spacing in row flex', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // columnGap:2 between two 1×1 children in a row flex → x positions 0 and 3
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', columnGap: 2, width: 4, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 1);
    const buf = paint(container, 4, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBeUndefined();
    expect(buf.get(2, 0).style.bg).toBeUndefined();
    expect(buf.get(3, 0).style.bg).toBe('blue');
  });

  test('per-axis gap overrides shorthand (columnGap wins over gap on row axis)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // gap:2 (shorthand) + columnGap:0 (axis) — horizontal spacing should be 0
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', gap: 2, columnGap: 0, width: 2, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 2, 1);
    const buf = paint(container, 2, 1);
    // No gap → siblings flush at x=0 and x=1
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('blue');
  });

  test('gap does not apply at the leading/trailing edges (only between siblings)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Two 1×1 children in a 3×1 row flex with gap:1 → first child at x=0, second at x=2.
    // If gap were applied at the start, first child would be at x=1, not x=0.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', gap: 1, width: 3, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 3, 1);
    const buf = paint(container, 3, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');   // flush left, no leading gap
    expect(buf.get(1, 0).style.bg).toBeUndefined(); // the one gap, between
    expect(buf.get(2, 0).style.bg).toBe('blue');
  });
});
```

- [ ] **Step 5: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 6 new).
  - `npx vitest run` — full suite green (219 + 6 = 225).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **`??` vs `||`**: `columnGap: 0` must override `gap: 2`. Use `??`.
- **`Gutter.Row` vs `Gutter.Column` swapped**: easy mistake. `Gutter.Row` = ROW gap = vertical (between rows). `Gutter.Column` = COLUMN gap = horizontal (between columns). The "rowGap controls vertical" + "columnGap controls horizontal" tests pin this. If they fail, the calls are swapped.
- **Import path for `Gutter`**: must come from `./yoga.js` (the local re-export), NOT directly from `'yoga-layout/load'`. The pattern matches `Edge`, `FlexDirection`, etc.
- **Tests fail because `Gutter` is undefined at runtime**: the re-export line in `src/yoga.ts` needs `Gutter` actually added; check the file after editing.

- [ ] **Step 6: Commit**
```bash
git add src/yoga.ts src/host.ts src/paint.test.ts
git commit -m "feat: Box gap — gap/rowGap/columnGap for flex sibling spacing"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Margin subsection).

- [ ] **Step 2: Add a `### Gap` subsection** under `## Status`, after `### Margin`:

```md
### Gap

`<Box>` accepts CSS-style gap props for spacing between flex children.

- `gap={n}` — both axes
- `rowGap={n}` — vertical spacing (between rows / column-flex items)
- `columnGap={n}` — horizontal spacing (between columns / row-flex items)

Per-axis wins over shorthand. Gap applies BETWEEN siblings only — no extra space at the parent's leading or trailing edge. Often cleaner than per-child `marginRight`/`marginBottom` for evenly-spaced lists.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (225)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box gap props"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- `gap` shorthand (row flex + column flex) → Task 1 (two tests).
- `rowGap` + `columnGap` per-axis → Task 1 (two tests).
- Per-axis precedence → Task 1 (specificity test).
- No leading/trailing gap → Task 1 (edge test).
- README → Task 2.

**2. Placeholder scan:** none.

**3. Type consistency:**
- All 3 gap props typed `number | undefined`. No string/percent variant.
- `Gutter` from `./yoga.js` (re-exported in Step 2).

**Risks worth flagging for the implementer:**

1. **CSS naming gotcha**: `rowGap` = vertical, `columnGap` = horizontal. The pair of tests ("rowGap controls vertical spacing in column flex" + "columnGap controls horizontal spacing in row flex") pins this. If both fail in unison, the `Gutter.Row`/`Gutter.Column` calls are swapped.

2. **`??` vs `||`** — same trap as padding/margin. `columnGap: 0` must override `gap: 2`. Use `??`.

3. **No `Gutter.All` call**: explicitly setting `Gutter.Row` and `Gutter.Column` covers both cases without relying on Yoga's internal All-vs-per-axis precedence. If the implementer adds a `Gutter.All` call, it's redundant — should be either removed or used INSTEAD of the per-axis calls (not in addition).

4. **No paint changes**: same as margin. Yoga's `setGap` affects each child's computed `box.left`/`box.top` directly; paint just reads what Yoga returns. If the implementer touches paint.ts, they're going wrong.

5. **Pre-existing tests**: gap defaults to 0, which is the same as not calling `setGap` at all. Adding always-call should be a no-op for existing tests. Unlikely to break anything.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/gap.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `gap`, and dispatch Task 1 (Sonnet — pattern is essentially identical to margin), then Task 2 (Haiku — README + build).
