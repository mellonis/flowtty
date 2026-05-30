# flowtty Min/Max Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add the four CSS-style min/max size constraints to `<Box>` — `minWidth`, `maxWidth`, `minHeight`, `maxHeight`. Each accepts `number | '${number}%' | undefined`. Wired via Yoga's `setMinWidth` / `setMaxWidth` / `setMinHeight` / `setMaxHeight`. Constraints interact with `flexGrow`/`flexShrink` and `width`/`height` to clamp the box's final computed size.

**Architecture:** `BoxProps` gets 4 new optional fields. `applyProps` calls each setter unconditionally with the prop value passed directly (Yoga's setter signatures accept the full union including `undefined` and `'${number}%'` strings, so no manual branching is needed — different from `width`/`height` which also support `'auto'` and need explicit `setWidthAuto()`). **No paint changes** — constraints affect Yoga's computed `box.width`/`box.height`; paint just reads those.

**Tech Stack:** Same as zIndex/overflow — TypeScript ESM, Vitest 4, yoga-layout 3.2.1.

**Out of scope:**
- `aspectRatio` prop — Yoga supports it (`setAspectRatio`), but it's a different concept (locking width:height ratio); separate plan if needed.
- Negative min/max — Yoga clamps; we pass through.

---

## Scope check

Four mechanical props with pass-through wiring. Mostly tests. One plan, **2 tasks**.

---

## File Structure

```
src/
  host.ts             # MODIFY — add 4 min/max props to BoxProps; 4 setter calls in applyProps
  paint.test.ts       # MODIFY — tests for minWidth blocking shrink, maxWidth capping grow, minHeight + maxHeight symmetry, percent variant
README.md             # MODIFY — document all four
```

---

### Task 1: BoxProps + setters + tests

**Files:**
- Modify: `src/host.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/host.ts` (the existing `setFlexGrow`/`setFlexShrink` block is the closest neighbor pattern; min/max sits beside it). `src/paint.test.ts` (match helper pattern).

- [ ] **Step 2: Modify `src/host.ts`** — add 4 props + 4 setter calls.

Add to `BoxProps` interface, after the existing flex-sizing fields (alongside `flexGrow`, `flexShrink`, `flexBasis`):

```ts
  /** Minimum cell size — Yoga prevents the box from shrinking below this.
   *  Accepts a number (cells) or a percent string (e.g. '50%'). Undefined = no minimum. */
  minWidth?: number | `${number}%`;
  maxWidth?: number | `${number}%`;
  minHeight?: number | `${number}%`;
  maxHeight?: number | `${number}%`;
```

In `applyProps`, after the existing flex-sizing block, add:

```ts
  // Min/max constraints — pass-through. Yoga's signatures accept number | '${number}%' | undefined
  // directly, so no manual branching is needed (different from width/height which support 'auto').
  n.setMinWidth(props.minWidth);
  n.setMaxWidth(props.maxWidth);
  n.setMinHeight(props.minHeight);
  n.setMaxHeight(props.maxHeight);
```

- [ ] **Step 3: Append failing tests to `src/paint.test.ts`** — match the existing helper pattern:

```ts
describe('Box min/max sizing', () => {
  test('minWidth prevents flexShrink from shrinking child below threshold', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×1 row flex; two children width:4 flexShrink:1 (would normally shrink to 2 each).
    // Add minWidth:3 to the first child → it shrinks only to 3; second child takes the remaining 1.
    // Total: 3 + 1 = 4. Red at x=0..2 (width 3), blue at x=3 (width 1).
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 4, height: 1 },
        createElement('flowtty-box', { width: 4, height: 1, flexShrink: 1, minWidth: 3, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 4, height: 1, flexShrink: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 1);
    const buf = paint(container, 4, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('red');
    expect(buf.get(3, 0).style.bg).toBe('blue');
  });

  test('maxWidth caps flexGrow expansion at the threshold', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 10×1 row flex; one child width:1 flexGrow:1 maxWidth:3 — grows from 1 toward 10
    // but caps at 3. Red at x=0..2.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, flexGrow: 1, maxWidth: 3, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 10, 1);
    const buf = paint(container, 10, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('red');
    expect(buf.get(3, 0).style.bg).toBeUndefined(); // beyond maxWidth
  });

  test('minHeight + maxHeight constrain column-flex children symmetrically', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 1×10 column flex; child with no height + flexGrow:1 maxHeight:2 — caps at 2.
    // Child with height:5 flexShrink:1 minHeight:4 in a tight 4-tall would clamp at 4, but
    // here we just check the maxHeight cap. Red at y=0..1; green at y=2..3 (next child fills minHeight).
    root.render(
      createElement('flowtty-box', { width: 1, height: 10 },
        createElement('flowtty-box', { width: 1, flexGrow: 1, maxHeight: 2, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, minHeight: 3, backgroundColor: 'green' }),
      ),
    );
    computeLayout(container, 1, 10);
    const buf = paint(container, 1, 10);
    // Red capped at 2 cells tall (y=0..1)
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(0, 1).style.bg).toBe('red');
    expect(buf.get(0, 2).style.bg).toBe('green'); // green starts immediately after red
    // Green's minHeight:3 → cells at y=2,3,4
    expect(buf.get(0, 3).style.bg).toBe('green');
    expect(buf.get(0, 4).style.bg).toBe('green');
  });

  test('maxWidth as percent string caps at fraction of parent width', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 10×1 row flex; child flexGrow:1 maxWidth:'50%' caps at 5.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
        createElement('flowtty-box', { height: 1, flexGrow: 1, maxWidth: '50%', backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 10, 1);
    const buf = paint(container, 10, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(4, 0).style.bg).toBe('red');
    expect(buf.get(5, 0).style.bg).toBeUndefined(); // capped at 50% = 5 cells
  });
});
```

- [ ] **Step 4: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 4 new).
  - `npx vitest run` — full suite green (248 + 4 = 252).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **TypeScript error on `setMinWidth(props.minWidth)`**: Yoga's signature is `number | '${number}%' | undefined`. The prop type matches exactly. If TypeScript complains, double-check that the prop type uses backticks (`` `${number}%` ``), not a plain string.
