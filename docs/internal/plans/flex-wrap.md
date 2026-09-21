# flowtty FlexWrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add `flexWrap` to `<Box>` — `'nowrap' | 'wrap' | 'wrap-reverse'` — so flex children overflow into additional lines instead of overflowing or shrinking. Wired via Yoga's `setFlexWrap(Wrap.X)`. Default `'nowrap'` matches CSS + Yoga. Interaction with the just-merged `gap`: when wrap is on, `rowGap` controls spacing between wrap lines (perpendicular to the main axis); `columnGap` continues to control spacing between items on the same line.

**Architecture:** `BoxProps` gets one new optional field. `applyProps` maps the string value to the Yoga `Wrap` enum and calls `setFlexWrap(...)` unconditionally. `Wrap` is re-exported from `src/yoga.ts` alongside the other enums (no naming clash with the existing `WrapMode` — that's a string-union type for text wrap, this is a numeric enum for flex wrap). **No paint changes** — Yoga's computed `box.left`/`box.top` per child already incorporates wrap-line positioning.

**Tech Stack:** Same as Flex Sizing — TypeScript ESM, Vitest 4, yoga-layout 3.2.1.

**Out of scope** (later / non-goals):
- `align-content` (controls cross-axis distribution of wrap lines when there's extra cross-axis space). Yoga supports it via `setAlignContent`; defer to a separate plan.
- Wrap interaction with `flexGrow` (grow recomputes per-line; works automatically through Yoga). No special wiring needed.

---

## Scope check

Single prop addition + one enum re-export. Pattern mirrors gap exactly. One plan, **2 tasks**.

---

## File Structure

```
src/
  yoga.ts             # MODIFY — add `Wrap` to the existing re-export line
  host.ts             # MODIFY — add flexWrap to BoxProps; map string → Wrap enum + setFlexWrap in applyProps
  paint.test.ts       # MODIFY — tests for wrap, nowrap default, wrap-reverse, wrap + rowGap interaction
README.md             # MODIFY — document flexWrap + interaction with gap
```

---

### Task 1: `Wrap` re-export + BoxProps + setFlexWrap + tests

**Files:**
- Modify: `src/yoga.ts`
- Modify: `src/host.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/yoga.ts` (one-line re-export to extend), `src/host.ts` (see the just-merged gap + flex-sizing blocks for the pattern), `src/paint.test.ts` (match the helper pattern).

- [ ] **Step 2: Modify `src/yoga.ts`** — add `Wrap` to the re-export at line 16.

Find:
```ts
export { FlexDirection, MeasureMode, PositionType, Edge, Justify, Align, Gutter } from 'yoga-layout/load';
```

Replace with:
```ts
export { FlexDirection, MeasureMode, PositionType, Edge, Justify, Align, Gutter, Wrap } from 'yoga-layout/load';
```

- [ ] **Step 3: Modify `src/host.ts`** — import `Wrap`, add the prop + mapping.

At line 1, add `Wrap` to the yoga import:
```ts
import { Align, Edge, FlexDirection, Gutter, Justify, MeasureMode, PositionType, Wrap, type Yoga, type YogaNode } from './yoga.js';
```

Add to `BoxProps` interface, after the existing flex-sizing fields:
```ts
  // Multi-line flex: 'wrap' / 'wrap-reverse' lets children flow onto additional lines
  // when they overflow the main axis. Default 'nowrap'.
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
```

In `applyProps`, after the existing flex-sizing block, add:
```ts
  // flex-wrap → Yoga Wrap enum. Always set so removing the prop re-renders correctly.
  n.setFlexWrap(wrapMap(props.flexWrap));
```

Add a `wrapMap` helper alongside the existing `jcMap`/`aiMap` helpers at the bottom of the file:
```ts
function wrapMap(v: BoxProps['flexWrap']): number {
  switch (v) {
    case 'wrap':         return Wrap.Wrap;
    case 'wrap-reverse': return Wrap.WrapReverse;
    default:             return Wrap.NoWrap;
  }
}
```

- [ ] **Step 4: Append failing tests to `src/paint.test.ts`** — match the existing pattern:

```ts
describe('Box flexWrap', () => {
  test('flexWrap="wrap": children that exceed main axis wrap to the next line', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×2 row flex, three 2-wide children. AA + BB fit on line 1 (4 wide total),
    // CC wraps to line 2.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', width: 4, height: 2 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 2);
    const buf = paint(container, 4, 2);
    // Line 1
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(3, 0).style.bg).toBe('green');
    // Line 2 (wrapped)
    expect(buf.get(0, 1).style.bg).toBe('blue');
    expect(buf.get(1, 1).style.bg).toBe('blue');
  });

  test('default flexWrap is "nowrap" — children overflow the parent rather than wrap', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Same children, no flexWrap. Total width 6 > parent 4; third child overflows past x=4.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 4, height: 1 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    // Give canvas room to render the overflow so we can observe it.
    computeLayout(container, 6, 1);
    const buf = paint(container, 6, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('green');
    expect(buf.get(4, 0).style.bg).toBe('blue');
    expect(buf.get(5, 0).style.bg).toBe('blue');
  });

  test('flexWrap="wrap-reverse": wrap lines stack in reverse cross-axis order', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Same scenario as the "wrap" test but with wrap-reverse. The line that would
    // normally land at y=0 ends up at y=1, and the wrapped line lands at y=0.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap-reverse', width: 4, height: 2 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 2);
    const buf = paint(container, 4, 2);
    // Wrapped (last) line is at TOP
    expect(buf.get(0, 0).style.bg).toBe('blue');
    expect(buf.get(1, 0).style.bg).toBe('blue');
    // First line is at BOTTOM
    expect(buf.get(0, 1).style.bg).toBe('red');
    expect(buf.get(2, 1).style.bg).toBe('green');
  });

  test('flexWrap="wrap" + rowGap: lines are separated by rowGap cells', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×3 row flex with wrap + rowGap:1. AA BB at y=0, gap at y=1, CC at y=2.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', flexWrap: 'wrap', rowGap: 1, width: 4, height: 3 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'green' }),
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 3);
    const buf = paint(container, 4, 3);
    // Line 1 at y=0
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('green');
    // rowGap at y=1 (no bg)
    expect(buf.get(0, 1).style.bg).toBeUndefined();
    expect(buf.get(2, 1).style.bg).toBeUndefined();
    // Wrapped line at y=2
    expect(buf.get(0, 2).style.bg).toBe('blue');
    expect(buf.get(1, 2).style.bg).toBe('blue');
  });
});
```

- [ ] **Step 5: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 4 new).
  - `npx vitest run` — full suite green (231 + 4 = 235).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **`Wrap` enum value name**: it's `Wrap.WrapReverse` (PascalCase), not `Wrap.WRAP_REVERSE` (Yoga's internal const) and not `Wrap.wrapReverse`. Check the d.ts: `WrapReverse` is the TS-friendly export name.
