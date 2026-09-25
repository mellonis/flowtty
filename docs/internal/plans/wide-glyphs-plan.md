# Wide glyphs occupy two grid cells — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a double-width glyph (CJK, emoji) occupies two cells of the grid, every width in the library is measured in display columns by one function, and the editor moves by grapheme cluster — so nothing overlaps, no row drifts and no caret lands inside a glyph.

**Architecture:** `packages/core/src/graphemes.ts` segments text into grapheme clusters (`Intl.Segmenter`, fast path for text below U+0300) and measures a cluster's width; `Buffer.set` stores a wide cluster as a lead cell plus a continuation cell with `char: ''` and keeps that pair intact whichever half is overwritten. Measuring (`measureText`, `wrapText`, `inputRows`, `<Table>`, markdown layout) switches to `stringWidth`; paint advances by cluster width; the backends skip continuation cells and drop the `\b` trick; the editor steps by cluster.

**Tech Stack:** TypeScript ESM, React 18 reconciler, Yoga (wasm), Vitest. No new dependencies (`Intl.Segmenter` is part of the runtime).

**Spec:** `docs/internal/plans/wide-glyphs.md` (design, approved 2026-09-25). The plan argues from it; read both.

## Global Constraints

- **No commits by the executor.** The person commits; every task ends with the gate green and the changes left in the working tree. (Their rule, overrides the skill template's commit steps.)
- Gates: `npm test` and `npm run typecheck` from the repo root. Single file: `npx vitest run <path>`.
- `core` imports no react, no yoga on its public surface, no node globals. `Intl.Segmenter` is a JS built-in, allowed.
- Exported functions carry explicit return types and exported consts explicit annotations (oxc dts generator). `.tsx` files import React explicitly.
- Published pages and code comments cite `docs/*.md` only — never this plan, the spec, or an issue number.
- Widths are display columns, measured by `stringWidth`; characters are clusters from `graphemes`; string indices stay UTF-16. A cluster of width 2 is never split at a line, window or clip edge: the column it would have torn is left blank.
- `Cell.char` is a cluster of width 1 or 2, `''` (continuation of the wide cluster to its left, same style), or `' '`. `''` is only ever written by `Buffer.set` itself.
- Commits are the person's: `Ruslan Gilmullin <mellonis@yandex.ru>`. Comments and specs in English.

## Review Focus

Inputs the spec implies but that need a pinned test; each has one in the task that owns the code.

1. **A wide glyph in the last column** of the buffer or of a box's content rect: a blank column, never a torn glyph and never a shifted row. (Task 2, Task 5.)
2. **A mouse press or drag on the right half of a wide glyph**: the selection snaps to the glyph's lead, the overlay covers both cells, the copy contains the glyph. (Task 6.)
3. **A controlled `cursor` handed inside a cluster** (a host sets `cursor` from its own arithmetic): the editor snaps it to the cluster's start before anything else; Backspace and Delete remove the whole cluster. (Task 8.)
4. **A frame diff that replaces a wide glyph with two narrow characters, and the reverse**: both cells are emitted, the physical cursor stays column-aligned, a lone changed space never lands on a glyph's right half. (Task 7.)
5. **Horizontal scrolling of `<TextInput>` through a wide cluster at the window edge**: the cluster leaves a blank column rather than rendering half; the caret cell on a wide cluster spans two columns. (Task 9.)
6. **DEL and C1 controls in text** (U+007F, U+0080–U+009F) reach the terminal raw today; U+009B is CSI. They are painted as a space like C0. (Task 5.)

---

## File Structure

```
tsconfig.base.json                                     # MODIFY — lib adds ES2022.Intl
packages/examples/tsconfig.json                        # MODIFY — same (flat file)
packages/core/src/graphemes.ts                         # CREATE — graphemes, clusterWidth, stringWidth, fitClusters, prevGrapheme, nextGrapheme
packages/core/src/graphemes.spec.ts                    # CREATE
packages/core/src/displayWidth.ts                      # MODIFY — stringWidth moves out; header comment
packages/core/src/displayWidth.spec.ts                 # MODIFY — stringWidth tests move to graphemes.spec
packages/core/src/index.ts                             # MODIFY — exports
packages/react/src/index.ts                            # MODIFY — re-exports
packages/core/src/cells.ts                             # MODIFY — Cell.char contract, Buffer.set invariant
packages/core/src/cells.spec.ts                        # MODIFY
packages/core/src/wrap.ts                              # MODIFY — measure in columns, cut by cluster
packages/core/src/wrap.spec.ts                         # MODIFY
packages/core/src/visualLines.ts                       # MODIFY
packages/core/src/visualLines.spec.ts                  # MODIFY
packages/core/src/inputRows.ts                         # MODIFY — rows by column, col = column
packages/core/src/inputRows.spec.ts                    # MODIFY
packages/core/src/host/host.ts                         # MODIFY — measureText / measure func
packages/core/src/host/host.spec.ts                    # MODIFY
packages/core/src/host/paint.ts                        # MODIFY — cluster loop, clip, run styles, marks
packages/core/src/host/paint.spec.ts                   # MODIFY
packages/core/src/host/selection.ts                    # MODIFY — snap to lead, overlay skips continuations
packages/core/src/host/selection.spec.ts               # MODIFY
packages/tty-backend/src/tty.ts                        # MODIFY — drawFull / drawDiff
packages/tty-backend/src/tty.spec.ts                   # MODIFY
packages/tty-backend/src/bufferToAnsi.ts               # MODIFY
packages/tty-backend/src/bufferToAnsi.spec.ts          # MODIFY
packages/inline-tty-backend/src/InlineTtyBackend.ts    # MODIFY — serializeBuffer
packages/inline-tty-backend/src/InlineTtyBackend.spec.ts # MODIFY
packages/core/src/editor.ts                            # MODIFY — step by cluster
packages/core/src/editor.spec.ts                       # MODIFY
packages/react/src/components/TextInput.tsx            # MODIFY — columns
packages/react/src/components/TextInput.spec.tsx       # MODIFY
packages/react/src/components/TextArea.tsx             # MODIFY — columns
packages/react/src/components/TextArea.spec.tsx        # MODIFY
packages/react/src/components/Table.tsx                # MODIFY — stringWidth
packages/react/src/components/Table.spec.tsx           # MODIFY
packages/react/src/components/markdown/layout.ts       # MODIFY — clusterWidth
packages/react/src/components/Markdown.spec.tsx        # MODIFY
packages/react/src/components/Menu.tsx                 # MODIFY — stringWidth
packages/react/src/components/Menu.spec.tsx            # MODIFY
packages/react/src/components/Shimmer.tsx              # MODIFY — graphemes
packages/react/src/components/Shimmer.spec.tsx         # MODIFY
packages/react/src/internal/render.spec.ts             # MODIFY — end to end
docs/terminal.md, docs/writing-a-backend.md, docs/testing.md, docs/components.md   # MODIFY
CHANGELOG.md, docs/internal/plans/_followups.md, docs/internal/plans/wide-glyphs.md # MODIFY
```

---

### Task 1: Grapheme primitives

**Files:**
- Create: `packages/core/src/graphemes.ts`, `packages/core/src/graphemes.spec.ts`
- Modify: `packages/core/src/displayWidth.ts` (remove `stringWidth`, trim header), `packages/core/src/displayWidth.spec.ts` (move the `stringWidth` describe block), `packages/core/src/index.ts:35`, `packages/react/src/index.ts:68`, `tsconfig.base.json:6`, `packages/examples/tsconfig.json:6`

**Interfaces:**
- Consumes: `charWidth(cp: number): 0 | 1 | 2` from `displayWidth.ts`.
- Produces (all exported from `@flowtty/core` and re-exported by `@flowtty/react`):
  - `graphemes(text: string): string[]`
  - `clusterWidth(cluster: string): 0 | 1 | 2`
  - `stringWidth(text: string): number`
  - `fitClusters(clusters: readonly string[], width: number, from?: number): number` — how many clusters from `from` fit in `width` columns (0 when the first does not).
  - `prevGrapheme(value: string, i: number): number`, `nextGrapheme(value: string, i: number): number` — UTF-16 cluster boundaries.

- [ ] **Step 1: Enable the Segmenter types**

In `tsconfig.base.json` and `packages/examples/tsconfig.json` change `"lib": ["ES2022"]` to `"lib": ["ES2022", "ES2022.Intl"]`.

- [ ] **Step 2: Write the failing tests**

`packages/core/src/graphemes.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { clusterWidth, fitClusters, graphemes, nextGrapheme, prevGrapheme, stringWidth } from './graphemes.js';

describe('graphemes', () => {
  test('plain text splits per character (fast path)', () => {
    expect(graphemes('héllo')).toEqual(['h', 'é', 'l', 'l', 'o']);
    expect(graphemes('')).toEqual([]);
  });
  test('a combining mark joins its base', () => {
    expect(graphemes('café')).toEqual(['c', 'a', 'f', 'é']);
  });
  test('a flag, a skin tone and a ZWJ family are one cluster each', () => {
    expect(graphemes('🇯🇵')).toEqual(['🇯🇵']);
    expect(graphemes('👍🏽')).toEqual(['👍🏽']);
    expect(graphemes('👩‍👧')).toEqual(['👩‍👧']);
  });
  test('CJK splits per ideograph', () => {
    expect(graphemes('日本語')).toEqual(['日', '本', '語']);
  });
});

describe('clusterWidth', () => {
  test('narrow, wide, zero', () => {
    expect(clusterWidth('a')).toBe(1);
    expect(clusterWidth('日')).toBe(2);
    expect(clusterWidth('😀')).toBe(2);
    expect(clusterWidth('́')).toBe(0); // a lone combining mark
    expect(clusterWidth('')).toBe(0);
  });
  test('a combining mark adds nothing to its base', () => {
    expect(clusterWidth('é')).toBe(1);
  });
  test('a flag, a skin tone and a ZWJ family are 2', () => {
    expect(clusterWidth('🇯🇵')).toBe(2);
    expect(clusterWidth('👍🏽')).toBe(2);
    expect(clusterWidth('👩‍👧')).toBe(2);
  });
  test('VS16 makes a narrow base emoji-wide; a lone VS16 stays 0', () => {
    expect(clusterWidth('☑')).toBe(1);
    expect(clusterWidth('☑️')).toBe(2);
    expect(clusterWidth('1️⃣')).toBe(2); // keycap
    expect(clusterWidth('️')).toBe(0);
  });
  test('a control character measures 1: paint substitutes a space for it', () => {
    expect(clusterWidth('\t')).toBe(1);
    expect(clusterWidth('\x1b')).toBe(1);
    expect(clusterWidth('\x7f')).toBe(1);
    expect(clusterWidth('\x9b')).toBe(1);
  });
});

describe('stringWidth', () => {
  test('ASCII is one column per character', () => {
    expect(stringWidth('hello')).toBe(5);
    expect(stringWidth('')).toBe(0);
  });
  test('CJK counts double', () => {
    expect(stringWidth('日本語')).toBe(6);
    expect(stringWidth('aあb')).toBe(4);
  });
  test('decomposed accents do not add width', () => {
    expect(stringWidth('é')).toBe(1);
    expect(stringWidth('café')).toBe(4);
  });
  test('astral code points count once at their true width', () => {
    expect(stringWidth('😀')).toBe(2);
    expect(stringWidth('a😀b')).toBe(4);
  });
  test('clusters that terminals draw as one glyph count 2, not per part', () => {
    expect(stringWidth('🇯🇵')).toBe(2);
    expect(stringWidth('👍🏽')).toBe(2);
    expect(stringWidth('👩‍👧')).toBe(2);
  });
  test('a control character counts the column paint gives it', () => {
    expect(stringWidth('a\tb')).toBe(3);
    expect(stringWidth('\x1b[0m')).toBe(4);
  });
});

describe('fitClusters', () => {
  test('counts the leading clusters that fit the columns', () => {
    expect(fitClusters(['a', 'b', 'c'], 2)).toBe(2);
    expect(fitClusters(['a', 'b', 'c'], 5)).toBe(3);
    expect(fitClusters(['a', 'b', 'c'], 0)).toBe(0);
  });
  test('a wide cluster over the edge does not fit', () => {
    expect(fitClusters(['a', '日', 'b'], 2)).toBe(1);
    expect(fitClusters(['a', '日', 'b'], 3)).toBe(2);
    expect(fitClusters(['日'], 1)).toBe(0);
  });
  test('counts from an offset', () => {
    expect(fitClusters(['a', 'b', '日', 'c'], 3, 1)).toBe(2);
  });
});

describe('prevGrapheme / nextGrapheme', () => {
  test('ASCII steps one unit', () => {
    expect(nextGrapheme('abc', 1)).toBe(2);
    expect(prevGrapheme('abc', 1)).toBe(0);
    expect(nextGrapheme('abc', 3)).toBe(3);
    expect(prevGrapheme('abc', 0)).toBe(0);
  });
  test('an emoji is two units, one step', () => {
    expect(nextGrapheme('a😀b', 1)).toBe(3);
    expect(prevGrapheme('a😀b', 3)).toBe(1);
  });
  test('a flag (four units) and a decomposed accent are one step', () => {
    expect(nextGrapheme('🇯🇵x', 0)).toBe(4);
    expect(prevGrapheme('🇯🇵x', 4)).toBe(0);
    expect(nextGrapheme('éx', 0)).toBe(2);
    expect(prevGrapheme('éx', 2)).toBe(0);
  });
  test('an index inside a cluster resolves to that cluster', () => {
    expect(nextGrapheme('🇯🇵x', 2)).toBe(4);
    expect(prevGrapheme('🇯🇵x', 2)).toBe(0);
    expect(prevGrapheme('a😀b', 2)).toBe(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/core/src/graphemes.spec.ts`
Expected: FAIL — cannot resolve `./graphemes.js`.

- [ ] **Step 4: Write `graphemes.ts`**

```ts
// Grapheme clusters and their display width — the two units of the cell grid.
// A cell holds one cluster (a base plus its combining marks, a flag's two
// regional indicators, an emoji with its skin tone or ZWJ sequence); the
// cluster occupies 1 or 2 columns. See docs/terminal.md (display width).
//
// Segmentation is `Intl.Segmenter`, a runtime built-in (no dependency). Text
// with nothing at or above U+0300 — all Latin and Cyrillic — has no combining
// marks, no wide glyphs and no multi-unit clusters, so it skips the segmenter:
// each UTF-16 unit is its own width-1 character.
import { charWidth } from './displayWidth.js';

const NEEDS_SEGMENTER = /[̀-￿]/;
const VS16 = 0xfe0f;

let segmenter: Intl.Segmenter | null = null;
function segments(text: string): Intl.Segments {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return segmenter.segment(text);
}

/** `text` as grapheme clusters, in order. */
export function graphemes(text: string): string[] {
  if (!NEEDS_SEGMENTER.test(text)) return text.split('');
  const out: string[] = [];
  for (const { segment } of segments(text)) out.push(segment);
  return out;
}

// C0, DEL and C1 have no glyph; paint substitutes a space, so they take a column.
function isControl(cp: number): boolean {
  return cp < 0x20 || (cp >= 0x7f && cp < 0xa0);
}

/**
 * Display columns of one cluster: 2 for East Asian Wide / Fullwidth and emoji
 * presentation, 0 for a lone zero-width mark, 1 otherwise. The width of a
 * multi-code-point cluster is the widest of its parts; a VS16 turns a narrow
 * base into an emoji (2). A terminal that does not join a sequence draws it
 * wider than this says — the known remainder, see docs/terminal.md.
 */
export function clusterWidth(cluster: string): 0 | 1 | 2 {
  if (cluster.length === 0) return 0;
  if (cluster.length === 1 && cluster.charCodeAt(0) < 0x300) return 1;
  let width: 0 | 1 | 2 = 0;
  let vs16 = false;
  for (const ch of cluster) {
    const cp = ch.codePointAt(0)!;
    if (cp === VS16) { vs16 = true; continue; }
    const w = isControl(cp) ? 1 : charWidth(cp);
    if (w > width) width = w;
  }
  return vs16 && width === 1 ? 2 : width;
}

/** Display columns of `text`: the sum of its clusters' widths. Plain text only — styling lives in the cell, not the string. */
export function stringWidth(text: string): number {
  if (!NEEDS_SEGMENTER.test(text)) return text.length;
  let w = 0;
  for (const g of graphemes(text)) w += clusterWidth(g);
  return w;
}

/**
 * How many of `clusters`, from index `from`, fit in `width` columns. A wide
 * cluster that would cross the edge does not fit, so the count can be 0 even
 * with room for one column: the caller decides whether to force progress.
 */
export function fitClusters(clusters: readonly string[], width: number, from = 0): number {
  let n = 0;
  let w = 0;
  for (let i = from; i < clusters.length; i++) {
    const cw = clusterWidth(clusters[i]!);
    if (w + cw > width) break;
    w += cw;
    n++;
  }
  return n;
}

/** UTF-16 index of the end of the cluster containing `i` (`i` on a boundary: the end of the cluster starting there). */
export function nextGrapheme(value: string, i: number): number {
  if (i >= value.length) return value.length;
  if (!NEEDS_SEGMENTER.test(value)) return i + 1;
  const seg = segments(value).containing(i)!;
  return seg.index + seg.segment.length;
}

/** UTF-16 index of the start of the cluster before `i` (`i` inside a cluster: that cluster's start). */
export function prevGrapheme(value: string, i: number): number {
  if (i <= 0) return 0;
  if (!NEEDS_SEGMENTER.test(value)) return i - 1;
  return segments(value).containing(i - 1)!.index;
}
```

- [ ] **Step 5: Move `stringWidth` out of `displayWidth.ts`**

Delete the `stringWidth` function and its doc comment from `displayWidth.ts`. Replace the header's third paragraph (from "This is per-code-point" to "pre-segment.") with: `Per code point. Clusters (flags, skin tones, ZWJ sequences, combining marks) are measured by clusterWidth in graphemes.ts, which builds on this table.` Move the `describe('stringWidth', …)` block out of `displayWidth.spec.ts` (its cases are covered by the new spec; delete it) and drop `stringWidth` from that file's import.

- [ ] **Step 6: Export**

`packages/core/src/index.ts` line 35 becomes:

```ts
export { charWidth } from './displayWidth.js';
export { graphemes, clusterWidth, stringWidth, fitClusters, prevGrapheme, nextGrapheme } from './graphemes.js';
```

`packages/react/src/index.ts` line 68 becomes:

```ts
export { charWidth, graphemes, clusterWidth, stringWidth, fitClusters, prevGrapheme, nextGrapheme } from '@flowtty/core';
```

- [ ] **Step 7: Run the tests and the gate**

Run: `npx vitest run packages/core/src/graphemes.spec.ts packages/core/src/displayWidth.spec.ts` → PASS.
Run: `npm run typecheck && npm test` → green (nothing else uses `stringWidth` on controls; the two backend `\b` tests still pass because `stringWidth('日') === 2`).

---

### Task 2: The Buffer keeps wide clusters whole

**Files:**
- Modify: `packages/core/src/cells.ts` (the `Cell` doc, `Buffer.set`), `packages/core/src/cells.spec.ts`

**Interfaces:**
- Consumes: `clusterWidth` (Task 1), `noteWarning` from `./warnings.js`.
- Produces: `Buffer.set(x, y, char, style?)` — unchanged signature, new invariant (Global Constraints). `Buffer.get(x, y).char === ''` identifies a continuation cell.

- [ ] **Step 1: Write the failing tests** (append to `cells.spec.ts`)

```ts
test('a wide cluster takes a lead cell and a continuation cell with the same style', () => {
  const b = new Buffer(4, 1);
  b.set(0, 0, '日', { bold: true });
  b.set(2, 0, 'x');
  expect(b.get(0, 0)).toEqual({ char: '日', style: { bold: true } });
  expect(b.get(1, 0)).toEqual({ char: '', style: { bold: true } });
  expect(b.get(2, 0).char).toBe('x');
  expect(b.toString()).toBe('日x');
});

test('a flag and a skin-tone emoji are one wide cluster each', () => {
  const b = new Buffer(4, 1);
  b.set(0, 0, '🇯🇵');
  b.set(2, 0, '👍🏽');
  expect(b.get(1, 0).char).toBe('');
  expect(b.get(3, 0).char).toBe('');
  expect(b.toString()).toBe('🇯🇵👍🏽');
});

test('a wide cluster in the last column becomes a blank, never a torn glyph', () => {
  const b = new Buffer(2, 1);
  b.set(1, 0, '日', { bold: true });
  expect(b.get(1, 0)).toEqual({ char: ' ', style: { bold: true } });
});

test('overwriting the lead blanks the continuation', () => {
  const b = new Buffer(3, 1);
  b.set(0, 0, '日', { bold: true });
  b.set(0, 0, 'a');
  expect(b.get(0, 0).char).toBe('a');
  expect(b.get(1, 0)).toEqual({ char: ' ', style: { bold: true } });
});

test('overwriting the continuation blanks the lead', () => {
  const b = new Buffer(3, 1);
  b.set(0, 0, '日', { bold: true });
  b.set(1, 0, 'b');
  expect(b.get(0, 0)).toEqual({ char: ' ', style: { bold: true } });
  expect(b.get(1, 0).char).toBe('b');
});

test('a wide cluster written over the lead of another orphans nothing', () => {
  const b = new Buffer(4, 1);
  b.set(1, 0, '日');       // cells 1,2
  b.set(0, 0, '本');       // cells 0,1 — 日's lead is overwritten, its continuation at 2 must blank
  expect([0, 1, 2, 3].map((x) => b.get(x, 0).char)).toEqual(['本', '', ' ', ' ']);
});

test('a wide cluster written over a continuation blanks that lead and takes its own pair', () => {
  const b = new Buffer(4, 1);
  b.set(0, 0, '日');       // cells 0,1
  b.set(1, 0, '本');       // cells 1,2 — 日 loses its continuation
  expect([0, 1, 2, 3].map((x) => b.get(x, 0).char)).toEqual([' ', '本', '', ' ']);
});

test('set with an empty char is ignored and noted: only set itself writes a continuation', () => {
  const b = new Buffer(2, 1);
  b.set(0, 0, 'a');
  b.set(0, 0, '');
  expect(b.get(0, 0).char).toBe('a');
  expect(takeWarnings().some((w) => w.includes('Buffer.set'))).toBe(true);
});

test('a zero-width cluster never lands in a cell', () => {
  const b = new Buffer(2, 1);
  b.set(0, 0, '́');
  expect(b.get(0, 0).char).toBe(' ');
});

test('clone keeps the pair', () => {
  const b = new Buffer(3, 1);
  b.set(0, 0, '日');
  const c = b.clone();
  c.set(0, 0, 'a');
  expect(b.get(1, 0).char).toBe('');
  expect(c.get(1, 0).char).toBe(' ');
});
```

Add `import { takeWarnings } from './warnings.js';` at the top.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/cells.spec.ts` → the new tests FAIL (continuation cell is `' '`, no blanking).

- [ ] **Step 3: Implement**

In `cells.ts` add imports `import { clusterWidth } from './graphemes.js';` and `import { noteWarning } from './warnings.js';`. Replace the `Cell` interface comment:

```ts
export interface Cell {
  /**
   * One grapheme cluster of display width 1 or 2 (`clusterWidth`), `''` for
   * the continuation column of the wide cluster in the cell to its left (it
   * carries the lead's style), or `' '` filler. Readers that concatenate chars
   * get the row's text for free; a backend skips `''` — the terminal advanced
   * over that column when it drew the lead. See docs/terminal.md (display width).
   */
  char: string;
  style: Style;
}
```

Replace `set`:

```ts
  /**
   * Write one cluster at (x, y). A wide cluster takes this cell and the next
   * (`''`); at the right edge, where it cannot, a blank is written instead.
   * Whichever half of an existing wide cluster this write lands on, the other
   * half becomes a blank in its old style — half a glyph is never left behind.
   * A zero-width cluster (a lone combining mark) has no cell and is stored as
   * a blank; `''` is not accepted, it is what `set` writes, never what it takes.
   */
  set(x: number, y: number, char: string, style: Style = {}): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (char === '') {
      noteWarning('flowtty: Buffer.set was given an empty char; the continuation of a wide glyph is written by set itself. The call was ignored.');
      return;
    }
    const cells = this.cells;
    const i = y * this.width + x;
    this.untear(i, x);
    let w = clusterWidth(char);
    if (w === 0) { char = ' '; w = 1; }
    if (w === 2) {
      if (x + 1 >= this.width) { cells[i] = { char: ' ', style }; return; }
      // The cell to the right becomes this cluster's continuation; if it was
      // the lead of another wide cluster, that one's continuation is orphaned.
      this.untear(i + 1, x + 1);
      cells[i] = { char, style };
      cells[i + 1] = { char: '', style };
      return;
    }
    cells[i] = { char, style };
  }

  // Cell `i` (at column `x`) is about to be overwritten: if it is one half of
  // a wide cluster, blank the other half so the frame never shows a torn glyph.
  private untear(i: number, x: number): void {
    const cells = this.cells;
    if (cells[i]!.char === '') {
      cells[i - 1] = { char: ' ', style: cells[i - 1]!.style }; // a continuation never sits in column 0
    } else if (x + 1 < this.width && cells[i + 1]!.char === '') {
      cells[i + 1] = { char: ' ', style: cells[i + 1]!.style };
    }
  }