- **"minHeight + maxHeight" test fails because red fills 3 cells**: maxHeight cap not applied — verify `n.setMaxHeight` is called.
- **"percent" test fails because cap is at 10 cells (full width)**: `'50%'` not being recognized as a percent — verify the prop value is being passed through unchanged (don't `parseFloat` it manually; Yoga handles the string).
- **Pre-existing tests fail**: all four setters with `undefined` should be no-ops (Yoga resets to unset). If pre-existing layout tests change, something else is off — re-read the diff.

- [ ] **Step 5: Commit**
```bash
git add src/host.ts src/paint.test.ts
git commit -m "feat: Box minWidth/maxWidth/minHeight/maxHeight — size constraints via Yoga"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Overflow subsection).

- [ ] **Step 2: Add a `### Size constraints` subsection** under `## Status`, after `### Overflow`:

```md
### Size constraints

`<Box>` accepts four optional min/max size props that clamp Yoga's computed size:

- `minWidth={n | '50%'}` — prevents flexShrink (and content) from shrinking below this
- `maxWidth={n | '50%'}` — caps flexGrow (and explicit width) at this
- `minHeight={n | '50%'}` — column-flex analog of `minWidth`
- `maxHeight={n | '50%'}` — column-flex analog of `maxWidth`

Each accepts a cell count or a percent string. Undefined = no constraint. Useful for responsive layouts (e.g. `maxWidth: '80%'` on a content panel) and for keeping flex-grow children from claiming all available space.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (252)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box min/max size constraints"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- `minWidth` (numeric) — Task 1 (shrink-block test).
- `maxWidth` (numeric) — Task 1 (grow-cap test).
- `minHeight` + `maxHeight` — Task 1 (column flex symmetry test).
- Percent variant — Task 1 (`maxWidth: '50%'` test).
- README → Task 2.

**2. Placeholder scan:** none.

**3. Type consistency:**
- All 4 props typed `number | '${number}%' | undefined` — exact match to Yoga's setter signatures.
- Pass-through wiring (no helper, no branching).

**Risks worth flagging for the implementer:**

1. **Yoga rounding under multiple constraints**: when `flexShrink` + `minWidth` + sibling sizing all interact, Yoga may distribute remaining/deficit space in non-obvious ways. The "minWidth blocks shrink" test uses clean integers (4 → 3+1 totaling parent's 4) to avoid this. If a test fails with off-by-one cell positions, that's likely Yoga's distribution math producing fractional pixels — adjust expectations to match Yoga's actual behavior, but document.

2. **`{}.toString()` quirks with `${number}%` template type**: TypeScript's template literal types are a compile-time concept. At runtime, `'50%'` is just a string. No conversion needed. Don't manually `parseFloat` and call `setMinWidthPercent` — pass the raw string to `setMinWidth`.

3. **No paint changes**: same as every other layout prop. Yoga handles the clamp; paint just reads `box.width`/`box.height`. If you touch paint.ts, you're going wrong.

4. **Pre-existing tests**: passing `undefined` to all 4 setters should be a Yoga no-op (resets to unset state, same as default). Should not affect any existing test.

5. **"Percent of what?"**: percentages are relative to the PARENT's main-axis size for width-family props and cross-axis for height-family props (CSS standard). Yoga implements this; flowtty just passes the string through.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/min-max-sizing.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `min-max-sizing`, dispatch Task 1 (Sonnet — pattern is essentially identical to flex-sizing), then Task 2 (Haiku — README + build).
