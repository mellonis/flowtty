# flowtty zIndex + Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add two visual-ordering features to `<Box>`:

- **`zIndex?: number`** — explicit cross-sibling stacking order within the existing two-pass paint. Higher zIndex paints on top of lower; default 0; tree order is the tiebreaker. **Does NOT cross pass boundaries** — absolutes always paint on top of stack-flow regardless of zIndex.
- **`overflow?: 'visible' | 'hidden'`** — clip descendants to the parent's content rect. Default `'visible'` (current behavior). Clips ALL descendant writes: backgrounds, borders, own-text, and recursively nested children. Parent's own background/border are NOT clipped by the parent's own overflow (they're the parent's own area).

**Architecture:**
- *zIndex*: within each pass (stack-flow / absolutes), sort children by `(child.props.zIndex ?? 0)` before painting. JS `Array.prototype.sort` is stable per ES2019, so tree order is preserved as the natural tiebreaker.
- *overflow*: introduce a `clip: Rect | null` parameter on `paintInstance` (default `null` = no clip). All cell writes (bg fill, `paintBorder`, own-text loop) go through a `setClipped(buffer, x, y, char, style, clip)` helper that gates `buffer.set` on the clip. When descending into children, if the current box has `overflow: 'hidden'`, the descendant clip becomes `intersectRects(inheritedClip, contentRectOf(box))`; otherwise the inherited clip passes through unchanged. `paintBorder` signature gains a `clip` parameter.

**Tech Stack:** Same as alignContent — TypeScript ESM, Vitest 4.

**Out of scope:**
- zIndex crossing pass boundaries (absolute with negative zIndex going UNDER stack-flow). Mixing flexbox order with z-index is a CSS sharp-edge; flowtty avoids it.
- `overflow: 'scroll'` / `'auto'` — no scrolling subsystem.
- Per-axis overflow (`overflowX` / `overflowY`) — single prop.

---

## Scope check

Two independent features, both touch paint.ts. Sequential 3-task plan: zIndex first (smaller, isolated), overflow second (heavier refactor), README+build third.

---

## File Structure

```
src/
  host.ts             # MODIFY — add zIndex + overflow to BoxProps
  paint.ts            # MODIFY — sort children by zIndex; setClipped helper; clip propagation through paintInstance + paintBorder
  paint.test.ts       # MODIFY — tests for zIndex (same-pass reordering; pass-boundary non-crossing); overflow (clip own children; clip nested; visible default unchanged)
README.md             # MODIFY — document both
```

---

### Task 1: zIndex — sort children within each paint pass

**Files:**
- Modify: `src/host.ts`
- Modify: `src/paint.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Read first** — `src/paint.ts` (lines 129-139 are the two-pass section to modify) and `src/paint.test.ts` (helper pattern).

- [ ] **Step 2: Modify `src/host.ts`** — add to `BoxProps`, after the existing `alignContent` field:

```ts
  /** Stacking order within the same paint pass. Higher values paint on top.
   *  Default 0. Tree order is the tiebreaker. Does NOT cross pass boundaries:
   *  absolutes always overlay stack-flow regardless of zIndex. */
  zIndex?: number;
```

(No applyProps change needed — zIndex is paint-only, doesn't affect Yoga layout.)

- [ ] **Step 3: Modify `src/paint.ts`** — replace the two-pass section (lines 129-139). Add an inline sort by `zIndex ?? 0` after partitioning:

Find the existing block:
```ts
  // 3. Two-pass: stack-flow children first, then absolute children on top.
  // (Multiple absolutes at the same depth paint in tree order — later siblings
  // overlay earlier, giving implicit z-ordering without an explicit zIndex prop.)
  const stackFlow: Instance[] = [];
  const absolutes: Instance[] = [];
  for (const child of inst.children) {
    if (child.type !== 'box') continue;
    (child.props.position === 'absolute' ? absolutes : stackFlow).push(child);
  }
  for (const child of stackFlow) paintInstance(child, buffer, box.left, box.top, effectiveBg);
  for (const child of absolutes) paintInstance(child, buffer, box.left, box.top, effectiveBg);