```

Also update the `Buffer` `toString` comment to say `''` continuation cells vanish, and in `test-backend.ts` nothing changes.

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/core/src/cells.spec.ts` → PASS. Run `npm test` — expect the two backend tests `backs cursor one column after a wide glyph` to now FAIL on `'x'` overwriting (the test writes `x` at column 1, which blanks the glyph). That is the temporary state the spec accepts between paint and backends; note it and continue. `npm run typecheck` green.

---

### Task 3: wrap and visualLines measure in columns

**Files:**
- Modify: `packages/core/src/wrap.ts`, `packages/core/src/wrap.spec.ts`, `packages/core/src/visualLines.ts`, `packages/core/src/visualLines.spec.ts`

**Interfaces:**
- Consumes: `graphemes`, `stringWidth`, `fitClusters` (Task 1).
- Produces: `wrapText` / `wrapTextLines` / `splitVisualLines` unchanged signatures, widths in columns.

- [ ] **Step 1: Write the failing tests** (append to `wrap.spec.ts`)

```ts
test('wrap mode measures in display columns: CJK wraps at half the characters', () => {
  expect(wrapText('日本語日本語', 6, 'wrap')).toEqual(['日本語', '日本語']);
  expect(wrapText('日本語 abc', 6, 'wrap')).toEqual(['日本語', 'abc']);
});

test('wrap mode never splits a wide cluster: it moves whole to the next line', () => {
  expect(wrapText('a日本', 4, 'wrap')).toEqual(['a日', '本']);
  expect(wrapText('ab日', 3, 'wrap')).toEqual(['ab', '日']);
});

test('wrap mode: a cluster wider than the line still makes progress', () => {
  expect(wrapText('日本', 1, 'wrap')).toEqual(['日', '本']);
});

test('wrap mode: a flag and a decomposed accent are one character', () => {
  expect(wrapText('🇯🇵🇯🇵', 2, 'wrap')).toEqual(['🇯🇵', '🇯🇵']);
  expect(wrapText('café ok', 4, 'wrap')).toEqual(['café', 'ok']);
});

test('truncate mode measures in columns and drops a wide cluster that would not fit before the ellipsis', () => {
  expect(wrapText('日本語', 4, 'truncate')).toEqual(['日…']);
  expect(wrapText('日本語', 5, 'truncate')).toEqual(['日本…']);
  expect(wrapText('日本語', 6, 'truncate')).toEqual(['日本語']);
});

test('the continuation join survives a wrap through wide text', () => {
  expect(wrapTextLines('日本 語', 4, 'wrap')).toEqual([{ text: '日本', continues: ' ' }, { text: '語' }]);
});
```

