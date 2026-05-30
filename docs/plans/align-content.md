# flowtty alignContent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add `alignContent` to `<Box>` — controls cross-axis distribution of wrap lines when `flexWrap` is `'wrap'` or `'wrap-reverse'` and there's extra cross-axis space. Values mirror CSS: `'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly' | 'stretch'`. Wired via Yoga's `setAlignContent(Align.X)`. **Default is `'flex-start'`** (always-call pattern pins behavior, not Yoga's potentially different default). No effect unless wrap is on AND the parent has more cross-axis space than the wrap lines need.

**Architecture:** `BoxProps` gets one new optional field. `applyProps` maps the string value to the Yoga `Align` enum via an `acMap` helper (parallel to `aiMap` / `jcMap`) and calls `setAlignContent(...)` unconditionally. The existing `Align` import is reused — no new yoga.ts re-export. **No paint changes.**

**Tech Stack:** Same as FlexWrap — TypeScript ESM, Vitest 4, yoga-layout 3.2.1.

**Out of scope:**
- Yoga's `Align.Baseline` (only meaningful for `alignItems` with text baselines — flowtty doesn't expose baselines).

---

## Scope check

One prop, one helper, one applyProps call. Pattern is essentially identical to `flexWrap`. One plan, **2 tasks**.

---

## File Structure

```
src/
  host.ts             # MODIFY — add alignContent to BoxProps; add acMap helper; setAlignContent in applyProps
  paint.test.ts       # MODIFY — tests for flex-end, center, space-between, stretch (default flex-start covered by existing wrap tests indirectly)
README.md             # MODIFY — document alignContent + wrap-line interaction
```

---

### Task 1: BoxProps + acMap + setAlignContent + tests

**Files:**
- Modify: `src/host.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/host.ts` to see the `aiMap` / `jcMap` helpers + the just-merged `wrapMap` / `setFlexWrap` block (yours sits beside them). `src/paint.test.ts` to match the helper pattern.

- [ ] **Step 2: Modify `src/host.ts`** — add the prop + acMap + applyProps call.

Add to `BoxProps` interface, after the existing `flexWrap` field:
```ts
  /** Cross-axis distribution of wrap lines. Only effective when flexWrap is 'wrap' or 'wrap-reverse'
   *  AND the parent has extra cross-axis space. Default 'flex-start'. */
  alignContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly' | 'stretch';
```

In `applyProps`, after the existing `n.setFlexWrap(...)` line, add:
```ts
  n.setAlignContent(acMap(props.alignContent));
```

Add an `acMap` helper alongside the existing `jcMap`/`aiMap`/`wrapMap` helpers at the bottom of the file:
```ts
function acMap(v: BoxProps['alignContent']): number {
  switch (v) {
    case 'flex-end':      return Align.FlexEnd;
    case 'center':        return Align.Center;
    case 'space-between': return Align.SpaceBetween;
    case 'space-around':  return Align.SpaceAround;
    case 'space-evenly':  return Align.SpaceEvenly;
    case 'stretch':       return Align.Stretch;
    default:              return Align.FlexStart;
  }
}
```

- [ ] **Step 3: Append failing tests to `src/paint.test.ts`** — match the existing pattern. Each test uses a 4×4 row-flex parent with `flexWrap: 'wrap'` and three 2-wide × 1-tall children, producing 2 wrap lines totaling 2 rows in a 4-row container (2 rows of free cross-axis space):

```ts
describe('Box alignContent', () => {
  test('alignContent="flex-end": wrap lines pack at the bottom (cross-axis end)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // 2 lines (2 rows used) in a 4-row parent → 2 free rows.
    // flex-end: free space at top, line 1 at y=2, line 2 at y=3.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-end', width: 4, height: 4 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    expect(buf.get(0, 0).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 2).style.bg).toBe('red');     // line 1
    expect(buf.get(2, 2).style.bg).toBe('green');
    expect(buf.get(0, 3).style.bg).toBe('blue');    // line 2
  });

  test('alignContent="center": wrap lines pack in the middle of cross-axis', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // center: 1 free row above, 1 free row below → line 1 at y=1, line 2 at y=2.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', width: 4, height: 4 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    expect(buf.get(0, 0).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 1).style.bg).toBe('red');     // line 1 centered
    expect(buf.get(2, 1).style.bg).toBe('green');
    expect(buf.get(0, 2).style.bg).toBe('blue');    // line 2
    expect(buf.get(0, 3).style.bg).toBeUndefined(); // free
  });

  test('alignContent="space-between": first line at top, last at bottom, free space between', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // space-between: line 1 at y=0, line 2 at y=3, free at y=1 and y=2.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'space-between', width: 4, height: 4 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    expect(buf.get(0, 0).style.bg).toBe('red');     // line 1 at top
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 2).style.bg).toBeUndefined(); // free
    expect(buf.get(0, 3).style.bg).toBe('blue');    // line 2 at bottom
  });

  test('alignContent="stretch": wrap lines stretch to fill cross-axis (each line 2 rows tall)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // 2 lines stretch to fill 4 rows → each line is 2 rows tall.
    // Children with height:1 + default alignItems='flex-start' render at the TOP of their line.
    // Line 1 spans y=0..1; children render at y=0. Line 2 spans y=2..3; children at y=2.
    // Compare to flex-start default (lines at y=0 and y=1, free at y=2,3) to see the difference.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'stretch', width: 4, height: 4 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    // Line 1 (stretched to y=0..1): children at y=0
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(0, 1).style.bg).toBeUndefined(); // line 1 bottom row (stretched, no child)
    // Line 2 (stretched to y=2..3): children at y=2
    expect(buf.get(0, 2).style.bg).toBe('blue');
    expect(buf.get(0, 3).style.bg).toBeUndefined(); // line 2 bottom row
  });
});
```