```

Replace with:
```ts
  // 3. Two-pass: stack-flow children first, then absolute children on top.
  // Within each pass, sort by zIndex (default 0). JS sort is stable per ES2019,
  // so tree order is preserved as the natural tiebreaker. zIndex does NOT cross
  // pass boundaries — absolutes always paint on top of stack-flow.
  const stackFlow: Instance[] = [];
  const absolutes: Instance[] = [];
  for (const child of inst.children) {
    if (child.type !== 'box') continue;
    (child.props.position === 'absolute' ? absolutes : stackFlow).push(child);
  }
  const byZ = (a: Instance, b: Instance) => (a.props.zIndex ?? 0) - (b.props.zIndex ?? 0);
  stackFlow.sort(byZ);
  absolutes.sort(byZ);
  for (const child of stackFlow) paintInstance(child, buffer, box.left, box.top, effectiveBg);
  for (const child of absolutes) paintInstance(child, buffer, box.left, box.top, effectiveBg);
```

- [ ] **Step 4: Append failing tests to `src/paint.test.ts`:**

```ts
describe('Box zIndex', () => {
  test('higher zIndex paints on top within the absolute pass (overrides tree order)', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Two absolutes at same (0,0). Without zIndex, tree order wins → blue (second) on top.
    // With zIndex 5 on red (first) and default 0 on blue, red wins.
    root.render(
      createElement('flowtty-box', { width: 1, height: 1 },
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'red', zIndex: 5 }),
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 1, 1);
    const buf = paint(container, 1, 1);
    expect(buf.get(0, 0).style.bg).toBe('red'); // higher zIndex wins
  });

  test('tree order is the tiebreaker when zIndex is equal', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Both zIndex 5 → second sibling wins (tree order tiebreaker).
    root.render(
      createElement('flowtty-box', { width: 1, height: 1 },
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'red',  zIndex: 5 }),
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'blue', zIndex: 5 }),
      ),
    );
    computeLayout(container, 1, 1);
    const buf = paint(container, 1, 1);
    expect(buf.get(0, 0).style.bg).toBe('blue');
  });

  test('zIndex does NOT cross pass boundaries — absolute with zIndex 0 still paints on top of stack-flow with zIndex 999', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Stack-flow child fills the parent with red and has a huge zIndex.
    // Absolute child overlays a single blue cell with default zIndex.
    // Pass-boundary rule wins: absolute on top.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 1, height: 1 },
        createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red', zIndex: 999 }),
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 1, height: 1, backgroundColor: 'blue' }),
      ),
    );
    computeLayout(container, 1, 1);
    const buf = paint(container, 1, 1);
    expect(buf.get(0, 0).style.bg).toBe('blue'); // absolute pass wins regardless of zIndex
  });

  test('negative zIndex pushes a sibling below others in the same pass', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Stack-flow siblings overlapping via negative margin (M1 margin feature).
    // First child red zIndex:-1, second child blue zIndex:0 — blue on top (default order),
    // negative zIndex makes red go under EVEN IF it appeared later in tree.
    root.render(
      createElement('flowtty-box', { flexDirection: 'row', width: 2, height: 1 },
        createElement('flowtty-box', { width: 2, height: 1, backgroundColor: 'blue' }),
        createElement('flowtty-box', { width: 2, height: 1, marginLeft: -2, backgroundColor: 'red', zIndex: -1 }),
      ),
    );
    computeLayout(container, 2, 1);
    const buf = paint(container, 2, 1);
    // Without zIndex, red (later) would overwrite blue. With zIndex:-1 on red, blue wins.
    expect(buf.get(0, 0).style.bg).toBe('blue');
    expect(buf.get(1, 0).style.bg).toBe('blue');
  });
});
```

- [ ] **Step 5: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 4 new).
  - `npx vitest run` — full suite green (239 + 4 = 243).
  - `npm run typecheck` — clean.

- [ ] **Step 6: Commit**
```bash
git add src/host.ts src/paint.ts src/paint.test.ts
git commit -m "feat: Box zIndex — explicit stacking order within paint passes"
```

---

### Task 2: overflow — clip propagation through paintInstance + paintBorder

**Files:**
- Modify: `src/host.ts`
- Modify: `src/paint.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Modify `src/host.ts`** — add to `BoxProps`, after the new `zIndex` field:

```ts
  /** Clip descendants to this box's content rect. Default 'visible' (no clipping).
   *  'hidden' clips ALL descendant writes including their backgrounds and borders.
   *  Does NOT clip this box's own background or border (those are this box's own area). */
  overflow?: 'visible' | 'hidden';
```

(No applyProps change — overflow is paint-only.)

- [ ] **Step 2: Modify `src/paint.ts`** — introduce `setClipped` + `intersectRects` helpers; add `clip: Rect | null` parameter to `paintInstance` and `paintBorder`; route all `buffer.set` calls through `setClipped`; compute the descendant clip and pass it down.

Add helpers near the top (above `paintInstance`):

