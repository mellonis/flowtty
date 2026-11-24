# Markdown Token Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a caller of `layoutMarkdown` / `<Markdown>` / `highlightMarkdownSource` can restyle any fenced-block token — a diff's added and removed rows included — without rewriting the laid-out spans.

**Architecture:** the palette is resolved once per fenced block from the caller's overrides merged over `DEFAULT_TOKEN_COLORS`, then handed to the builder that already turns token names into styles. Because resolution happens before `createBuilder`'s neighbour merging, the merge is computed on the styles that will be drawn. `layoutCode` reads the same resolved palette for a diff row's band.

**Tech Stack:** TypeScript 5/7 ESM, Vitest 4, Yoga 3 — the existing flowtty toolchain. No new dependency.

**Spec:** `docs/internal/plans/markdown-token-colors-design.md`

## Global Constraints

- Defaults stay one table: `DEFAULT_TOKEN_COLORS` in `highlight/tokenColors.ts`, every value a named palette colour (`docs/components.md` — code blocks).
- A call without overrides allocates nothing new and draws byte-identically to today.
- `CodeSeg` / `CodeLine` — the public output shapes — do not change.
- A palette is never module state: two concurrent layouts with different palettes must not see each other.
- Exported declarations need explicit types (tsdown/oxc, `CLAUDE.md`); no `isolatedDeclarations`.
- Versions move together across the four published packages: `1.0.0-alpha.40`.

## Review Focus