- **String value typo**: the prop accepts the kebab string `'wrap-reverse'`, not `'wrapReverse'`. CSS conventions for string values.
- **"wrap-reverse" test fails because lines aren't actually flipped**: verify `wrapMap` maps `'wrap-reverse'` to `Wrap.WrapReverse` (not `Wrap.Wrap`). The default branch (`Wrap.NoWrap`) is intentional fallback for `'nowrap'` and undefined.
- **"wrap + rowGap" test fails because gap doesn't show between wrap lines**: this would mean Yoga isn't applying `Gutter.Row` to wrap-line spacing. Less likely than a test setup issue — re-verify the parent height (3 = 1 line + 1 gap + 1 line).

- [ ] **Step 6: Commit**
```bash
git add src/yoga.ts src/host.ts src/paint.test.ts
git commit -m "feat: Box flexWrap — wrap / wrap-reverse multi-line flex layouts"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Flex sizing subsection).

- [ ] **Step 2: Add a `### Flex wrap` subsection** under `## Status`, after `### Flex sizing`:

```md
### Flex wrap

`<Box flexWrap>` controls multi-line flex layouts. Default `'nowrap'`.

- `flexWrap="nowrap"` (default) — single line; children overflow or shrink to fit
- `flexWrap="wrap"` — children flow to additional lines when they exceed the main axis
- `flexWrap="wrap-reverse"` — same as `wrap`, but wrap lines stack in reverse cross-axis order

When wrap is on, `rowGap` controls spacing between wrap lines (perpendicular to the main axis); `columnGap` continues to control spacing between items on the same line.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (235)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box flexWrap"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- `flexWrap="wrap"` → Task 1 (wrap test).
- `flexWrap="nowrap"` default → Task 1 (overflow test).
- `flexWrap="wrap-reverse"` → Task 1 (reverse test).
- Wrap + rowGap interaction → Task 1 (gap test).
- README → Task 2.

**2. Placeholder scan:** none.

**3. Type consistency:**
- `flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse'` — kebab string union, matches CSS values.
- `wrapMap(v): number` returns `Wrap.NoWrap | Wrap.Wrap | Wrap.WrapReverse`.

**Risks worth flagging for the implementer:**

1. **Enum naming**: `Wrap.WrapReverse` — pay attention to PascalCase. The d.ts shows `WrapReverse = 2`; that's what to use.

2. **Naming collision risk with existing `WrapMode`**: there isn't one. `WrapMode` is a TypeScript string-union (`'wrap' | 'truncate' | 'none'`) used by `<Box wrap>` for text wrap; `Wrap` is a numeric enum from Yoga. Different namespaces, different concepts. If TypeScript ever complains, double-check imports.

3. **No paint changes**: same as gap and flex-sizing. Wrap affects each child's computed `box.left`/`box.top` via Yoga; paint reads computed layout. If the implementer touches paint.ts, they're going wrong.

4. **`align-content` is NOT wired**: when `flexWrap: 'wrap'` produces multiple lines and the cross-axis has extra space, those lines stack at the start by default. The user can't yet control this. Documented as out-of-scope.

5. **Pre-existing tests with implicit `flexWrap: undefined`**: `wrapMap(undefined)` returns `Wrap.NoWrap`, which is Yoga's default — no behavior change. Always-call is a no-op for existing tests.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/flex-wrap.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `flex-wrap`, and dispatch Task 1 (Sonnet — pattern is essentially identical to gap), then Task 2 (Haiku — README + build).
