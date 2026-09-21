# flowtty Borders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add `border` + `borderColor` props to `<Box>` so a one-cell border can be drawn around the box, with five named styles (`single`, `double`, `round`, `bold`, `classic`), Yoga-reserved cells so border doesn't overlap content, and color via the same string format as `Style.fg` (named or truecolor). Acceptance: a `<Box border="single" width={5} height={3}>` renders as `┌───┐ / │   │ / └───┘`; content fits inside the 3×1 interior; `border="bold" borderColor="#ff0000"` emits truecolor SGR for the border cells.

**Architecture:** Borders are a Yoga `setBorder(edge, 1)` reservation (so layout subtracts a 1-cell ring from content space — same mechanism Yoga uses for CSS borders) + a paint step that writes the eight glyph slots (4 corners + 4 edges) into the buffer's outermost ring of the box rect. The five styles live in a single `BORDER_CHARS` table keyed by style name. `borderColor` flows into the cell `Style.fg`; if unset, border cells emit no fg (inherits terminal default). Boxes too small for a border (`width < 2` OR `height < 2`) silently skip rendering (the Yoga reservation still applies, but the glyphs would overlap).

**Tech Stack:** Same as Truecolor — TypeScript ESM, Vitest 4, yoga-layout 3.2.1.

**Out of scope** (future):
- Per-edge borders (`borderTop`/`borderRight`/…) — single all-four-edges prop only.
- Per-edge styles or colors (mixing styles per edge).
- Border with `bold`/`dim`/`underline`/`inverse` style — color only (the `bold` *style name* already gives weight via thicker glyphs).
- Custom border char tables (user-supplied 8-char string) — five named styles only.
- T-junction / cross glyphs for adjacent siblings — neighboring borders draw independently and overlap at corners.
- Padding-aware border (treating border + padding as separate layout slots) — Yoga's `setPadding` isn't wired today; can be added later.

---

## Scope check

Single independent feature: types + Yoga edge reservation + paint draw + tests. One plan, **2 tasks**.

---

## File Structure

```
src/
  borders.ts          # NEW — BorderStyle type + BORDER_CHARS table (8 chars per style)
  borders.test.ts     # NEW — BORDER_CHARS table sanity check
  host.ts             # MODIFY — add border?/borderColor? to BoxProps; setBorder(edge, 1) on all four edges when border is set
  paint.ts            # MODIFY — after content pass, draw the 8-slot border ring if border prop set and box ≥ 2×2
  paint.test.ts       # MODIFY (or ADD if not present) — render tests for each style, color, size guard, content fit
  index.ts            # MODIFY — re-export BorderStyle alongside BoxProps
README.md             # MODIFY — note borders + accepted styles
```

Responsibilities:
- **`borders.ts`** owns the glyph table. Pure data + type.
- **`host.ts`** owns Yoga interaction — `setBorder(edge, 1)` on Top/Right/Bottom/Left when `props.border` is truthy; clears (`setBorder(edge, 0)`) when prop drops away (re-render with new props).
- **`paint.ts`** owns drawing — reads `box: Rect`, looks up the glyph table, writes 4 corner cells + 4 edge runs into the buffer.
- **`paint.test.ts`**: assert specific characters land at specific (x, y) cells using `TestBackend.lastBuffer.get(x, y).char` (check the existing tests in the file for the standard pattern).

---

### Task 1: Implementation — types, Yoga reservation, paint draw, all tests