- A token name flowtty does not know (a typo, a newer release's token) — the call must draw the default, never throw.
- An override object holding `undefined` for a token (a host spreading `cond ? x : undefined`) — treated as absent, band and ink unchanged.
- `NO_COLOR` / a 16-colour terminal with a palette in play — the rows must still read as their source lines; a palette never rewrites text.
- A short or wrapped diff row under a palette band — the band still ends flush at the code width and covers every continuation row.
- Two layouts with different palettes in one process — no bleed, because nothing is cached between calls.

---

## File Structure

```
packages/react/src/components/markdown/
  highlight/types.ts        + TokenPalette, TokenColorOverride, TokenColors
  highlight/tokenColors.ts    DEFAULT_TOKEN_COLORS, resolvePalette, createBuilder(palette)
  highlight/engine.ts         tokenizeLine(line, spec, state, palette)
  highlight/js.ts             highlightJs(lines, palette)
  highlight/diff.ts           highlightDiff(lines, palette)
  highlight/languages.ts      LangDef.highlight(lines, palette); fromSpec/highlightMarkup/highlightConsole
  highlight/index.ts          highlightBlock(lines, lang, palette?)
  highlight/palette.spec.ts   NEW
  layout.ts                   MarkdownOptions.tokenColors; rowBackground(kind, palette); layoutCode
  layout.spec.ts              tests
  source.ts                   highlightMarkdownSource(src, width, wrap, opts?)
  source.spec.ts              tests
  ../Markdown.tsx             forwards tokenColors
src/index.ts                  public type aliases
docs/components.md            options table + Diff blocks
```

---

### Task 1: The palette reaches the builder

**Files:**
- Modify: `packages/react/src/components/markdown/highlight/types.ts` (after `TokenStyle`, line 53)
- Modify: `packages/react/src/components/markdown/highlight/tokenColors.ts` (whole file, 51 lines)
- Modify: `packages/react/src/components/markdown/highlight/engine.ts:164`
- Modify: `packages/react/src/components/markdown/highlight/js.ts:93`
- Modify: `packages/react/src/components/markdown/highlight/diff.ts:26-45`
- Modify: `packages/react/src/components/markdown/highlight/languages.ts:12-27,53-60,124-134`
- Modify: `packages/react/src/components/markdown/highlight/index.ts:21-32`
- Test: `packages/react/src/components/markdown/highlight/palette.spec.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type TokenPalette = Readonly<Record<TokenType, TokenStyle>>`
  - `type TokenColorOverride = TokenStyle | Color`
  - `type TokenColors = Partial<Record<TokenType, TokenColorOverride>>`
  - `resolvePalette(overrides?: TokenColors): TokenPalette`
  - `createBuilder(palette?: TokenPalette): SegBuilder`
  - `highlightBlock(lines: readonly string[], lang: string, palette?: TokenPalette): CodeLine[]`
  - `DEFAULT_TOKEN_COLORS: TokenPalette` (replaces the private `TOKEN_COLORS`)

- [ ] **Step 1: Write the failing test**

```ts
// packages/react/src/components/markdown/highlight/palette.spec.ts
import { describe, expect, test } from 'vitest';
import { DEFAULT_TOKEN_COLORS, createBuilder, resolvePalette } from './tokenColors.js';
import { highlightBlock } from './index.js';

describe('the token palette', () => {
  test('an override restyles what the highlighter emits', () => {
    const palette = resolvePalette({ added: 'blue', removed: { color: 'magenta', dim: true } });
    const lines = highlightBlock(['@@ -1 +1 @@', '-gone', '+new'], 'diff', palette);
    expect(lines[1]!.segs[0]).toEqual({ text: '-gone', color: 'magenta', dim: true });
    expect(lines[2]!.segs[0]).toEqual({ text: '+new', color: 'blue' });
  });

  // A partial style merges over the default one: a band alone keeps the ink.
  test('a partial style keeps the fields it does not name', () => {
    const palette = resolvePalette({ added: { background: '#113311' } });
    expect(palette.added).toEqual({ color: 'green', background: '#113311' });
    expect(palette.removed).toEqual(DEFAULT_TOKEN_COLORS.removed);
  });

  // Runs merge on the RESOLVED style, so two tokens that look alike by default
  // stay apart when only one of them is recoloured.
  test('merging happens after the palette, not before', () => {
    const b = createBuilder(resolvePalette({ number: 'red' }));
    b.push('12', 'number');
    b.push('13', 'selector');
    expect(b.segs).toEqual([{ text: '12', color: 'red' }, { text: '13', color: 'yellow' }]);
  });

  // Review Focus: an unknown token and a token left undefined are both "absent".
  test('an unknown token and an undefined value are ignored', () => {
    const over = { added: undefined, nosuchtoken: 'red' } as never;
    expect(resolvePalette(over)).toEqual(DEFAULT_TOKEN_COLORS);
  });

  // Review Focus: no module state — the defaults are never touched.
  test('resolving leaves the defaults alone, whatever the caller does next', () => {
    resolvePalette({ added: 'blue', removed: 'blue' });
    expect(DEFAULT_TOKEN_COLORS.added).toEqual({ color: 'green' });
    expect(DEFAULT_TOKEN_COLORS.removed).toEqual({ color: 'red' });
    expect(resolvePalette()).toBe(DEFAULT_TOKEN_COLORS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/react/src/components/markdown/highlight/palette.spec.ts`
Expected: FAIL — `resolvePalette`/`DEFAULT_TOKEN_COLORS` are not exported; `highlightBlock` takes two arguments.

- [ ] **Step 3: Implement the types, the resolver and the palette-aware builder**

In `types.ts`, beside `TokenStyle`:

```ts
/** The styles a block is drawn with, one per token. */
export type TokenPalette = Readonly<Record<TokenType, TokenStyle>>;
/** One token's override: a whole style, or just the ink. */
export type TokenColorOverride = TokenStyle | Color;
/** What a caller may override; every other token keeps its default. */
export type TokenColors = Partial<Record<TokenType, TokenColorOverride>>;
```

In `tokenColors.ts`: rename `TOKEN_COLORS` to `DEFAULT_TOKEN_COLORS`, annotate it
`TokenPalette`, and add

```ts
export function resolvePalette(overrides?: TokenColors): TokenPalette {
  if (!overrides) return DEFAULT_TOKEN_COLORS;
  const out = { ...DEFAULT_TOKEN_COLORS };
  for (const token of Object.keys(DEFAULT_TOKEN_COLORS) as TokenType[]) {
    const o = overrides[token];
    if (o === undefined) continue;
    out[token] = typeof o === 'string' ? { ...DEFAULT_TOKEN_COLORS[token], color: o } : { ...DEFAULT_TOKEN_COLORS[token], ...o };
  }
  return out;
}
```

and `createBuilder(palette: TokenPalette = DEFAULT_TOKEN_COLORS)` reading
`palette[token]`.

Thread the palette through the four builder sites and the table read:
`tokenizeLine(line, spec, state, palette)`, `highlightJs(lines, palette)`,
`highlightMarkup(lines, palette)`, `highlightConsole(lines, palette)`,
`fromSpec(spec)` returning `(lines, palette)`, `highlightDiff(lines, palette)` with
`row(line, token, kind, palette)` reading `palette[token]`, and
`LangDef.highlight: (lines: readonly string[], palette: TokenPalette) => CodeLine[]`.
`highlightBlock(lines, lang, palette = DEFAULT_TOKEN_COLORS)` passes it to
`def.highlight(lines, palette)`; its `detectLanguage`/`resolveLanguage` paths are
unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/react/src/components/markdown/highlight/palette.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole react suite and the typecheck**

Run: `npm test && npm run typecheck`
Expected: no failures — every existing highlighter test draws what it drew before.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/components/markdown/highlight
git commit -m "feat(markdown): a fenced block's token palette can be overridden"
```

---

### Task 2: `MarkdownOptions.tokenColors`, and the diff bands follow it

**Files:**
- Modify: `packages/react/src/components/markdown/layout.ts:23-37` (options), `:415-417` (`rowBackground`), `:494-500` (`layoutCode`)
- Modify: `packages/react/src/components/Markdown.tsx:67-83`
- Modify: `packages/react/src/index.ts:86-89` (public type exports)
- Modify: `docs/components.md:575-585` (options table), `:593-600` (Diff blocks)
- Test: `packages/react/src/components/markdown/layout.spec.ts` (append to the diff-blocks `describe`)

**Interfaces:**
- Consumes: `resolvePalette(overrides?: TokenColors): TokenPalette`, `TokenColors`, `TokenType`, `highlightBlock(lines, lang, palette)` from Task 1.
- Produces: `MarkdownOptions.tokenColors?: TokenColors`; public aliases `MarkdownToken`, `MarkdownTokenStyle`, `MarkdownTokenColors` in `@flowtty/react`.

- [ ] **Step 1: Write the failing test**

Append to `layout.spec.ts` (the file already declares `ADDED_BG` and `fence`):

```ts
test('tokenColors recolours a diff fence and its band', () => {
  const lines = layoutMarkdown(fence('diff', '@@ -1 +1 @@', '-gone', '+new'), 20, {
    tokenColors: { removed: { color: 'magenta', background: '#220000' }, added: 'blue' },
  });
  const removed = lines[2]!;
  const added = lines[3]!;
  expect(removed.spans.find((s) => s.text.startsWith('-gone'))?.color).toBe('magenta');
  expect(removed.spans.find((s) => s.text.startsWith('-gone'))?.background).toBe('#220000');
  expect(new Set(removed.spans.filter((s) => s.background !== undefined).map((s) => s.background))).toEqual(new Set(['#220000']));
  expect(added.spans.find((s) => s.text.startsWith('+new'))?.color).toBe('blue');
  // Only the ink was overridden: the default band is still there.
  expect(new Set(added.spans.filter((s) => s.background !== undefined).map((s) => s.background))).toEqual(new Set([ADDED_BG]));
});

// Review Focus: a palette never rewrites a row — what a `+`/`-` glyph says survives
// NO_COLOR and a 16-colour terminal unchanged.
test('a palette changes no character of the block', () => {
  const src = fence('diff', '@@ -3,2 +3,3 @@', ' keep', '-gone', '+new');
  const plain = layoutMarkdown(src, 20).map(text);
  const painted = layoutMarkdown(src, 20, { tokenColors: { added: 'redBright', removed: 'red' } }).map(text);
  expect(painted).toEqual(plain);
});

// Review Focus: a band from the palette still ends flush on a wrapped row.
test('a palette band fills a wrapped continuation row', () => {
  const lines = layoutMarkdown(fence('diff', '+aaaaaaaaaaaa'), 10, { tokenColors: { added: { background: '#113311' } } });
  for (const l of lines.slice(1)) {
    expect(l.spans.filter((s) => s.background === '#113311').map((s) => s.text).join('').length).toBe(8);
  }
});

test('diffBackground: false still wins over a palette band', () => {
  const lines = layoutMarkdown(fence('diff', '+new'), 20, {
    diffBackground: false, tokenColors: { added: { background: '#113311' } },
  });
  expect(lines.every((l) => l.spans.every((s) => s.background === undefined))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/react/src/components/markdown/layout.spec.ts`
Expected: FAIL — `tokenColors` is not a known option; rows keep flowtty's inks.

- [ ] **Step 3: Implement**

In `layout.ts`:

```ts
import { resolvePalette } from './highlight/tokenColors.js';
import type { TokenColors } from './highlight/types.js';
// in MarkdownOptions:
  /** Per-token styles for a fenced block, merged over the defaults. A bare
   *  Color is its `color`; any field left out keeps the default. */
  tokenColors?: TokenColors;
```

`rowBackground(kind, palette)` returns `palette[kind]?.background` for
`added`/`removed`, falling back to `ADDED_BG` / `REMOVED_BG` when the palette names
no background for that kind. In `layoutCode`, first statement:
`const palette = resolvePalette(opts.tokenColors);` then
`const code = highlightBlock(b.lines, b.lang, palette);` and
`const background = bands ? rowBackground(hl.kind, palette) : undefined;`.

In `Markdown.tsx`: add `tokenColors` to the destructured props, to `opts`, and to the
`useMemo` dependency list.

In `packages/react/src/index.ts`, beside the `MarkdownOptions` export:

```ts
export type {
  TokenType as MarkdownToken, TokenStyle as MarkdownTokenStyle, TokenColors as MarkdownTokenColors,
} from './components/markdown/highlight/types.js';
```

In `docs/components.md`: one row in the options table —
`| tokenColors | MarkdownTokenColors | unset | Per-token styles for a fenced block, merged over the defaults: a bare colour is its colour, a field left out keeps the default. Names the colours above **and** a diff's inks and bands — see [Diff blocks] |` — and a sentence in **Diff blocks** saying the two inks and the two bands are the defaults, overridable through `tokenColors` (`added`/`removed`, `color`/`background`), with the dark defaults named as `#003b00` / `#3b0000` and the 16-colour caveat kept.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/react/src/components/markdown/layout.spec.ts`
Expected: PASS, including the four new tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `npm test && npm run typecheck`
Expected: green. `docs.spec.ts` still passes (no language changed).

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/components/markdown/layout.ts packages/react/src/components/Markdown.tsx \
  packages/react/src/index.ts packages/react/src/components/markdown/layout.spec.ts docs/components.md
git commit -m "feat(markdown): tokenColors on MarkdownOptions, bands from the palette"
```

---

### Task 3: `highlightMarkdownSource` takes the same palette

**Files:**
- Modify: `packages/react/src/components/markdown/source.ts:92-106,176-189`
- Test: `packages/react/src/components/markdown/source.spec.ts`

**Interfaces:**
- Consumes: `resolvePalette`, `TokenColors` from Task 1.
- Produces: `highlightMarkdownSource(src: string, width: number, wrap: boolean, opts?: { tokenColors?: TokenColors }): SourceLine[]`.

- [ ] **Step 1: Write the failing test**

```ts
test('the source view takes the same palette', () => {
  const rows = highlightMarkdownSource('```diff\n+new\n```', 20, false, { tokenColors: { added: 'blue' } });
  const row = rows.find((r) => r.spans.some((s) => s.text === '+new'))!;
  expect(row.spans.find((s) => s.text === '+new')?.color).toBe('blue');
});

test('no palette leaves the source view exactly as it was', () => {
  const src = '# T\n\n```ts\nconst a = 1\n```';
  expect(highlightMarkdownSource(src, 40, true)).toEqual(highlightMarkdownSource(src, 40, true, {}));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/react/src/components/markdown/source.spec.ts`
Expected: FAIL — `+new` is `green`, and the fourth argument is not accepted by the types.

- [ ] **Step 3: Implement**

Add the optional fourth parameter, resolve it once, and pass the palette through
`fencedCodeLines(lines, palette)` into `highlightBlock(lines.slice(start, end), lang, palette)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/react/src/components/markdown/source.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/components/markdown/source.ts packages/react/src/components/markdown/source.spec.ts
git commit -m "feat(markdown): highlightMarkdownSource accepts a token palette"
```

---

### Task 4: Version, changelog, release

**Files:**
- Modify: `packages/core/package.json`, `packages/react/package.json`, `packages/tty-backend/package.json`, `packages/inline-tty-backend/package.json` (line 3, each)
- Modify: `CHANGELOG.md` (top)

**Interfaces:**
- Consumes: everything above.
- Produces: `@flowtty/*@1.0.0-alpha.40` published — the version flow-assist's own plan waits on.

- [ ] **Step 1: Bump all four packages**

`"version": "1.0.0-alpha.40"` in each of the four `package.json` files. Nothing else
in them changes.

- [ ] **Step 2: Write the changelog entry**

```markdown
## 1.0.0-alpha.40 — 2026-11-24

### Added

- **A fenced block's colours are the caller's to set.** `MarkdownOptions.tokenColors`
  (and the same prop on `<Markdown>`) takes a partial map of token → style or colour,
  merged over the defaults and resolved once per block, so a row's ink is settled
  before neighbouring runs merge. A diff's row bands follow the palette when it names
  a `background`; `diffBackground: false` still removes them all. The same palette
  reaches `layoutMarkdown`, `layoutMarkdownDetailed`, `<Markdown>` and
  `highlightMarkdownSource`. With no overrides the output is unchanged.
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck`
Expected: green.

- [ ] **Step 4: Publish**

Run: `npm run release:publish`
Expected: the four packages published at `1.0.0-alpha.40`; the tree's `package.json`
`exports` restored to `./src/index.ts` (never commit the flipped form).

- [ ] **Step 5: Commit and tag**

```bash
git add packages/*/package.json CHANGELOG.md
git commit -m "chore: release 1.0.0-alpha.40"
git tag v1.0.0-alpha.40
```