```ts
// Gate a buffer write on a clip rect. If clip is null, write unconditionally.
function setClipped(buffer: Buffer, x: number, y: number, char: string, style: Style, clip: Rect | null): void {
  if (clip !== null) {
    if (x < clip.left || y < clip.top || x >= clip.left + clip.width || y >= clip.top + clip.height) return;
  }
  buffer.set(x, y, char, style);
}

// Intersection of two rects. Null treated as "no clip" (returns the other rect).
// Returns an empty (width:0 / height:0) rect when there's no overlap — setClipped
// will skip all writes against it.
function intersectRects(a: Rect | null, b: Rect): Rect {
  if (a === null) return b;
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return { left, top, width: 0, height: 0 };
  return { left, top, width: right - left, height: bottom - top };
}
```

Update `paintBorder` signature + all internal writes:
```ts
function paintBorder(inst: Instance, buffer: Buffer, box: Rect, clip: Rect | null): void {
  const style = inst.props.border;
  if (!style) return;
  if (box.width < 2 || box.height < 2) return;

  const chars = BORDER_CHARS[style];
  const cellStyle: Style = {};
  if (inst.props.borderColor !== undefined) cellStyle.fg = inst.props.borderColor;

  const x0 = box.left;
  const y0 = box.top;
  const x1 = box.left + box.width - 1;
  const y1 = box.top + box.height - 1;

  setClipped(buffer, x0, y0, chars.tl, cellStyle, clip);
  setClipped(buffer, x1, y0, chars.tr, cellStyle, clip);
  setClipped(buffer, x0, y1, chars.bl, cellStyle, clip);
  setClipped(buffer, x1, y1, chars.br, cellStyle, clip);

  for (let x = x0 + 1; x < x1; x++) {
    setClipped(buffer, x, y0, chars.t, cellStyle, clip);
    setClipped(buffer, x, y1, chars.b, cellStyle, clip);
  }
  for (let y = y0 + 1; y < y1; y++) {
    setClipped(buffer, x0, y, chars.l, cellStyle, clip);
    setClipped(buffer, x1, y, chars.r, cellStyle, clip);
  }
}
```

Update `paintInstance` signature + body. Replace the existing function:

```ts
function paintInstance(
  inst: Instance,
  buffer: Buffer,
  offsetX: number,
  offsetY: number,
  inheritedBg: string | undefined = undefined,
  clip: Rect | null = null,
): void {
  const box: Rect = layoutOf(inst, offsetX, offsetY);
  const ownBg = inst.props.backgroundColor;
  const effectiveBg = ownBg ?? inheritedBg;

  // 1. Fill the box rect with own backgroundColor (if set). Clipped by inherited clip.
  if (ownBg !== undefined) {
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        setClipped(buffer, x, y, ' ', { bg: ownBg }, clip);
      }
    }
  }

  // 1b. Border (if set), clipped by inherited clip.
  paintBorder(inst, buffer, box, clip);

  // 2. Own text — clipped by content rect (existing behavior) AND inherited clip.
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
      if (row >= content.height) break;
      const chars = [...(lines[row] ?? '')];
      for (let col = 0; col < chars.length; col++) {
        if (col >= content.width) break;
        setClipped(buffer, content.left + col, content.top + row, chars[col]!, textStyle, clip);
      }
    }
  }

  // Compute descendant clip: if this box has overflow:hidden, intersect inherited
  // clip with this box's content rect; otherwise pass inherited through.
  const childClip = inst.props.overflow === 'hidden'
    ? intersectRects(clip, contentRectOf(inst, box))
    : clip;

  // 3. Two-pass with zIndex sort (from Task 1).
  const stackFlow: Instance[] = [];
  const absolutes: Instance[] = [];
  for (const child of inst.children) {
    if (child.type !== 'box') continue;
    (child.props.position === 'absolute' ? absolutes : stackFlow).push(child);
  }
  const byZ = (a: Instance, b: Instance) => (a.props.zIndex ?? 0) - (b.props.zIndex ?? 0);
  stackFlow.sort(byZ);
  absolutes.sort(byZ);
  for (const child of stackFlow) paintInstance(child, buffer, box.left, box.top, effectiveBg, childClip);
  for (const child of absolutes) paintInstance(child, buffer, box.left, box.top, effectiveBg, childClip);
}
```

- [ ] **Step 3: Append failing tests to `src/paint.test.ts`:**