Append to `visualLines.spec.ts` (check its import line; it imports `splitVisualLines`):

```ts
test('wrap measures in columns and never splits a wide cluster', () => {
  expect(splitVisualLines('a日本', 'wrap', 4).map((l) => l.text)).toEqual(['a日', '本']);
  expect(splitVisualLines('日本語', 'wrap', 4).map((l) => [l.text, l.lineNum])).toEqual([['日本', 1], ['語', null]]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/wrap.spec.ts packages/core/src/visualLines.spec.ts` → the new tests FAIL.

- [ ] **Step 3: Implement `wrap.ts`**

Add `import { fitClusters, graphemes, stringWidth } from './graphemes.js';`. Replace the doc line "Assumes 1 code point = 1 cell (no CJK/emoji width awareness in M1d)." with "Widths are display columns (`stringWidth`); a wide cluster is never split at a break." Replace `truncateLine` and `wrapLine`:

```ts
function truncateLine(line: string, width: number): string {
  if (width <= 0) return '';
  if (stringWidth(line) <= width) return line;
  // Content was cut — always signal it with the ellipsis in the last cell, even
  // when the cut lands on a word boundary (a space). Otherwise the truncation is
  // invisible (e.g. "hello world"/5 would silently render as "hello").
  if (width === 1) return ELLIPSIS;
  const clusters = graphemes(line);
  // A wide cluster that would not fit before the ellipsis is dropped: the line
  // comes out a column short rather than torn.
  return clusters.slice(0, fitClusters(clusters, width - 1)).join('') + ELLIPSIS;
}

function wrapLine(line: string, width: number, out: WrappedLine[]): void {
  if (width === 0) { out.push({ text: '' }); return; }
  if (line === '') { out.push({ text: '' }); return; }

  // Every push but the last of this source line carries what the break that
  // ended it dropped — the one fact `wrapText` used to throw away. The value
  // here is the shape of the break; `recordDropped` widens it to what was
  // actually eaten.
  const push = (text: string, continues: string): void => { out.push({ text, continues }); };

  let current = '';
  let currentWidth = 0;
  for (const word of line.split(' ')) {
    const wordWidth = stringWidth(word);
    const candidateWidth = current ? currentWidth + 1 + wordWidth : wordWidth;
    if (candidateWidth <= width) {
      current = current ? current + ' ' + word : word;
      currentWidth = candidateWidth;
      continue;
    }
    // The line ends here and `word` starts the next one: the space between them
    // is what the wrap dropped.
    if (current) { push(current, ' '); current = ''; currentWidth = 0; }
    if (wordWidth > width) {
      const clusters = graphemes(word);
      let at = 0;
      while (at < clusters.length) {
        // As many clusters as fit, but at least one: a cluster wider than the
        // whole line still has to move. A wide cluster that does not fit
        // starts the next piece whole.
        const take = Math.max(1, fitClusters(clusters, width, at));
        const piece = clusters.slice(at, at + take).join('');
        at += take;
        if (at < clusters.length) push(piece, ''); // a cut through the middle of a word — nothing was dropped at all
        else { current = piece; currentWidth = stringWidth(piece); }
      }
    } else {
      current = word;
      currentWidth = wordWidth;
    }
  }
  if (current) out.push({ text: current });
}
```

- [ ] **Step 4: Implement `visualLines.ts`**

Add `import { fitClusters, graphemes, stringWidth } from './graphemes.js';`. Replace the doc sentence "Width is in cells (counted via `[...line]` for grapheme-naive codepoint iteration — matches flowtty's paint-side width assumptions)." with "Width is in display columns (`stringWidth`); a wide cluster is never split." Replace the loop body from `const chars = [...line];`:

```ts
    if (stringWidth(line) <= width) {
      out.push({ text: line, lineNum: i + 1 });
      continue;
    }
    const clusters = graphemes(line);
    let first = true;
    let at = 0;
    while (at < clusters.length) {
      const take = Math.max(1, fitClusters(clusters, width, at));
      out.push({ text: clusters.slice(at, at + take).join(''), lineNum: first ? i + 1 : null });
      at += take;
      first = false;
    }
```

- [ ] **Step 5: Run the tests and the gate**

Run: `npx vitest run packages/core/src/wrap.spec.ts packages/core/src/visualLines.spec.ts` → PASS. `npm run typecheck` green. `npm test`: the same two backend tests fail as after Task 2, nothing new.

---

### Task 4: inputRows and measureText in columns

**Files:**
- Modify: `packages/core/src/inputRows.ts`, `packages/core/src/inputRows.spec.ts`, `packages/core/src/host/host.ts:406-455`, `packages/core/src/host/host.spec.ts`

**Interfaces:**
- Consumes: `graphemes`, `stringWidth`, `fitClusters`, `clusterWidth` (Task 1).
- Produces: `inputRows(value, width, cursor?)` rows break by column; `caretPosition(value, cursor, width).col` is a column; `rowIndexAt(row, col)` takes a column (a column inside a wide cluster resolves to after it); `measureText(text)` width in columns.

- [ ] **Step 1: Write the failing tests** (append to `inputRows.spec.ts`; check that `rowIndexAt` is imported)

```ts
test('rows break by display column and never split a wide cluster', () => {
  expect(inputRows('日本語', 4).map((r) => [r.text, r.start, r.continuation])).toEqual([['日本', 0, false], ['語', 2, true]]);
  expect(inputRows('a日本', 4).map((r) => r.text)).toEqual(['a日', '本']);
});

test('the caret column is a display column', () => {
  expect(caretPosition('日本語', 2, 10)).toEqual({ row: 0, col: 2 });
  expect(caretPosition('日本語', 4, 10)).toEqual({ row: 0, col: 4 });
  expect(caretPosition('a🇯🇵b', 5, 10)).toEqual({ row: 0, col: 3 }); // after the flag: 1 + 2
});

test('a caret after a row that exactly fills its columns with wide text gets a row of its own', () => {
  expect(inputRows('日本', 4, 2).map((r) => [r.text, r.start])).toEqual([['日本', 0], ['', 2]]);
});

test('rowIndexAt converts a column back to an index; a column inside a wide cluster resolves after it', () => {
  const row = inputRows('a日b', 10)[0]!;
  expect(rowIndexAt(row, 0)).toBe(0);
  expect(rowIndexAt(row, 1)).toBe(1);
  expect(rowIndexAt(row, 2)).toBe(2);
  expect(rowIndexAt(row, 3)).toBe(2);
  expect(rowIndexAt(row, 4)).toBe(3);
});
```

Append to `host.spec.ts` (it imports from `./host.js`; add `measureText` to the import):

```ts
test('measureText measures in display columns', () => {
  expect(measureText('日本語')).toEqual({ width: 6, height: 1 });
  expect(measureText('ab\n🇯🇵')).toEqual({ width: 2, height: 2 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/inputRows.spec.ts packages/core/src/host/host.spec.ts` → new tests FAIL.

- [ ] **Step 3: Implement `inputRows.ts`**

Add `import { clusterWidth, fitClusters, graphemes, stringWidth } from './graphemes.js';`. Rewrite the header's "Units" paragraph:

```ts
// Units: `cursor` and `InputRow.start` are UTF-16 indices into the value (so
// `value.slice(0, cursor)` works), while widths and the caret's `col` are
// display COLUMNS (`stringWidth`) — the grid's unit. Rows break by cluster, so
// a wide cluster (an ideograph, an emoji with its modifiers) is never split
// across rows; one that does not fit the row's last column moves whole to the
// next row. A cursor is always on a cluster boundary (the editor keeps it so).
```

Replace the per-line body of `inputRows`:

```ts
  for (const line of value.split('\n')) {
    const clusters = graphemes(line);
    if (clusters.length === 0) {
      rows.push({ text: '', start: lineStart, continuation: false });
    } else {
      let start = lineStart;
      let at = 0;
      let lastRowFull = false;
      while (at < clusters.length) {
        const take = Math.max(1, fitClusters(clusters, w, at));
        const text = clusters.slice(at, at + take).join('');
        rows.push({ text, start, continuation: at > 0 });
        start += text.length;
        at += take;
        lastRowFull = stringWidth(text) >= w;
      }
      // The caret parked after a line that exactly fills its last row needs a row.
      if (cursor === lineStart + line.length && lastRowFull) {
        rows.push({ text: '', start: cursor, continuation: true });
      }
    }
    lineStart += line.length + 1;
  }
```

Replace `rowIndexAt` and the `col` computation in `caretPosition`:

```ts
/** UTF-16 index of display column `col` within `row` (clamped to its end). A column inside a wide cluster resolves to after it. */
export function rowIndexAt(row: InputRow, col: number): number {
  let width = 0;
  let index = row.start;
  for (const g of graphemes(row.text)) {
    if (width >= col) break;
    width += clusterWidth(g);
    index += g.length;
  }
  return index;
}
```

and in `caretPosition`: `return { row: r, col: stringWidth(value.slice(row.start, c)) };`.

- [ ] **Step 4: Implement `host.ts`**

Add `import { stringWidth } from '../graphemes.js';`. `measureText`: `const width = lines.reduce((m, l) => Math.max(m, stringWidth(l)), 0);`. In `refreshMeasure`: `const longest = lines.reduce((m, l) => Math.max(m, stringWidth(l)), 0);`.

- [ ] **Step 5: Run the tests and the gate**