**Files:**
- Create: `src/borders.ts`
- Create: `src/borders.test.ts`
- Modify: `src/host.ts`
- Modify: `src/paint.ts`
- Modify: `src/paint.test.ts` (or create if it doesn't exist — check first)
- Modify: `src/index.ts`

- [ ] **Step 1: Read first** — `src/paint.test.ts` to see how existing paint tests are written (what helpers, what import style, how they reach into `TestBackend.lastBuffer`). Also `src/index.ts` to see the existing re-export shape.

- [ ] **Step 2: Create `src/borders.ts`:**

```ts
// Five named border styles. Each value is an 8-char string in the fixed order:
//   tl, t, tr, r, br, b, bl, l
// where t/r/b/l are the repeating edge glyphs (single char each) and tl/tr/br/bl
// are the four corners. Paint repeats the edge chars to fill the box width/height.
export type BorderStyle = 'single' | 'double' | 'round' | 'bold' | 'classic';

export interface BorderChars {
  tl: string; t: string; tr: string;
  r: string;
  br: string; b: string; bl: string;
  l: string;
}

export const BORDER_CHARS: Record<BorderStyle, BorderChars> = {
  single:  { tl: '┌', t: '─', tr: '┐', r: '│', br: '┘', b: '─', bl: '└', l: '│' },
  double:  { tl: '╔', t: '═', tr: '╗', r: '║', br: '╝', b: '═', bl: '╚', l: '║' },
  round:   { tl: '╭', t: '─', tr: '╮', r: '│', br: '╯', b: '─', bl: '╰', l: '│' },
  bold:    { tl: '┏', t: '━', tr: '┓', r: '┃', br: '┛', b: '━', bl: '┗', l: '┃' },
  classic: { tl: '+', t: '-', tr: '+', r: '|', br: '+', b: '-', bl: '+', l: '|' },
};
```

- [ ] **Step 3: Create `src/borders.test.ts`:**

```ts
import { describe, test, expect } from 'vitest';
import { BORDER_CHARS, type BorderStyle } from './borders.js';

describe('BORDER_CHARS', () => {
  const styles: BorderStyle[] = ['single', 'double', 'round', 'bold', 'classic'];

  test.each(styles)('%s style has all 8 single-char slots', (style) => {
    const c = BORDER_CHARS[style];
    for (const slot of ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'] as const) {
      const ch = c[slot];
      expect(typeof ch).toBe('string');
      // each glyph is a single visible char (display-width 1 — all box-drawing chars are width-1)
      expect([...ch].length).toBe(1);
    }
  });

  test('single style uses the canonical box-drawing glyphs', () => {
    expect(BORDER_CHARS.single.tl).toBe('┌');
    expect(BORDER_CHARS.single.tr).toBe('┐');
    expect(BORDER_CHARS.single.bl).toBe('└');
    expect(BORDER_CHARS.single.br).toBe('┘');
    expect(BORDER_CHARS.single.t).toBe('─');
    expect(BORDER_CHARS.single.l).toBe('│');
  });
});
```

- [ ] **Step 4: Modify `src/host.ts`** — `BoxProps` additions + Yoga `setBorder` calls.

Add to the `BoxProps` interface (e.g. after the existing `backgroundColor` field):

```ts
  // Border drawn around the box (one cell on each side). When set, Yoga
  // reserves 1 cell on each edge so border doesn't overlap content.
  border?: BorderStyle;
  // Color for border glyphs — same string format as `color` (named or truecolor).
  borderColor?: string;
```

At the top of `host.ts`, add the import:

```ts
import type { BorderStyle } from './borders.js';
```

In `applyProps`, after the existing position-type / edge-offset block (around line 84), add:

```ts
  // Border edge reservation — Yoga subtracts these from content space.
  // Always set (including to 0 when border drops away) so prop changes re-render correctly.
  const borderWidth = props.border ? 1 : 0;
  n.setBorder(Edge.Top, borderWidth);
  n.setBorder(Edge.Right, borderWidth);
  n.setBorder(Edge.Bottom, borderWidth);
  n.setBorder(Edge.Left, borderWidth);
```

- [ ] **Step 5: Modify `src/paint.ts`** — draw the border ring.

Add import at the top:

```ts
import { BORDER_CHARS } from './borders.js';
```

Add a `paintBorder` helper in the file (above `paintInstance` is fine):

```ts
// Draw the box's 8-slot border (4 corners + 4 edge runs) directly into the
// buffer. Called BEFORE children paint so content / nested children overlay
// the border interior. The border itself sits on the outermost cell ring of
// the box rect; Yoga's setBorder(edge, 1) reserved those cells from layout
// so neither own-text nor child layout will land on them.
function paintBorder(inst: Instance, buffer: Buffer, box: Rect): void {
  const style = inst.props.border;
  if (!style) return;
  if (box.width < 2 || box.height < 2) return; // can't draw a border without an interior

  const chars = BORDER_CHARS[style];
  const cellStyle: Style = {};
  if (inst.props.borderColor !== undefined) cellStyle.fg = inst.props.borderColor;

  const x0 = box.left;
  const y0 = box.top;
  const x1 = box.left + box.width - 1;
  const y1 = box.top + box.height - 1;

  // Corners
  buffer.set(x0, y0, chars.tl, cellStyle);
  buffer.set(x1, y0, chars.tr, cellStyle);
  buffer.set(x0, y1, chars.bl, cellStyle);
  buffer.set(x1, y1, chars.br, cellStyle);

  // Top + bottom edges (between corners)
  for (let x = x0 + 1; x < x1; x++) {
    buffer.set(x, y0, chars.t, cellStyle);
    buffer.set(x, y1, chars.b, cellStyle);
  }
  // Left + right edges (between corners)
  for (let y = y0 + 1; y < y1; y++) {
    buffer.set(x0, y, chars.l, cellStyle);
    buffer.set(x1, y, chars.r, cellStyle);
  }
}
```

Call `paintBorder(inst, buffer, box);` in `paintInstance`. Place it between step 1 (background fill) and step 2 (own text):

```ts
  // 1. Fill the box rect with own backgroundColor (if set).
  if (ownBg !== undefined) {
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        buffer.set(x, y, ' ', { bg: ownBg });
      }
    }
  }

  // 1b. Draw border (if set) on the outermost ring before content paints.
  paintBorder(inst, buffer, box);

  // 2. Paint own text (wrapped if wrap prop set).
```

The order matters: background fills the whole rect (including border cells), THEN border overwrites those edge cells with glyphs (using its own `cellStyle` — note: this means border cells won't carry the box's `backgroundColor` unless we explicitly forward it; see Risk 1 in self-review).

- [ ] **Step 6: Modify `src/index.ts`** — add `BorderStyle` to the public exports next to `BoxProps`:

Look for the existing `BoxProps` re-export. If it's `export type { BoxProps } from './host.js';`, change to `export type { BoxProps } from './host.js';` plus a new line: `export type { BorderStyle } from './borders.js';`. (Re-export the `BorderChars` interface too if convenient — small surface, useful for consumers building custom wrappers.)

- [ ] **Step 7: Modify `src/paint.test.ts`** — render assertions. Read the existing file first to copy its helper pattern (likely involves `render(...)` from `'./render.js'` + a `TestBackend` + reading `backend.lastBuffer.get(x, y).char`). Use the same pattern. Append:

```ts
import { BORDER_CHARS } from './borders.js';
// (Other imports — render, Box, TestBackend, flush — should already be present in this file.)

describe('Box border', () => {
  test('border="single" draws ┌─┐ / │ │ / └─┘ on a 3×3 box', async () => {
    const backend = new TestBackend(3, 3);
    render(<Box border="single" width={3} height={3} />, { backend });
    flush();
    const buf = backend.lastBuffer!;
    // Top row
    expect(buf.get(0, 0).char).toBe('┌');
    expect(buf.get(1, 0).char).toBe('─');
    expect(buf.get(2, 0).char).toBe('┐');
    // Middle row — only side edges; interior cell is blank
    expect(buf.get(0, 1).char).toBe('│');
    expect(buf.get(1, 1).char).toBe(' '); // interior
    expect(buf.get(2, 1).char).toBe('│');
    // Bottom row
    expect(buf.get(0, 2).char).toBe('└');
    expect(buf.get(1, 2).char).toBe('─');
    expect(buf.get(2, 2).char).toBe('┘');
  });

  test.each([
    ['double',  { tl: '╔', tr: '╗', bl: '╚', br: '╝', t: '═', l: '║' }],
    ['round',   { tl: '╭', tr: '╮', bl: '╰', br: '╯', t: '─', l: '│' }],
    ['bold',    { tl: '┏', tr: '┓', bl: '┗', br: '┛', t: '━', l: '┃' }],
    ['classic', { tl: '+', tr: '+', bl: '+', br: '+', t: '-', l: '|' }],
  ] as const)('border="%s" draws its corner + edge glyphs', (style, want) => {
    const backend = new TestBackend(3, 3);
    render(<Box border={style} width={3} height={3} />, { backend });
    flush();
    const buf = backend.lastBuffer!;
    expect(buf.get(0, 0).char).toBe(want.tl);
    expect(buf.get(2, 0).char).toBe(want.tr);
    expect(buf.get(0, 2).char).toBe(want.bl);
    expect(buf.get(2, 2).char).toBe(want.br);
    expect(buf.get(1, 0).char).toBe(want.t);
    expect(buf.get(0, 1).char).toBe(want.l);
  });

  test('borderColor applies fg style to border cells', () => {
    const backend = new TestBackend(3, 3);
    render(<Box border="single" borderColor="red" width={3} height={3} />, { backend });
    flush();
    const buf = backend.lastBuffer!;
    expect(buf.get(0, 0).style.fg).toBe('red');
    expect(buf.get(1, 1).style.fg).toBeUndefined(); // interior cell unaffected
  });

  test('borderColor accepts truecolor values', () => {
    const backend = new TestBackend(3, 3);
    render(<Box border="single" borderColor="#ff0000" width={3} height={3} />, { backend });
    flush();
    const buf = backend.lastBuffer!;
    expect(buf.get(0, 0).style.fg).toBe('#ff0000');
  });

  test('box too small (width < 2 OR height < 2) silently skips border draw', () => {
    const backend = new TestBackend(3, 3);
    render(<Box border="single" width={1} height={3} />, { backend });
    flush();
    const buf = backend.lastBuffer!;
    // No border glyphs anywhere in column 0
    for (let y = 0; y < 3; y++) {
      const ch = buf.get(0, y).char;
      expect(BORDER_CHARS.single.tl).not.toBe(ch);
      expect(BORDER_CHARS.single.bl).not.toBe(ch);
      expect(BORDER_CHARS.single.l).not.toBe(ch);
    }
  });

  test('border + content: text lands inside the border (Yoga reserves the ring)', () => {
    const backend = new TestBackend(5, 3);
    render(
      <Box border="single" width={5} height={3}>
        <Text>hi</Text>
      </Box>,
      { backend },
    );
    flush();
    const buf = backend.lastBuffer!;
    // Border cells
    expect(buf.get(0, 0).char).toBe('┌');
    expect(buf.get(4, 0).char).toBe('┐');
    expect(buf.get(0, 2).char).toBe('└');
    expect(buf.get(4, 2).char).toBe('┘');
    // Text inside the border (Yoga reserved 1-cell ring → content area is 3×1 at (1,1))
    expect(buf.get(1, 1).char).toBe('h');
    expect(buf.get(2, 1).char).toBe('i');
  });
});
```

If `Text` import isn't already in `paint.test.ts`, add it; same for `flush`. Match the import style used elsewhere in the file.

- [ ] **Step 8: Verify**
  - `npx vitest run src/borders.test.ts` — passes.
  - `npx vitest run src/paint.test.ts` — passes (existing + new).
  - `npx vitest run` — full suite green (190 + new count).
  - `npm run typecheck` — clean.

Common pitfalls — fix the implementation, don't weaken tests:
- **Yoga `setBorder` invariant**: if the implementation calls `n.setBorder(...)` BEFORE the node is created or while it has a measure func that conflicts, Yoga may throw. The placement here (inside `applyProps`, after position-type) is identical to the pattern used by the existing edge-position calls — should be safe.
- **Text test fails because text lands at (0,0)**: this means Yoga's `setBorder` isn't actually reserving cells — verify `n.setBorder(Edge.Top, 1)` is being called (typo? wrong Edge enum value?). Or `layoutOf` isn't accounting for border (it shouldn't need to — Yoga's `getComputedLayout` returns the box rect; the *measure func* for text-only children reads the constrained width passed by Yoga which already excludes border). If text-only children are positioned without honoring border, the issue is in `layoutOf` or `paintInstance`'s text loop using `box.left + col` (the child's own layout already accounts for parent's border via Yoga, so `box.left` for the child IS at `parent.left + 1`).
- **"box too small" test fails because a glyph IS at (0,0)**: the guard `width < 2 || height < 2` must use the post-layout `box.width` / `box.height`, not the prop value (props may be undefined for auto-sized).
- **"borderColor truecolor" test fails because the cell `style.fg` is `undefined`**: verify that `cellStyle.fg = inst.props.borderColor` runs unconditionally when `borderColor` is set — don't gate it on `parseColor` (paint stores the raw string; ansi `sgr` resolves it later).

- [ ] **Step 9: Commit**
```bash
git add src/borders.ts src/borders.test.ts src/host.ts src/paint.ts src/paint.test.ts src/index.ts
git commit -m "feat: Box border + borderColor — five styles, Yoga edge reservation"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find the `## Status` section.

- [ ] **Step 2: Add a `### Borders` subsection** under `## Status` (after the truecolor subsection). Suggested content:

```md
### Borders

`<Box border>` draws a one-cell border on all four edges. The cells are reserved
via Yoga's per-edge border slots, so content fits inside the ring automatically.

- `border="single"` → `┌─┐ │ │ └─┘`
- `border="double"` → `╔═╗ ║ ║ ╚═╝`
- `border="round"`  → `╭─╮ │ │ ╰─╯`
- `border="bold"`   → `┏━┓ ┃ ┃ ┗━┛`
- `border="classic"` → ASCII fallback `+-+ | | +-+`

`borderColor` accepts the same values as `color` (named, `#rrggbb`, `rgb(...)`).
Boxes smaller than 2×2 silently skip the border.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document Box border + borderColor"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- `BoxProps.border` + `BoxProps.borderColor` types → Task 1.
- Five styles with correct glyphs → Task 1 (BORDER_CHARS + per-style assertion test).
- Yoga edge reservation → Task 1 (setBorder, content-fit test).
- borderColor (named + truecolor) → Task 1 (two color tests).
- Size guard → Task 1 (too-small test).
- README documentation → Task 2.

**2. Placeholder scan:** none. All code blocks are complete; assertions name specific glyphs and coordinates.

**3. Type consistency:**
- `BorderStyle` exported from `borders.ts`, re-exported from `index.ts`, used as type for `BoxProps.border`.
- `BORDER_CHARS: Record<BorderStyle, BorderChars>` keyed by the literal union — adding a new style requires extending both.

**Risks worth flagging for the implementer:**

1. **`backgroundColor` doesn't bleed into border cells**: `paintBorder` writes with its own `cellStyle = { fg?: borderColor }` and no bg. If the user sets `<Box border backgroundColor="blue">`, the border glyphs show without blue bg (terminal default behind them). This is a minor visual inconsistency. Trade-off: forwarding bg makes the helper signature more complex. Defer — document if asked. If the implementer wants to fix it cheaply, add `if (inst.props.backgroundColor !== undefined) cellStyle.bg = inst.props.backgroundColor;` in `paintBorder`. Acceptable either way.

2. **Yoga's `getComputedBorder`**: paint reads `layoutOf(inst, ...)` which returns the rect — it doesn't subtract the border slot, the rect IS the full box. Children's layout (returned from Yoga for THEIR nodes) already excludes parent's border. So `paintBorder` draws on the parent's own rect's outer ring, and children paint at their own rect (which is inset). This is correct, but easy to misread — verify with the "border + content" test (text at `(1, 1)`).

3. **Two-pass paint (M1f)**: absolutes paint AFTER stack-flow children. An absolute child overlaying a parent's border will overwrite border cells (because absolutes paint into the parent's coordinate space and can land anywhere in `0..parent.width`). This is intentional (overlay semantics) — but means a borderless modal-style overlay on a bordered parent will eat the border underneath. Acceptable; document only if asked.

