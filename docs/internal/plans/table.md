# Table component (#93)

A declarative grid: `data` rows × `columns` definitions, drawn with box-drawing
rules. v1 ships **fit-to-width** (columns shrink to the available width, cells
truncate with `…`). Horizontal scroll is a deliberate follow-up (it needs a
focus + keyboard surface like `Select`/`Menu`, and only one focused widget can
own ←/→ at a time).

## API

```ts
interface TableColumn<T> {
  accessor: keyof T | ((row: T, index: number) => string);
  header?: string;                       // default String(accessor) when a key
  align?: 'left' | 'right' | 'center';   // default 'left'
  width?: number;                        // fixed content width; auto when omitted
  minWidth?: number;
  maxWidth?: number;
}

interface TableProps<T> {
  data: readonly T[];
  columns: readonly TableColumn<T>[];
  border?: BorderStyle | 'none';   // default 'single'
  borderColor?: string;
  cellPadding?: number;            // spaces each side of content; default 1
  showHeader?: boolean;            // default true
  headerColor?: string;
  headerBold?: boolean;            // default true
  width?: number;                  // fixed total budget; omit to fit container
}
```

## Width source

- `width` prop set → fixed budget, no measurement.
- omitted → measured container width via `onLayout` on the outer column box
  (mirrors `ProgressBar`). Initial budget before the first layout = terminal
  width (`useTerminalSize`) so the first frame is sensible; refined on layout.
  Diff before `setState` (onLayout fires every paint).

## Fit algorithm (shrink-to-fit, never stretch up)

1. Natural content width per column = max(header, all cells) in **code points**;
   honor explicit `width`; clamp to `[minWidth, maxWidth]`.
2. Chrome = fixed: verticals (`ncols+1` bordered, else 0) + `ncols * 2*cellPadding`.
3. If `sum(content) > budget - chrome`, shrink the widest *non-fixed* column by 1
   repeatedly down to a floor of `max(minWidth ?? 1, 1)` until it fits (or all at
   floor → overflow, clipped by the terminal).
4. Truncate each cell to its final width with `…` in the last cell; pad to width
   per `align`.

## Why code points, not `stringWidth` (#92)

The painter writes **one grid cell per code point**, and the wide-char interim
(`\b` after a double-width glyph) keeps `grid column == physical column`. So the
grid — and therefore rule/junction alignment — is code-point indexed. Sizing by
code points keeps borders aligned. `stringWidth` becomes the correct sizing
primitive only once paint reserves the second cell for wide glyphs (the deferred
cell-accurate work). CJK/emoji cells render with the same visual overlap as the
rest of flowtty until then.

## Rendering

- Rule rows (top `┌┬┐`, header sep `├┼┤`, bottom `└┴┘`) = one `<Text>` of the
  full rule string, `borderColor`. Junction glyphs per style live in a local
  `TABLE_CHARS` map (the shared `BORDER_CHARS` lacks `┬┼┴├┤`).
- Content rows = a `<Box flexDirection="row">` of alternating vertical glyphs
  (`borderColor`) and pre-padded cell `<Text>` spans (header spans get
  `headerBold`/`headerColor`). Every span is an exact code-point width, so the
  row aligns to the rules.
- `border: 'none'` → no rule rows; columns separated by their padding only.