- [ ] **Step 4: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 4 new).
  - `npx vitest run` — full suite green (235 + 4 = 239).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **Yoga default for alignContent**: Yoga 3.x default might be `Stretch` (CSS3 default) or `FlexStart` (older). The always-call pattern with `acMap` default `Align.FlexStart` pins behavior regardless. If the "stretch" test fails because lines stretched WITHOUT the prop, Yoga default is stretch and the plan's default-flex-start choice is still correct (you've explicitly set it to flex-start, so behavior is deterministic).
- **`center` test produces y=2/y=3 instead of y=1/y=2**: Yoga might round center differently. The plan's choice of 2 free rows around 2 content rows gives `1 above + 1 below` — exact integers. If the test fails, look at the actual coords and update the expectations to match Yoga's rounding (but document the deviation).
- **`stretch` test fails because children fill BOTH rows of their line**: that would mean `alignItems` is implicitly stretching them. With default `alignItems` (flex-start), child stays at its height=1. If they DO stretch, the test would show bg at y=0 AND y=1 for line 1. If this happens, the test expectation needs flipping — but it's also a finding worth noting.

- [ ] **Step 5: Commit**
```bash
git add src/host.ts src/paint.test.ts
git commit -m "feat: Box alignContent — cross-axis distribution of wrap lines"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Flex wrap subsection).

- [ ] **Step 2: Add a `### Align content` subsection** under `## Status`, after `### Flex wrap`:

```md
### Align content

`<Box alignContent>` controls cross-axis distribution of wrap lines. Only effective when `flexWrap` is `'wrap'` or `'wrap-reverse'` AND the parent has more cross-axis space than the wrap lines need. Default `'flex-start'`.

- `'flex-start'` (default) — lines packed at cross-axis start
- `'flex-end'` — lines packed at cross-axis end
- `'center'` — lines centered
- `'space-between'` — first line at start, last at end, free space between
- `'space-around'` — equal space around each line
- `'space-evenly'` — equal space between all lines including edges
- `'stretch'` — lines stretch to fill cross-axis space

CSS deviation: CSS3 defaults `align-content` to `'stretch'` for flex; flowtty defaults to `'flex-start'` (deterministic, doesn't reflow content unexpectedly).
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (239)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box alignContent"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- `flex-end`, `center`, `space-between`, `stretch` → Task 1 (four tests).
- `flex-start` default → no explicit test (covered by existing flexWrap tests which assume default).
- `space-around` / `space-evenly` → not explicitly tested (mapping is mechanical, identical structure to `space-between`). If implementer wants to add coverage, the parent dimensions need tuning for clean integers — defer.
- README → Task 2 (flagged CSS deviation).

**2. Placeholder scan:** none.

**3. Type consistency:**
- `alignContent?:` string union of 7 CSS values.
- `acMap` returns `Align.X` numeric enum.

**Risks worth flagging for the implementer:**

1. **Yoga's default for `align-content`** — might be `Stretch` (CSS3) or `FlexStart` (older). The always-call pattern + `acMap` default `Align.FlexStart` makes flowtty's default deterministic regardless. If the implementer is curious, they can probe with a one-off test (`createElement('flowtty-box', { flexWrap: 'wrap', /* no alignContent */ })` and observe), but it's not required.

2. **Rounding in `center`/`space-around`** — the plan uses 2 free rows + 2 content rows = exact split. `space-around` and `space-evenly` weren't tested because they require finer rounding cases. If the implementer wants to add a `space-around` test, use a parent with 4 free rows + 2 content rows (6 tall) so divisions are clean.

3. **`stretch` test behavior** — the test pins that children DON'T stretch (only lines do). Default `alignItems` is `flex-start`. If the test fails because children stretch, check if `alignItems` is being incorrectly inherited or applied.

4. **No paint changes** — same as flexWrap. If you touch paint.ts, you're going wrong.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/align-content.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `align-content`, dispatch Task 1 (Sonnet — pattern matches flexWrap), then Task 2 (Haiku — README + build).
