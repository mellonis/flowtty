# Components

The building blocks beyond `<Box>` and `<Text>`. Forms, focus and buttons are in [input.md](input.md); dialogs are in [app.md](app.md).

- [TextInput](#textinput)
- [Select](#select)
- [MultiSelect](#multiselect)
- [TextArea](#textarea)
- [Table](#table)
- [Markdown](#markdown)
- [Link](#link)
- [Spinner](#spinner)
- [ProgressBar](#progressbar)
- [TaskList](#tasklist)

## TextInput

A single-line field. Controlled (`value` + `onChange`) or, for a one-shot prompt,
uncontrolled (`defaultValue`).

```tsx
<TextInput value={slug} onChange={setSlug} onSubmit={save} onCancel={close}
  validate={(v) => (/^[a-z-]+$/.test(v) ? null : 'kebab-case only')} />
```

| Prop | |
|---|---|
| `value` / `onChange` | Controlled value. Omit `value` for an uncontrolled field. |
| `defaultValue` | Initial value of an uncontrolled field. |
| `onSubmit(value)` | Enter — only if `validate` passes. |
| `onCancel()` | Escape. |
| `validate(value)` | Return a message to reject a submit, `null` to accept. The message is drawn in red under the field and cleared by the next edit; `showError={false}` leaves that to you. |
| `mask` | Draw `•` per character (passwords). |
| `isFocused` | Override focus; by default the enclosing `<FocusGroup>` decides. |

Editing keys: ←/→, Home/End and Ctrl+A / Ctrl+E, Alt+←/→ (or Alt+B / Alt+F) by
word, Backspace / Delete, Alt+Backspace and Ctrl+W delete a word back, Alt+D a
word forward, Ctrl+K / Ctrl+U kill to the end / start. A paste is inserted at the
caret with its line breaks turned into spaces. An emoji is one character. For
several lines use [`<TextArea>`](#textarea).

## Select

Pick one of a list. The highlighted item *is* the value.

```tsx
<Select items={[{ label: 'Hobby', value: 'hobby' }, { label: 'Team', value: 'team' }]}
  value={plan} onChange={setPlan} onSubmit={confirm} />
```

↑/↓ (or `k` / `j`) move and wrap around; typing narrows the list to labels
containing what was typed (case-insensitive), Backspace widens it again; Enter
calls `onSubmit`, Escape `onCancel`. Because `j` and `k` navigate, they cannot be
typed into the filter. The generic parameter is the value type —
`<Select<Plan> …>` in JSX keeps it, `createElement` loses it.

## MultiSelect

Pick any number. `value` is the array of selected values, always in the order of
`items`.

```tsx
<MultiSelect items={tags} value={picked} onChange={setPicked} onSubmit={next}
  onAddNew={async () => (await askForTag()) ?? null} />
```

↑/↓ move, Space toggles, Enter submits, Escape cancels. `onAddNew` adds a
"+ add new" row; return the new item's value — directly or as a promise, e.g.
after a sub-prompt in a dialog — and the component selects it and moves the cursor
onto it once it appears in `items` (adding it to `items` is the caller's job).
Return `null` for a cancelled prompt.

Both lists show focus: a colored, bold `▸` and a bold cursor row when focused, a
dim marker when not.

## TextArea

`<TextArea>` is the multi-line sibling of `<TextInput>`: soft wrap, a caret that
moves across visual rows (and can stand on a blank line), Home/End, word motion
and the kill bindings per line, and pastes inserted with their line breaks. Its
height is its row count, capped by `maxRows`, so the layout around it needs no
bookkeeping.

```tsx
<TextArea
  value={text} onChange={setText} onSubmit={send}
  maxRows={5}
  prefix={<Text color="cyan">› </Text>} continuationPrefix="  "
  placeholder="type a message"
  onKey={(key) => key.name === 'tab' && complete()}   // true = consumed
/>
```

- **Line breaks.** Enter submits. Shift+Enter, Alt+Enter and **backslash then
  Enter** insert a line break — the last one works in every terminal (without the
  Kitty protocol many terminals send plain Enter for Shift+Enter).
- **`onKey(key)`** runs before the field's own handling; return `true` to consume
  the key. That is how a host owns Enter, Tab, Escape, or history on up/down.
- **Caret.** Uncontrolled by default; a value replaced from outside (history,
  completion) puts the caret at its end. Pass `cursor` + `onCursorChange` to
  control it.
- **`prefix` / `continuationPrefix`** — a gutter before the first row of the value
  and before every other row; the text wraps in the width that is left.
- **`ghost`** — untyped completion drawn dim after the value while the caret is
  at its end, with the caret on the ghost's first character; not part of the
  value. **`suffix`** renders after it (a key hint). Typed text is never dimmed.

The pure parts are exported for custom fields: the editor reducer takes
`{ multiline: true, width }`, and `inputRows(value, width, cursor?)` /
`caretPosition(value, cursor, width)` give the row layout and the caret's place in it.

**Units.** `cursor` (and `InputRow.start`) is a UTF-16 index into the value, so
`value.slice(0, cursor)` is the text before the caret — but it only ever rests on
a character boundary: an emoji is two UTF-16 units and the editor steps over,
deletes and wraps it as ONE character. Widths and `caretPosition().col` count
characters (code points), the grid's unit; `rowIndexAt(row, col)` converts a
column back to an index. Grapheme clusters (ZWJ emoji, combining marks) are not
merged — code point is the floor. A paste's `\r\n` / `\r` become `\n` in the
reducer itself, so a host that builds its own `paste` key is covered too.

## Table

`<Table>` draws a data grid: `data` rows × `columns` definitions, with
box-drawing rules (`border`) or whitespace (`border="none"`).

```tsx
import { Table } from '@flowtty/react';

<Table
  data={[
    { name: 'Ann', role: 'Engineer', age: 30 },
    { name: 'Bo',  role: 'Designer', age: 27 },
  ]}
  columns={[
    { accessor: 'name', header: 'Name' },
    { accessor: 'role', header: 'Role' },
    { accessor: 'age',  header: 'Age', align: 'right' },
  ]}
/>
```

Each `TableColumn` has an `accessor` (a row key, or `(row, i) => string`), an
optional `header` (defaults to the key), `align` (`'left'` | `'right'` |
`'center'`), and `width` / `minWidth` / `maxWidth` bounds. Table-level props:
`border` (`'round'` default, `'single'`, `'double'`, `'bold'`, `'classic'`, or
`'none'`), `borderColor`, `cellPadding` (default 1), `showHeader` (default
`true`), `headerColor`, and `headerBold` (default `true`).

**Fit-to-width.** With no `width` prop the table measures its container (via
`onLayout`, falling back to the terminal width before the first layout) and
shrinks the widest columns — truncating cells with `…` — so the grid never
exceeds the available space. Pass `width` to fix the total budget. Columns are
only shrunk, never stretched. Horizontal scroll for over-wide tables is a
planned follow-up (it needs a focus + keyboard surface).

> Column widths are measured in **code points**, matching flowtty's one-cell-
> per-code-point grid, so rules stay aligned. Double-width CJK/emoji cells carry
> the same visual overlap as the rest of flowtty until paint reserves the second
> cell (see [Display width](terminal.md#display-width) and [Still deferred](terminal.md#still-deferred-later-milestones)).

## Markdown

`<Markdown>` renders a markdown string as styled terminal text. It's a
best-effort, line-based renderer — not a CommonMark implementation — covering
the subset that reads well in a cell grid:

```tsx
import { Markdown } from '@flowtty/react';

<Markdown>{`
# Heading

A paragraph with **bold**, *emphasis*, \`inline code\` and a [link](https://x).

- bullet one
- bullet two

> a blockquote

\`\`\`ts
const x: number = 1;
\`\`\`
`}</Markdown>
```

Style mapping (the terminal cell model has no italic):

| Markdown            | Rendered as                                  |
|---------------------|----------------------------------------------|
| `# … ######`        | bold + a per-level color, dim `#` prefix kept |
| `**bold**`          | bold                                         |
| `*emphasis*`        | underline (no italic in a cell grid)         |
| `` `code` ``        | cyan                                         |
| `[text](url)`       | blue + underline; url emitted as an OSC 8 hyperlink (clickable on capable backends) — see [Link](#link) |
| `![alt](src)`       | dim `alt` text (images can't render in a TTY)|
| `> quote`           | dim, with a `│ ` gutter                      |
| `- ` / `1. ` lists  | colored marker + hanging indent on wrap; an indented run nests under the item above it; ordered items keep their source number (`3.` stays `3.`) |
| `- [ ]` / `- [x]`   | `☐` / green `☑` task checkboxes              |
| GFM tables          | padded columns, bold header over a dim rule, `:--` / `:-:` / `--:` alignment; a table wider than the width shrinks its widest column and wraps those cells |
| ` ```lang ` fences  | per-language token colors (js/ts, json)      |
| `---`               | a dim horizontal rule                        |

> Wrapping and table columns are measured in **code points**, matching flowtty's
> one-cell-per-code-point grid (same as `<Table>`), so columns stay aligned on
> rows with CJK/emoji. Those glyphs carry the usual visual overlap until paint
> reserves the second cell (see [Still deferred](terminal.md#still-deferred-later-milestones)).

Emphasis is **asterisk-only** on purpose: `_` is left alone so `snake_case`
identifiers in prose aren't mangled.

**Why pre-wrap instead of leaning on Yoga's `flexWrap`?** The component lays the
markdown out into a flat list of styled *visual lines* (`layoutMarkdown(src,
width)`), each a run of styled spans, pre-wrapped to the resolved width. That
gives a stable line count, so a host that paginates by row — like the
`articles-tui` example, which slices the body by terminal height — can page
through rendered markdown exactly the way it pages raw text. `layoutMarkdown` is
exported for that use; `<Markdown>` itself just measures its width (via
`onLayout`) and renders every line. Pass an explicit `width` to skip the
measure-and-relayout paint.

> The `articles-tui` example opens article `.md` files rendered this way by
> default; press `R` to flip to the **raw source view** — the markdown source
> shown verbatim but syntax-highlighted in place (markers kept and dimmed,
> headings/lists/links/fences colored, fenced-code token-colored). That view
> uses `highlightMarkdownSource(src, width, wrap)`, the source-preserving
> counterpart to `layoutMarkdown` (it never collapses whitespace, so code
> indentation survives, and it hard-wraps rather than word-wraps).

## Link

`<Link href>` renders a terminal hyperlink. On a backend that advertises the
`hyperlinks` capability (the TTY backends, when the terminal supports it), the
label is emitted as an [OSC 8](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda)
hyperlink — clickable (or ⌘/Ctrl-click) in supporting terminals. Where it can't
(a plain pipe, the headless test surface, or a terminal that ignores OSC 8 such
as Apple Terminal.app), it degrades to the styled label followed by a dim
`(url)` so the address is still reachable.

```tsx
import { Link } from '@flowtty/react';

<Link href="https://example.com">the docs</Link>
// capable terminal:  the docs        (clickable)
// otherwise:         the docs (https://example.com)
```

| Prop              | Default  | Notes                                                        |
|-------------------|----------|--------------------------------------------------------------|
| `href`            | —        | Target URL. Control bytes are stripped before emission.      |
| `children`        | `href`   | Visible label; falls back to the URL itself.                 |
| `color`           | `'blue'` | Label color (always underlined).                             |
| `showUrlFallback` | `true`   | Append ` (url)` when the backend can't render a clickable link and the label differs from the URL. |

`hyperlinks` is a backend **capability flag** (like `fullScreen`): omitted means
"can't", so `<Link>` degrades gracefully rather than promising a clickable link
the terminal won't honor. OSC 8 support is a property of the *terminal*, not of
stdout being a TTY, and there's no escape-sequence query for it — so the TTY
backends sniff the environment (`TERM_PROGRAM` allowlist, `VTE_VERSION`,
`WT_SESSION`, …; Apple Terminal.app is excluded). Override with
`FORCE_HYPERLINKS=1` / `=0`. The painter always emits the OSC 8 bytes; the flag
only governs `<Link>` fallback (rendered-markdown links emit OSC 8 either way).
The URL rides in the cell `Style.link`, so it threads through the same paint +
frame-diff path as visual attributes.

## Spinner

`<Spinner>` is an animated busy indicator built on `useTicker`. Mount it while
work is in flight; unmount it when done (the animation stops on unmount and on
whole-app teardown automatically).

```tsx
import { Spinner } from '@flowtty/react';

<Spinner />                                  // default 'dots' set
<Spinner type="line" label="Building" />     // named set + trailing label
<Spinner frames={['🌑','🌒','🌓','🌔','🌕']} interval={120} color="cyan" />
```

Props:

- `type` — named frame set: `'dots'` (default), `'line'`, `'simpleDots'`, `'arc'`, `'circle'`.
- `frames` — a custom frame list (overrides `type`); keep frames equal-width to avoid jitter.
- `interval` — ms per frame (defaults to the chosen set's natural cadence).
- `label` — optional text rendered one space after the glyph.
- `color` — applied to the spinner glyph (named / `#rrggbb` / `rgb(...)`).

The frame sets are a curated subset of the cli-spinners catalogue, inlined so
the package stays dependency-free.

## ProgressBar

`<ProgressBar>` is a determinate bar driven entirely by props — re-render with a
new `value` to advance it (it does not self-animate).

```tsx
import { ProgressBar } from '@flowtty/react';

<ProgressBar value={0.5} />                          // fills the row, 50%
<ProgressBar value={3} total={4} width={20} showPercent />
<ProgressBar value={done} total={files} color="green" />
```

Props:

- `value` — progress; a 0..1 fraction unless `total` is set, then it's `value / total`.
- `total` — optional denominator; the fraction is clamped to 0..1.
- `width` — fixed cell width. Omit to **fill the row** (measured via `onLayout`).
- `char` / `emptyChar` — filled / empty glyphs (default `█` / `░`).
- `color` — color of the filled portion.
- `showPercent` — append a ` NN%` readout; in fill mode it reserves its own space
  so the bar measures the remainder.

## TaskList

`<TaskList>` renders a vertical checklist where each task shows a state icon —
`◌` pending, an animated spinner while running, `✓` success, `✗` error, `↓`
skipped. It's data-driven: update a task's `state` and re-render to advance it.

```tsx
import { TaskList } from '@flowtty/react';

<TaskList tasks={[
  { label: 'Install deps', state: 'success' },
  { label: 'Compile',      state: 'running' },
  { label: 'Test',         state: 'error', detail: '2 failing' },
  { label: 'Deploy',       state: 'pending' },
]} />
```

Each `TaskItem` has a `label`, an optional `state` (default `'pending'`), and an
optional `detail` (dimmed text after the label). `spinnerType` picks the spinner
set used for running tasks. Running tasks animate via `<Spinner>` (and thus
`useTicker`), so they stop cleanly on unmount / teardown.
