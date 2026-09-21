# flowtty display: 'none' Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add `display?: 'flex' | 'none'` to `<Box>`. `'none'` removes the box and all descendants from layout (Yoga `Display.None`) — siblings don't reserve space for it, and paint short-circuits the subtree entirely. Useful for conditional UI without unmounting React state.

**Architecture:** `BoxProps` gets one new optional field. `applyProps` maps the string to the Yoga `Display` enum and calls `setDisplay(...)` unconditionally. **One paint change**: an early-return at the top of `paintInstance` for `display === 'none'` — Yoga collapses the box to zero size so paint would no-op anyway, but the short-circuit avoids walking the subtree (cleaner and saves cycles in deep trees).

**Tech Stack:** Same as aspectRatio.

**Out of scope:**
- `display: 'contents'` (CSS3 — node renders children but contributes no own box). Niche, doesn't pair with the rest of flowtty's API cleanly.

---

## Scope check

One prop, one re-export, one applyProps call, one paint short-circuit. **2 tasks.**

---

## File Structure

```
src/
  yoga.ts             # MODIFY — add `Display` to the existing enum re-export
  host.ts             # MODIFY — import Display; add `display` to BoxProps; setDisplay in applyProps
  paint.ts            # MODIFY — early return in paintInstance for display === 'none'
  paint.test.ts       # MODIFY — tests for hidden child (sibling fills space) and hidden subtree
README.md             # MODIFY — document display
```

---

### Task 1: re-export + BoxProps + setDisplay + paint short-circuit + tests

**Files:**
- Modify: `src/yoga.ts`
- Modify: `src/host.ts`
- Modify: `src/paint.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/yoga.ts` (one-line re-export to extend), `src/host.ts` (the `Wrap` import + `wrapMap` pattern is the closest neighbor; `Display` follows the same shape), `src/paint.ts` (the early-return goes at the very top of `paintInstance`), `src/paint.test.ts` (helper pattern).

- [ ] **Step 2: Modify `src/yoga.ts`** — add `Display` to the existing re-export.

Find:
```ts
export { FlexDirection, MeasureMode, PositionType, Edge, Justify, Align, Gutter, Wrap } from 'yoga-layout/load';
```

Replace with:
```ts
export { FlexDirection, MeasureMode, PositionType, Edge, Justify, Align, Gutter, Wrap, Display } from 'yoga-layout/load';
```

- [ ] **Step 3: Modify `src/host.ts`** — import `Display`, add prop + setter.

At line 1, add `Display` to the yoga import (alongside `Wrap`):
```ts
import { Align, Display, Edge, FlexDirection, Gutter, Justify, MeasureMode, PositionType, Wrap, type Yoga, type YogaNode } from './yoga.js';
```

Add to `BoxProps` interface, after the existing `aspectRatio` field:
```ts
  /** 'none' removes this box and all descendants from layout (siblings don't reserve space for it,
   *  and paint skips the subtree). Default 'flex'. Useful for conditional UI without unmounting. */
  display?: 'flex' | 'none';
```

In `applyProps`, after the existing aspectRatio line, add:
```ts
  n.setDisplay(props.display === 'none' ? Display.None : Display.Flex);
```

- [ ] **Step 4: Modify `src/paint.ts`** — add early return at the top of `paintInstance`. Find the start of `paintInstance` (around line 85) and add immediately at the top of the function body:

```ts
function paintInstance(
  inst: Instance,
  buffer: Buffer,
  offsetX: number,
  offsetY: number,
  inheritedBg: string | undefined = undefined,
  clip: Rect | null = null,
): void {
  // display: 'none' removes the box from layout (Yoga gives it zero size) AND
  // skips its entire subtree from paint. Without this short-circuit the existing
  // code would loop zero times for own draws and recurse into zero-sized children,
  // which is correct but wasteful in deep trees.
  if (inst.props.display === 'none') return;

  const box: Rect = layoutOf(inst, offsetX, offsetY);
  // ... rest of existing body unchanged
```

- [ ] **Step 5: Append failing tests to `src/paint.test.ts`** — match the existing helper pattern:

```ts
describe('Box display', () => {
  test('display="none" hides the box AND lets siblings take its space', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×1 row flex; two children width:4 with flexShrink:1.
    // If both visible: each shrinks to 2 (red x=0..1, blue x=2..3).
    // With red hidden via display:'none': only blue is laid out → blue takes the full 4 cells.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 4, height: 1 },
        createElement('flowtty-box', { width: 4, height: 1, flexShrink: 1, display: 'none', backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 4, height: 1, flexShrink: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 1);
    const buf = paint(container, 4, 1);
    // Blue fills the full 4 cells (red contributes no layout)
    expect(buf.get(0, 0).style.bg).toBe('blue');
    expect(buf.get(3, 0).style.bg).toBe('blue');
    // Red was hidden — no red cells anywhere
    for (let x = 0; x < 4; x++) {
      expect(buf.get(x, 0).style.bg).not.toBe('red');
    }
  });

  test('display="none" on a parent hides the entire subtree (children also invisible)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Outer container has two children: a visible blue box at left, and a display:'none' parent
    // (which contains a "would-have-been-visible" red child). The hidden parent's red child
    // must NOT appear anywhere.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 4, height: 1 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
        createElement('flowtty-box', { display: 'none', width: 2, height: 1 },
          createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'red' }),
        ),
      ),
    );
    computeLayout(container, 4, 1);
    const buf = paint(container, 4, 1);
    // Blue at x=0..1
    expect(buf.get(0, 0).style.bg).toBe('blue');
    expect(buf.get(1, 0).style.bg).toBe('blue');
    // Hidden parent's subtree: no red anywhere. The cells beyond blue are undefined (background).
    for (let x = 0; x < 4; x++) {
      expect(buf.get(x, 0).style.bg).not.toBe('red');
    }
    expect(buf.get(2, 0).style.bg).toBeUndefined();
    expect(buf.get(3, 0).style.bg).toBeUndefined();
  });

  test('display="flex" (default) keeps the box visible (no-op vs. omitting the prop)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Explicit display:'flex' should match the default behavior — child paints normally.
    root.render(
      createElement('flowtty-box', { width: 2, height: 1 },
        createElement('flowtty-box', { display: 'flex', width: 2, height: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 2, 1);
    const buf = paint(container, 2, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
  });
});
```

- [ ] **Step 6: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 3 new).
  - `npx vitest run` — full suite green (255 + 3 = 258).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **TypeScript error on `Display` import**: `Display` must be added to `src/yoga.ts` BEFORE importing it in `host.ts`. Order Step 2 then Step 3.
- **"display:'none' hides AND siblings expand" test fails because blue stays at x=2..3**: `setDisplay(Display.None)` not being called — verify the import + the call.
- **"hidden subtree" test fails because red appears**: paint short-circuit missing in `paintInstance` — verify `if (inst.props.display === 'none') return;` is FIRST inside the function body.
- **Pre-existing tests fail**: default behavior (`setDisplay(Display.Flex)`) matches Yoga's default. If any test breaks, it's because `Display.Flex` differs from "no setDisplay call" in some edge case — investigate, don't weaken tests.

- [ ] **Step 7: Commit**
```bash
git add src/yoga.ts src/host.ts src/paint.ts src/paint.test.ts
git commit -m "feat: Box display='none' — hide subtree from layout and paint"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Aspect ratio subsection).

- [ ] **Step 2: Add a `### Display` subsection** under `## Status`, after `### Aspect ratio`:

```md
### Display

`<Box display>` controls whether this box (and its subtree) participates in layout. Default `'flex'`.

- `display="flex"` (default) — normal flexbox participation
- `display="none"` — box and all descendants are removed from layout and skipped by paint. Siblings reflow as if this box didn't exist. React state is preserved (unlike conditionally unmounting).

Useful for tab panels, collapsible sections, and conditional UI where remounting would lose form state, scroll position, or other ephemeral state.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (258)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box display"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- `display="none"` on a sibling (sibling reflow) → Task 1 (test 1).
- `display="none"` on a parent (subtree hidden) → Task 1 (test 2).
- `display="flex"` explicit default → Task 1 (test 3 sanity check).
- README → Task 2 (with the React-state-preservation rationale).

**2. Placeholder scan:** none.

**3. Type consistency:**
- `display?: 'flex' | 'none'` — string union.
- Mapped to `Display.Flex` / `Display.None` numeric enum.

**Risks worth flagging for the implementer:**

1. **Yoga's default**: `setDisplay` defaults to `Display.Flex`. Always calling `setDisplay(Display.Flex)` on display-undefined boxes should be a no-op. If any pre-existing test breaks, that's a finding worth surfacing.

2. **Paint short-circuit position**: must be the FIRST line of `paintInstance` body, before `layoutOf(inst, ...)`. Calling `layoutOf` on a display:'none' node is technically safe (returns zero rect) but pointless. The early return is for both correctness (skipping subtree paint) and clarity (intent).

3. **Inherited bg / clip**: when a display:'none' box is skipped, its children never inherit anything from it. Since they're also skipped, this is moot. No special handling needed.

4. **React state preservation**: this is a behavioral guarantee from React's reconciler — when a box stays mounted with `display:'none'`, its component instances stay alive. NOT something flowtty needs to explicitly implement. Worth flagging in the README as the main reason to choose `display:'none'` over conditional rendering.

5. **`display:'none'` interaction with absolute positioning**: a hidden absolute child is also hidden (paint skips it). Yoga's absolute layout for display:'none' returns zero rect.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/display-none.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `display-none`, dispatch Task 1 (Sonnet — pattern is essentially identical to flexWrap, plus a one-line paint addition), then Task 2 (Haiku — README + build).
