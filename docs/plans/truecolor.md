# flowtty Truecolor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** accept 24-bit color values in `Style.fg` / `Style.bg` — `#rgb`, `#rrggbb`, `rgb(R, G, B)` — in addition to the existing named-color set. `sgr(style)` emits the truecolor SGR escape (`\x1b[38;2;R;G;Bm` for fg, `\x1b[48;2;R;G;Bm` for bg) when a value parses as a color; otherwise falls back to the existing named-color map; otherwise silently ignores the value. No `Style` shape change — `fg` and `bg` remain `string`.

**Architecture:** add a pure helper `parseColor(input: string): { r: number; g: number; b: number } | null` to `src/ansi.ts`. Update `sgr` so the fg/bg branches first try `parseColor`; on hit, emit the truecolor escape; on miss, fall through to the existing `FG`/`BG` named lookup. The frame-diff baseline (`JSON.stringify(style)` equality) keeps working unchanged because we're not altering the `Style` shape.

**Tech Stack:** Same as M1e — TypeScript ESM, Vitest 4, no new deps.

**Out of scope** (later or non-goals): 256-color (`\x1b[38;5;Nm`) palette mapping for legacy terminals — modern terminals support truecolor; document the requirement instead. Modern CSS syntaxes like `rgb(255 0 0 / 50%)`, `hsl(…)`, `oklch(…)`, `color(…)`. Color name normalization (treating `#fff` ≡ `rgb(255,255,255)` ≡ `#ffffff` as one cell during frame diff — they currently diff as different, which is acceptable; users should normalize if they care). Clamping out-of-range values like `rgb(300, 0, 0)` — we reject (return `null`, value silently ignored), consistent with malformed-hex behavior.

---

## Scope check

Single subsystem (ANSI color serialization). One plan, **2 tasks**.

---

## File Structure

```
src/
  ansi.ts            # MODIFY — add parseColor helper; update sgr to try parseColor first for fg/bg
  ansi.test.ts       # ADD — parseColor unit tests + sgr truecolor tests + named-fallback tests
README.md            # MODIFY — note truecolor support
```

Responsibilities:
- **`ansi.ts`** — owns color parsing + SGR serialization. `parseColor` is exported (small enough to be reusable + testable in isolation).
- The change is purely additive — existing named-color callers (`fg: 'red'`) keep working.

---

### Task 1: `parseColor` helper + `sgr` truecolor branches

**Files:**
- Modify: `src/ansi.ts`
- Modify: `src/ansi.test.ts`

- [ ] **Step 1: Append failing tests to `src/ansi.test.ts`:**

