# flowtty Flex Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add `flexGrow`, `flexShrink`, and `flexBasis` to `<Box>`. `flexGrow` distributes leftover space among siblings; `flexShrink` distributes deficit when content overflows; `flexBasis` is the initial size before grow/shrink (number, `'auto'`, or `'50%'`). Wired via Yoga's `setFlexGrow`/`setFlexShrink`/`setFlexBasis`. **Defaults match Yoga, not CSS:** grow=0, shrink=0, basis=auto. The CSS default `flexShrink: 1` is *not* applied — documented as an intentional pass-through.

**Architecture:** `BoxProps` gets 3 new optional fields. `applyProps` calls `setFlexGrow(props.flexGrow ?? 0)` + `setFlexShrink(props.flexShrink ?? 0)` unconditionally. `flexBasis` follows the existing `width`/`height` pattern (number → `setFlexBasis(n)`; percent string → `setFlexBasisPercent`; anything else / undefined → `setFlexBasisAuto()`). **No paint changes** — Yoga's computed `box.width`/`box.height` already reflects grow/shrink/basis.

**Tech Stack:** Same as Gap — TypeScript ESM, Vitest 4, yoga-layout 3.2.1.

**Out of scope** (later / non-goals):
- `flex` shorthand (CSS `flex: 1 1 auto`). Three props are explicit; can add a parser later if needed.
- `flexWrap` — separate concept (multi-line flex). Without it, shrink may produce overflow even when shrink is set.
- Negative `flexGrow`/`flexShrink` — Yoga clamps; we pass through.

---

## Scope check

Three per-node props (no per-edge). Pattern essentially mirrors gap. One plan, **2 tasks**.

---

## File Structure

```
src/
  host.ts             # MODIFY — add flexGrow/flexShrink/flexBasis to BoxProps; call setFlexGrow/Shrink/Basis in applyProps
  paint.test.ts       # MODIFY — tests for grow equal/asymmetric, shrink equal, basis explicit/percent, Yoga default-shrink=0
README.md             # MODIFY — document the three props + flag the shrink-default deviation from CSS
```

Responsibilities:
- **`host.ts`** owns prop type + Yoga calls.
- **`paint.test.ts`** asserts post-layout sizes via bg-color-filled children.

---

### Task 1: BoxProps + flex setters + tests

**Files:**
- Modify: `src/host.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/host.ts` to see the just-merged gap block (yours sits beside it) and the existing `width`/`height` pattern at lines 64-73 (the basis branching mirrors it), and `src/paint.test.ts` to match the test helper pattern.

- [ ] **Step 2: Modify `src/host.ts`** — add the 3 props + applyProps calls.

Add to `BoxProps` interface, after the existing gap fields:

```ts
  // Flex sizing. Defaults match Yoga (NOT CSS):
  //   flexGrow:   0  (no expansion into leftover space)
  //   flexShrink: 0  (no shrink under deficit — CSS default is 1)
  //   flexBasis:  'auto'  (use width/height as initial size)
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | 'auto' | `${number}%`;
```

In `applyProps`, after the existing gap block, add:

```ts
  // Flex sizing — always set (including defaults) so removing the prop re-renders correctly.
  n.setFlexGrow(props.flexGrow ?? 0);
  n.setFlexShrink(props.flexShrink ?? 0);

  // flexBasis follows the width/height pattern: number → exact, '%' → percent, else auto.
  if (typeof props.flexBasis === 'number') {
    n.setFlexBasis(props.flexBasis);
  } else if (typeof props.flexBasis === 'string' && props.flexBasis.endsWith('%')) {
    n.setFlexBasisPercent(parseFloat(props.flexBasis));
  } else {
    n.setFlexBasisAuto();
  }
```

- [ ] **Step 3: Append failing tests to `src/paint.test.ts`** — match the existing pattern:

