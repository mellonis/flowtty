# Input, focus and forms

How keys reach a component, how focus moves, and how forms validate.

- [Keys and useInput](#keys-and-useinput)
- [Paste and the mouse](#paste-and-the-mouse)
- [Clicks and hover](#clicks-and-hover)
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

The built-in components consume the keys they act on: a focused `TextInput`
takes every key that edits or moves, and Enter or Escape when it has an
`onSubmit` / `onCancel` to call; the lists take their navigation, their filter,
Space and Enter; `Button` takes Enter when focused and its `shortcut` from
anywhere; `FocusGroup` takes Tab when there is somewhere to move to; a scroll
box the page keys and a wheel step over it; `Menu` its keys while engaged. A
key a component ignores still falls through — so typing `q` into a field does
not quit an app whose root handler binds `q`, and pressing `q` on a button
does. `isActive` mutes a handler without moving it in the delivery order: a
field's handler, gated on focus, keeps the place its mount gave it.

**The order is the mount order, and it stays.** A subtree mounted later — a
plugin's component — comes after everything mounted before it, whatever its
place in the tree. Opening or closing a dialog, or flipping `<Box inert>`,
mutes and unmutes a subtree without moving anyone: the muting is a check at
delivery, not a new subscription. A handler that must hear first whatever was
mounted when takes the capture phase: `useInput(handler, { capture: true })`
hears every key before the ordinary handlers — an app's own chords, a host's
command layer — can consume it, and is muted with its subtree like the rest.
Capture handlers hear a key in mount order among themselves. The mirror image
is `useInput(handler, { fallback: true })`: a fallback hears a key only when no
capture and no ordinary handler consumed it — where an app's global keymap
belongs, so a focused field or list takes the key first and the app's own
bindings see only what fell through. Fallbacks hear a key in mount order among
themselves. Three phases, then: capture (a host's chords), ordinary (the
components), fallback (the app's keymap); a muted subtree mutes all three.

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
  if (key.name === 'mousemove') hoverAt(key.x!, key.y!);
});
```

- **Paste.** The TTY backends turn on bracketed paste, so pasted text is delivered
  as ONE `{ name: 'paste', text }` key (line endings normalized to `\n`) instead
  of a run of keystrokes. A pasted newline is therefore text, never Enter, and
  pasted letters never fire single-letter bindings. `<TextInput>` inserts a paste
  at the caret and, being single-line, turns its line breaks into spaces.
- **Wheel.** `wheelup` / `wheeldown`, with `count`: how many notches the key
  stands for. A flick lands as a run of reports in one read, and the TTY
  backend hands a run of identical ones — same direction, cell and modifiers,
  nothing else in between — over as ONE key with the run length, so the app
  renders once for the flick instead of once per notch; a lone notch has
  `count: 1`, and any other key ends a run, so nothing is reordered. A handler
  that counts notches adds `key.count ?? 1` (a backend that does not collapse
  sets nothing). `<ScrollBox>` scrolls `wheelStep × count`.
- **Buttons.** `mousedown` when a button goes down, `mousedrag` for every cell a
  held button crosses, `mouseup` when it comes back up. Motion with no button
  held is reported as `mousemove` only when the backend was asked for hover
  (`mouse: { hover: true }`), coalesced to one key per cell and at most one per
  ~16 ms; the pointer leaving the window is `mouseleave`, with no coordinates.
  `button` is `'left'`, `'middle'` or `'right'`; it is
  absent on the rare release whose report named no button, so test a release with
  `key.name === 'mouseup'` rather than with `button`, or a drag can stay open
  forever. The horizontal wheel and the extra buttons (8 and up) are dropped.
- **Coordinates.** `wheelup`, `wheeldown`, `mousedown`, `mousedrag`, `mouseup`
  and `mousemove` all carry `x` / `y`: the 0-based column and row of the cell
  under the pointer, the same coordinates `onLayout` rects use. `mouseleave`
  carries neither — the pointer is outside the grid by then. `shift`, `meta`
  and `ctrl` come from the report, as for any other key.

All of it — wheel included — needs `new TtyBackend(stdout, stdin, { mouse: true })`
(or `{ mouse: { hover: true } }`, which turns reporting on by itself — a
separate `mouse: true` alongside it is not needed). It is off by default, and
the cost is real: see below. Inline mode
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

In tests, `TestBackend` has `paste(text)`, `wheel('up' | 'down', x?, y?, count?)` and
`mouse('down' | 'drag' | 'up' | 'move' | 'leave', x?, y?, options?)` — see
[Sending input](testing.md#sending-input). Coordinates default to cell (0, 0),
and a `<ScrollBox>` only reacts while the pointer is over it, so pass coordinates
inside the box unless it sits at the origin.

**Key names.** A control chord is `{ name, ctrl: true }` with the letter or symbol
of its ASCII column: Ctrl+A is `a`, Ctrl+] is `]`, Ctrl+Space (0x00) is `@`. A
field types, and a list filters by, printable keys only (`isPrintable(key)` from
`@flowtty/core` is the test) — a chord is never typed and never consumed by a
component that does not act on it. A printable key is named by its character — `' '`, `':'`, `'a'` —
and the rest come from a fixed list, exported as `NAMED_KEYS` (type `NamedKey`):
`return`, `escape`, `tab`, `backspace`, `delete`, `insert`, the arrows, `home`,
`end`, `pageup`, `pagedown`, `f1`–`f12`, `paste`, `wheelup`, `wheeldown`,
`mousedown`, `mousedrag`, `mouseup`, `mousemove`, `mouseleave`. There is no
`'space'` or `'enter'`. The type
can't reject such a typo (any character is a valid name), so
`TestBackend.press()` does: it throws on a name no terminal produces, which stops
a test from blessing a branch real input never reaches.

`escape` arrives about 30 ms after the key: a lone `ESC` byte at the end of a
read may be the start of a sequence whose rest is still on its way (a mouse
report the OS split), so the TTY backend waits that long before calling it
Escape. Nothing else is delayed.

A handler that matches on names it knows is unaffected by the mouse keys: their
names are multi-character, so they are never mistaken for a printable character.
`<TextInput>`, `<TextArea>`, `<ListSelect>` and `<ListMultiSelect>` ignore them.

## Clicks and hover

A box takes a click by declaring it, and a component asks whether the pointer
is over it:

```tsx
<Text onClick={() => open(id)}>▸ {title}</Text>

function FoldLine({ title }) {
  const [hovered, hover] = useHover();
  return <Text {...hover} dim={!hovered} onClick={toggle}>{title}</Text>;
}
```

- **`onClick(key)`** fires on a left press and release in the same cell over
  the box, with no drag between (a drag is a selection). The box painted on
  top wins where boxes overlap, and the nearest box with a handler up from it
  gets the click — once, and that handler's press is withheld from `useInput`
  even where it becomes a drag: the press arms on `mousedown` and is withheld
  right there, before anyone knows whether it will stay a click, so a
  subscriber sees `mousedrag` / `mouseup` with no `mousedown` before them — an
  app's own press/drag/release state machine over a clickable region must
  tolerate that orphan drag. A press that reaches no `onClick` up the chain
  goes on to subscribers as before. This also means an `onClick` ancestor
  claims the press for every cell inside it that no nearer `onClick` takes:
  the built-in fields, `Button`, `Checkbox`, the lists and the `Select`
  trigger all declare `onClick` on their own box, so one of them inside a row
  with `onRowClick` still takes its click, and the row gets the clicks beside
  it. A component that detects clicks through `useInput` instead (its own
  `mousedown` / `mouseup` bookkeeping, `useClick` included) never sees the
  press under such an ancestor. A box with `onClick` or `onHoverChange` keeps a passive input
  subscription while it is mounted, so the backend feeds it keys even in an
  app with no `useInput` of its own. A click does not focus the box: call
  `focus()` in the handler when it should, as `Button` does.
  `useClick(rectRef, handler)` still works for a hit area that is not a box
  of its own — as long as nothing between it and the pointer already claims
  `onClick`.
- **The prop toggles, the key stays.** `onClick={disabled ? undefined : fn}`
  keeps the box's element type stable — the key is present either way, only
  the value changes — so the subtree under it is never remounted for it.
  Spreading the prop in and out (`{...(disabled ? {} : { onClick })}`) does
  not get this for free: that removes the key rather than setting it to
  `undefined`, and the subtree remounts each time the prop appears or
  disappears. Keep the prop present and toggle its value instead.
- **`useHover()`** returns `[hovered, props]`; spread the props on one box.
  The component re-renders when the pointer enters or leaves that box, never
  on a move inside it. Nested boxes can be hovered together. When the content
  under a resting pointer changes — a list scrolled, a row appeared — the
  hover follows without any motion. `onHoverChange(hovered)` is the prop the
  hook wraps.
- **The built-in components show hover** the same way, once the backend has
  it on: the thing under the pointer is underlined, a look no focus state
  uses, so focus and hover read apart and both show when they coincide.
  `Button` underlines its `[ label ]` (not the shortcut hint), `Checkbox` its
  label, `ListSelect`, `ListMultiSelect` and the `Select` popup the row's
  label, `Table` with `onRowClick` the row's cells, the closed `Select` its
  value. `TextInput` and `TextArea` show nothing — a field is not an action —
  and a `ScrollList` row is the caller's: hover inside it is the item's own
  `useHover`. Each component's entry in [components.md](components.md) says
  what it shows. None of it costs anything while hover is off: nothing fires.
- **`inert` and dialogs.** A box under an `inert` ancestor, or on the page
  under an open dialog, gets neither clicks nor hover, and does not shield
  what is under it: the chain is cut at the muted box, so the click reaches
  nothing **inside** that subtree — an `onClick` ancestor *outside* it still
  gets the click — and the keys go on to subscribers (which is how a `Select`
  popup closes on a press outside it).
- **Hover needs asking for.** `new TtyBackend(stdout, stdin, { mouse:
  { hover: true } })` turns on any-event tracking (`?1003h`): the terminal
  reports every pointer move, which a slow SSH link feels. Without it
  `useHover` stays false and `onHoverChange` never fires. `mouseleave` rides
  on the window-focus reports the color-scheme tracker turns on: a terminal
  that reports window focus (most do) clears the hover when the pointer
  leaves the window, but `colorScheme: false` turns those reports off too, so
  with it the pointer leaving is never reported and the hover clears only on
  the next move. `render(…, { mouse: false })` turns the whole dispatch off.

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
  behaviour — except the press and release of a click an `onClick` box takes,
  which are withheld from `useInput` the way `useClick` withholds its own (see
  [Clicks and hover](#clicks-and-hover)). Selection rides the same path: an app
  with no `useInput` subscriber and no `onClick` / `onHoverChange` box anywhere
  receives no keys at all, and so has no selection either — a box with either
  prop keeps a passive subscription open even with no `useInput` of its own.
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

**A click focuses.** Every field — `TextInput`, `TextArea`, `ListSelect`,
`ListMultiSelect`, `Select`, `Checkbox`, `Button` — takes focus on a mouse click
inside it; `Button` also presses, `Checkbox` toggles, `Select` opens. A click is
a press and a release both on the field with no drag between: a drag that
starts on a button is a selection, not a press. Each of them is an `onClick`
on the component's own box (see [Clicks and hover](#clicks-and-hover)), so a
field or a button inside a row with `onRowClick` (`Table`, `ScrollList`)
takes its own click and the row gets the rest. The pieces are public:
`useFocus()` returns `focus()` for the calling component, and `onClick` on a
`Box` — any component can open a collapsed item on a click the same way:

```tsx
function Collapsed({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Box onClick={() => setOpen((o) => !o)}>{open ? children : <Text dim>▸ …</Text>}</Box>;
}
```

`useClick(rectRef, onClick)` remains for a hit area that is not a box of its
own — a region measured by `onLayout` inside a bigger box. It detects the
click through `useInput`, so it never sees a press that an `onClick` box
above it has already taken.

`<Button>` is focusable. Props:

```tsx
<Button label="Open" shortcut="o" onPress={() => ...} />
```

- `Enter` when focused → `onPress()`
- `shortcut` key (anywhere in the input scope) → `onPress()` even when not focused
- Focused state: bold + inverse-video label

`<ListMultiSelect onAddNew>` adds a "+ add new" row. Return the new item's value from
the callback — directly or as a promise, e.g. after a sub-prompt in a dialog — and
the component selects it and moves the cursor onto it once it appears in `items`
(adding it to `items` is the caller's job). Return `null` for a cancelled prompt.

TextInput / ListSelect / ListMultiSelect / Select / Checkbox also plug into the focus system. Their `isFocused` prop becomes optional — if unset, they read from the FocusGroup. If set explicitly, the prop overrides.

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
