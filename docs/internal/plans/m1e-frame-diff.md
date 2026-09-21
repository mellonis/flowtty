# flowtty M1e — TTY Frame Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make `TtyBackend.draw(buffer)` emit minimal ANSI per frame — only cells that changed since the previous frame get re-written. Keep a reference to the previous Buffer, compare cell-by-cell, position the cursor + apply style + write only the differing cells. Adjacency optimization: when consecutive cells on the same row differ, emit one cursor move + the run of chars (no per-cell cursor positioning). First frame + size mismatch + resize → fall back to a full redraw. Acceptance: `backend.press({name:'i'})` on an `i`-increments-counter app issues only a handful of bytes to stdout (single cursor move + single-digit char + RESET) instead of the ~hundreds-of-bytes full redraw.

**Architecture:** `TtyBackend` gains `previousBuffer: Buffer | null` (set from each completed draw). The new `draw` flow:

```
if (previousBuffer === null || previousBuffer.size !== newBuffer.size) {
  drawFull(newBuffer);   // existing M0 code path — CLEAR + all rows + RESET
} else {
  drawDiff(previousBuffer, newBuffer);   // new path — only changed cells
}
previousBuffer = newBuffer;
```

`drawDiff` walks the cell grid once; for each `(x, y)` where the cell differs from previous (char OR style), it:
- emits a `cursorTo(x, y)` ANSI escape **iff** this cell isn't immediately adjacent to the previous emitted cell (same row, next column),
- emits a `RESET + sgr(style)` **iff** the style differs from the pen's current state,
- emits the new char.

After all changes, one trailing `RESET` (defensive). The resize handler (`backend.onResize`) invalidates `previousBuffer` so the next draw is a full redraw (the cursor positions in the diff would be wrong against the new terminal dimensions).

**Tech Stack:** Same as M1f — TypeScript ESM, React 19, `react-reconciler@0.31.0`, `yoga-layout@3.2.1`, Vitest 4.

**Out of scope** (later milestones / explicit non-goals): scrolling-region optimization (`\x1b[<top>;<bottom>r` + `\n` for log-stream apps like `<Static>`); double-buffered / VT100-style damage tracking beyond per-cell; sub-cell diffing (each cell is the atomic unit); preserving the user's previous shell content beneath the app (alt-screen already handles that); emitting fewer cursor-positions via column-only moves (`\x1b[<col>G`) when row is unchanged — possible perf nibble but adds branching, deferred.

---

## Scope check

Independent backend-only optimization. Single file modified (`src/backends/tty.ts`) + tests + minor ansi helper. **One plan, 3 tasks.**

---

## File Structure

```
src/
  ansi.ts                # MODIFY — add cursorTo(x, y) helper + cellsEqual helper
  ansi.test.ts           # ADD — cursorTo + cellsEqual unit tests
  backends/tty.ts        # MODIFY — previousBuffer field; drawFull (extracted from existing draw) + drawDiff; onResize invalidates previousBuffer
  backends/tty.test.ts   # ADD — first-frame full; subsequent-frame diff (single change, adjacent run, style change, no-op); resize invalidates
  README.md              # MODIFY — note the perf optimization
```

Responsibilities:
- **`ansi.ts`** owns escape-string formatting. `cursorTo(x, y)` is just a tiny helper; `cellsEqual(a, b)` is utility for the diff logic.
- **`backends/tty.ts`** owns the diff state machine + the full-vs-diff branching + the resize-invalidation.

---

### Task 1: ANSI helpers — `cursorTo` + `cellsEqual`

**Files:**
- Modify: `src/ansi.ts`
- Modify: `src/ansi.test.ts`

- [ ] **Step 1: Append failing tests to `src/ansi.test.ts`:**
```ts
import { cursorTo, cellsEqual } from './ansi.js';

test('cursorTo(x, y) emits CSI cursor-position with 1-indexed row;col', () => {
  // ANSI cursor positioning is 1-indexed: (col 0, row 0) → CSI 1;1H
  expect(cursorTo(0, 0)).toBe('\x1b[1;1H');
  expect(cursorTo(5, 2)).toBe('\x1b[3;6H'); // row 3, col 6
  expect(cursorTo(0, 9)).toBe('\x1b[10;1H');
});

test('cellsEqual returns true for identical char + style', () => {
  expect(cellsEqual({ char: 'a', style: {} }, { char: 'a', style: {} })).toBe(true);
  expect(cellsEqual(
    { char: 'X', style: { bold: true, fg: 'red' } },
    { char: 'X', style: { bold: true, fg: 'red' } },
  )).toBe(true);
});

test('cellsEqual returns false when char differs', () => {
  expect(cellsEqual({ char: 'a', style: {} }, { char: 'b', style: {} })).toBe(false);
});

test('cellsEqual returns false when style differs', () => {
  expect(cellsEqual(
    { char: 'a', style: {} },
    { char: 'a', style: { bold: true } },
  )).toBe(false);
  expect(cellsEqual(
    { char: 'a', style: { fg: 'red' } },
    { char: 'a', style: { fg: 'blue' } },
  )).toBe(false);
});
```