```ts
import { parseColor } from './ansi.js';

describe('parseColor', () => {
  test('#rgb 3-digit hex expands each digit', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0 }); // f→ff, 8→88, 0→00
  });

  test('#rrggbb 6-digit hex parses each byte', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseColor('#1a2b3c')).toEqual({ r: 26, g: 43, b: 60 });
  });

  test('hex is case-insensitive', () => {
    expect(parseColor('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('#AbCdEf')).toEqual({ r: 171, g: 205, b: 239 });
  });

  test('rgb(r, g, b) parses with or without whitespace', () => {
    expect(parseColor('rgb(255,128,0)')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseColor('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseColor('rgb( 255 , 128 , 0 )')).toEqual({ r: 255, g: 128, b: 0 });
  });

  test('returns null for named colors (caller falls through to named-color map)', () => {
    expect(parseColor('red')).toBeNull();
    expect(parseColor('white')).toBeNull();
  });

  test('returns null for malformed input', () => {
    expect(parseColor('#xyz')).toBeNull();
    expect(parseColor('#ff')).toBeNull();      // wrong length
    expect(parseColor('#ffff')).toBeNull();    // wrong length
    expect(parseColor('#fffffff')).toBeNull(); // wrong length
    expect(parseColor('rgb(1,2)')).toBeNull(); // wrong arity
    expect(parseColor('rgb(a,b,c)')).toBeNull();
    expect(parseColor('')).toBeNull();
  });

  test('returns null for out-of-range rgb values (no clamping)', () => {
    expect(parseColor('rgb(256, 0, 0)')).toBeNull();
    expect(parseColor('rgb(-1, 0, 0)')).toBeNull();
    expect(parseColor('rgb(300, 128, 0)')).toBeNull();
  });
});

describe('sgr truecolor', () => {
  test('fg with #rrggbb emits 24-bit foreground escape', () => {
    expect(sgr({ fg: '#ff0000' })).toBe('\x1b[38;2;255;0;0m');
  });

  test('bg with rgb(...) emits 24-bit background escape', () => {
    expect(sgr({ bg: 'rgb(0, 128, 255)' })).toBe('\x1b[48;2;0;128;255m');
  });

  test('fg + bg + bold combine in one escape', () => {
    // Order: existing sgr orders modifiers then fg then bg (verify against current impl)
    const out = sgr({ fg: '#ff8800', bg: 'rgb(0,0,128)', bold: true });
    expect(out).toContain('38;2;255;136;0');
    expect(out).toContain('48;2;0;0;128');
    expect(out).toContain('1'); // bold
    expect(out.startsWith('\x1b[')).toBe(true);
    expect(out.endsWith('m')).toBe(true);
  });

  test('named color still works (fallback path)', () => {
    expect(sgr({ fg: 'red' })).toBe('\x1b[31m');
    expect(sgr({ bg: 'blue' })).toBe('\x1b[44m');
  });

  test('unknown color value is silently ignored (no SGR emitted for it)', () => {
    // Neither parses as truecolor nor matches named map.
    expect(sgr({ fg: 'nonsense' })).toBe('');
    expect(sgr({ bg: '#xyz', bold: true })).toBe('\x1b[1m');
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `parseColor` not exported; `sgr` doesn't handle truecolor.

- [ ] **Step 3: Read `src/ansi.ts`** to confirm the current `sgr` shape (the truecolor branches plug into the same `parts` array — read so you implement the exact branch correctly).

- [ ] **Step 4: Modify `src/ansi.ts`** — add `parseColor` and the truecolor branches in `sgr`.

Append `parseColor` near the bottom of `ansi.ts` (above or below the existing color maps — choose by adjacency to `FG`/`BG`):

```ts
/**
 * Parse a color string into 0–255 RGB components.
 * Accepts:
 *   - "#rgb"     — 3-digit hex, each digit doubled (e.g. "#f80" → ff,88,00)
 *   - "#rrggbb"  — 6-digit hex
 *   - "rgb(R, G, B)" — CSS-style, each channel 0–255 integer
 * Returns null for anything else (named colors, malformed, out-of-range).
 * Callers should fall back to a named-color map on null.
 */
export function parseColor(input: string): { r: number; g: number; b: number } | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  const s = input.trim();

  // Hex form
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      if (!/^[0-9a-fA-F]{3}$/.test(hex)) return null;
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      return { r, g, b };
    }
    if (hex.length === 6) {
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }
    return null;
  }

  // rgb(r, g, b) form
  const m = /^rgb\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i.exec(s);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
    return { r, g, b };
  }

  return null;
}
```

Then update the `sgr` function. Find the existing fg/bg lookup branches (something like `if (style.fg) { const code = FG[style.fg]; if (code !== undefined) parts.push(String(code)); }`) and replace each with the truecolor-first pattern:

```ts
if (style.fg) {
  const rgb = parseColor(style.fg);
  if (rgb) {
    parts.push(`38;2;${rgb.r};${rgb.g};${rgb.b}`);
  } else {
    const code = FG[style.fg];
    if (code !== undefined) parts.push(String(code));
  }
}
if (style.bg) {
  const rgb = parseColor(style.bg);
  if (rgb) {
    parts.push(`48;2;${rgb.r};${rgb.g};${rgb.b}`);
  } else {
    const code = BG[style.bg];
    if (code !== undefined) parts.push(String(code));
  }
}
```

- [ ] **Step 5: Verify**
  - `npx vitest run src/ansi.test.ts` — all (existing + new) pass.
  - `npx vitest run` — full suite green (178 + new count).
  - `npm run typecheck` — clean.

Common pitfalls:
- 3-digit expansion: `#f80` → `ff,88,00` (digit doubled), NOT `0f,08,00` (zero-padded). The implementation uses `hex[0]+hex[0]`, etc.
- The `rgb(...)` regex MUST anchor with `^…$` — without anchors, `'rgb(0,0,0) garbage'` would match.
- The "combined fg+bg+bold" test doesn't pin parameter ORDER — it asserts presence — to avoid coupling to `sgr`'s internal parts ordering. If the existing `sgr` emits modifiers first, that's fine; the assertions check substrings.
- The "unknown color ignored" test — `sgr({ fg: 'nonsense' })` returns `''` only if `sgr` returns empty string when `parts` is empty. Verify the existing `sgr` already does this (returns `''` when no parts) — likely it does, since `sgr({})` should be `''`. If it returns `\x1b[m`, you have a pre-existing minor issue; adapt the test to whatever the current `sgr({})` returns (run `console.log(JSON.stringify(sgr({})))` to check).

