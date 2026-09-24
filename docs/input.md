# Input, focus and forms

How keys reach a component, how focus moves, and how forms validate.

- [Keys and useInput](#keys-and-useinput)
- [Paste and the mouse](#paste-and-the-mouse)
- [Selection](#selection)
- [Focus + Button](#focus--button)
- [Form](#form)
- [Usage with Zod](#usage-with-zod)

## Keys and useInput

`useInput(handler)` subscribes a component to the keys of its input scope:

```tsx
useInput((key) => {
  if (key.name === 'q') exit();
});
```

`key` is `{ name, sequence, ctrl, meta, shift }`, plus `text` for a paste and
`x` / `y` / `button` for the mouse (next section). Every subscriber in the scope
receives every key, in **subscription order**: on mount, children before parents
— React runs effects inside-out — and a component mounted later comes after the
ones already there. A `<DialogHost>` mutes the scopes under its top dialog, and
`<Box inert>` mutes a subtree, so "the innermost live handler first" is what an
app sees in practice.

**Return `true` to consume the key.** Subscribers later in the order do not see
it, and the backend skips its own default for it. There are three such
defaults in the TTY backends: Ctrl+C and Ctrl+D exit the app (raw mode swallows
`SIGINT`, so the key is all there is), and Ctrl+Z suspends it (see
[Handing the terminal over](app.md#handing-the-terminal-over)). A field that
undoes on Ctrl+Z returns `true` while focused, and the app still suspends
everywhere else; an app that cancels a running request on Ctrl+C returns `true`
while one is running, and exits on its own the second time:

```tsx
useInput((key) => {
  if (key.ctrl && key.name === 'c' && running) { cancel(); return true; }
});
```

An app that consumes Ctrl+C owns its exit: nothing else quits it from the
keyboard (`kill -INT` and `SIGTERM` still restore the terminal). Only a strict
`true` consumes — the handler's type is `(key) => unknown`, so `(key) =>
seen.push(key)` still type-checks, and an `async` handler returns a Promise,
which never consumes: no handler swallows keys by accident. Handlers that
return nothing behave as before. `TestBackend.press()` returns whether the key
was consumed, so a test can assert it.

The built-in components (`TextInput`, `Select`, …) consume nothing yet; a
global shortcut still fires while a field is focused.

## Paste and the mouse

Paste and mouse events arrive through `useInput` as ordinary keys with a payload:

```tsx
useInput((key) => {
  if (key.name === 'paste') insert(key.text!);            // the whole paste, once
  if (key.name === 'wheelup') scrollBy(-3);               // key.x / key.y = cell under the pointer
  if (key.name === 'wheeldown') scrollBy(3);
  if (key.name === 'mousedown') startAt(key.x!, key.y!);  // key.button = 'left' | 'middle' | 'right'
  if (key.name === 'mousedrag') extendTo(key.x!, key.y!);
  if (key.name === 'mouseup') commit();
});
```

- **Paste.** The TTY backends turn on bracketed paste, so pasted text is delivered
  as ONE `{ name: 'paste', text }` key (line endings normalized to `\n`) instead
  of a run of keystrokes. A pasted newline is therefore text, never Enter, and
  pasted letters never fire single-letter bindings. `<TextInput>` inserts a paste
  at the caret and, being single-line, turns its line breaks into spaces.
- **Wheel.** `wheelup` / `wheeldown`, one key per step.
- **Buttons.** `mousedown` when a button goes down, `mousedrag` for every cell a
  held button crosses, `mouseup` when it comes back up. Motion with no button
  held is never reported. `button` is `'left'`, `'middle'` or `'right'`; it is
  absent on the rare release whose report named no button, so test a release with
  `key.name === 'mouseup'` rather than with `button`, or a drag can stay open
  forever. The horizontal wheel and the extra buttons (8 and up) are dropped.
- **Coordinates.** All five mouse keys carry `x` / `y`: the 0-based column and
  row of the cell under the pointer, the same coordinates `onLayout` rects use.
  `shift`, `meta` and `ctrl` come from the report, as for any other key.

All of it — wheel included — needs `new TtyBackend(stdout, stdin, { mouse: true })`.
It is off by default, and the cost is real: see below. Inline mode
(`InlineTtyBackend`) never enables it — the wheel there belongs to the terminal's
own scrollback.

**What mouse reporting costs.** While it is on, the terminal hands the mouse to
the app, so its *own* drag-to-select stops working — the user can no longer sweep
text and copy it. Every terminal keeps a bypass modifier that suppresses
reporting for the duration of a drag, but which one differs, and these three are
the ones verified by hand:

| Terminal | Hold while dragging |
| --- | --- |
| Most terminals | Shift |
| iTerm2 | Option |
| Apple Terminal | `fn` — neither Shift nor Option works there; View → Allow Mouse Reporting turns reporting off altogether |

Turn `mouse` on when the app gives something back for it, and say so in the app's
help.

In tests, `TestBackend` has `paste(text)`, `wheel('up' | 'down', x?, y?)` and
`mouse('down' | 'drag' | 'up', x?, y?, options?)` — see
[Sending input](testing.md#sending-input). Coordinates default to cell (0, 0),
and a `<ScrollBox>` only reacts while the pointer is over it, so pass coordinates
inside the box unless it sits at the origin.

**Key names.** A printable key is named by its character — `' '`, `':'`, `'a'` —
and the rest come from a fixed list, exported as `NAMED_KEYS` (type `NamedKey`):
`return`, `escape`, `tab`, `backspace`, `delete`, `insert`, the arrows, `home`,
`end`, `pageup`, `pagedown`, `f1`–`f12`, `paste`, `wheelup`, `wheeldown`,
`mousedown`, `mousedrag`, `mouseup`. There is no `'space'` or `'enter'`. The type
can't reject such a typo (any character is a valid name), so
`TestBackend.press()` does: it throws on a name no terminal produces, which stops
a test from blessing a branch real input never reaches.

A handler that matches on names it knows is unaffected by the mouse keys: their
names are multi-character, so they are never mistaken for a printable character.
`<TextInput>`, `<TextArea>`, `<Select>` and `<MultiSelect>` ignore them.

## Selection

Dragging with the left button held selects text on the frame that is already on
screen: the renderer inverts the cells the drag covers, and when the button
comes back up the text goes to the system clipboard and `onCopy` says what
happened. No component takes part in it and no state changes — a drag re-runs
the overlay and the draw, not layout and not a React render.

```tsx
await render(<App />, backend, {
  onCopy: ({ text, delivered }) => {
    setToast(delivered ? `copied ${text.length} chars` : 'copy unavailable');
  },
});
```

- **Left button only.** `mousedown` anchors, `mousedrag` extends, `mouseup`
  finishes. Both ends are inclusive, so a drag one cell to the right selects two
  cells — and a press and a release on the *same* cell is a click: it selects
  nothing and fires nothing.
- **A stream, not a rectangle.** From the anchor to the current cell in reading
  order, with the rows in between spanning the full width of the scope.
- **A band in the text's own colors.** A selected cell turns on `inverse` and
  keeps its `fg` and `bg` exactly as they were, so the terminal draws the band
  from the one and the glyph from the other. The two colors of a cell contrast
  by construction — that is what made the text readable before the drag — so
  the swap contrasts too, on a light theme and on a dark one, and flowtty never
  has to name a color it cannot know. A plain cell is the default band with the
  glyph in the default background; text painted in a box's inherited `color`
  (see [Inherited colors](layout.md#inherited-colors)) is a band of that ink;
  white on a black panel selects to black on white; a cyan heading, a diff's
  red and green and every syntax color become a band of that color. Bold,
  underline, strikethrough and an OSC 8 link are kept; `dim` is dropped,
  because SGR 2 and 7 combine differently across terminals and a dim cell would
  punch a hole in the band. With no color support at all (`NO_COLOR`, a
  `color: false` backend) the band is all that is emitted, which is the right
  fallback. A cell that was already inverse (a selected table row, a focused
  button, the cursor) is drawn the other way round — not inverse, keeping both
  its colors — so it reads as a hole in the band instead of vanishing into it.
- **The keys still arrive.** `mousedown` / `mousedrag` / `mouseup` go on to every
  `useInput` subscriber as usual, so an app keeps its own press / drag / release
  behaviour. Selection rides that same path: an app with no `useInput` subscriber
  anywhere receives no keys at all, and so has no selection either.
- `render(…, { selection: false })` turns the whole thing off and leaves the
  frame to the app.

**Scopes.** `<Box selectionScope>` confines a drag that starts inside the box to
its **content rect** — inside its border and padding, and inside whatever clips
it. The drag point is clamped there, so dragging out of a pane selects to that
pane's edge and never into the neighbour or onto the border between them. The
nearest scoped ancestor-or-self wins; with none, a drag selects across the whole
frame the way the terminal's own selection does, and box-drawing glyphs it
crosses are copied as they are.

`<Box selectable={false}>` (and `<Text selectable={false}>`) takes the box's
whole rect out of every selection, children included: nothing there is
highlighted and nothing there is copied. A press that lands in such a region
still anchors a drag — sweeping out of a code block's gutter, or off a password
field into the text beside it, is an ordinary gesture — it just contributes
nothing itself, so a press and release inside one yields nothing at all.

A drag inside a scope only loses the opted-out regions **painted over that
scope** — its own content, and anything drawn on top of it afterwards (a menu
dropdown opened over a pane). A region painted *before* the scope is behind it:
a dialog over a menu bar covers the bar, and a region nobody can see must not
cut a hole in the selection on top of it. An unscoped drag covers the whole
frame and takes every opted-out region with it.

Five built-ins are already wired: `<ScrollBox>` (and so `<ScrollList>`) scopes
to its viewport (the rows in view, with the scrollbar column left out),
`<DialogHost>` scopes each dialog
to its content, `<Table>` scopes to its grid, `<Menu>`'s bar and dropdowns are
`selectable={false}`, and `<Markdown>` marks the frame it draws — a fenced
block's gutter and label, a blockquote's bar — the same way, so a drag over a
document copies the document (see
[Markdown](components.md#markdown)). All of it is chrome, not text.

**Double- and triple-click.** A double-click selects the word under the pointer:
the run of non-space cells around it on that row, punctuation included, stopped
by the scope and by a `selectable={false}` region. A triple-click selects the
line: the row within the scope, and the rows a soft wrap joins to it, so a
wrapped paragraph is one line and copies as one. The selection is made on the
press and the release does nothing; a drag after a double-click does not extend
it. The TTY backend counts presses — the same button on the same cell within
500 ms is the second, then the third, then a first again — and puts the count on
the `mousedown` key as `clicks`; a custom backend that sets nothing gets single
clicks. The same selections can be made from code — see
[Selecting from code](app.md#selecting-from-code).

**What clears it.** Any keystroke, and any new press. A resize. And content that
changes underneath it: the cells a finished selection covers are compared against
every new frame, so a pane that scrolls or a reply that streams in drops the
highlight instead of leaving it over different text, while an unrelated repaint
(a spinner ticking elsewhere) keeps it. The wheel never clears a selection by
itself — scrolling the pane *under* it changes those cells, which does.

**The text.** The selected cells as painted, trailing ASCII blanks trimmed per
row (NBSP and everything else kept; a row that carries on below is trimmed at
its text instead — see **Soft wrap**). A row a `selectable={false}` region took
out **whole** is skipped wherever it falls: nothing of it was selectable, so it
is frame — a fence label, a menu bar — and not a line of the text. A row that is
merely blank IS a line: a paragraph break, an empty line inside a code block. It
is kept inside the selection and dropped at the top and the bottom, so a drag to
the bottom edge of a scope taller than its text comes back without trailing
newlines. The grid is one cell per code point (see
[Display width](terminal.md#display-width)), so an end of the selection never
falls inside a character.

**Soft wrap.** A paragraph the renderer broke at the wrap column comes back as
the one line it was written as: the rows are rejoined with **exactly what the
wrap ate** at each break — the space it took at a word boundary (or the whole
run of them, where it swallowed several), nothing at all where it cut through a
long word — and with a newline everywhere else. A wrapped row's trailing space
is part of the line and comes back with it; the blanks a hanging indent puts at
the start of a continuation row do not, and neither does the padding a component
put after the text (a code block's diff band).

Inside a wrapped paragraph the text is returned as written. Two things a `wrap`
never paints cannot come back, whatever the selection covers:

- the **leading ASCII spaces of a source line** — a word wrap drops them, so no
  cell on the frame holds them;
- the **trailing ASCII spaces of a source line** — a blank cell at the end of a
  row that does not carry on below cannot be told from the fill around it, so
  the row is trimmed (a wrapped row that *does* carry on keeps its trailing
  space, because the renderer knows where the text ends).

Both are ASCII `' '` only: an NBSP is content everywhere, is never a wrap point
and is never trimmed. A line of nothing but ASCII spaces paints no row at all,
so it is not in the text either, and a tab comes back as the single space it is
painted as — the painter substitutes one for every control byte.

`<Markdown>` is a step further removed: it normalizes its source before laying
it out (a paragraph comes out space-joined), so what a drag returns is the
document as rendered, not the markdown as typed.

The join only applies where the selection covers that wrapped span and nothing
else that has text on it — so in a two-pane layout, a drag that picks up the
neighbouring pane copies each row as its own line, exactly as the terminal's own
selection would. Scope the pane (above) and its paragraphs read as paragraphs
again. A `<Markdown>` document joins the same way for headings, paragraphs,
list items, quoted paragraphs and wrapped code lines: the gutter painted in
front of a quote or a code row is chrome, so it is out of the selection and the
two halves meet at the column the wrap cut.

**Copy on select.** The text goes to the backend's clipboard — OSC 52, one write
(see [The clipboard](app.md#the-clipboard)) — and then `onCopy` fires:

| | |
|---|---|
| `text` | what was copied |
| `delivered` | whether a clipboard sequence was actually written |
| `source` | `'selection'` for a drag, `'api'` for `useApp().copy()` |

`onCopy` fires **whether or not** `delivered` is true, which is what lets an app
run `pbcopy` / `wl-copy` / `clip.exe` of its own on the way down. A drag that
covered only blanks copies nothing and fires nothing.

`render(…, { copyOnSelect: false })` keeps the highlight and the callback and
skips the clipboard write — `delivered` is then always false.

**Which terminals take the clipboard write.** There is no way to ask a terminal
whether it did, so `delivered: true` means the bytes went out, not that the
clipboard changed. Only what each terminal's own documentation says is listed
here; everything else is "varies":

| Terminal | |
|---|---|
| Apple Terminal | No OSC 52 at all. flowtty detects it and writes nothing, so `delivered` is false and the app's own `pbcopy` is the path. |
| iTerm2 | Needs its **Applications in terminal may access clipboard** setting turned on. |
| tmux | Its `set-clipboard` option governs whether a sequence from an application reaches the outer terminal; it must not be `off`. |
| everything else | Varies. flowtty attempts the write; a terminal that does not know the sequence swallows it. |

## Focus + Button

Components inside a `<FocusGroup>` can call `useFocus()` to know if they're the active focusable. Tab cycles forward, Shift-Tab backward. First registered = auto-focused.

`<DialogHost>` wraps each stack entry in an implicit `FocusGroup`, so Tab is scoped to the top dialog by default — no setup needed. Host content also gets its own implicit group.

`<Button>` is focusable. Props:

```tsx
<Button label="Open" shortcut="o" onPress={() => ...} />
```

- `Enter` when focused → `onPress()`
- `shortcut` key (anywhere in the input scope) → `onPress()` even when not focused
- Focused state: bold + inverse-video label

`<MultiSelect onAddNew>` adds a "+ add new" row. Return the new item's value from
the callback — directly or as a promise, e.g. after a sub-prompt in a dialog — and
the component selects it and moves the cursor onto it once it appears in `items`
(adding it to `items` is the caller's job). Return `null` for a cancelled prompt.

TextInput / Select / MultiSelect also plug into the focus system. Their `isFocused` prop becomes optional — if unset, they read from the FocusGroup. If set explicitly, the prop overrides.

Outside a FocusGroup, `useFocus()` returns `{isFocused: true}` (safe default — single component receives input as before).

## Form

`<Form>` collects named fields, moves focus through them, and submits them
together. A field is whatever calls `useField(name, { validate })`:

```tsx
function Field({ name, label, validate }: { name: string; label: string; validate?: (v: unknown) => string | null }) {
  const f = useField(name, { validate });
  return (
    <Box flexDirection="column">
      <Text dim>{label}</Text>
      <TextInput value={(f.value as string) ?? ''} onChange={f.onChange}
        onSubmit={f.onSubmit} onCancel={f.onCancel} isFocused={f.isFocused} />
    </Box>
  );
}

<Form onSubmit={(values) => save(values)} onCancel={close}>
  <Field name="slug" label="slug" validate={(v) => (/^[a-z-]+$/.test(String(v)) ? null : 'kebab-case only')} />
  <Field name="title" label="title" />
</Form>
```

`useField` returns `{ value, onChange, onSubmit, onCancel, isFocused }`. Enter in
a field (`onSubmit`) validates it and moves to the next one; from the last field
it calls the form's `onSubmit` with every value, keyed by name. Escape cancels the
form. Fields register in mount order, which is also the focus order.

## Usage with Zod

```tsx
import { z } from 'zod';
import { useState } from 'react';
import { render, TextInput, Box, Text } from '@flowtty/react';

const Slug = z.string().regex(/^[a-z0-9-]+$/, 'kebab-case only');

function App() {
  const [v, setV] = useState('');
  const validate = (x: string) => {
    const r = Slug.safeParse(x);
    return r.success ? null : r.error.issues[0]?.message ?? 'invalid';
  };
  return (
    <Box>
      <TextInput value={v} onChange={setV} validate={validate} onSubmit={(s) => console.log('slug:', s)} />
    </Box>
  );
}
```

When `validate` rejects a submit, `<TextInput>` renders the message in red under
the field and clears it on the next edit (`showError={false}` if you show it
yourself). For a one-shot prompt, skip the state: `<TextInput defaultValue="seed"
onSubmit={…} />` keeps its own value.