4. **`setBorder` on a node that later becomes text-only with a measure func**: Yoga handles border + measure func together (CSS borders on text inputs work). But the `refreshMeasure` flow toggles measure funcs; if border is set on a text-bearing box, Yoga should subtract the border from the constraint passed to the measure func. The "border + content" test asserts text fits at `(1, 1)` in a 5×3 box — if Yoga isn't passing the constrained width (5 - 2 = 3) to the measure func, the wrap calculation could overflow. Verify by reading `setMeasureFunc` callback in `host.ts:132` — it uses `Math.floor(width)` which is whatever Yoga gives, so behavior should be correct. If a test fails because of measure-func mis-wiring, the fix is in `refreshMeasure`, not in this plan.

5. **`paint.test.ts` may not exist or may not use the exact import style assumed above**: Step 1 of Task 1 has the implementer READ the existing file first. If the file doesn't exist OR uses `render` differently (e.g. with a custom helper), adapt the test code to fit that pattern. The asserts (`buf.get(x, y).char`) are stable across patterns since `TestBackend.lastBuffer` is the public API.

6. **`Text` is a sugar component over `Box`** (per comment in `host.ts:4`): the "border + content" test uses `<Text>hi</Text>` inside a `<Box border>`. If `Text` is implemented as a `Box` that wraps a `TextInstance` child, the layout should work — but verify the `Text` component is in scope in `paint.test.ts` (import from `'./components.js'` or wherever it lives).

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/borders.md`. Subagent-driven execution per your request — confirming the same flow as truecolor: commit plan on master, branch `borders`, dispatch Task 1 (Sonnet — logic + integration), then Task 2 (Haiku — README + build).