- [ ] **Step 2: Run, verify FAIL** (`cursorTo`/`cellsEqual` not exported).

- [ ] **Step 3: Modify `src/ansi.ts`** — read it first. Add two exports alongside the existing ones. Append at the bottom of the file (after the existing constants):

```ts
import type { Cell } from './cells.js';

/**
 * CSI Cursor Position: move cursor to (col, row), both 1-indexed in the ANSI
 * spec. We accept 0-indexed (x, y) and convert.
 */
export function cursorTo(x: number, y: number): string {
  return `\x1b[${y + 1};${x + 1}H`;
}

/** True iff two cells have identical char AND identical style. */
export function cellsEqual(a: Cell, b: Cell): boolean {
  if (a.char !== b.char) return false;
  // Style objects are small (~6 optional bool/string fields). JSON.stringify
  // is correct + fast enough at this scale; matches the existing per-cell
  // SGR change-detection pattern used in TtyBackend.draw.
  return JSON.stringify(a.style) === JSON.stringify(b.style);
}
```

If `Cell` isn't already exported as a type from `cells.ts`, check — the existing tty.ts code imports `Cell`-shaped objects, so it's exported.

- [ ] **Step 4: Verify** — `npx vitest run src/ansi.test.ts` → all (existing + 4 new) pass. Full suite green (168 + 4 = 172). `npm run typecheck` clean.

- [ ] **Step 5: Commit**
```bash
git add src/ansi.ts src/ansi.test.ts
git commit -m "feat: ansi cursorTo + cellsEqual helpers for frame diff"
```

---

### Task 2: `TtyBackend.draw` — diff-based path

**Files:**
- Modify: `src/backends/tty.ts`
- Modify: `src/backends/tty.test.ts`

Replace the single-path `draw` with: extract the existing full-redraw into a private `drawFull` method; add `drawDiff(prev, next)` that emits only changed cells with cursor positioning + adjacency optimization; main `draw` decides which to call based on `previousBuffer`. Track `previousBuffer` and the pen's current style across writes.

- [ ] **Step 1: Append failing tests to `src/backends/tty.test.ts`** (existing imports preserved):
```ts
test('TtyBackend.draw: second frame with NO changes writes nothing (no-op diff)', () => {
  const { stub: out, writes } = makeStub(4, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf = new Buffer(4, 1);
  buf.set(0, 0, 'a'); buf.set(1, 0, 'b'); buf.set(2, 0, 'c'); buf.set(3, 0, 'd');
  back.draw(buf);
  const beforeLen = writes.length;
  // Draw the SAME buffer again
  back.draw(buf);
  // No additional writes (zero changes)
  expect(writes.length).toBe(beforeLen);
  back.dispose();
});

test('TtyBackend.draw: second frame with ONE cell changed writes a single cursor-positioned char', () => {
  const { stub: out, writes } = makeStub(4, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf1 = new Buffer(4, 1);
  buf1.set(0, 0, 'a'); buf1.set(1, 0, 'b'); buf1.set(2, 0, 'c'); buf1.set(3, 0, 'd');
  back.draw(buf1);
  const beforeLen = writes.length;
  const buf2 = new Buffer(4, 1);
  buf2.set(0, 0, 'a'); buf2.set(1, 0, 'X'); buf2.set(2, 0, 'c'); buf2.set(3, 0, 'd');
  back.draw(buf2);
  // One new write for the diff
  expect(writes.length).toBe(beforeLen + 1);
  const diff = writes[writes.length - 1]!;
  // Should contain cursorTo(1, 0) = '\x1b[1;2H' and the char 'X'
  expect(diff).toContain('\x1b[1;2H');
  expect(diff).toContain('X');
  // Should NOT contain 'a', 'b', 'c', 'd' as new chars — only X is rewritten
  expect(diff).not.toContain('abcd');
  back.dispose();
});

test('TtyBackend.draw: adjacent changes share one cursor move (run is written contiguously)', () => {
  const { stub: out, writes } = makeStub(6, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf1 = new Buffer(6, 1);
  for (let i = 0; i < 6; i++) buf1.set(i, 0, 'a');
  back.draw(buf1);
  const buf2 = new Buffer(6, 1);
  buf2.set(0, 0, 'a'); buf2.set(1, 0, 'X'); buf2.set(2, 0, 'Y'); buf2.set(3, 0, 'Z'); buf2.set(4, 0, 'a'); buf2.set(5, 0, 'a');
  back.draw(buf2);
  const diff = writes[writes.length - 1]!;
  // ONE cursor move to (1,0) = '\x1b[1;2H', then 'XYZ' contiguously
  expect(diff).toContain('\x1b[1;2HXYZ');
  // (Should NOT contain a second cursor move within the run — only the leading one.)
  // Count CSI H sequences:
  const cursorMoves = diff.match(/\x1b\[\d+;\d+H/g) ?? [];
  expect(cursorMoves.length).toBe(1);
  back.dispose();
});

test('TtyBackend.draw: style change emits SGR before the char', () => {
  const { stub: out, writes } = makeStub(3, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf1 = new Buffer(3, 1);
  buf1.set(0, 0, 'a'); buf1.set(1, 0, 'b'); buf1.set(2, 0, 'c');
  back.draw(buf1);
  const buf2 = new Buffer(3, 1);
  buf2.set(0, 0, 'a'); buf2.set(1, 0, 'b', { bold: true, fg: 'red' }); buf2.set(2, 0, 'c');
  back.draw(buf2);
  const diff = writes[writes.length - 1]!;
  // Cursor to (1,0); SGR for bold + red (1;31); 'b'; reset trailing
  expect(diff).toContain('\x1b[1;2H');
  expect(diff).toContain('\x1b[1;31m');
  expect(diff).toContain('b');
  back.dispose();
});

test('TtyBackend.draw: first frame still does a full redraw (CLEAR + full content)', () => {
  const { stub: out, writes } = makeStub(3, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const before = writes.length;
  const buf = new Buffer(3, 1);
  buf.set(0, 0, 'a'); buf.set(1, 0, 'b'); buf.set(2, 0, 'c');
  back.draw(buf);
  const drawWrite = writes[before]!;
  // Existing M0 contract: CLEAR + content + RESET
  expect(drawWrite.startsWith(CLEAR)).toBe(true);
  expect(drawWrite).toContain('abc');
  expect(drawWrite.endsWith(RESET)).toBe(true);
  back.dispose();
});
```

- [ ] **Step 2: Run, verify FAIL** (the existing `draw` doesn't diff).

- [ ] **Step 3: Modify `src/backends/tty.ts`** — read the file first to see the existing shape. Replace the `draw` method with the diff-aware version, and extract the existing per-line/per-cell loop into a private `drawFull`. Add a `previousBuffer` field.

Add the `cursorTo` + `cellsEqual` imports at the top (alongside the existing ansi imports):
```ts
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, CLEAR, HIDE_CURSOR, RESET, SHOW_CURSOR, cellsEqual, cursorTo, sgr } from '../ansi.js';
```

Add a field next to the existing flag fields:
```ts
private previousBuffer: Buffer | null = null;
```

Replace the existing `draw(buffer: Buffer): void { ... }` method (the M0 full-redraw) with:
```ts
draw(buffer: Buffer): void {
  if (
    this.previousBuffer === null ||
    this.previousBuffer.width !== buffer.width ||
    this.previousBuffer.height !== buffer.height
  ) {
    this.drawFull(buffer);
  } else {
    this.drawDiff(this.previousBuffer, buffer);
  }
  this.previousBuffer = buffer;
}

// Extracted from the original draw — full-frame redraw with CLEAR and per-line
// SGR runs. Used on the first frame and after size changes.
private drawFull(buffer: Buffer): void {
  let outStr = CLEAR;
  for (let y = 0; y < buffer.height; y++) {
    let line = '';
    let last: Style | null = null;
    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.get(x, y);
      const styleStr = sgr(cell.style);
      if (JSON.stringify(cell.style) !== JSON.stringify(last)) {
        line += RESET + styleStr;
        last = cell.style;
      }
      line += cell.char;
    }
    outStr += line + RESET + (y < buffer.height - 1 ? '\n' : '');
  }
  this.out.write(outStr);
}

// Emit only cells that differ from `prev`. Adjacency optimization: when the
// previous emitted cell was at (x-1, y), skip the cursor positioning for the
// next cell — characters flow naturally to the right after a write.
// Style state is tracked across all changes so we only emit SGR when needed.
private drawDiff(prev: Buffer, next: Buffer): void {
  let out = '';
  let penStyle: Style | null = null;
  let lastX = -2;
  let lastY = -2;

  for (let y = 0; y < next.height; y++) {
    for (let x = 0; x < next.width; x++) {
      const a = prev.get(x, y);
      const b = next.get(x, y);
      if (cellsEqual(a, b)) continue;

      // Cursor move iff this cell isn't immediately right of the prior emitted one.
      if (!(y === lastY && x === lastX + 1)) {
        out += cursorTo(x, y);
      }
      // Style change iff the pen's style doesn't already match.
      if (penStyle === null || JSON.stringify(b.style) !== JSON.stringify(penStyle)) {
        out += RESET + sgr(b.style);
        penStyle = b.style;
      }
      out += b.char;
      lastX = x;
      lastY = y;
    }
  }

  if (out !== '') {
    this.out.write(out + RESET);
  }
}
```

(Need to import `Style` if not already — `import type { Buffer, Style } from '../cells.js';`. It's already imported.)

- [ ] **Step 4: Verify**
- `npx vitest run src/backends/tty.test.ts` → all (existing + 5 new) pass.
- `npx vitest run` → full suite green (172 + 5 = 177).
- `npm run typecheck` → clean.

If the "ONE cell changed" test reports `writes.length` increased by MORE than 1: the diff path is writing multiple times — combine into a single `this.out.write(out + RESET)` at the end (the spec already does so; verify your implementation matches).

If "adjacent run" test fails because `\x1b[1;2HXYZ` doesn't match: the adjacency check might be tracking the wrong "last" position. Verify `lastX = x; lastY = y;` is set AFTER the char emit, and that the comparison is `y === lastY && x === lastX + 1`.

If "no-op diff" test fails (writes.length increased): the `out !== ''` guard at the end isn't preventing the empty write — verify the early `if (out !== '')` check skips the write call entirely.

- [ ] **Step 5: Commit**
```bash
git add src/backends/tty.ts src/backends/tty.test.ts
git commit -m "feat: TtyBackend frame diff — only changed cells written each frame"
```

---

### Task 3: Resize invalidates previous buffer + README + final build

**Files:**
- Modify: `src/backends/tty.ts` (one line)
- Modify: `src/backends/tty.test.ts` (one new test)
- Modify: `README.md`

When the terminal resizes, the next paint may use new dimensions; the prior cell coordinates would be wrong. Invalidate `previousBuffer` so the next draw falls back to a full redraw (which the existing M1c onResize + render `draw()` already triggers).

- [ ] **Step 1: Append failing test to `src/backends/tty.test.ts`:**
```ts
test('TtyBackend: resize invalidates previousBuffer → next draw is a full redraw', () => {
  const { stub: out, writes } = makeStub(4, 1);
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const buf1 = new Buffer(4, 1);
  buf1.set(0, 0, 'a'); buf1.set(1, 0, 'b'); buf1.set(2, 0, 'c'); buf1.set(3, 0, 'd');
  back.draw(buf1);  // first frame: full
  // Subscribe to onResize (mimics render() wiring) — but resize SHOULD invalidate
  // even without an external subscriber being called; the backend self-invalidates.
  (out as unknown as EventEmitter).emit('resize');
  // Second draw of the SAME contents — diff would write nothing; but we just resized,
  // so a full redraw fires (CLEAR + 'abcd' + RESET).
  const before = writes.length;
  back.draw(buf1);
  const drawWrite = writes[before];
  expect(drawWrite).toBeDefined();
  expect(drawWrite!.startsWith(CLEAR)).toBe(true);
  expect(drawWrite).toContain('abcd');
  back.dispose();
});
```

- [ ] **Step 2: Modify `src/backends/tty.ts`** — change the `resizeNotify` handler so it ALSO invalidates `previousBuffer` before notifying external subscribers. Find:
```ts
private readonly resizeNotify = (): void => {
  for (const h of [...this.resizeSubscribers]) h();
};
```

Replace with:
```ts
private readonly resizeNotify = (): void => {
  // Invalidate the diff baseline — the next paint will likely use new dimensions
  // and previous cell coordinates would be wrong against the resized terminal.
  this.previousBuffer = null;
  for (const h of [...this.resizeSubscribers]) h();
};
```

- [ ] **Step 3: Update `README.md`** — find the existing `## Status` section, replace its content with (use REAL triple-backtick fences):

```md
## Status

M1e (TTY frame diff). `TtyBackend` now writes only the cells that changed
since the previous frame. Adjacent changes on the same row share one cursor
move (the run flows contiguously). Style changes emit SGR only when the pen
state needs updating. **No-op repaints write nothing.** First frame + size
mismatch + terminal resize fall back to a full redraw.

This is a perf-only change — no public API additions. Interactive apps
(counter, prompt, form) that repaint per keystroke now issue a handful of
bytes per frame instead of the full ~hundreds-of-bytes redraw.

### Still deferred (later milestones)

- Scrolling-region optimization for log-stream apps.
- Column-only cursor moves (`CSI <col>G`) when row is unchanged — small extra perf nibble.
- Truecolor (`#rgb` / `rgb(…)`).
- Explicit `zIndex` prop, `position: 'relative'`.
- Bracketed paste, mouse, Kitty keyboard protocol, modifier-encoded arrows.
```

Leave everything ELSE in the README unchanged.

- [ ] **Step 4: Final verification + commit (authorized):**
```bash
npx vitest run        # all 178 still pass (177 + 1 resize test)
npm run typecheck     # clean
npm run build         # ESM + dts succeed, no warnings
git add src/backends/tty.ts src/backends/tty.test.ts README.md
git commit -m "feat: TtyBackend resize invalidates diff baseline + document M1e"
```

## Report:
- **Status:** DONE | BLOCKED
- Test + typecheck + build output (paste tails)
- Commit SHA

---

## Self-Review

**1. Spec coverage** (M1e):
- Cell-diff path → Tasks 1, 2.
- Adjacency optimization → Task 2.
- Style-state tracking → Task 2.
- Resize invalidation → Task 3.
- README update → Task 3.
- Out-of-scope items (scrolling region, column-only moves) named in plan header + README.

**2. Placeholder scan:** no "TBD"/"implement later". The `JSON.stringify(style)` comparison is the same pattern the existing M0 draw uses (per-line SGR change detection) — consistent, not a hack.

**3. Type consistency:** `Cell` (from `cells.ts`), `Buffer` (from `cells.ts`), `Style` (from `cells.ts`) used uniformly. `cursorTo` and `cellsEqual` exported from `ansi.ts`. `TtyBackend.previousBuffer: Buffer | null` — same `Buffer` class.

**Risks worth flagging for the implementer (not blockers):**

1. **`previousBuffer = buffer` keeps a reference**, not a copy. `paint()` in render.ts creates a fresh `Buffer` per call, so the reference is safe (no aliasing — each frame is its own instance). If a future optimization recycles buffers (mutates in place), this assumption breaks. M1e is fine as-is.

2. **JSON.stringify ordering** of `Style` fields is deterministic in JS engines for plain objects with string keys (insertion order). Since `Style` is built from explicit prop reads in `textStyleOf` (`paint.ts`), the key order is stable. If a future `textStyleOf` reorders branches OR uses spread from external state, the comparison could miss equal styles. Document.

3. **First-frame full redraw** uses `CLEAR + per-line SGR runs + RESET` (existing M0 code, just extracted into `drawFull`). The diff path uses `cursorTo + per-cell SGR + char + trailing RESET`. Two different ANSI patterns; that's fine — each is optimal for its case (full = sequential write, no cursor positioning; diff = random access with cursor positioning).

4. **Adjacency check `y === lastY && x === lastX + 1`** works for left-to-right row scans. The diff loop iterates rows in order, columns in order, so this is correct for the implementation as written. If a future optimization scans differently (e.g. by changed-region rectangles), the adjacency check needs updating.

5. **Mock stdout EventEmitter** (Task 3) — the test stub now has both `write` and EventEmitter `emit` for resize (from M1c). Reuse the existing `makeStub` from `tty.test.ts` without modification. If the stub doesn't have `emit` properly inherited, fall back to manually setting `out._eventsCount` or use the existing `(out as unknown as EventEmitter).emit('resize')` pattern that's already used in other tests in the file.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/m1e-frame-diff.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task; same flow as prior milestones.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