- [ ] **Step 6: Commit**
```bash
git add src/ansi.ts src/ansi.test.ts
git commit -m "feat: ansi truecolor — #rgb, #rrggbb, rgb(r,g,b) in Style.fg/bg"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** to see the current `## Status` section (just merged from M1e).

- [ ] **Step 2: Update README** — append a short truecolor note. Two acceptable approaches:
  - **Option A (preferred):** add a small `### Truecolor` subsection under `## Status` documenting accepted formats, with a brief example.
  - **Option B:** mention truecolor in the running Status paragraph.

The note should cover:
- Accepted formats: `#rgb`, `#rrggbb`, `rgb(R, G, B)`, named colors.
- Truecolor support requires a modern terminal (iTerm2, Terminal.app, Windows Terminal, modern xterm-based). Older terminals may ignore the escape or render approximations.
- Unknown / malformed values are silently ignored (matches the existing named-color miss behavior).

Example snippet (adjust to fit the existing README voice):

```md
### Truecolor

`Style.fg` and `Style.bg` accept:

- Named colors (`'red'`, `'blue'`, `'white'`, …) — emit standard 30-37 / 40-47 codes.
- 3-digit hex `#rgb` (each digit doubled — `#f80` → `#ff8800`).
- 6-digit hex `#rrggbb`.
- CSS-style `rgb(R, G, B)` (each channel 0–255 integer).

24-bit color (`#…` / `rgb(…)`) emits `\x1b[38;2;R;G;Bm` (fg) / `\x1b[48;2;R;G;Bm` (bg).
Modern terminal required (iTerm2, Terminal.app, Windows Terminal, modern xterm).
Unknown values are silently ignored.
```

- [ ] **Step 3: Final verification + commit (authorized):**
```bash
npx vitest run      # all pass
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document truecolor in README"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHA

---

## Self-Review

**1. Spec coverage:**
- `#rgb` parser → Task 1.
- `#rrggbb` parser → Task 1.
- `rgb(R, G, B)` parser → Task 1.
- `sgr` truecolor emission → Task 1.
- Named-color fallback → Task 1.
- Silent ignore on miss → Task 1.
- README documentation → Task 2.

**2. Placeholder scan:** none — `parseColor` body, `sgr` branch code, all tests, and the README snippet are concrete.

**3. Type consistency:**
- `parseColor(input: string): { r: number; g: number; b: number } | null` — used as `parseColor(style.fg)` where `style.fg: string | undefined`, guarded by `if (style.fg)`.
- `Style.fg` and `Style.bg` stay typed `string | undefined` — no shape change. Existing call sites are unaffected.

**Risks worth flagging for the implementer:**

1. **Frame-diff equality**: `JSON.stringify({fg:'#fff'})` ≠ `JSON.stringify({fg:'#ffffff'})` — visually identical cells but different style objects, so the diff treats them as a change. This is acceptable (out-of-scope to normalize) — but document if it bites. The TtyBackend diff path (M1e) will simply emit the SGR + char for these — correct behavior, just slightly wasted bytes.

2. **`sgr({}) → ''`** behavior is assumed. If the existing `sgr` returns something else for an empty style, the "unknown color ignored" test (`sgr({ fg: 'nonsense' })` → `''`) needs adjusting. Verify by reading current `sgr` first.

3. **Regex anchors** on the `rgb(...)` form (`^…$`) are critical — without them, `'rgb(0,0,0)extra'` would match. The implementation uses `^…$`; double-check during paste.

4. **3-digit hex expansion** — common bug to write `parseInt(hex[0], 16) * 16` (which expands `#f00` to `r=240`, wrong — should be 255). The spec is digit-doubling: `f` → `0xff = 255`. The implementation uses `hex[0]+hex[0]` (string concat then parse), which gives the right answer.

5. **Negative numbers in `rgb(...)`** — the regex `(-?\d+)` accepts negatives so the range check catches them. Without the `-?`, `rgb(-1,0,0)` would fail to match the regex entirely (still null, but for the wrong reason). Either path passes the "out of range" test; the explicit allow + range-check makes the intent clearer.

6. **No truecolor escape currently emitted by the codebase** — the M1e frame-diff tests only assert on specific named-color escapes (`\x1b[1;31m` for bold-red). Truecolor doesn't change those tests. But if any test asserts `sgr(...)` output exhaustively (full string equality, not substring), and the test cell happens to use a value that *now* parses as truecolor (e.g. `fg: '#ff0000'` if any test uses that), the test will see a different escape. Grep test files for `fg: '#` and `bg: '#` before committing; should be zero matches in the existing tests.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/truecolor.md`. Subagent-driven execution per your request — once you confirm, I'll commit this plan on master, branch `truecolor`, then dispatch Task 1.