```ts
describe('Box flex sizing', () => {
  test('flexGrow distributes leftover space equally between siblings', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 10×1 row flex; two children width:1 flexGrow:1 → each ends up 5 wide.
    // Free space = 10 - (1+1) = 8; distributed 8/2 = 4 → each child 1+4 = 5.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, flexGrow: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 1, height: 1, flexGrow: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 10, 1);
    const buf = paint(container, 10, 1);
    // Red at x=0..4
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(4, 0).style.bg).toBe('red');
    // Blue at x=5..9
    expect(buf.get(5, 0).style.bg).toBe('blue');
    expect(buf.get(9, 0).style.bg).toBe('blue');
  });

  test('flexGrow asymmetric: 1:2 ratio splits leftover space 1/3 : 2/3', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 9×1 row flex; both children basis 0 (width=0) so total free space = 9.
    // Distribute 9 × 1/3 = 3 and 9 × 2/3 = 6. Red x=0..2, blue x=3..8.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 9, height: 1 },
        createElement('flowtty-box', { width: 0, height: 1, flexGrow: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 0, height: 1, flexGrow: 2, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 9, 1);
    const buf = paint(container, 9, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('red');
    expect(buf.get(3, 0).style.bg).toBe('blue');
    expect(buf.get(8, 0).style.bg).toBe('blue');
  });

  test('flexShrink: equal-basis siblings shrink equally under deficit', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×1 row flex; two children width:4 flexShrink:1 → total basis 8, fit 4,
    // overflow 4, each shrinks 4 × (4×1)/(4×1 + 4×1) = 2 → final width 2 each.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 4, height: 1 },
        createElement('flowtty-box', { width: 4, height: 1, flexShrink: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 4, height: 1, flexShrink: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 4, 1);
    const buf = paint(container, 4, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('blue');
    expect(buf.get(3, 0).style.bg).toBe('blue');
  });

  test('flexBasis (number) overrides width as the initial size for grow/shrink calc', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 10×1 row flex. Two children width:2 flexBasis:4 — basis wins, so each
    // starts at 4. Total 8; free space 2. First child flexGrow:1 → 4+2 = 6.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
        createElement('flowtty-box', { width: 2, height: 1, flexBasis: 4, flexGrow: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 2, height: 1, flexBasis: 4, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 10, 1);
    const buf = paint(container, 10, 1);
    // Red at x=0..5 (basis 4 + grow 2)
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(5, 0).style.bg).toBe('red');
    // Blue at x=6..9 (basis 4, no grow)
    expect(buf.get(6, 0).style.bg).toBe('blue');
    expect(buf.get(9, 0).style.bg).toBe('blue');
  });

  test('flexBasis (percent string) sets the initial size as a fraction of parent', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 10×1 row flex. One child flexBasis:'50%' → child width 5.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
        createElement('flowtty-box', { height: 1, flexBasis: '50%', backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 10, 1);
    const buf = paint(container, 10, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(4, 0).style.bg).toBe('red');
    expect(buf.get(5, 0).style.bg).toBeUndefined(); // beyond the child
  });

  test('default flexShrink is 0 (Yoga convention, NOT CSS) — children overflow rather than shrink', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 4×1 row flex; two children width:4 with NO flexShrink set.
    // CSS default would shrink them; Yoga keeps both at 4 → second overflows past parent.
    // First child fills 0..3; second is positioned at x=4 (overflow, outside parent rect).
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 4, height: 1 },
        createElement('flowtty-box', { width: 4, height: 1, backgroundColor: 'red' }),
        createElement('flowtty-box', { width: 4, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 8, 1); // give the canvas room to render the overflow so we can read it
    const buf = paint(container, 8, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(3, 0).style.bg).toBe('red');
    expect(buf.get(4, 0).style.bg).toBe('blue');
    expect(buf.get(7, 0).style.bg).toBe('blue');
  });
});
```

- [ ] **Step 4: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 6 new).
  - `npx vitest run` — full suite green (225 + 6 = 231).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **`??` vs `||`**: `flexGrow: 0` and `flexShrink: 0` must be passable explicitly. `??` only short-circuits on null/undefined. (If the implementer uses `||`, `0` would fall through to `0` anyway by coincidence — both work here — but stay consistent with the project pattern.)