Run: `npx vitest run packages/core/src/inputRows.spec.ts packages/core/src/host/host.spec.ts packages/core/src/editor.spec.ts` → PASS (the editor's up/down tests use ASCII). `npm run typecheck` green.

---

### Task 5: Paint advances by cluster width

**Files:**
- Modify: `packages/core/src/host/paint.ts:30-62, 227-282`, `packages/core/src/host/paint.spec.ts`

**Interfaces:**
- Consumes: `graphemes`, `clusterWidth`, `stringWidth` (Task 1); `Buffer.set` invariant (Task 2).
- Produces: a painted frame where a wide cluster is a lead + continuation pair; continuation marks span columns.

- [ ] **Step 1: Write the failing tests** (append to `paint.spec.ts`; it has `tree`, `box`, `computeLayout`, `paint`)

```ts
function frameOf(container: Container, width: number, height: number) {
  computeLayout(container, width, height);
  return paint(container, width, height);
}

test('a wide glyph takes two cells: the next character lands two columns on', async () => {
  const container = await tree(box({}, '日x'));
  const b = frameOf(container, 5, 1);
  expect([0, 1, 2].map((x) => b.get(x, 0).char)).toEqual(['日', '', 'x']);
});

test('a wide glyph in a box\'s last content column is blanked, not torn', async () => {
  const container = await tree(box({ width: 3 }, 'ab日'));
  const b = frameOf(container, 6, 1);
  expect([0, 1, 2, 3].map((x) => b.get(x, 0).char)).toEqual(['a', 'b', ' ', ' ']);
});

test('a wide glyph cut by a clip (overflow hidden) is blanked, not torn', async () => {
  const container = await tree(box({ width: 3, overflow: 'hidden' }, box({ width: 6 }, 'ab日x')));
  const b = frameOf(container, 6, 1);
  expect([0, 1, 2, 3].map((x) => b.get(x, 0).char)).toEqual(['a', 'b', ' ', ' ']);
});

test('run styles follow clusters, not code points', async () => {
  const container = await tree(box({ runs: [{ text: '🇯🇵' }, { text: 'x', bold: true }] }));
  const b = frameOf(container, 4, 1);
  expect(b.get(0, 0)).toEqual({ char: '🇯🇵', style: {} });
  expect(b.get(2, 0)).toEqual({ char: 'x', style: { bold: true } });
});

test('a lone combining mark has no cell; DEL and C1 controls paint as a space', async () => {
  const container = await tree(box({}, '́a\x7fb\x9bc'));
  const b = frameOf(container, 6, 1);
  expect([0, 1, 2, 3, 4].map((x) => b.get(x, 0).char)).toEqual(['a', ' ', 'b', ' ', 'c']);
});

test('a continuation mark spans the columns wide text painted', async () => {
  const container = await tree(box({ width: 4, wrap: 'wrap' }, '日本 語'));
  expect(marksOf(container, 4, 2)).toEqual([{ y: 0, x0: 0, x1: 4, join: ' ' }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/host/paint.spec.ts` → new tests FAIL.

- [ ] **Step 3: Implement**

Add `import { clusterWidth, graphemes, stringWidth } from '../graphemes.js';`. In `runStyles` replace `for (const _ch of run.text) out.push(style);` with `for (const _cluster of graphemes(run.text)) out.push(style);` and the comment "One Style per character" with "One Style per cluster". Replace `setClipped`:

```ts
// Gate a buffer write on a clip rect. If clip is null, write unconditionally.
// A wide cluster whose second column is outside the clip would be torn: the
// first column gets a blank instead (the buffer's own edge is Buffer.set's job).
function setClipped(buffer: Buffer, x: number, y: number, char: string, style: Style, clip: Rect | null): void {
  if (clip !== null) {
    if (x < clip.left || y < clip.top || x >= clip.left + clip.width || y >= clip.top + clip.height) return;
    if (x + 1 >= clip.left + clip.width && clusterWidth(char) === 2) char = ' ';
  }
  buffer.set(x, y, char, style);
}
```

Replace the text loop (from `const source = styles ? [...text] : null;` to the end of the `for (let row …)` loop):

```ts
    const source = styles ? graphemes(text) : null;
    let at = 0; // position in `source` of the next cluster to be painted
    for (let row = 0; row < lines.length; row++) {
      const lineText = lines[row]?.text ?? '';
      const clusters = graphemes(lineText);
      // A line the WRAP ended (not a newline in the source) carries on at the
      // start of the next row: mark the span it painted, so a selection over
      // the two rows copies them as the one line they were written as. Only
      // when that next row is actually painted — a line cut off by the content
      // height has nothing below it.
      const continues = lines[row]?.continues;
      if (continues !== undefined && row + 1 < Math.min(lines.length, content.height)) {
        const span = Math.min(stringWidth(lineText), content.width);
        markContinuation(buffer, content.top + row, content.left, content.left + span, continues, clip);
      }
      let col = 0;
      for (const ch of clusters) {
        let style = textStyle;
        if (styles && source) {
          // Wrapping only ever DROPS clusters (the space or line break it
          // breaks at) or adds the truncation ellipsis — so walk the source
          // forward to this cluster. One that isn't there (the ellipsis)
          // takes the style of the text it cuts.
          let found = at;
          while (found < source.length && source[found] !== ch) found++;
          if (found < source.length) { style = styles[found]!; at = found + 1; }
          else style = styles[Math.min(at, styles.length - 1)] ?? textStyle;
        }
        const width = clusterWidth(ch);
        if (width === 0) continue; // a lone zero-width mark has no cell
        if (row < content.height && col < content.width) {
          // Sanitize controls (C0, DEL, C1): emitting them to a TTY moves /
          // resets the cursor (\r → col 0, \b → back, U+009B is CSI) and
          // corrupts subsequent cells in the diff-emitted stream. Substitute a
          // space so the cell is still occupied but inert. Tab/newline
          // included — splitting is handled upstream by wrapText.
          const cp = ch.codePointAt(0)!;
          let safe = cp < 0x20 || (cp >= 0x7f && cp < 0xa0) ? ' ' : ch;
          // A wide cluster in the content rect's last column would be torn.
          if (width === 2 && col + 1 >= content.width) safe = ' ';
          setClipped(buffer, content.left + col, content.top + row, safe, style, clip);
        }
        col += width;
      }
    }
```

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/core/src/host/` → PASS (including `hitTest.spec`, `selection.spec`). Also run `npx vitest run packages/react/src/internal/paint-control-chars.spec.ts` — it may pin the old DEL behaviour; if it asserts DEL is emitted raw, update it to expect a space (the spec's Review Focus 6). `npm run typecheck` green.

---

### Task 6: Selection snaps to a glyph's lead

**Files:**
- Modify: `packages/core/src/host/selection.ts` (`applySelection`, `press`, `extend`, and the code API entry points that take cells), `packages/core/src/host/selection.spec.ts`

**Interfaces:**
- Consumes: `Buffer.get(x, y).char === ''` (Task 2).
- Produces: `applySelection(buffer, segments)` skips continuation cells; a range's anchor / head never sits on a continuation cell.

- [ ] **Step 1: Write the failing tests** (append to `selection.spec.ts`; `bufferOf` there writes per code point — add a column-aware builder)

```ts
function gridOf(lines: string[], width: number): Buffer {
  const b = new Buffer(width, lines.length);
  lines.forEach((line, y) => {
    let x = 0;
    for (const g of graphemes(line)) { b.set(x, y, g); x += clusterWidth(g); }
  });
  return b;
}

test('applySelection restyles both cells of a wide glyph and never writes an empty char', () => {
  const b = gridOf(['日x'], 4);
  const out = applySelection(b, [{ y: 0, x0: 0, x1: 3 }]);
  expect(out.get(0, 0).char).toBe('日');
  expect(out.get(1, 0)).toEqual({ char: '', style: out.get(0, 0).style });
  expect(out.get(0, 0).style).toEqual(selectedStyle({}));
  expect(takeWarnings()).toEqual([]);
});

test('a segment starting on a continuation cell covers the glyph from its lead', () => {
  const b = gridOf(['日x'], 4);
  const out = applySelection(b, [{ y: 0, x0: 1, x1: 3 }]);
  expect(out.get(0, 0).style).toEqual(selectedStyle({}));
  expect(selectionText(b, range([1, 0], [2, 0]))).toBe('日x');
});

test('a double-click inside 日本語 selects the whole word', () => {
  const b = gridOf(['ab 日本語 cd'], 12);
  const scope = { clip: { left: 0, top: 0, width: 12, height: 1 }, excluded: [] };
  const r = wordAt(b, scope, 4, 0)!; // the right half of 日
  expect([r.anchor.x, r.head.x]).toEqual([3, 8]);
  expect(selectionText(b, r)).toBe('日本語');
});
```

Add `import { clusterWidth, graphemes } from '../graphemes.js';` and `import { takeWarnings } from '../warnings.js';`. (`selectionText(buffer, range)` — check its actual signature at the top of the spec and adjust the call.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/host/selection.spec.ts` → the first two FAIL (a warning is noted; the lead is not restyled).

- [ ] **Step 3: Implement**

Add a helper near `wordAt`:

```ts
// The cell to act on for a press at column `x`: the right half of a wide
// glyph belongs to the glyph, so it resolves to the lead on its left.
function leadOf(buffer: Buffer, x: number, y: number): number {
  return x > 0 && buffer.get(x, y).char === '' ? x - 1 : x;
}
```

`applySelection`:

```ts
  for (const seg of segments) {
    // A segment that starts on the right half of a wide glyph covers the glyph.
    const from = leadOf(buffer, seg.x0, seg.y);
    for (let x = from; x < seg.x1; x++) {
      const cell = buffer.get(x, seg.y);
      if (cell.char === '') continue; // restyled with its lead — set writes the pair
      out.set(x, seg.y, cell.char, selectedStyle(cell.style));
    }
  }
```

In `selectionText` (both loops that read `buffer.get(x, row.y).char` — around lines 232 and 632): start each part at `leadOf(buffer, part.x0, y)` so a copy that begins on a continuation includes the glyph. In `press` and `extend`, after `clampToRect`, snap: `const frame = this.host.frame(); if (frame !== null) anchor.x = leadOf(frame, anchor.x, anchor.y);` (same for `head`). `wordAt` and `lineAt` take the cell they are given; `wordAt`'s walk already treats `''` as non-space. The public `select(anchor, head)` entry (if it builds a range directly) snaps the same way.

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/core/src/host/selection.spec.ts packages/react/src/internal/selection.spec.tsx` → PASS. `npm run typecheck` green.

---

### Task 7: The backends skip continuation cells

**Files:**
- Modify: `packages/tty-backend/src/tty.ts:210-290`, `packages/tty-backend/src/tty.spec.ts:346-374`, `packages/tty-backend/src/bufferToAnsi.ts:60-86`, `packages/tty-backend/src/bufferToAnsi.spec.ts:139-146`, `packages/inline-tty-backend/src/InlineTtyBackend.ts:425-449`, `packages/inline-tty-backend/src/InlineTtyBackend.spec.ts:162-173`

**Interfaces:**
- Consumes: `Cell.char === ''` (Task 2). `stringWidth` is no longer imported by the backends.
- Produces: rows exactly `width` columns wide on the terminal; no `\b` anywhere.

- [ ] **Step 1: Rewrite the pinned tests**

`tty.spec.ts`, replace the two `backs cursor` tests:

```ts
test('TtyBackend.draw (full): a wide glyph is written once, its continuation cell emits nothing', () => {
  const { stub: out, writes } = makeStub(4, 1);
  const back = new TtyBackend(out);
  const buf = new Buffer(4, 1);
  buf.set(0, 0, '日'); // cells 0,1
  buf.set(2, 0, 'x');
  buf.set(3, 0, 'y');
  back.draw(buf);
  const drawWrite = writes[1]!;
  expect(drawWrite).not.toContain('\b');
  expect(drawWrite.replace(/\x1b\[[0-9;]*m/g, '')).toContain('日xy');
  back.dispose();
});

test('TtyBackend.draw (diff): a wide glyph replacing two narrow cells keeps the cursor column-aligned', () => {
  const { stub: out, writes } = makeStub(4, 1);
  const back = new TtyBackend(out);
  const buf1 = new Buffer(4, 1);
  buf1.set(0, 0, 'a'); buf1.set(1, 0, 'b'); buf1.set(2, 0, 'c'); buf1.set(3, 0, 'd');
  back.draw(buf1);
  const buf2 = new Buffer(4, 1);
  buf2.set(0, 0, '日'); buf2.set(2, 0, 'c'); buf2.set(3, 0, 'e');
  back.draw(buf2);
  const diff = writes[writes.length - 1]!;
  expect(diff).not.toContain('\b');
  // 日 at column 0 moved the cursor to column 2; 'c' is unchanged; 'e' at 3 needs a move.
  expect(diff).toContain('日');
  expect(diff).toContain(cursorTo(3, 0) + 'e');
  back.dispose();
});

test('TtyBackend.draw (diff): two narrow cells replacing a wide glyph are both emitted, adjacent', () => {
  const { stub: out, writes } = makeStub(4, 1);
  const back = new TtyBackend(out);
  const buf1 = new Buffer(4, 1);
  buf1.set(0, 0, '日'); buf1.set(2, 0, 'c');
  back.draw(buf1);
  const buf2 = new Buffer(4, 1);
  buf2.set(0, 0, 'a'); buf2.set(1, 0, 'b'); buf2.set(2, 0, 'c');
  back.draw(buf2);
  const diff = writes[writes.length - 1]!;
  expect(diff).toContain('ab');
  expect(diff).not.toContain(cursorTo(1, 0));
  back.dispose();
});
```

(`cursorTo` is exported from `./ansi.js`; import it in the spec if it is not already.)

`InlineTtyBackend.spec.ts`, replace the `backs cursor` test:

```ts
  test('serializeBuffer writes a wide glyph once and nothing for its continuation cell', () => {
    const out = mockStdout(10);
    const b = new InlineTtyBackend({ out, in: mockStdin(), liveHeight: 1 });
    const buf = new Buffer(4, 1);
    buf.set(0, 0, '日', {});
    buf.set(2, 0, 'x', {});
    b.draw(buf);
    const text = out.captured();
    expect(text).not.toContain('\b');
    expect(text.replace(/\x1b\[[0-9;]*m/g, '')).toContain('日x');
    b.dispose();
  });
```

`bufferToAnsi.spec.ts`, replace the `wide glyph` test:

```ts
test('a wide glyph is written once; its continuation cell emits nothing', () => {
  const buffer = new Buffer(3, 1);
  buffer.set(0, 0, '日');
  buffer.set(2, 0, 'x');
  expect(bufferToAnsi(buffer, opts)).toBe('日x');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/tty-backend packages/inline-tty-backend` → the rewritten tests FAIL (`\b` present).

- [ ] **Step 3: Implement `tty.ts`**

`drawFull`, inside the `x` loop, first line: `if (cell.char === '') continue; // the continuation of the wide glyph just written: the terminal advanced over it`. Delete the `\b` block and its comment. `drawDiff`, after `if (cellsEqual(a, b)) continue;`: `if (b.char === '') continue; // never emitted; the lead before it moved the cursor past it`. Replace the `\b` block with:

```ts
        out += b.char;
        // A wide glyph moved the cursor two columns: the cell after its
        // continuation is the adjacent one.
        lastX = next.get(x + 1, y).char === '' ? x + 1 : x;
        lastY = y;
```

Remove the `stringWidth` import if nothing else in the file uses it.

- [ ] **Step 4: Implement `InlineTtyBackend.ts` and `bufferToAnsi.ts`**

`serializeBuffer`: first line of the `x` loop `if (cell.char === '') continue;`, delete the `\b` block. `bufferToAnsi`: first line of the cell loop `if (cell.char === '') continue;`; replace the long `\b` comment with: `// A continuation cell emits nothing: the wide glyph before it already took its column. See docs/terminal.md (display width).` Remove unused `stringWidth` imports.

- [ ] **Step 5: Run the gate**

Run: `npm test` → fully green again (the temporary failures from Task 2 are gone). `npm run typecheck` green.

---

### Task 8: The editor steps by cluster

**Files:**
- Modify: `packages/core/src/editor.ts:4-17, 76-80, 127-128, 168-175`, `packages/core/src/editor.spec.ts`

**Interfaces:**
- Consumes: `prevGrapheme`, `nextGrapheme` (Task 1).
- Produces: `reduce` keeps `cursor` on a cluster boundary; Left/Right/Backspace/Delete step a cluster.

- [ ] **Step 1: Write the failing tests** (append to `editor.spec.ts`)

```ts
test('left and right step over a flag and a decomposed accent as one character', () => {
  expect(reduce(s('a🇯🇵b', 5), key({ name: 'left' }))).toEqual({ kind: 'edit', state: s('a🇯🇵b', 1) });
  expect(reduce(s('a🇯🇵b', 1), key({ name: 'right' }))).toEqual({ kind: 'edit', state: s('a🇯🇵b', 5) });
  expect(reduce(s('éx', 2), key({ name: 'left' }))).toEqual({ kind: 'edit', state: s('éx', 0) });
});

test('backspace and delete remove a whole cluster', () => {
  expect(reduce(s('a🇯🇵b', 5), key({ name: 'backspace' }))).toEqual({ kind: 'edit', state: s('ab', 1) });
  expect(reduce(s('a🇯🇵b', 1), key({ name: 'delete' }))).toEqual({ kind: 'edit', state: s('ab', 1) });
  expect(reduce(s('café', 5), key({ name: 'backspace' }))).toEqual({ kind: 'edit', state: s('caf', 3) });
});

test('a cursor handed inside a cluster snaps to its start before anything else', () => {
  expect(reduce(s('a🇯🇵b', 3), key({ name: 'right' }))).toEqual({ kind: 'edit', state: s('a🇯🇵b', 5) });
  expect(reduce(s('a🇯🇵b', 3), key({ name: 'x' }))).toEqual({ kind: 'edit', state: s('ax🇯🇵b', 2) });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/editor.spec.ts` → new tests FAIL.

- [ ] **Step 3: Implement**

Replace lines 13–17 (`isHigh`, `isLow`, `prevIndex`, `nextIndex`) with `import { nextGrapheme, prevGrapheme } from './graphemes.js';` at the top (keep the other imports). Update the `EditorState.cursor` doc: "movement and deletion step over a whole grapheme cluster (an emoji with its modifiers, a flag, a base with its combining marks), and a cursor handed in inside a cluster is snapped to its start before anything else." Replace the snap in `reduce`:

```ts
  // Never edit from inside a cluster: snap to the start of the one the cursor is in.
  let cursor = Math.max(0, Math.min(value.length, state.cursor));
  if (cursor < value.length) cursor = prevGrapheme(value, nextGrapheme(value, cursor));
```

Replace `prevIndex(value, cursor)` with `prevGrapheme(value, cursor)` (Left, Backspace) and `nextIndex(value, cursor)` with `nextGrapheme(value, cursor)` (Right, Delete). Search the file for any other use of `isHigh` / `isLow` (`wordLeft` / `wordRight` do not use them); none should remain.

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/core/src/editor.spec.ts` → PASS. `npm run typecheck` green.

---

### Task 9: TextInput works in columns

**Files:**
- Modify: `packages/react/src/components/TextInput.tsx:101-151, 160-170`, `packages/react/src/components/TextInput.spec.tsx`

**Interfaces:**
- Consumes: `graphemes`, `clusterWidth`, `stringWidth` (Task 1, via `@flowtty/core`).
- Produces: a `<TextInput>` whose caret column, scroll window and padding are display columns.

- [ ] **Step 1: Write the failing tests** (append to `TextInput.spec.tsx`; it renders with `createElement` and reads `backend.lastFrame` / `backend.lastBuffer`)

```ts
test('the caret on a wide glyph covers both of its cells', async () => {
  function App() {
    return createElement(TextInput, { value: 'a日b', onChange: () => {}, isFocused: true, frame: 'none' });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  // The caret starts at the end; two steps left put it on 日 (the editor steps by cluster).
  backend.press({ name: 'left' });
  backend.press({ name: 'left' });
  await flush();
  const buf = backend.lastBuffer!;
  expect([0, 1, 2, 3].map((x) => buf.get(x, 0).char)).toEqual(['a', '日', '', 'b']);
  expect(buf.get(1, 0).style.inverse).toBe(true);
  expect(buf.get(2, 0).style.inverse).toBe(true);
  expect(buf.get(3, 0).style.inverse).toBeUndefined();
});

test('scrolling through wide text leaves a blank column instead of half a glyph at the window edge', async () => {
  function App() {
    return createElement(TextInput, { value: '日本語日本語', onChange: () => {}, width: 5, isFocused: true, frame: 'none' });
  }
  const backend = new TestBackend(5, 1);
  await render(createElement(App), backend);
  await flush(); // onLayout has delivered the width
  // Caret at the end (column 12) → window is columns [8, 13): '語' (10–11), the caret cell (12); column 8–9 holds '本' whole.
  expect(backend.lastFrame).toBe('本語');
  backend.press({ name: 'home' });
  await flush();
  // Window [0, 5): 日 (0–1), 本 (2–3), 語 would need 4–5 → blank at 4.
  expect(backend.lastFrame).toBe('日本');
});

test('a masked value shows one dot per cluster', async () => {
  function App() {
    return createElement(TextInput, { value: '🇯🇵a', onChange: () => {}, mask: true, frame: 'none' });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('••');
});
```

`isFocused`, `frame` and `mask` are the component's prop names; there is no controlled `cursor` prop, so the caret is moved with keys.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/react/src/components/TextInput.spec.tsx` → new tests FAIL.

- [ ] **Step 3: Implement**

Import `graphemes, clusterWidth, stringWidth` from `@flowtty/core`. Replace lines 101–151 (from the "Everything below works in CHARACTERS" comment to `const display = chars.join('');`):

```tsx
  // Everything below works in display COLUMNS, the grid's unit: an emoji is two
  // UTF-16 units, one cluster and two columns, so neither slicing the string by
  // `cursor` nor counting characters would place the caret. `cursor` itself
  // stays a UTF-16 index (see EditorState).
  const clusters = graphemes(mask ? '•'.repeat(graphemes(value).length) : value);
  const widths = clusters.map(clusterWidth);
  // cols[i] is the column cluster i starts at; cols[clusters.length] the total width.
  const cols: number[] = [0];
  for (const w of widths) cols.push(cols[cols.length - 1]! + w);
  const total = cols[clusters.length]!;
  const caretIdx = graphemes(value.slice(0, safeCursor)).length;
  const caretCol = cols[caretIdx]!;
  const caretWidth = caretIdx < clusters.length ? widths[caretIdx]! : 1;

  // Always render exactly `width` cells (or the natural value+cursor when width
  // is unknown — one-frame placeholder until onLayout fires).
  // Scroll-offset rules:
  //   1. Keep the caret cell in the viewport: clamp when it leaves [off, off+w).
  //   2. Slide LEFT when content shrinks: don't leave trailing empty space at
  //      the right while leading content is still scrolled off-screen. Gives
  //      q[qqqqqqqq#] → [qqqqqqqq#] → [qqqqqqq# ] as user deletes.
  const scrollOffsetRef = useRef(0);
  let off: number;
  let windowEnd: number;
  if (width === null) {
    off = 0;
    windowEnd = total + caretWidth;
  } else {
    const w = width;
    if (caretCol < scrollOffsetRef.current) scrollOffsetRef.current = caretCol;
    if (caretCol + caretWidth > scrollOffsetRef.current + w) scrollOffsetRef.current = caretCol + caretWidth - w;
    const maxUseful = Math.max(0, total + 1 - w);
    if (scrollOffsetRef.current > maxUseful) scrollOffsetRef.current = maxUseful;
    off = scrollOffsetRef.current;
    windowEnd = off + w;
  }

  // The text in columns [from, to): clusters fully inside, and a blank for
  // each column of a cluster the edge cuts — never half a glyph.
  const columnsOf = (from: number, to: number): string => {
    let out = '';
    for (let i = 0; i < clusters.length; i++) {
      const a = cols[i]!;
      const b = cols[i + 1]!;
      if (b <= from || a >= to) continue;
      out += a >= from && b <= to ? clusters[i]! : ' '.repeat(Math.min(b, to) - Math.max(a, from));
    }
    return out;
  };

  // Split the visible display around the cursor. The cursor consumes one cell
  // (two for a wide cluster): either the cluster at the caret (rendered with
  // inverse) or CURSOR_AT_END (space + inverse = solid filled cell) when the
  // caret is past end-of-value.
  const before = columnsOf(off, caretCol);
  const cursorChar = caretIdx < clusters.length ? clusters[caretIdx]! : CURSOR_AT_END;
  // Pad "after" with trailing spaces to fill the viewport — these become visible
  // blank cells (with the lightgray bg) instead of leaving previous content behind.
  const afterText = columnsOf(caretCol + caretWidth, windowEnd);
  const afterLen = Math.max(0, windowEnd - caretCol - caretWidth);
  const after = afterText + (width === null ? '' : ' '.repeat(Math.max(0, afterLen - stringWidth(afterText))));
  const display = clusters.join('');
```

Then: `renderedRef.current = total + (isFocused ? 1 : 0);` and in the unfocused branch `display + ' '.repeat(Math.max(0, width - total))`. Remove the now-unused `chars` references (search the file).

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/react/src/components/TextInput.spec.tsx packages/react/src/components/Form.spec.tsx packages/react/src/components/Confirm.spec.tsx` → PASS. `npm run typecheck` green.

---

### Task 10: TextArea works in columns

**Files:**
- Modify: `packages/react/src/components/TextArea.tsx:153-172`, `packages/react/src/components/TextArea.spec.tsx`

**Interfaces:**
- Consumes: `graphemes`, `clusterWidth`, `stringWidth`, `fitClusters` (Task 1); `caretPosition().col` in columns (Task 4).
- Produces: a `<TextArea>` whose caret cell is the cluster at the caret column.

- [ ] **Step 1: Write the failing tests** (append to `TextArea.spec.tsx`; use its `mount` helper, which exposes `frame()` and the backend)

```ts
  test('the caret sits on a wide glyph as one cell of two columns; rows never split a glyph', async () => {
    const t = await mount('日本語日本語', {}, 6, 3);
    // Width 6 minus nothing: the value is 12 columns → two rows of three ideographs.
    expect(await t.frame()).toEqual(['日本語', '日本語', '']);
    t.backend.press({ name: 'home' });
    await flushAsync(t.backend);
    const buf = t.backend.lastBuffer!;
    expect(buf.get(0, 0).char).toBe('日');
    expect(buf.get(0, 0).style.inverse).toBe(true);
    expect(buf.get(1, 0).style.inverse).toBe(true);
    expect(buf.get(2, 0).style.inverse).toBeUndefined();
  });
```

(Adjust to `mount`'s return shape — it returns an object with `frame`, `caret` and presumably `backend`; if the backend is not returned, extend the helper to return it.) The frame's third row is whatever the component renders for the empty row after a full last row — check by running and pin the observed shape if it differs.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/react/src/components/TextArea.spec.tsx` → FAIL.

- [ ] **Step 3: Implement**

Import `graphemes, clusterWidth, stringWidth, fitClusters` from `@flowtty/core`. Replace lines 155–172 (from `// Characters, not UTF-16 units` to `const dimAfter = …`):

```tsx
          // Clusters, not UTF-16 units — and the caret's `col` is a display
          // column: a wide glyph is one cluster of two columns and is never
          // sliced in two.
          const cells = graphemes(row.text);
          const rowWidth = stringWidth(row.text);
          const ghost = isLastRow ? graphemes(trailing) : [];
          const tailCells = ghost.slice(0, fitClusters(ghost, Math.max(0, wrapWidth - rowWidth)));
          const tail = tailCells.join('');
          if (!isCaretRow) {
            return (
              <Box key={r} flexDirection="row">
                <Text color={textColor}>{row.text}</Text>
                {tail ? <Text {...faded}>{tail}</Text> : null}
              </Box>
            );
          }
          // The cluster the caret column starts: rows begin on cluster
          // boundaries and the editor keeps the cursor on one, so the column
          // is always a cluster start.
          let caretIdx = 0;
          for (let c = 0; caretIdx < cells.length && c < caret.col; caretIdx++) c += clusterWidth(cells[caretIdx]!);
          const before = cells.slice(0, caretIdx).join('');
          const onText = caretIdx < cells.length;
          const caretChar = onText ? cells[caretIdx]! : tailCells[0] ?? CURSOR_AT_END;
          const after = onText ? cells.slice(caretIdx + 1).join('') : '';
          const dimAfter = onText ? tail : tailCells.slice(1).join('');
```

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/react/src/components/TextArea.spec.tsx` → PASS. `npm run typecheck` green.

---

### Task 11: Table columns in display width

**Files:**
- Modify: `packages/react/src/components/Table.tsx:74-96, 172-173`, `packages/react/src/components/Table.spec.tsx`

**Interfaces:**
- Consumes: `graphemes`, `stringWidth`, `fitClusters` (Task 1).
- Produces: `<Table>` whose column widths, truncation and padding are display columns.

- [ ] **Step 1: Write the failing test** (inside the `describe('Table')`)

```tsx
  test('rows with CJK and emoji keep the rules aligned', async () => {
    const backend = new TestBackend(30, 8);
    const columns: TableColumn<{ name: string; qty: number }>[] = [
      { accessor: 'name', header: 'Name' },
      { accessor: 'qty', header: 'Qty', align: 'right' },
    ];
    const data = [{ name: '日本語', qty: 3 }, { name: '🇯🇵 flag', qty: 12 }, { name: 'plain', qty: 7 }];
    const r = await render(<Table data={data} columns={columns} width={30} />, backend);
    await flushAsync(backend);
    const buf = backend.lastBuffer!;
    const row = (y: number) => Array.from({ length: buf.width }, (_, x) => buf.get(x, y).char).join('');
    // Every row's rightmost border sits in the same column.
    const rightBar = (y: number) => stringWidth(row(y).trimEnd()) - 1;
    const ys = [0, 1, 2, 3, 4, 5];
    expect(ys.map(rightBar)).toEqual(ys.map(() => rightBar(0)));
    expect(backend.lastFrame).toContain('│ 日本語  │');
    r.unmount();
  });

  test('a cell truncates by cluster, never leaving half a glyph before the ellipsis', async () => {
    const backend = new TestBackend(20, 4);
    const columns: TableColumn<{ name: string }>[] = [{ accessor: 'name', header: 'N', width: 4 }];
    const r = await render(<Table data={[{ name: '日本語' }]} columns={columns} width={20} border="none" />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('日…');
    r.unmount();
  });
```

(Import `stringWidth` from `@flowtty/core`; check the `border` prop's exact name and the exact spacing of the bordered row by running once and pinning what `fitCell` produces: header `Name` pads to the widest cell, `🇯🇵 flag` = 7 columns.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/react/src/components/Table.spec.tsx` → FAIL (columns misaligned).

- [ ] **Step 3: Implement**

Import `graphemes, stringWidth, fitClusters` from `@flowtty/core`. Delete `cpLen`; replace `fitCell`:

```ts
// Truncate to `width` display columns with a trailing ellipsis, then pad to
// exactly `width` per `align`. A wide cluster that would not fit before the
// ellipsis is dropped, never torn (see docs/terminal.md, display width).
function fitCell(raw: string, width: number, align: TableAlign): string {
  if (width <= 0) return '';
  let body: string;
  if (stringWidth(raw) > width) {
    if (width === 1) body = '…';
    else {
      const clusters = graphemes(raw);
      body = clusters.slice(0, fitClusters(clusters, width - 1)).join('') + '…';
    }
  } else {
    body = raw;
  }
  const deficit = width - stringWidth(body);
  if (deficit <= 0) return body;
  if (align === 'right') return ' '.repeat(deficit) + body;
  if (align === 'center') {
    const left = deficit >> 1;
    return ' '.repeat(left) + body + ' '.repeat(deficit - left);
  }
  return body + ' '.repeat(deficit);
}
```

Lines 172–173: `cpLen(` → `stringWidth(`. Update the `width` prop docs ("Fixed content width (cells…)") to say display columns.

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/react/src/components/Table.spec.tsx` → PASS. `npm run typecheck` green.

---

### Task 12: Markdown layout in display width

**Files:**
- Modify: `packages/react/src/components/markdown/layout.ts:135, 140-154, 454-463`, `packages/react/src/components/Markdown.spec.tsx:123-139`

**Interfaces:**
- Consumes: `graphemes`, `clusterWidth`, `stringWidth` (Task 1).
- Produces: `StyledChar.ch` is a cluster; every width in the module is display columns.

- [ ] **Step 1: Rewrite the pinned test** (`Markdown.spec.tsx:123-139`)

```tsx
  // Table columns line up in display columns: a wide glyph takes two cells.
  test('table columns line up when a row has wide glyphs', async () => {
    const backend = new TestBackend(40, 8);
    const md = '| Status | Qty |\n| :-- | --: |\n| ✅ Done | 11 |\n| 日本語 | 3 |\n| 🇯🇵 flag | 5 |\n| plain | 7 |';
    const r = await render(<Markdown width={40}>{md}</Markdown>, backend);
    await flushAsync(backend);

    const buf = backend.lastBuffer!;
    const lastX = (y: number) => {
      let x = buf.width - 1;
      while (x >= 0 && buf.get(x, y).char === ' ') x--;
      return x;
    };
    const ys = [0, 1, 2, 3, 4, 5];
    expect(ys.map(lastX)).toEqual(ys.map(() => lastX(0)));
    r.unmount();
  });

  test('a fenced code line with wide glyphs hard-wraps by column, never through a glyph', async () => {
    const backend = new TestBackend(4, 3);
    const r = await render(<Markdown width={4} codeWrap="wrap">{'```\na日本\n```'}</Markdown>, backend);
    await flushAsync(backend);
    const rows = backend.lastFrame.split('\n');
    expect(rows.some((l) => l.includes('a日'))).toBe(true);
    expect(rows.some((l) => l.includes('本'))).toBe(true);
    r.unmount();
  });
```

(Check the name of the code-wrap prop on `<Markdown>` in `Markdown.tsx` — the type is `MarkdownCodeWrap`; use the prop the component exposes, and drop the fenced-block frame if it eats the width: the point is the split, adjust the width so a row holds exactly `a日`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/react/src/components/Markdown.spec.tsx` → FAIL.

- [ ] **Step 3: Implement**

Import `graphemes, clusterWidth, stringWidth` from `@flowtty/core`. Line 135: `for (const ch of graphemes(s.text)) out.push({ ch, style });`. Replace lines 140–154 (the `cellWidth` comment and the three helpers):

```ts
// The unit every measurement here uses: display columns. `StyledChar.ch` is a
// grapheme cluster and takes the columns `clusterWidth` says (an ideograph or
// an emoji two, a base with its combining marks one). `<Table>` measures the
// same way. See docs/terminal.md (display width).
const cellWidth = (c: StyledChar): number => clusterWidth(c.ch);

function charsWidth(chars: StyledChar[]): number {
  let n = 0;
  for (const c of chars) n += cellWidth(c);
  return n;
}

const textWidth = stringWidth;
```

Replace `splitCodeChars`:

```ts
function splitCodeChars(chars: StyledChar[], width: number, mode: MarkdownCodeWrap): StyledChar[][] {
  if (charsWidth(chars) <= width) return [chars];
  if (mode === 'truncate') {
    // Keep what fits in width − 1 columns; the ellipsis wears the style of the
    // first cluster it replaced. A wide cluster that would cross the edge is dropped.
    const keep: StyledChar[] = [];
    let w = 0;
    for (const c of chars) {
      const cw = cellWidth(c);
      if (w + cw > Math.max(0, width - 1)) break;
      keep.push(c);
      w += cw;
    }
    return [[...keep, { ch: '…', style: chars[keep.length]!.style }]];
  }
  const rows: StyledChar[][] = [];
  let row: StyledChar[] = [];
  let w = 0;
  for (const c of chars) {
    const cw = cellWidth(c);
    // A row takes at least one cluster, so a glyph wider than the row still moves.
    if (row.length > 0 && w + cw > width) { rows.push(row); row = []; w = 0; }
    row.push(c);
    w += cw;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}
```

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/react/src/components/Markdown.spec.tsx packages/react/src/components/markdown` → PASS. `npm run typecheck` green.

---

### Task 13: Menu and Shimmer

**Files:**
- Modify: `packages/react/src/components/Menu.tsx:71-84, 304`, `packages/react/src/components/Menu.spec.tsx`, `packages/react/src/components/Shimmer.tsx:91`, `packages/react/src/components/Shimmer.spec.tsx`

**Interfaces:**
- Consumes: `stringWidth`, `graphemes` (Task 1).
- Produces: menu panels sized in columns; the shimmer band steps by cluster.

- [ ] **Step 1: Write the failing tests**

`Menu.spec.tsx` (inside the describe; open the panel the way the existing tests do — F10 then Enter — and read `backend.lastFrame`):

```tsx
  test('a panel with a CJK label is wide enough for it', async () => {
    const backend = new TestBackend(40, 6);
    const items: MenuItem[] = [{ key: 'f', label: 'File', submenu: [
      { key: 'a', label: '日本語', onSelect: () => {} },
      { key: 'b', label: 'ab', onSelect: () => {} },
    ] }];
    await render(createElement(DialogHost, null, createElement(Menu, { items })), backend);
    await flushAsync(backend);
    backend.press({ name: 'f10' });
    await flushAsync(backend);
    backend.press({ name: 'return' });
    await flushAsync(backend);
    const rows = backend.lastFrame.split('\n');
    const cjk = rows.find((l) => l.includes('日本語'))!;
    const ab = rows.find((l) => l.includes(' ab'))!;
    expect(stringWidth(cjk.trimEnd())).toBe(stringWidth(ab.trimEnd()));
  });
```

(Import `stringWidth` from `@flowtty/core`. Check how the existing tests open a submenu — the key names may differ — and mirror them.)

`Shimmer.spec.tsx` (inside the describe; use its `step`, `cellsIn` helpers):

```tsx
  test('a wide glyph under the band is one step of two columns', async () => {
    const backend = new TestBackend(10, 1);
    await render(<Shimmer highlight="cyan" width={1} interval={100}>{'a日b'}</Shimmer>, backend);
    await flushAsync(backend);
    expect(cellsIn(backend, 4, 'cyan')).toEqual([0]);
    await step(backend, 100);
    expect(cellsIn(backend, 4, 'cyan')).toEqual([1, 2]); // the glyph and its continuation cell
    await step(backend, 100);
    expect(cellsIn(backend, 4, 'cyan')).toEqual([3]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/react/src/components/Menu.spec.tsx packages/react/src/components/Shimmer.spec.tsx` → FAIL.

- [ ] **Step 3: Implement**

`Menu.tsx`: import `stringWidth` from `@flowtty/core`; replace the three `[...item.label].length` / `[...it.label].length` with `stringWidth(item.label)` / `stringWidth(it.label)` (lines 72, 77, 83, 304 — `labelArea` at 77 is unused; drop it if the typecheck complains). `Shimmer.tsx`: import `graphemes`; line 91 `const chars = graphemes(children);`. Update the doc comment above the component that says characters are code points: "Characters are grapheme clusters: a wide glyph is one character and the band walks over it as one step of two columns."

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run packages/react/src/components/Menu.spec.tsx packages/react/src/components/Shimmer.spec.tsx` → PASS. `npm run typecheck` green.

---

### Task 14: End to end, documents, CHANGELOG

**Files:**
- Modify: `packages/react/src/internal/render.spec.ts`, `docs/terminal.md:44-64, 362-369`, `docs/writing-a-backend.md:36-38`, `docs/testing.md:80-86`, `docs/components.md:276-283, 326-329, 373-376, 748-757`, `CHANGELOG.md`, `docs/internal/plans/_followups.md`, `docs/internal/plans/wide-glyphs.md`

- [ ] **Step 1: Write the end-to-end test** (append to `render.spec.ts`, using its render idiom with `TestBackend`)

```ts
test('wide glyphs keep a row layout column-aligned end to end', async () => {
  const backend = new TestBackend(12, 2);
  await render(
    createElement(Box, { flexDirection: 'column' },
      createElement(Box, { flexDirection: 'row' }, createElement(Text, null, '日本語'), createElement(Text, null, '|')),
      createElement(Box, { flexDirection: 'row' }, createElement(Text, null, 'abcdef'), createElement(Text, null, '|')),
    ),
    backend,
  );
  await flushAsync(backend);
  expect(backend.lastFrame).toBe('日本語|\nabcdef|');
  expect(backend.lastBuffer!.get(6, 0).char).toBe('|');
  expect(backend.lastBuffer!.get(6, 1).char).toBe('|');
});
```

Run: `npx vitest run packages/react/src/internal/render.spec.ts` → PASS (it should already; it pins the whole chain).

- [ ] **Step 2: docs/terminal.md**

Replace the "Display width" section (lines 44–64) with:

```markdown
## Display width

The grid's unit is the display **column**, and a cell holds one **grapheme
cluster**: a base with its combining marks, a flag's two regional indicators,
an emoji with its skin tone or ZWJ sequence. A cluster occupies one column, or
two for East Asian Wide / Fullwidth glyphs and emoji presentation; a wide
cluster takes two cells of the grid, and nothing ever draws over its second
half. Zero-width marks never take a cell of their own.

`stringWidth(str)` measures a string in columns; `graphemes(str)` splits it
into clusters; `clusterWidth(cluster)` measures one; `fitClusters(clusters,
width)` says how many leading clusters fit a width; `prevGrapheme` /
`nextGrapheme` step a UTF-16 index over one cluster. `charWidth(codePoint)` is
the per-code-point table underneath (Markus Kuhn's combining set plus the East
Asian Wide / Fullwidth blocks — inlined, no dependency). Every component
measures with these; use them to align columns or budget a row when laying
out your own content.

```ts
import { stringWidth, graphemes } from '@flowtty/react';

stringWidth('café');    // 4  (a combining accent adds 0)
stringWidth('日本語');  // 6  (each ideograph is 2)
stringWidth('a😀b');    // 4
stringWidth('🇯🇵👍🏽');  // 4  (a flag and a toned thumb: one cluster of 2 each)
graphemes('éx'); // ['é', 'x']
```

A control character measures 1: paint substitutes a space for it. Expects
plain text — styling lives in the cell, not the string.

**The remainder.** Terminals do not all agree on emoji: one that does not join
a ZWJ sequence draws it wider than 2, and a code point newer than the tables
may be drawn wide where flowtty counts 1. Such a row drifts by a column on
that terminal. flowtty measures by its tables and does not probe the terminal.
```

Delete the first bullet of "Still deferred" (lines 362–369, the wide-character rendering paragraph).

- [ ] **Step 3: docs/writing-a-backend.md**

Extend the `draw` bullet (line 36) with:

```markdown
  A cell's `char` is one grapheme cluster, or `''` for the second column of a
  wide cluster (CJK, emoji) in the cell to its left: write the lead and skip
  the `''` cell — the terminal advanced two columns when it drew the lead. A
  backend that diffs frames must remember that: after a wide cluster at `x`,
  the cell at `x + 2` is the adjacent one. See docs/terminal.md (display width).
```

- [ ] **Step 4: docs/testing.md**

After the `renderToString` example (line 86) add: "A frame row that holds a wide glyph (`日本`) reads shorter than the grid is wide: the glyph's second cell is `''` and vanishes in the text, exactly as it takes no extra column on screen."

- [ ] **Step 5: docs/components.md**

- Lines 276–283 (TextArea units): replace "Widths and `caretPosition().col` count characters (code points), the grid's unit" with "Widths and `caretPosition().col` are display columns, the grid's unit"; replace "Grapheme clusters (ZWJ emoji, combining marks) are not merged — code point is the floor." with "The editor steps over a grapheme cluster (a flag, an emoji with its modifiers, a base with its combining marks) as one character."
- Lines 326–329 (Table note) → "> Column widths are display columns (`stringWidth`): a CJK ideograph or an emoji takes two, so rules stay aligned on any row (see [Display width](terminal.md#display-width))."
- Lines 373–376 (Markdown note) → "> Wrapping and table columns are measured in display columns, the same as `<Table>`, so columns stay aligned on rows with CJK / emoji (see [Display width](terminal.md#display-width))."
- Lines 748 and 755–757 (Shimmer): "(code points, from the start)" → "(grapheme clusters, from the start)"; "Characters are code points, one cell each, the grid's own rule: a wide glyph is one character and the band walks over it as one cell." → "Characters are grapheme clusters: a wide glyph is one character and the band walks over it as one step of two columns."

- [ ] **Step 6: CHANGELOG.md**

Above the `## 1.0.0-alpha.30` heading add:

```markdown
## Unreleased

### Changed

- **Wide glyphs occupy two grid cells.** A CJK ideograph or an emoji takes the
  two columns it takes on screen: paint reserves the second cell, the backends
  no longer back the cursor up over it, and nothing overlaps its right half.
  Every width in the library — layout, `wrapText`, `<TextInput>` /
  `<TextArea>`, `<Table>`, markdown tables and code blocks, `<Menu>` — is
  measured in display columns. See docs/terminal.md (display width).
- **`Cell.char` is a grapheme cluster, or `''` for the second column of a wide
  one.** A backend writes the lead and skips the `''` cell. Backends built on
  the old one-cell-per-code-point grid must adopt this (docs/writing-a-backend.md).
- **`stringWidth` measures grapheme clusters**: a flag, an emoji with a skin
  tone and a ZWJ sequence are 2, not the sum of their parts; a control
  character counts the column paint gives it (1).
- The editor (`<TextInput>`, `<TextArea>`) moves and deletes by grapheme
  cluster, so a caret never lands inside a flag or a decomposed accent.
- DEL and C1 control characters in text are painted as a space, like C0.

### Added

- `graphemes`, `clusterWidth`, `fitClusters`, `prevGrapheme`, `nextGrapheme`
  from `@flowtty/core` and `@flowtty/react`.
```

(The release commit renames `Unreleased` to the version — the existing entries show the shape.)

- [ ] **Step 7: Followups and spec status**

Append to `docs/internal/plans/_followups.md`:

```markdown
## Wide glyphs (2026-09)

### Probe the terminal for its emoji width

flowtty measures by its tables; a terminal that does not join ZWJ sequences, or
draws a code point newer than the tables wide, drifts by a column on such rows.
The fix would be a one-time probe at startup (write a glyph, query the cursor
position with CSI 6n) and a per-backend width override. Not done: the drift is
cosmetic and the probe costs a round trip on every start.

**Action:** revisit if a real terminal in use shows the drift on common content.
```

In `docs/internal/plans/wide-glyphs.md` set `**Status:**` to `implemented`, and in §2 replace "leaving a blank column before `…`" with "so the line comes out a column short".

- [ ] **Step 8: Final gate**

Run: `npm test && npm run typecheck && npm run build` → all green. Run `npm run articles-tui` or `npm run inline-build-log` once by hand in a real terminal with a CJK string in view if one is at hand, and report what was seen. Leave everything uncommitted for the person.
