# flowtty M1d — Text Features (wrap + element styling) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make `<Text>` and `<Box>` prop-driven for rendering — `<Text>` gains `wrap` (word-wrap with char-wrap fallback, or `truncate` with single-cell ellipsis `…`) + `color`/`bold`/`dim`/`underline`/`inverse`; `<Box>` gains `backgroundColor`. The Yoga measure func becomes wrap-aware (responds to width constraints), the paint pass carries Text style to cell `Style` and fills Box backgrounds, and the ANSI serializer learns named background colors. Acceptance: `<Box width={10} backgroundColor="blue"><Text color="red" bold wrap>this is a long line</Text></Box>` paints a 10-wide blue background with red+bold text wrapped across multiple rows.

**Architecture:** A pure `wrapText(text, width, mode)` helper (one file, exhaustively unit-tested). `host.ts` `refreshMeasure` calls it from within the Yoga measure callback, using Yoga's `widthMode` (`Undefined`/`AtMost`/`Exactly`) to decide whether to constrain. `paint.ts` walks text-bearing boxes, runs the same `wrapText` to choose paint lines, reads `color`/`bold`/`…` off `inst.props` to build the per-cell `Style`, and fills the box rect with `backgroundColor` cells before painting text on top. `ansi.ts` `sgr()` learns a `BG` map for named background colors. `TestBackend` exposes a `lastBuffer` getter so tests can assert on `style` per cell.

**Tech Stack:** Same as M1c — TypeScript ESM, React 19, `react-reconciler@0.31.0`, `yoga-layout@3.2.1`, Vitest 4.

**Out of scope** (later milestones / explicit non-goals): truecolor (`#rgb` / `rgb(…)`) — only named 16-color palette in M1d (`black`/`red`/`green`/`yellow`/`blue`/`magenta`/`cyan`/`white`); per-character/inline style spans (e.g., `<Text>plain <Text bold>bold</Text> plain</Text>`) — M1d styles apply to a Text's whole children string; right-to-left text + bidi; CJK/emoji width awareness (still assumes 1 code point = 1 cell).

---

## Scope check

This is a small, focused plan: one independent feature (Text/Box prop rendering) with two natural sub-features (wrap, styling) that share enough infrastructure (measure + paint + props pipeline) that splitting them creates more friction than landing together. **One plan, ~8 tasks.**

---

## File Structure

```
src/
  wrap.ts                # NEW — wrapText(text, width, mode) pure helper
  wrap.test.ts           # NEW — exhaustive cases (word/char/truncate/edges)
  host.ts                # MODIFY — extend BoxProps; refreshMeasure becomes wrap-aware
  host.test.ts           # ADD — measure-with-wrap test
  components.ts          # MODIFY — TextProps shape; Text forwards style+wrap props
  paint.ts               # MODIFY — wrap-aware text painting; bg fill; per-cell Style from props
  paint.test.ts          # ADD — wrap rendering + bg + styled cells
  ansi.ts                # MODIFY — add BG named-color map; sgr() emits bg codes
  ansi.test.ts           # ADD — bg tests
  backends/test.ts       # MODIFY — keep lastBuffer for cell-level inspection
  backends/test.test.ts  # ADD — lastBuffer is the last drawn Buffer instance
  index.ts               # MODIFY — re-export TextProps (already exports BoxProps)
  README.md              # MODIFY — M1d state + Text-styling usage
```

Responsibilities:
- **`wrap.ts`** is the only place that knows the wrap algorithm. Pure; no React, no Yoga, no I/O.
- **`host.ts`** owns BoxProps shape + how Yoga learns the wrapped size.
- **`paint.ts`** is the only place that knows how to render text styled + wrapped into the cell buffer.
- **`ansi.ts`** is the only place that maps Style → ANSI bytes.

---

### Task 1: `wrapText` — pure word/char/truncate algorithm

**Files:**
- Create: `src/wrap.ts`
- Create: `src/wrap.test.ts`