```ts
describe('Box overflow', () => {
  test('overflow="visible" (default): child extends past parent — written outside parent rect', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Parent 2×1 with an absolute child width=4 — without clipping, child writes to x=0..3.
    root.render(
      createElement('flowtty-box', { width: 2, height: 1 },
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 4, height: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 4, 1);
    const buf = paint(container, 4, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBe('red'); // outside parent — still painted
    expect(buf.get(3, 0).style.bg).toBe('red');
  });

  test('overflow="hidden": child clipped to parent content rect — cells outside have no bg', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Same scenario with overflow:hidden — child writes only to x=0..1.
    root.render(
      createElement('flowtty-box', { overflow: 'hidden', width: 2, height: 1 },
        createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 4, height: 1, backgroundColor: 'red' }),
      ),
    );
    computeLayout(container, 4, 1);
    const buf = paint(container, 4, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBeUndefined(); // clipped
    expect(buf.get(3, 0).style.bg).toBeUndefined(); // clipped
  });

  test('overflow="hidden" clips own text past content rect even with padding', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // 3×1 box with padding:1 → content area is 1×0 (no vertical room). text shouldn't render
    // (covered by existing contentRect clip), and overflow:hidden adds nothing here.
    // Wider test: 3×1 with NO padding — content rect is 3×1, "abcde" wraps off the right.
    // Without overflow, text overflows visually past x=2; with overflow:hidden, x=3..4 stay blank.
    // (Note: the existing content-rect clip already cuts at content.width, so this test
    //  primarily verifies that adding overflow:hidden doesn't BREAK the existing behavior.)
    root.render(
      createElement('flowtty-box', { overflow: 'hidden', width: 3, height: 1 }, 'abcde'),
    );
    computeLayout(container, 5, 1);
    const buf = paint(container, 5, 1);
    expect(buf.get(0, 0).char).toBe('a');
    expect(buf.get(2, 0).char).toBe('c');
    expect(buf.get(3, 0).char).toBe(' '); // outside the box — never written
    expect(buf.get(4, 0).char).toBe(' ');
  });

  test('overflow="hidden" nested: inner clip intersects with outer clip', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // Outer 3×1 overflow:hidden contains a stack-flow child 2×1 overflow:hidden, which
    // contains an absolute child width=10. Effective clip for the grandchild is the
    // intersection of outer (0..2) and middle (0..1) → (0..1).
    root.render(
      createElement('flowtty-box', { overflow: 'hidden', width: 3, height: 1 },
        createElement('flowtty-box', { overflow: 'hidden', width: 2, height: 1 },
          createElement('flowtty-box', { position: 'absolute', top: 0, left: 0, width: 10, height: 1, backgroundColor: 'red' }),
        ),
      ),
    );
    computeLayout(container, 5, 1);
    const buf = paint(container, 5, 1);
    expect(buf.get(0, 0).style.bg).toBe('red');
    expect(buf.get(1, 0).style.bg).toBe('red');
    expect(buf.get(2, 0).style.bg).toBeUndefined(); // beyond inner overflow:hidden
    expect(buf.get(3, 0).style.bg).toBeUndefined();
    expect(buf.get(4, 0).style.bg).toBeUndefined();
  });

  test('overflow="hidden" does NOT clip the parents own background or border', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    // The parent ITSELF has overflow:hidden but renders into its own rect — bg and border fill its full 3×3 rect.
    // (Demonstrates: overflow on a box affects DESCENDANTS, not the box's own self-drawing.)
    root.render(
      createElement('flowtty-box', { overflow: 'hidden', border: 'single', backgroundColor: 'blue', width: 3, height: 3 }),
    );
    computeLayout(container, 3, 3);
    const buf = paint(container, 3, 3);
    // Border corners + bg in interior all rendered normally
    expect(buf.get(0, 0).char).toBe('┌');
    expect(buf.get(2, 0).char).toBe('┐');
    expect(buf.get(1, 1).style.bg).toBe('blue');
    expect(buf.get(0, 2).char).toBe('└');
    expect(buf.get(2, 2).char).toBe('┘');
  });
});
```

- [ ] **Step 4: Verify**
  - `npx vitest run src/paint.test.ts` — passes (existing + 5 new).
  - `npx vitest run` — full suite green (243 + 5 = 248).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation:
