# Layout

Every `<Box>` is a Yoga flexbox node. These are the props that size, place, clip and scroll it. Yoga's defaults are not CSS's — most importantly `flexShrink` is `0`, so a child keeps its natural size and overflows unless you give it `flexShrink={1}`.

- [Borders](#borders)
- [Inherited colors](#inherited-colors)
- [Padding](#padding)
- [Margin](#margin)
- [Gap](#gap)
- [Flex sizing](#flex-sizing)
- [Flex wrap](#flex-wrap)
- [Align content](#align-content)
- [Size constraints](#size-constraints)
- [Aspect ratio](#aspect-ratio)
- [Display](#display)
- [Size awareness](#size-awareness)
- [zIndex](#zindex)
- [Overflow](#overflow)
- [Scrolling](#scrolling)
  - [ScrollList (virtualized)](#scrolllist-virtualized)
- [Selection scopes](#selection-scopes)

## Borders

`<Box border>` draws a one-cell border on all four edges. The cells are reserved
via Yoga's per-edge border slots, so content fits inside the ring automatically.

- `border="single"` → `┌─┐ │ │ └─┘`
- `border="double"` → `╔═╗ ║ ║ ╚═╝`
- `border="round"`  → `╭─╮ │ │ ╰─╯`
- `border="bold"`   → `┏━┓ ┃ ┃ ┗━┛`
- `border="classic"` → ASCII fallback `+-+ | | +-+`

`borderColor` accepts the same values as `color` (named, `#rrggbb`, `rgb(...)`).
Boxes smaller than 2×2 silently skip the border.

Border cells share the box's background: they default to the box's effective
background color (own `backgroundColor`, else the inherited one), so a filled
modal keeps its fill under the border ring. `borderBackgroundColor` overrides
that for the border cells only; the `'default'` value keeps them on the
terminal default background.

Border glyphs follow the same rule for the foreground: with no `borderColor`
they take the box's effective text color (own `color`, else the inherited one),
so a panel that sets `color` keeps its frame visible; `borderColor: 'default'`
keeps them on the terminal's own foreground.

## Inherited colors

A box's `backgroundColor` and `color` reach every descendant that sets none of
its own: text, `<Span>` runs and border glyphs inside a `<Box color="white"
backgroundColor="black">` all paint white on black, and a `<Text color="cyan">`
inside it still paints cyan. Set a panel's colors once, on the panel, instead of
on every line in it — that is what keeps a dark panel readable on a light
terminal theme, where the default foreground is black.

Both accept `'default'`, the terminal's own color: `color="default"` on a box
resets its text and everything below it to the terminal foreground, as
`backgroundColor="default"` does for the background. `dim`, `bold` and the other
attributes are not inherited; they apply on top of whatever color is in effect.
To pick the colors for the scheme the terminal is actually on, see
[The color scheme](app.md#the-color-scheme).

## Padding

`<Box>` accepts CSS-style padding props. Per-edge wins over axis wins over shorthand.

- `padding={n}` — all four edges
- `paddingX={n}` — left + right
- `paddingY={n}` — top + bottom
- `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` — per-edge override

Values are integer cell counts. Padding and border combine — a `<Box border="single" padding={1}>` insets content by 2 cells on each side (1 border + 1 padding). `backgroundColor` fills the full rect including padding cells.

## Margin

`<Box>` accepts CSS-style margin props. Same precedence as padding (per-edge > axis > shorthand).

- `margin={n}` — all four edges
- `marginX={n}` — left + right
- `marginY={n}` — top + bottom
- `marginTop`, `marginRight`, `marginBottom`, `marginLeft` — per-edge override

Values are integer cell counts. Negative values are allowed — Yoga supports them for overlap layouts (a child with `marginLeft={-1}` shifts one cell into its preceding sibling's space).

## Gap

`<Box>` accepts CSS-style gap props for spacing between flex children.

- `gap={n}` — both axes
- `rowGap={n}` — vertical spacing (between rows / column-flex items)
- `columnGap={n}` — horizontal spacing (between columns / row-flex items)

Per-axis wins over shorthand. Gap applies BETWEEN siblings only — no extra space at the parent's leading or trailing edge. Often cleaner than per-child `marginRight`/`marginBottom` for evenly-spaced lists.

## Flex sizing

`<Box>` accepts the three flex sizing props:

- `flexGrow={n}` — claim a share of leftover space (proportional weight; default `0`)
- `flexShrink={n}` — claim a share of deficit when siblings overflow (proportional weight; default `0`)
- `flexBasis={n | 'auto' | '50%'}` — initial size before grow/shrink applies (default `'auto'` — uses `width`/`height`)

**Defaults match Yoga, not CSS.** CSS sets `flex-shrink` to `1` by default — flowtty (via Yoga) leaves it at `0`, so children overflow rather than shrink unless `flexShrink={1}` is set explicitly. Useful when overflow is intentional; surprising if you're used to CSS.

## Flex wrap

`<Box flexWrap>` controls multi-line flex layouts. Default `'nowrap'`.

- `flexWrap="nowrap"` (default) — single line; children overflow or shrink to fit
- `flexWrap="wrap"` — children flow to additional lines when they exceed the main axis
- `flexWrap="wrap-reverse"` — same as `wrap`, but wrap lines stack in reverse cross-axis order

When wrap is on, `rowGap` controls spacing between wrap lines (perpendicular to the main axis); `columnGap` continues to control spacing between items on the same line.

## Align content

`<Box alignContent>` controls cross-axis distribution of wrap lines. Only effective when `flexWrap` is `'wrap'` or `'wrap-reverse'` AND the parent has more cross-axis space than the wrap lines need. Default `'flex-start'`.

- `'flex-start'` (default) — lines packed at cross-axis start
- `'flex-end'` — lines packed at cross-axis end
- `'center'` — lines centered
- `'space-between'` — first line at start, last at end, free space between
- `'space-around'` — equal space around each line
- `'space-evenly'` — equal space between all lines including edges
- `'stretch'` — lines stretch to fill cross-axis space

CSS deviation: CSS3 defaults `align-content` to `'stretch'` for flex; flowtty defaults to `'flex-start'` (deterministic, doesn't reflow content unexpectedly).

## Size constraints

`<Box>` accepts four optional min/max size props that clamp Yoga's computed size:

- `minWidth={n | '50%'}` — prevents flexShrink (and content) from shrinking below this
- `maxWidth={n | '50%'}` — caps flexGrow (and explicit width) at this
- `minHeight={n | '50%'}` — column-flex analog of `minWidth`
- `maxHeight={n | '50%'}` — column-flex analog of `maxWidth`

Each accepts a cell count or a percent string. Undefined = no constraint. Useful for responsive layouts (e.g. `maxWidth: '80%'` on a content panel) and for keeping flex-grow children from claiming all available space.

## Aspect ratio

`<Box aspectRatio>` is a number representing `width / height` (CSS convention). When one dimension is constrained (via `width`, `height`, or flex sizing), Yoga derives the other from the ratio.

- `aspectRatio={2}` — twice as wide as tall (e.g., `width=10` → `height=5`)
- `aspectRatio={0.5}` — twice as tall as wide (e.g., `height=4` → `width=2`)
- `aspectRatio={1}` — square

Useful for media-style panels where you want a fixed shape regardless of container size — e.g., a flex child with `flexGrow={1} aspectRatio={3}` claims leftover horizontal space and adjusts its height to maintain a 3:1 ratio.

## Display

`<Box display>` controls whether this box (and its subtree) participates in layout. Default `'flex'`.

- `display="flex"` (default) — normal flexbox participation
- `display="none"` — box and all descendants are removed from layout and skipped by paint. Siblings reflow as if this box didn't exist. React state is preserved (unlike conditionally unmounting).

Useful for tab panels, collapsible sections, and conditional UI where remounting would lose form state, scroll position, or other ephemeral state.

## Size awareness

Two complementary primitives for components that need to know their allocated space.

**`onLayout` (per-box, nested-friendly):**

```tsx
<Box onLayout={(rect) => {/* rect = { left, top, width, height } */}}>
```

Fires after layout with this box's computed rect. Use for components inside a flexbox layout (e.g. an `<ArticleReader>` in a 70% panel needs to paginate against the panel's width, not the terminal's). **Diff before `setState`** — onLayout fires on every paint; unconditionally setting state with a new object infinite-loops:

```tsx
<Box flexGrow={1} onLayout={(r) => {
  if (!size || size.width !== r.width || size.height !== r.height) setSize(r);
}}>
```

**`useTerminalSize()` (whole terminal):**

```tsx
import { useTerminalSize } from '@flowtty/react';

function App() {
  const { width, height } = useTerminalSize();
  return <Box width={width} height={height}>…</Box>;
}
```

Returns the current terminal size; re-renders on `backend.onResize` (TTY) or initial-only (TestBackend / fixed-size). Useful for full-screen apps that own the terminal. For nested components, prefer `onLayout`.

## zIndex

`<Box zIndex>` is an integer; higher values paint on top of lower within the same paint pass. Default `0`. Tree order is the natural tiebreaker (later sibling wins).

**Does NOT cross pass boundaries.** Stack-flow children paint first, then absolutes — an absolute with `zIndex={0}` still overlays a stack-flow with `zIndex={999}`. zIndex only reorders siblings within the same pass.

## Overflow

`<Box overflow>` controls whether descendants are clipped to this box's content rect. Default `'visible'`.

- `'visible'` (default) — descendants may extend past this box (current behavior)
- `'hidden'` — descendants clipped to content rect; ALL descendant writes (backgrounds, borders, own-text, nested children) are gated

`'hidden'` does NOT clip the box's own background or border — those are this box's own area, not its descendants' writes. Clips are intersected across nested `overflow: 'hidden'` ancestors.

## Scrolling

`scrollTop` / `scrollBottom` turn a box into a **scroll viewport**: it clips like
`overflow="hidden"` and paints its flow children shifted by that many rows.

- `scrollTop={n}` — rows scrolled from the top. `scrollBottom={n}` — rows from the
  END of the content; `scrollBottom={0}` pins the last rows into view.
- The value is clamped at paint time against the content's *current* height, so a
  pinned view follows growing content in the same frame — no catch-up repaint.
  Content shorter than the viewport never scrolls (it sits at the top).
- `position="absolute"` children are **overlays**: they don't scroll and don't
  count as content. That is how a scrollbar or a sticky header row is drawn.
- `onScrollMetrics({ contentHeight, viewportHeight, scrollTop, maxScrollTop })`
  fires every paint (diff before `setState`, like `onLayout`).
- A scrolled child's `onLayout` reports its on-screen row (negative once it is
  above the viewport) and still fires while it is clipped away.

Most apps want the component instead:

```tsx
<Box flexDirection="column" height="100%">
  <Header />
  <ScrollBox flexGrow={1} flexShrink={1} anchor="bottom" scrollbar>
    {messages.map((m) => <Message key={m.id} {...m} />)}
  </ScrollBox>
  <Prompt />
</Box>
```

`<ScrollBox>` sizes like any `<Box>` — with `flexGrow` it takes whatever the
layout leaves, so the app never adds up sibling heights to know how many rows fit.

| Prop | |
|---|---|
| `anchor` | `'top'` (default) or `'bottom'`. Bottom is the chat/log shape: the last rows show and stay in view as content grows — until the user scrolls up, after which new content no longer moves what they are reading. Scrolling back to the end re-pins. |
| `offset` / `onScroll` | Controlled position, in rows from the anchored edge (0 = at that edge). When `offset` is set the box never moves on its own; keys and the wheel only report through `onScroll(offset, metrics)`. |
| `onMetrics` | Content / viewport heights changed — for a "↑ more" hint, or a host that clamps its own `offset`. |
| `isActive` | Handle PgUp / PgDn and the wheel (default `true`). The wheel only counts while the pointer is over the box. |
| `wheelStep`, `pageStep` | Rows per wheel notch (default 3) and per PgUp/PgDn (default: viewport height − 1). |
| `scrollbar` | Draw a thumb in the right-hand column while the content overflows. |
| `ref` | `scrollTo(offset)`, `scrollToStart()`, `scrollToEnd()`. |

Every child is laid out by Yoga (cleanly cached between frames), but only rows
in view are drawn, so a few thousand rows scroll comfortably. Keep rows cheap to
re-render — one memoized component per message, not one per line.

A `<ScrollBox>` is a selection scope of its own: a drag inside it is confined to
the rows in view, and the scrollbar column is not part of it. See
[Selection scopes](#selection-scopes).

### ScrollList (virtualized)

A `<ScrollBox>` lays out every child each frame, so a keystroke over a long
conversation costs more the longer it gets. `<ScrollList>` is a `<ScrollBox>` for
long lists of equal-height rows — a chat, a log, a result set — that renders only
the rows near the viewport and stands in for the rest with two spacers of the
right height:

```tsx
<ScrollList
  flexGrow={1} flexShrink={1} anchor="bottom" scrollbar
  items={messages}
  keyOf={(m) => m.id}
  renderItem={(m) => <Message {...m} />}
/>
```

It *is* a `<ScrollBox>` underneath, so everything above holds: `anchor`,
`offset` / `onScroll`, `onMetrics`, `isActive`, `wheelStep` / `pageStep`,
`scrollbar`, the `ref` handle and the `<Box>` sizing props pass straight
through, and `position="absolute"` children are overlays over the viewport. The
content is exactly `items.length × rowHeight` rows tall, so anchoring, the
metrics and the scrollbar are the same as with every row present.

| Prop | |
|---|---|
| `items` | The rows, in order. Read, never copied or wrapped: hand over the same array while nothing changed and nothing re-renders. |
| `renderItem(item, index)` | Draws one row. Called only for rows inside the rendered window. |
| `keyOf(item, index)` | A stable key per row, so React keeps a row's subtree while the window moves. Default: the index — fine while rows are only appended. |
| `rowHeight` | Rows every item takes (default 1). **Every row is exactly this tall**: each is laid out in a box of that height, so an item that would be taller spills under the next row, which paints over it, rather than moving the rows below. (The box is not a clip: a clip one row tall would drop the `wrapContinues` mark a wrapped paragraph needs to copy as one line.) Variable heights are not supported. |
| `overscan` | Rows rendered beyond each edge of the viewport (default: one viewport height), so a small scroll step finds its rows already there and re-renders nothing. The window moves only once the viewport gets within half this many rows of its edge, so up to half as many again may be rendered. |
| `children` | Overlays only: `position="absolute"` children, as in `<ScrollBox>`. |

The window follows the scroll position: a key, the wheel or a handle call moves
it in the same batch as the scroll, so the next frame has its rows. A position
the list only learns from the paint — a controlled `offset` set by the app, a
jump that lands outside the window — can leave the viewport blank for one frame
until the metrics arrive and the window catches up.

Rows in view are real children, so a drag over them selects their cells, a
wrapped paragraph inside a row still copies as one line and `selectable={false}`
chrome is left out, as in any `<ScrollBox>`; a drag that runs past the edge stops
at the viewport, as every scoped drag does. Copy-on-select copies **what is on
screen** — the rows painted, not the rows outside the window.

## Selection scopes

Two props say what a drag-selection over the frame may cover. Neither affects
layout or paint — they are read when a press lands. The whole feature is
described in [Input](input.md#selection).

| Prop | |
|---|---|
| `selectionScope` | Confine a drag that starts inside this box to its **content rect** — inside border and padding, and inside whatever clips it. The drag point is clamped there, so sweeping out of a pane selects to its edge instead of into the neighbour or onto the border. The nearest scoped ancestor-or-self wins; with none, a drag covers the whole frame. `<ScrollBox>`, `<Table>` and each `<DialogHost>` dialog set it already. |
| `selectable` | Default `true`, inherited. `false` takes this box's whole rect out of every selection, children included: nothing in it is highlighted, nothing in it is copied, and a press inside it starts nothing. `<Menu>`'s bar and dropdowns set it. |