- [ ] **Step 1: Write the failing test `src/wrap.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { wrapText } from './wrap.js';

test('wrap mode: short text fits on one line', () => {
  expect(wrapText('hi', 10, 'wrap')).toEqual(['hi']);
});

test('wrap mode: word-wraps at spaces', () => {
  expect(wrapText('hello world', 7, 'wrap')).toEqual(['hello', 'world']);
  expect(wrapText('a b c d', 3, 'wrap')).toEqual(['a b', 'c d']);
});

test('wrap mode: char-wraps a single word longer than width', () => {
  expect(wrapText('antidisestablishment', 6, 'wrap')).toEqual(['antidi', 'sestab', 'lishme', 'nt']);
});

test('wrap mode: mixed — word-wraps where it can, char-wraps long words', () => {
  expect(wrapText('hi superlongword bye', 6, 'wrap')).toEqual(['hi', 'superl', 'ongwor', 'd bye']);
});

test('wrap mode: preserves explicit \\n line breaks (wrap each source line independently)', () => {
  expect(wrapText('hello world\\nfoo bar', 6, 'wrap').join('|')).toBe(
    'hello\\nworld\\nfoo|bar'.split('\\n').join('|'),
  );
  // Equivalent direct assertion:
  expect(wrapText('hello world\nfoo bar', 6, 'wrap')).toEqual(['hello', 'world', 'foo', 'bar']);
});

test('truncate mode: lines longer than width are truncated with … (single-cell ellipsis)', () => {
  expect(wrapText('hello world', 7, 'truncate')).toEqual(['hello …']);
  expect(wrapText('hi', 7, 'truncate')).toEqual(['hi']);
});

test('truncate mode: width < 2 yields a single ellipsis (or empty for width 0)', () => {
  expect(wrapText('hello', 1, 'truncate')).toEqual(['…']);
  expect(wrapText('hello', 0, 'truncate')).toEqual(['']);
});

test('truncate mode: preserves explicit \\n; each source line is truncated independently', () => {
  expect(wrapText('hello world\nfoo bar baz', 7, 'truncate')).toEqual(['hello …', 'foo bar']);
});

test('none mode: no wrapping or truncation (lines kept whole)', () => {
  expect(wrapText('hello world', 3, 'none')).toEqual(['hello world']);
  expect(wrapText('a\nb', 1, 'none')).toEqual(['a', 'b']);
});

test('edge: width 0 in wrap mode returns an empty line per source line', () => {
  expect(wrapText('hello', 0, 'wrap')).toEqual(['']);
});

test('edge: empty input returns a single empty line (matches measureText semantics)', () => {
  expect(wrapText('', 10, 'wrap')).toEqual(['']);
  expect(wrapText('', 10, 'truncate')).toEqual(['']);
  expect(wrapText('', 10, 'none')).toEqual(['']);
});
```

(Note on the literal-`\\n` test: vitest renders the readable form; the second `expect` is the direct assertion to avoid escape-confusion.)

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/wrap.test.ts`.

- [ ] **Step 3: Write `src/wrap.ts`:**
```ts
export type WrapMode = 'wrap' | 'truncate' | 'none';

const ELLIPSIS = '…';

/**
 * Lay out `text` into display lines fitting within `width` cells.
 * Assumes 1 code point = 1 cell (no CJK/emoji width awareness in M1d).
 *
 *  - 'wrap'     — word-wrap at spaces; any single word longer than width is char-wrapped.
 *  - 'truncate' — each source line truncated to width, with `…` in the last cell when truncated.
 *  - 'none'     — each source line preserved unchanged (caller is responsible for overflow).
 *
 * Always returns at least one line (empty input → `['']`, matching measureText's height=1 default).
 */
export function wrapText(text: string, width: number, mode: WrapMode): string[] {
  if (width < 0) width = 0;
  const out: string[] = [];

  for (const source of text.split('\n')) {
    if (mode === 'none') {
      out.push(source);
      continue;
    }
    if (mode === 'truncate') {
      out.push(truncateLine(source, width));
      continue;
    }
    // mode === 'wrap'
    wrapLine(source, width, out);
  }

  if (out.length === 0) out.push('');
  return out;
}

function truncateLine(line: string, width: number): string {
  if (width <= 0) return '';
  if ([...line].length <= width) return line;
  if (width === 1) return ELLIPSIS;
  // Take width-1 cells then append the ellipsis cell.
  const chars = [...line];
  return chars.slice(0, width - 1).join('') + ELLIPSIS;
}