- **All pre-existing tests must still pass**: the change is additive (adds a `clip` parameter with default `null`, default behavior = no clip). If anything breaks, it's a mistake in the helper-routing (e.g. a `buffer.set` call still in the body that wasn't replaced with `setClipped`).
- **"nested overflow" test fails**: the intersect math is off OR the recursion isn't propagating childClip. Print `childClip` for each level to debug.
- **"parent's own bg not clipped" test fails because (0,0) corner is undefined**: this means the parent's own bg fill is being clipped by its own overflow. The plan-correct behavior is the parent's own bg fills its own rect (since the inherited clip from the test setup is `null`, the bg fill writes everywhere within the rect). Verify `clip` is `null` (passed by `paint()`) for the top-level paintInstance call, NOT `contentRectOf(this)`.
- **"absolute child clipped by overflow:hidden parent" test fails**: child is being painted from the parent's coords (`paintInstance(child, buffer, box.left, box.top, ..., childClip)`), so the absolute's own absolute positioning will land inside the parent's rect — the clip rect (`childClip`) only clips the WRITES, not the positioning. With a `width: 4` absolute at `left: 0` in a `width: 2` parent, child positions itself at x=0..3 but only x=0..1 are written.

- [ ] **Step 5: Commit**
```bash
git add src/host.ts src/paint.ts src/paint.test.ts
git commit -m "feat: Box overflow — 'hidden' clips descendant writes via paint-time clip propagation"
```

---

### Task 3: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section (after Align content subsection).

- [ ] **Step 2: Add TWO subsections** under `## Status`, after `### Align content`:

```md
### zIndex

`<Box zIndex>` is an integer; higher values paint on top of lower within the same paint pass. Default `0`. Tree order is the natural tiebreaker (later sibling wins).

**Does NOT cross pass boundaries.** Stack-flow children paint first, then absolutes — an absolute with `zIndex={0}` still overlays a stack-flow with `zIndex={999}`. zIndex only reorders siblings within the same pass.

### Overflow

`<Box overflow>` controls whether descendants are clipped to this box's content rect. Default `'visible'`.

- `'visible'` (default) — descendants may extend past this box (current behavior)
- `'hidden'` — descendants clipped to content rect; ALL descendant writes (backgrounds, borders, own-text, nested children) are gated

`'hidden'` does NOT clip the box's own background or border — those are this box's own area, not its descendants' writes. Clips are intersected across nested `overflow: 'hidden'` ancestors.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (248)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box zIndex + overflow"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- *zIndex*: same-pass reorder, tiebreaker, no pass crossing, negative zIndex → Task 1 (4 tests).
- *overflow*: visible default, hidden basic clip, text clip preserved, nested intersection, own bg/border not clipped → Task 2 (5 tests).
- README → Task 3.

**2. Placeholder scan:** none.

**3. Type consistency:**
- `zIndex?: number` — number, default 0 via `?? 0`.
- `overflow?: 'visible' | 'hidden'` — string union, default `'visible'` (i.e. no clip set).
- `clip: Rect | null` parameter on `paintInstance` and `paintBorder` — `null` means no clipping.
- `setClipped(buffer, x, y, char, style, clip)` — 6 args, matches `buffer.set` + clip.
- `intersectRects(a: Rect | null, b: Rect): Rect` — always returns a Rect (empty rect if no overlap).

**Risks worth flagging for the implementer:**

1. **Sort stability**: `Array.prototype.sort` is stable per ES2019. Vitest runs on Node (V8) which has stable sort. No issue. If you're paranoid, use a `(zIndex, treeIndex)` compound key — but unnecessary.

2. **All `buffer.set` calls must be routed through `setClipped`**: grep `paint.ts` after the change — there should be ZERO `buffer.set(` calls left (all become `setClipped(buffer, ...)`). If even one is missed, that path bypasses the clip and an existing test might still pass but the overflow tests fail in subtle ways.

3. **`paintBorder` signature change**: the call site in `paintInstance` MUST pass `clip` as the new 4th arg. TypeScript will catch a missing arg.

4. **Empty-rect clip**: when ancestor clips don't overlap, `intersectRects` returns a `width:0 height:0` rect. `setClipped`'s check `x >= clip.left + clip.width` becomes `x >= clip.left + 0` i.e. `x >= clip.left` — combined with `x < clip.left` from the other side, it's impossible to satisfy, so all writes skip. Correct.

5. **Pre-existing test interactions**: 4 borders tests + 8 padding tests + others test specific cell values without overflow. They use `paint()` which passes `clip = null` → all writes go through. Should be unaffected. If any break, it's a routing miss.

6. **Performance**: every cell write now has a clip check. Negligible cost (a few comparisons). Not a concern.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/zindex-overflow.md`. Subagent-driven execution per your request — once confirmed, I'll commit the plan on master, branch `zindex-overflow`, dispatch Task 1 (Sonnet — small zIndex sort), Task 2 (Sonnet — overflow refactor is the meat), then Task 3 (Haiku — README + build).