- **`flexBasis: 0`**: must call `setFlexBasis(0)`, not `setFlexBasisAuto()`. The `typeof props.flexBasis === 'number'` check correctly captures 0.
- **"asymmetric grow" test rounding**: Yoga uses pixel-perfect rounding. For 9 wide with 1:2 ratio, the math gives exactly 3 and 6 (integers) — no rounding ambiguity. If the test fails, the calculation is wrong, not the rounding.
- **"flexShrink equal" test fails because both children stayed at 4**: setFlexShrink not being called or being called with 0. Verify `n.setFlexShrink(props.flexShrink ?? 0)` is there AND `flexShrink: 1` is being passed in the test.
- **"default shrink = 0 overflow" test fails because the second child shrinks**: means `flexShrink` default is being treated as 1 somehow. Verify the always-call `n.setFlexShrink(0)` is overriding any inherited state.

- [ ] **Step 5: Commit**
```bash
git add src/host.ts src/paint.test.ts
git commit -m "feat: Box flexGrow + flexShrink + flexBasis — flex sizing wired to Yoga"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Gap subsection).

- [ ] **Step 2: Add a `### Flex sizing` subsection** under `## Status`, after `### Gap`:

```md
### Flex sizing

`<Box>` accepts the three flex sizing props:

- `flexGrow={n}` — claim a share of leftover space (proportional weight; default `0`)
- `flexShrink={n}` — claim a share of deficit when siblings overflow (proportional weight; default `0`)
- `flexBasis={n | 'auto' | '50%'}` — initial size before grow/shrink applies (default `'auto'` — uses `width`/`height`)

**Defaults match Yoga, not CSS.** CSS sets `flex-shrink` to `1` by default — flowtty (via Yoga) leaves it at `0`, so children overflow rather than shrink unless `flexShrink={1}` is set explicitly. Useful when overflow is intentional; surprising if you're used to CSS.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (231)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box flexGrow + flexShrink + flexBasis"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- `flexGrow` distribution → Task 1 (equal + asymmetric tests).
- `flexShrink` deficit handling → Task 1 (equal-shrink test).
- `flexBasis` number → Task 1 (basis-overrides-width test).
- `flexBasis` percent string → Task 1 (50% test).
- Yoga's default-shrink=0 deviation pinned → Task 1 (overflow test).
- README → Task 2 (flagged the CSS deviation).

**2. Placeholder scan:** none. All test maths are exact integers (no rounding ambiguity).

**3. Type consistency:**
- `flexGrow` / `flexShrink`: `number | undefined`.
- `flexBasis`: `number | 'auto' | \`${number}%\` | undefined` — same template-literal type as Yoga's setter signature for clean autocomplete.

**Risks worth flagging for the implementer:**

1. **Rounding in fractional grow**: Yoga uses pixel-perfect rounding (banker's rounding or similar). The tests pick numbers that produce exact integers (10÷2=5, 9×1/3=3) to avoid this. If a future test wants `gap: 1` with 3 siblings in a 10-wide parent, the math becomes `(10-2)/3 = 2.67` and rounding behavior could differ across Yoga versions. The current tests avoid this.

2. **`flexBasis: 0` vs missing**: `setFlexBasis(0)` is meaningfully different from `setFlexBasisAuto()`. The first says "start at 0, use grow/shrink to size me." The second says "start at width/height (or content)." The `typeof === 'number'` check correctly differentiates `0` from `undefined`.

3. **`flexBasis: '0%'`**: the regex check `endsWith('%')` would catch this and call `setFlexBasisPercent(0)`. Equivalent to `setFlexBasis(0)` for layout purposes. Acceptable.

4. **No paint changes**: same as gap. Yoga's grow/shrink/basis affect `box.width`/`box.height`; paint reads those. If the implementer touches paint.ts, they're going wrong.

5. **CSS default-shrink deviation is intentional and tested**: if a future change "fixes" it by defaulting `flexShrink` to 1, the overflow test will fail and surface the regression. The README documents the deviation so users aren't surprised.

6. **`width: 0` children with backgroundColor**: paint fills bg over the COMPUTED rect (after Yoga runs), not the prop value. A `width: 0 flexGrow: 1` child gets a non-zero computed width and the bg fills correctly. Verified implicitly by the asymmetric-grow test.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/flex-sizing.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `flex-sizing`, and dispatch Task 1 (Sonnet — same mechanical pattern as gap), then Task 2 (Haiku — README + build).