function wrapLine(line: string, width: number, out: string[]): void {
  if (width === 0) { out.push(''); return; }
  if (line === '') { out.push(''); return; }

  let current = '';
  for (const word of line.split(' ')) {
    // Word fits on current line (with separating space if non-empty)?
    const candidate = current ? current + ' ' + word : word;
    if ([...candidate].length <= width) {
      current = candidate;
      continue;
    }
    // Doesn't fit. Flush current line if any.
    if (current) { out.push(current); current = ''; }
    // Word itself longer than width → char-wrap it.
    if ([...word].length > width) {
      let remainder = [...word];
      while (remainder.length > width) {
        out.push(remainder.slice(0, width).join(''));
        remainder = remainder.slice(width);
      }
      current = remainder.join('');
    } else {
      current = word;
    }
  }
  if (current) out.push(current);
  if (out.length === 0) out.push('');
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/wrap.test.ts`. All ~11 tests pass. `npx vitest run` → full suite green (86 + 11 = 97). `npm run typecheck` clean.

- [ ] **Step 5: Commit**
```bash
git add src/wrap.ts src/wrap.test.ts
git commit -m "feat: wrapText pure helper (word-wrap with char-wrap fallback, truncate, none)"
```

---

### Task 2: `BoxProps` + `TextProps` extensions

**Files:**
- Modify: `src/host.ts`
- Modify: `src/components.ts`

- [ ] **Step 1: Extend `BoxProps` in `src/host.ts`** — find the existing interface and add fields:
```ts
export interface BoxProps {
  width?: number;
  height?: number;
  flexDirection?: 'row' | 'column';
  // Text wrap mode for direct text children (default: 'none' — current behavior).
  wrap?: 'wrap' | 'truncate' | 'none';
  // Text styling applied to direct text children:
  color?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
  // Box background fill:
  backgroundColor?: string;
}
```

(Leave existing types/exports unchanged. `applyProps` doesn't need to change yet — the new fields are read by `refreshMeasure` and `paint` directly off `inst.props`; none of them feed Yoga node styles directly.)

- [ ] **Step 2: Add `TextProps` in `src/components.ts`** and update `Text` to forward style+wrap props. Find the existing `Text` and replace:
```ts
import { createElement, type ReactNode } from 'react';
import type { BoxProps } from './host.js';

export function Box({ children, ...rest }: BoxProps & { children?: ReactNode }) {
  return createElement('flowtty-box', rest, children);
}

export interface TextProps {
  children?: ReactNode;
  color?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
  /** Default 'none' (no wrap). 'wrap' = word-wrap with char-wrap fallback. 'truncate' = single-cell ellipsis. */
  wrap?: 'wrap' | 'truncate' | 'none';
}

export function Text({ children, ...style }: TextProps) {
  // Renders to a flowtty-box whose paint pass reads these style props off inst.props.
  return createElement('flowtty-box', style, children);
}
```

- [ ] **Step 3: Verify** — `npx vitest run` (all 97 should still pass; M0/M1a/M1b/M1c tests don't check the new fields). `npm run typecheck` clean.

- [ ] **Step 4: Commit**
```bash
git add src/host.ts src/components.ts
git commit -m "feat: extend BoxProps + add TextProps for wrap/color/bold/bg styling"
```

---

### Task 3: Wrap-aware Yoga measure func

**Files:**
- Modify: `src/host.ts`
- Modify: `src/host.test.ts`

- [ ] **Step 1: Append failing tests to `src/host.test.ts`:**
```ts
test('measure func: wrap mode returns wrapped dimensions when parent constrains width', async () => {
  const Yoga = await getYoga();
  // Parent box width 7, with text 'hello world' and wrap='wrap'.
  // Expected wrapped lines: ['hello', 'world'] → width 5, height 2.
  const parent = createInstance('flowtty-box', { width: 7, wrap: 'wrap' }, Yoga);
  const txt = createTextInstance('hello world', Yoga);
  appendChild(parent, txt, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(parent.yogaNode.getComputedHeight()).toBe(2);
});

test('measure func: none mode (default) returns natural width', async () => {
  const Yoga = await getYoga();
  // No wrap set; the box should size to text natural width (11 cells).
  const parent = createInstance('flowtty-box', {}, Yoga);
  const txt = createTextInstance('hello world', Yoga);
  appendChild(parent, txt, Yoga);
  parent.yogaNode.calculateLayout(undefined, undefined);
  expect(parent.yogaNode.getComputedWidth()).toBe(11);
  expect(parent.yogaNode.getComputedHeight()).toBe(1);
});
```

- [ ] **Step 2: Run, verify the wrap test FAILS** (the none test should still pass — it's the M0 behavior). `npx vitest run src/host.test.ts`.

- [ ] **Step 3: Modify `src/host.ts` `refreshMeasure`** to consult wrap mode and the constraint width. **Important — Yoga's `MeasureMode` enum:** like the other Yoga enums it's a named export from `'yoga-layout/load'`, NOT a property of the loaded instance (this exact gotcha was confirmed in M1b's T4). Import it and re-export from `src/yoga.ts` first:

   In `src/yoga.ts`, find the existing enum re-exports and add `MeasureMode`:
   ```ts
   export { FlexDirection, MeasureMode } from 'yoga-layout/load';
   ```

   Then in `src/host.ts`, import `MeasureMode` from `./yoga.js` and update `refreshMeasure`:
   ```ts
   import { FlexDirection, MeasureMode, type Yoga, type YogaNode } from './yoga.js';
   import { wrapText, type WrapMode } from './wrap.js';

   // ... existing exports ...

   export function refreshMeasure(inst: Instance, _Yoga: Yoga): void {
     const hasText = inst.children.some((c) => c.type === 'text');
     const hasBox = inst.children.some((c) => c.type === 'box');
     if (hasText && !hasBox) {
       const text = ownText(inst);
       const mode = (inst.props.wrap ?? 'none') as WrapMode;
       inst.yogaNode.setMeasureFunc((width, widthMode /*, height, heightMode */) => {
         // When parent imposes a width (Exactly or AtMost) and wrap mode is set,
         // run wrapText to compute the constrained dimensions; otherwise return
         // natural size (longest line × line count).
         if (mode !== 'none' && (widthMode === MeasureMode.Exactly || widthMode === MeasureMode.AtMost) && Number.isFinite(width)) {
           const cap = Math.max(0, Math.floor(width));
           const lines = wrapText(text, cap, mode);
           const longest = lines.reduce((m, l) => Math.max(m, [...l].length), 0);
           return { width: longest, height: lines.length };
         }
         return measureText(text);
       });
     } else {
       inst.yogaNode.setMeasureFunc(null);
     }
   }
   ```

   (Existing `measureText` stays as-is; the wrap-mode branch calls `wrapText` instead.)

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/host.test.ts` (both wrap + none tests pass). `npx vitest run` → full suite green (97 + 2 = 99). `npm run typecheck` clean.

   **If MeasureMode access fails** — runtime check `Yoga.MeasureMode` vs the imported `MeasureMode` constant. The named export from `yoga-layout/load` is the verified path; if the names differ in the installed package, inspect `node_modules/yoga-layout/dist/load.d.ts` for the actual export name.

- [ ] **Step 5: Commit**
```bash
git add src/yoga.ts src/host.ts src/host.test.ts
git commit -m "feat: refreshMeasure consults wrap mode + width constraint"
```

---

### Task 4: ANSI `sgr()` background colors

**Files:**
- Modify: `src/ansi.ts`
- Modify: `src/ansi.test.ts`

- [ ] **Step 1: Append failing tests to `src/ansi.test.ts`:**
```ts
test('sgr emits bg color codes (named, 40–47)', () => {
  expect(sgr({ bg: 'red' })).toBe('\x1b[41m');
  expect(sgr({ bg: 'blue' })).toBe('\x1b[44m');
  expect(sgr({ bold: true, fg: 'red', bg: 'blue' })).toBe('\x1b[1;31;44m');
});

test('sgr ignores unknown bg colors (matches the existing fg behavior)', () => {
  expect(sgr({ bg: '#ff0000' })).toBe(''); // truecolor not in M1d
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Modify `src/ansi.ts`** — add the BG map and extend `sgr()` to push bg codes. Find the existing `FG` map and `sgr()`; add BG and one branch:
```ts
const BG: Record<string, number> = {
  black: 40, red: 41, green: 42, yellow: 43,
  blue: 44, magenta: 45, cyan: 46, white: 47,
};

export function sgr(style: Style): string {
  const codes: number[] = [];
  if (style.bold) codes.push(1);
  if (style.dim) codes.push(2);
  if (style.underline) codes.push(4);
  if (style.inverse) codes.push(7);
  if (style.fg && FG[style.fg] !== undefined) codes.push(FG[style.fg]!);
  if (style.bg && BG[style.bg] !== undefined) codes.push(BG[style.bg]!);
  return codes.length ? `\x1b[${codes.join(';')}m` : '';
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/ansi.test.ts`. Full suite green. Typecheck clean.

- [ ] **Step 5: Commit**
```bash
git add src/ansi.ts src/ansi.test.ts
git commit -m "feat: sgr() emits named background-color codes"
```

---

### Task 5: `TestBackend.lastBuffer` — cell-level inspection for tests

**Files:**
- Modify: `src/backends/test.ts`
- Modify: `src/backends/test.test.ts`

- [ ] **Step 1: Append failing test to `src/backends/test.test.ts`:**
```ts
test('TestBackend.lastBuffer exposes the last drawn Buffer for cell-level assertions', () => {
  const b = new TestBackend(4, 1);
  const buf = new Buffer(4, 1);
  buf.set(0, 0, 'X', { bold: true, fg: 'red' });
  b.draw(buf);
  const got = b.lastBuffer;
  expect(got).not.toBeNull();
  expect(got!.get(0, 0)).toEqual({ char: 'X', style: { bold: true, fg: 'red' } });
});
```
(`Buffer` is already imported in this file; reuse the existing import.)

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Modify `src/backends/test.ts`** — store the Buffer ref alongside the captured string, expose via getter:
```ts
import type { Buffer } from '../cells.js';
import type { Key } from '../keys.js';
import type { Backend } from './types.js';

export class TestBackend implements Backend {
  frames: string[] = [];
  private buffers: Array<Buffer> = [];
  private readonly subscribers = new Set<(key: Key) => void>();

  constructor(
    private readonly cols = 40,
    private readonly rows = 10,
  ) {}

  size() { return { width: this.cols, height: this.rows }; }

  draw(buffer: Buffer): void {
    this.frames.push(buffer.toString());
    this.buffers.push(buffer);
  }

  get lastFrame(): string { return this.frames[this.frames.length - 1] ?? ''; }
  get lastBuffer(): Buffer | null { return this.buffers[this.buffers.length - 1] ?? null; }

  onKey(handler: (key: Key) => void): () => void {
    this.subscribers.add(handler);
    return () => { this.subscribers.delete(handler); };
  }

  press(key: Partial<Key> & { name: string }): void {
    const k: Key = {
      sequence: key.sequence ?? '', ctrl: key.ctrl ?? false,
      meta: key.meta ?? false, shift: key.shift ?? false, name: key.name,
    };
    for (const h of [...this.subscribers]) h(k);
  }

  type(text: string): void {
    for (const ch of text) this.press({ name: ch, sequence: ch });
  }
}
```
(Only additions: `buffers` array, `lastBuffer` getter, `draw` pushes to both.)

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/backends/test.test.ts`. Full suite green. Typecheck clean.

- [ ] **Step 5: Commit**
```bash
git add src/backends/test.ts src/backends/test.test.ts
git commit -m "feat: TestBackend.lastBuffer for cell-level style assertions"
```

---

### Task 6: Paint — wrap, text style, box background

**Files:**
- Modify: `src/paint.ts`
- Modify: `src/paint.test.ts`

- [ ] **Step 1: Append failing tests to `src/paint.test.ts`:**
```ts
test('paint: wrap mode renders text across multiple rows', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 6, height: 2, wrap: 'wrap' }, 'hello world'),
  );
  computeLayout(container, 6, 2);
  const buf = paint(container, 6, 2);
  expect(buf.toString()).toBe('hello\nworld');
});

test('paint: truncate mode renders single line with ellipsis', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 7, height: 1, wrap: 'truncate' }, 'hello world'),
  );
  computeLayout(container, 7, 1);
  const buf = paint(container, 7, 1);
  expect(buf.toString()).toBe('hello …');
});

test('paint: text style props (color/bold) flow to cell Style', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { color: 'red', bold: true }, 'X'),
  );
  computeLayout(container, 5, 1);
  const buf = paint(container, 5, 1);
  expect(buf.get(0, 0)).toEqual({ char: 'X', style: { fg: 'red', bold: true } });
});

test('paint: box backgroundColor fills the box rect', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 3, height: 2, backgroundColor: 'blue' }),
  );
  computeLayout(container, 3, 2);
  const buf = paint(container, 3, 2);
  // Every cell in the 3×2 rect should be a space with bg=blue.
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 3; x++) {
      expect(buf.get(x, y)).toEqual({ char: ' ', style: { bg: 'blue' } });
    }
  }
});

test('paint: bg fill then text on top — text cells inherit text style, bg cells keep bg', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 4, height: 1, backgroundColor: 'blue', color: 'red' }, 'hi'),
  );
  computeLayout(container, 4, 1);
  const buf = paint(container, 4, 1);
  expect(buf.get(0, 0)).toEqual({ char: 'h', style: { fg: 'red', bg: 'blue' } });
  expect(buf.get(1, 0)).toEqual({ char: 'i', style: { fg: 'red', bg: 'blue' } });
  expect(buf.get(2, 0)).toEqual({ char: ' ', style: { bg: 'blue' } });
  expect(buf.get(3, 0)).toEqual({ char: ' ', style: { bg: 'blue' } });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/paint.test.ts`. (Style is `{}`, no wrap, no bg fill.)

- [ ] **Step 3: Rewrite `src/paint.ts`** to handle wrap, style, and bg. Replace entirely:
```ts
import { Buffer, type Style } from './cells.js';
import { layoutOf, type Rect } from './layout.js';
import { ownText, type Instance } from './host.js';
import type { Container } from './reconciler.js';
import { wrapText, type WrapMode } from './wrap.js';

export function paint(container: Container, width: number, height: number): Buffer {
  const buffer = new Buffer(width, height);
  for (const root of container.children) paintInstance(root, buffer, 0, 0);
  return buffer;
}

function textStyleOf(inst: Instance): Style {
  const p = inst.props;
  const style: Style = {};
  if (p.color !== undefined) style.fg = p.color;
  if (p.bold) style.bold = true;
  if (p.dim) style.dim = true;
  if (p.underline) style.underline = true;
  if (p.inverse) style.inverse = true;
  if (p.backgroundColor !== undefined) style.bg = p.backgroundColor;
  return style;
}

function bgStyleOf(inst: Instance): Style | null {
  return inst.props.backgroundColor !== undefined ? { bg: inst.props.backgroundColor } : null;
}

function paintInstance(inst: Instance, buffer: Buffer, offsetX: number, offsetY: number): void {
  const box: Rect = layoutOf(inst, offsetX, offsetY);

  // 1. Fill the box rect with backgroundColor cells (if set).
  const bg = bgStyleOf(inst);
  if (bg) {
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        buffer.set(x, y, ' ', bg);
      }
    }
  }

  // 2. Paint own text (wrapped if wrap prop set), inheriting bg if present.
  const text = ownText(inst);
  if (text) {
    const mode = (inst.props.wrap ?? 'none') as WrapMode;
    const lines = mode === 'none' ? text.split('\n') : wrapText(text, box.width, mode);
    const textStyle = textStyleOf(inst);
    for (let row = 0; row < lines.length; row++) {
      const chars = [...(lines[row] ?? '')];
      for (let col = 0; col < chars.length; col++) {
        buffer.set(box.left + col, box.top + row, chars[col]!, textStyle);
      }
    }
  }

  // 3. Recurse into child boxes.
  for (const child of inst.children) {
    if (child.type === 'box') paintInstance(child, buffer, box.left, box.top);
  }
}
```

- [ ] **Step 4: Verify** — `npx vitest run src/paint.test.ts` (all paint tests pass). `npx vitest run` → full suite green (~104). `npm run typecheck` clean.

- [ ] **Step 5: Commit**
```bash
git add src/paint.ts src/paint.test.ts
git commit -m "feat: paint — wrap, text style props, box background fill"
```

---

### Task 7: TextInput sanity + acceptance demo

**Files:**
- Modify: `src/text-input.test.ts`

The TextInput tests assert string equality on `lastFrame` (e.g., `'hi▏'`). Painting now sets text style based on the box's props — but TextInput's `<Box><Text>...</Text></Box>` passes no style props, so cells get `style: {}` as before. The string output is unchanged. Verify by running the full suite (it should already pass), then add one acceptance test exercising wrap + styling end-to-end through render().

- [ ] **Step 1: Add acceptance test to `src/text-input.test.ts`** (existing imports cover `createElement`, `useState`, `render`, `TestBackend`, `Box`, `Text`):
```ts
test('M1d acceptance: <Box width=10 backgroundColor=blue><Text color=red bold wrap>hello world</Text></Box>', async () => {
  function App() {
    return createElement(Box, { width: 10, height: 3, backgroundColor: 'blue' },
      createElement(Text, { color: 'red', bold: true, wrap: 'wrap' }, 'hello world'),
    );
  }
  const backend = new TestBackend(10, 3);
  await render(createElement(App), backend);
  // Plain text frame: text wraps to two rows; outer bg fills the rest.
  expect(backend.lastFrame).toBe('hello\nworld');
  // Cell-level style: text cells red+bold over blue; bg cells just blue.
  const buf = backend.lastBuffer!;
  expect(buf.get(0, 0)).toEqual({ char: 'h', style: { fg: 'red', bold: true, bg: 'blue' } });
  expect(buf.get(4, 0)).toEqual({ char: 'o', style: { fg: 'red', bold: true, bg: 'blue' } });
  expect(buf.get(5, 0)).toEqual({ char: ' ', style: { bg: 'blue' } });
  expect(buf.get(0, 2)).toEqual({ char: ' ', style: { bg: 'blue' } });
});
```

- [ ] **Step 2: Run, verify PASS** — `npx vitest run src/text-input.test.ts`. Full suite green. Typecheck clean.

   If the text cells DON'T have `bg: 'blue'`: the issue is that `textStyleOf` reads `backgroundColor` off the **text-bearing inst's own props**, but in this test the text-bearing inst is the inner `<Text>` (which renders to a `flowtty-box` with `color: 'red', bold: true, wrap: 'wrap'` props — no `backgroundColor`). The outer `<Box>` has the `backgroundColor`. So `textStyleOf` on the inner text box won't include bg. The expected behavior is to inherit bg from ancestor.
   
   **If that's the case**, two options:
   - (Preferred for M1d) Pass the inherited bg down the `paintInstance` recursion: add a 4th param `inheritedStyle` that text cells merge with their own style. Update the test to reflect inherited behavior.
   - (Alternative) Document that text inherits no styles; require the user to set bg on each Text. Test expectation changes.
   
   Pick the inherited-bg path — it's the natural behavior. Update `paintInstance` accordingly:
   ```ts
   function paintInstance(
     inst: Instance, buffer: Buffer, offsetX: number, offsetY: number,
     inheritedBg: string | undefined = undefined,
   ): void {
     const box: Rect = layoutOf(inst, offsetX, offsetY);
     const ownBg = inst.props.backgroundColor;
     const effectiveBg = ownBg ?? inheritedBg;
     if (ownBg) {
       for (let y = box.top; y < box.top + box.height; y++) {
         for (let x = box.left; x < box.left + box.width; x++) {
           buffer.set(x, y, ' ', { bg: ownBg });
         }
       }
     }
     const text = ownText(inst);
     if (text) {
       const mode = (inst.props.wrap ?? 'none') as WrapMode;
       const lines = mode === 'none' ? text.split('\n') : wrapText(text, box.width, mode);
       const textStyle = textStyleOf(inst);
       if (effectiveBg !== undefined && textStyle.bg === undefined) textStyle.bg = effectiveBg;
       for (let row = 0; row < lines.length; row++) {
         const chars = [...(lines[row] ?? '')];
         for (let col = 0; col < chars.length; col++) {
           buffer.set(box.left + col, box.top + row, chars[col]!, textStyle);
         }
       }
     }
     for (const child of inst.children) {
       if (child.type === 'box') paintInstance(child, buffer, box.left, box.top, effectiveBg);
     }
   }
   ```
   Re-run; the acceptance test should now pass with inherited bg.

- [ ] **Step 3: Commit**
```bash
git add src/paint.ts src/text-input.test.ts
git commit -m "feat: bg inheritance in paint + M1d Text styling acceptance test"
```

---

### Task 8: Public exports + README + final build

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Update `src/index.ts`** — add `TextProps` and `WrapMode` exports:
```ts
export type { TextProps } from './components.js';
export type { WrapMode } from './wrap.js';
```
(Keep all existing exports unchanged.)

- [ ] **Step 2: Update `README.md`** — find the existing `## Status` section and replace with:

```md
## Status

M1d (Text features). `<Text>` now accepts `wrap` (word-wrap with char-wrap
fallback, or `truncate` with single-cell ellipsis), `color`, `bold`, `dim`,
`underline`, `inverse`; `<Box>` accepts `backgroundColor`. Named 16-color
palette only (`black`/`red`/`green`/`yellow`/`blue`/`magenta`/`cyan`/`white`).
Background colors inherit from ancestor boxes into descendant text.

### Usage

\`\`\`tsx
import { render, Box, Text, TtyBackend } from 'flowtty';

render(
  <Box width={20} backgroundColor="blue">
    <Text color="red" bold wrap="wrap">hello world this is a long line</Text>
  </Box>,
  new TtyBackend(),
);
\`\`\`

### Still deferred (later milestones)

- `<Select>` / `<MultiSelect>` / `<Confirm>` prompts — next M1c plan.
- `<Form>` + intra-form focus ring + embedded `openDialog` — the plan after that.
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`) — only the named 16-color palette is recognized.
- Per-character inline style spans, RTL/bidi, CJK/emoji width awareness — assume 1 code point = 1 cell.
- Bracketed paste, mouse, Kitty keyboard protocol, modifier-encoded arrows.
```

(Use real triple-backtick fences when editing.)

- [ ] **Step 3: Final verification:**
- `npx vitest run` → all tests pass.
- `npm run typecheck` → clean.
- `npm run build` → ESM + dts succeed; no warnings.

- [ ] **Step 4: Commit**
```bash
git add src/index.ts README.md
git commit -m "chore: export TextProps + WrapMode; document M1d Text features"
```

---

## Self-Review

**1. Spec coverage:**
- `wrap` mode set (`'wrap'` / `'truncate'` / `'none'`) → Task 1 (algorithm), Task 3 (measure), Task 6 (paint).
- Text styling (`color`/`bold`/`dim`/`underline`/`inverse`) → Task 2 (props), Task 4 (sgr bg + existing fg), Task 6 (paint).
- Box `backgroundColor` (with inheritance into descendant text) → Task 2 (prop), Task 4 (sgr bg), Task 6 + Task 7 (paint + inheritance).
- `TestBackend.lastBuffer` for cell-level style tests → Task 5.

**2. Placeholder scan:** no "TBD" / "implement later". Deferrals (truecolor, inline spans, bidi, CJK) are explicitly named with reasons.

**3. Type consistency:** `WrapMode` (`'wrap'|'truncate'|'none'`) is identical across `wrap.ts`, `host.ts`, `components.ts`, `paint.ts`. `BoxProps` shape additions are read uniformly by `paint` and `refreshMeasure`. `TextProps` shape is local to `components.ts`; `Text` forwards them as `flowtty-box` props which then become `inst.props` consumed by `paint` — no field-name drift between Text→Box→paint.

**Risks worth flagging for the implementer (not blockers):**

1. **`MeasureMode` enum access (Task 3).** Like `FlexDirection`, it's a named export from `'yoga-layout/load'`, NOT on the loaded instance. Re-export through `src/yoga.ts` for consistency with how `FlexDirection` is handled today.

2. **`width === undefined` from Yoga (Task 3).** When `widthMode === Undefined`, Yoga may pass `NaN` or `undefined` as the width arg — the `Number.isFinite(width)` check guards against both. If the wrap branch fires with NaN width, you'll see test failures with absurd dimensions; the finite-check is the fix.

3. **Bg inheritance (Task 7).** The inherited-bg path is the natural behavior most apps want (a panel with a bg should color the text inside it too, even if the text doesn't set its own bg). The alternative (no inheritance) requires every Text to repeat the panel's bg — annoying. The plan walks through this in Task 7 Step 2 because the acceptance test reveals it; expect to land both Tasks 6 and 7's paint changes (the inheritance code shipped in Task 7 supersedes Task 6's simpler version).

4. **The wrap algorithm in `wrap.ts` is char-counted by code units (`.length`), but the wrap by code points (`[...word].length`).** That's intentional for now (M1d assumes 1 code point = 1 cell) — be alert if a future test introduces emoji or CJK and the assertions seem off-by-one.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/m1d-text-features.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Same as M0 / M1a / M1b / M1c.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
