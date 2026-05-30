# flowtty aspectRatio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add `aspectRatio?: number` to `<Box>`. Ratio is `width / height` (CSS convention): `aspectRatio: 2` = twice as wide as tall; `aspectRatio: 0.5` = twice as tall as wide; `aspectRatio: 1` = square. Yoga derives the missing dimension from the constrained one (or from flex sizing). Wired via Yoga's `setAspectRatio(number | undefined)`.

**Architecture:** `BoxProps` gets one new optional field. `applyProps` calls `n.setAspectRatio(props.aspectRatio)` unconditionally — pure pass-through (Yoga's signature accepts `number | undefined`). **No paint changes.**

**Tech Stack:** Same as Min/Max Sizing.

**Out of scope:**
- CSS-style `aspectRatio: 'auto'` or `aspectRatio: '16/9'` string syntax — flowtty accepts plain numbers (user does the division if needed).

---

## Scope check

One prop, one setter, three tests. Smallest plan in the series. **2 tasks** (kept separate from README for commit-history consistency).

---

## File Structure

```
src/
  host.ts             # MODIFY — add aspectRatio to BoxProps; setAspectRatio in applyProps
  paint.test.ts       # MODIFY — tests for width-derived height, height-derived width, square (ratio=1)
README.md             # MODIFY — document aspectRatio
```

---

### Task 1: BoxProps + setAspectRatio + tests

**Files:**
- Modify: `src/host.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/host.ts` (the just-merged min/max block is the neighbor; aspectRatio sits beside it). `src/paint.test.ts` (helper pattern).

- [ ] **Step 2: Modify `src/host.ts`** — add the prop + setter call.

Add to `BoxProps` interface, after the existing `maxHeight` field:

```ts
  /** Width / height ratio. Yoga derives the missing dimension from the constrained one.
   *  CSS convention: `aspectRatio: 2` = twice as wide as tall; `0.5` = twice as tall as wide; `1` = square. */
  aspectRatio?: number;
```

In `applyProps`, after the existing min/max block, add:
```ts
  n.setAspectRatio(props.aspectRatio);
```

- [ ] **Step 3: Append failing tests to `src/paint.test.ts`** — match the existing helper pattern:

```ts
describe('Box aspectRatio', () => {
  test('width given + aspectRatio derives height (ratio 2 → height = width/2)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Child width:4 aspectRatio:2 → Yoga derives height 2. Red fills 4×2 at top-left of 4×4 canvas.
    root.render(
      createElement('flowtty-box', { width: 4, height: 4 },
        createElement('flowtty-box', { width: 4, aspectRatio: 2, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    // Red at y=0..1 (height 2), full width 0..3
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(3, 0).style.bg).toBe('red');
    expect(buf.get(0, 1).style.bg).toBe('red');
    expect(buf.get(3, 1).style.bg).toBe('red');
    // Below derived height — no bg
    expect(buf.get(0, 2).style.bg).toBeUndefined();
    expect(buf.get(0, 3).style.bg).toBeUndefined();
  });

  test('height given + aspectRatio derives width (ratio 0.5 → width = height*0.5)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Child height:4 aspectRatio:0.5 → Yoga derives width 2. Red fills 2×4 at top-left.
    root.render(
      createElement('flowtty-box', { width: 4, height: 4 },
        createElement('flowtty-box', { height: 4, aspectRatio: 0.5, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 4, 4);
    const buf = paint(container, 4, 4);
    // Red at x=0..1 (width 2), full height 0..3
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(0, 3).style.bg).toBe('red');
    expect(buf.get(1, 3).style.bg).toBe('red');
    // Beyond derived width — no bg
    expect(buf.get(2, 0).style.bg).toBeUndefined();
    expect(buf.get(3, 0).style.bg).toBeUndefined();
  });

  test('aspectRatio: 1 makes a square (height = width)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Child width:3 aspectRatio:1 → height 3. Red fills 3×3.
    root.render(
      createElement('flowtty-box', { width: 5, height: 5 },
        createElement('flowtty-box', { width: 3, aspectRatio: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 5, 5);
    const buf = paint(container, 5, 5);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(2, 2).style.bg).toBe('red'); // bottom-right of the 3×3 square
    expect(buf.get(3, 0).style.bg).toBeUndefined(); // outside square
    expect(buf.get(0, 3).style.bg).toBeUndefined();
  });
});
```

- [ ] **Step 4: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 3 new).
  - `npx vitest run` — full suite green (252 + 3 = 255).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **TypeScript error on `setAspectRatio(props.aspectRatio)`**: signature is `number | undefined`. Prop type is `number | undefined`. Exact match.
- **"height = width/2" test fails because height = width*2**: the ratio is INVERTED. CSS convention is `width / height`. `aspectRatio: 2` → `width = 2 * height` → `height = width / 2`. Yoga uses the CSS convention. If the test shows red filling 4 cells tall (height = 8?), the ratio direction is wrong — but Yoga's docs say width/height, so this shouldn't happen.
- **Pre-existing tests fail**: passing `undefined` to setAspectRatio should be a no-op. Should not affect any existing test.

- [ ] **Step 5: Commit**
```bash
git add src/host.ts src/paint.test.ts
git commit -m "feat: Box aspectRatio — Yoga-derived dimension via width/height ratio"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Size constraints subsection).

- [ ] **Step 2: Add a `### Aspect ratio` subsection** under `## Status`, after `### Size constraints`:

```md
### Aspect ratio

`<Box aspectRatio>` is a number representing `width / height` (CSS convention). When one dimension is constrained (via `width`, `height`, or flex sizing), Yoga derives the other from the ratio.

- `aspectRatio={2}` — twice as wide as tall (e.g., `width=10` → `height=5`)
- `aspectRatio={0.5}` — twice as tall as wide (e.g., `height=4` → `width=2`)
- `aspectRatio={1}` — square

Useful for media-style panels where you want a fixed shape regardless of container size — e.g., a flex child with `flexGrow={1} aspectRatio={3}` claims leftover horizontal space and adjusts its height to maintain a 3:1 ratio.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (255)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box aspectRatio"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- Width-derived height → Task 1 (ratio 2 test).
- Height-derived width → Task 1 (ratio 0.5 test).
- Square (ratio 1) → Task 1.
- README → Task 2.

**2. Placeholder scan:** none.

**3. Type consistency:** `aspectRatio?: number` matches Yoga's `setAspectRatio(number | undefined)` exactly.

**Risks worth flagging for the implementer:**

1. **Ratio direction (width/height, not height/width)**: easy to get backwards. The three tests pin all three directions (>1, <1, =1) so a swap would fail at least two tests.

2. **Fractional dimensions**: `aspectRatio: 2.5` with `width: 5` gives `height: 2`. Yoga rounds to integer cells. The plan's tests use clean integer divisions (4/2=2, 4×0.5=2, 3/1=3) — no rounding ambiguity.

3. **No paint changes**: same as every other layout prop. aspectRatio affects `box.width`/`box.height` via Yoga; paint reads computed layout.

4. **Pre-existing tests**: `setAspectRatio(undefined)` is a Yoga no-op (resets to unset). Should not affect any existing test.

5. **Conflict with explicit both-dimensions**: if BOTH `width` and `height` are set, aspectRatio is ignored (no constrained dimension to derive from). Not tested explicitly because behavior depends on Yoga's resolution order — out of scope for tests.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/aspect-ratio.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `aspect-ratio`, dispatch Task 1 (Sonnet — same mechanical pattern as min/max), then Task 2 (Haiku — README + build).
