# Markdown token palette — design

**Status:** proposed, awaiting approval.

## Intent

A host can change what a fenced code block *means* without redrawing it. Today
the only colour knob on a fenced block is `diffBackground`, and the inks come
from a table inside `@flowtty/react` that no caller can reach. That became a
visible defect downstream: flow-assist draws a diff twice — a `✎` block inside
the conversation (flowtty's fence, added green / removed red) and the `/diff`
panel (its own rows, added green / removed `warn` yellow) — and the two say
different things about a deletion. The fix that needs no fork, no span
rewriting and no second vocabulary is a per-call override of the token palette.

Who it serves: any host that has a palette of its own and draws diffs or code
with flowtty's layout — flow-assist first, plugin authors after it.

## Goals

- One option, `tokenColors`, on `MarkdownOptions` (and therefore on
  `<Markdown>`'s props): per token, the style to draw instead of the default.
- The same option reaches every entry point that colors code:
  `layoutMarkdown`, `layoutMarkdownDetailed`, `Markdown`,
  `highlightMarkdownSource`.
- A default run with no option is byte-for-byte what it is today.
- A diff's row bands follow the palette when the palette names a background, and
  stay `diffBackground`'s kill switch.

## Non-goals

- No new substitution grammar (`${added}` and the like). A host resolves its own
  tokens (flow-assist already has `resolveColorRefs`) and passes a concrete
  `Color`.
- No ambient theme, provider or global setter. `layoutMarkdown` is a pure
  function outside React context, and it must stay one.
- No mapping for languages, no per-language palettes, no light/dark detection
  inside flowtty: the host decides, flowtty draws.
- `highlightMarkdownSource`'s existing positional arguments do not change shape;
  the palette arrives as a new optional fourth argument.

## Anti-goals

- A host pushing a colour that the 16-colour downgrade cannot express *silently*.
  Values stay `Color` and go through the existing paint path, but the override is
  the host's own doing and its own risk — the defaults stay named colours.
- Any measurable cost on the common path: no palette object passes through the
  tokenizer when the option is absent.
- Two tables drifting apart again: the defaults must remain one table, and the
  override must be a merge over it, not a second copy.

## Constraints

- `TOKEN_COLORS` lives in `highlight/tokenColors.ts`; the builder
  (`createBuilder`) is the only place a token becomes a style, and it is created
  in four places (`engine.ts`, `js.ts`, `languages.ts` ×2) plus `diff.ts`, which
  reads the table directly.
- `LangDef`, `LangSpec`, `TokenStyle` are internal; `CodeSeg`/`CodeLine` are the
  public output and must not gain fields for this.
- Style merging happens in the builder (`sameStyle`), so a palette must be
  applied *before* merging or two tokens that look alike under the override would
  merge and only half of them would be recoloured.
- flowtty is consumed by flow-assist as a published package, not the checkout
  beside it: the change needs a release (`1.0.0-alpha`), and flow-assist bumps
  after it.

## Approaches considered

1. **`tokenColors` on `MarkdownOptions`, palette threaded to the builder.**
   Chosen. Exact by construction — merging sees the final styles — the defaults
   stay in one table, and no public output shape changes. Cost: a palette
   parameter through `LangDef.highlight` and five small call sites.
2. **`token` on `CodeSeg` plus a restyle pass in `highlightBlock`.** Fewer edits,
   but it leaks the token vocabulary into public output, and it is only exact if
   merging also compares tokens (otherwise a merged run takes the first token's
   style). The same work, a worse surface.
3. **Ambient palette (provider / module setter).** Rejected: `layoutMarkdown` is
   pure and outside React; module state is re-entrancy and cross-test leakage.
4. **Colour aliases resolved by flowtty (`${added}`).** Rejected: a second
   grammar duplicating the host's own resolver, with an "unresolved token"
   question flowtty has no answer for, and no capability over (1).

## Design

### Public surface (`@flowtty/react`)

```ts
type MarkdownToken = 'plain' | 'comment' | 'string' | 'number' | 'keyword'
  | 'type' | 'key' | 'command' | 'property' | 'selector' | 'tag' | 'component'
  | 'attr' | 'entity' | 'directive' | 'annotation' | 'muted'
  | 'added' | 'removed' | 'hunk' | 'header';
interface MarkdownTokenStyle {
  color?: Color; dim?: boolean; bold?: boolean; background?: Color;
}
type MarkdownTokenColors = Partial<Record<MarkdownToken, MarkdownTokenStyle | Color>>;

interface MarkdownOptions {
  // … existing fields …
  /** Per-token styles for a fenced block, merged over the defaults. A bare
   *  Color is its `color`. */
  tokenColors?: MarkdownTokenColors;
}
```

Internally `TokenType`/`TokenStyle` keep their names; the index re-exports them
as `MarkdownToken`/`MarkdownTokenStyle`.

### Semantics

- **Merge, not replace.** A key left out keeps the default. `dim: false`
  overrides `comment`'s `dim: true`. A bare string is `{ color: value }`.
- **One table.** `DEFAULT_TOKEN_COLORS` stays where it is; a call resolves
  `{ ...DEFAULT, ...override }` once per *fenced block* (not per line), and the
  resolved table is what the builder reads — so `sameStyle` merging keeps
  working exactly as now.
- **Bands.** `layoutCode` derives a diff row's band from the resolved style's
  `background`, falling back to the current `#003b00` / `#3b0000`.
  `diffBackground: false` still removes every band, whatever the palette says.
  The defaults are dark grounds with no light-scheme counterpart in flowtty —
  a host on a light terminal supplies its own through `background`, which is
  what makes the bands readable there (a pale band under the same inks).
- **No option, no change.** With `tokenColors` absent the pipeline is the
  current one: no palette object is allocated, no lookup changes.

### Plumbing

- `tokenColors.ts`: `createBuilder(palette)`, `TOKEN_COLORS` unchanged and
  exported internally as `DEFAULT_TOKEN_COLORS`; `resolvePalette(override)`.
- `types.ts`: `TokenPalette = Readonly<Record<TokenType, TokenStyle>>`;
  `LangDef.highlight(lines, palette)`.
- `engine.ts`, `js.ts`, `markup.ts`, `diff.ts`, `languages.ts`: accept the
  palette and pass it to the builder / to `TOKEN_COLORS[kind]`.
- `index.ts` (`highlightBlock`): `highlightBlock(lines, lang, tokenColors?)`
  resolves once and hands it down.
- `layout.ts`: `layoutCode` passes `opts.tokenColors` and reads the resolved
  palette for bands.
- `source.ts`: `highlightMarkdownSource(src, width, wrap, opts?)` where `opts`
  is `{ tokenColors?: MarkdownTokenColors }`.

### Docs

`docs/components.md`: a `tokenColors` row in the options table, and the “Diff
blocks” section says the two inks and the two bands are overridable — with the
16-colour caveat kept. `CHANGELOG.md`: one “Added” entry in `1.0.0-alpha.40`.

## Downstream (flow-assist)

Two commits in two repos, in this order.

**flowtty** — the change above, its tests, a release.

**flow-assist**:

1. `src/playback/theme.ts` — four new keys in `theme.modals.chat`: `add`
   (dark `green`, light `green`), `del` (dark `red`, light `#a40000`), and the
   grounds they sit on, `addBg` (dark `#003b00`, light `#e6f4e6`) and `delBg`
   (dark `#3b0000`, light `#fce8e8`). `warn` keeps meaning "waits on the
   person"; reusing it for a deletion is what let the two views drift.
2. `src/views/modals.ts` — one `chatMarkdownOptions(m)` helper returning
   `{ tokenColors: { added: { color: m.add, background: m.addBg }, removed: { color: m.del, background: m.delBg }, hunk: m.accent } }`,
   used by `blockLines` (the `✎` block) and by `mdLines` (a diff the model
   writes in an answer), so both read as the panel does.
3. `diffPanelBody` — `-` rows take `m.del` instead of `m.warn`, and their code
   area sits on a `Box` ground of `m.delBg`; `+` rows likewise on `m.addBg`.
   The band is a `flexGrow: 1` Box beside the number gutter, not padded spaces,
   so it reaches the panel's right edge like flowtty's band and a drag still
   copies the code alone.
4. Tests: a frame test proving the `✎` block and the panel draw the same ink
   *and* the same band for `+` and `-`, and that `warn` no longer appears on a
   diff row.

The bands stay on in both views. They do not fight any ground of the chat's:
the `✎` block sits in the assistant's message, whose ground is the modal's `bg`
(`groundOf` answers `undefined` for that role). What they do need is a
light-scheme value, which is why they come from the palette now: flowtty's
`#003b00`/`#3b0000` under a black-on-light chat is unreadable today — that is a
defect of the current `✎` block, not a reason to drop the bands.

No `HOST_API` bump: the option is flowtty's, it is additive, and a plugin sees
flowtty through the host's bundled copy.

## Verification

- flowtty: `npm test` and `npm run typecheck`; a default-run frame compared
  byte for byte against the current layout; an override test on a labelled and an
  auto-detected diff; a merge test (`dim: false` on `comment`, a bare `Color`);
  a band test with and without `tokenColors.removed.background`.
- flow-assist: `bun run typecheck && bun test ./src ./scripts ./packages`.

## Left to the builder

- Whether `DEFAULT_TOKEN_COLORS` is exported publicly (this design says no; the
  documented table is enough).
- The exact light-scheme `del` value (`#a40000` is a starting point).
- Whether syntax tokens — `number`/`string`/`keyword` — are also mapped for the
  light scheme in flow-assist. Out of scope here; the option makes it a one-line
  change later.
