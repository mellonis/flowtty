# @flowtty/react

React adapter for flowtty: a yoga-flexbox layout + paint pipeline + components + hooks + dialog stack that renders into a `Backend` (TTY, Electron, anything implementing `@flowtty/core`'s `Backend` interface).

This package is the React-specific layer. The framework-free pieces — `Buffer`, `Cell`, `Style`, `Key`, the `Backend` interface, and the `TestBackend` for headless tests — live in [`@flowtty/core`](../core).

## Install

```bash
npm install @flowtty/react @flowtty/tty-backend react
```

`react` is a peer dependency (React 19 only). `@flowtty/tty-backend` is the canonical TTY backend. Other backends (`@flowtty/electron-backend`, future Svelte adapter) slot in identically.

## Hello world

```tsx
import { render, Box, Text } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

await render(
  <Box flexDirection="column">
    <Text bold>Hello, flowtty!</Text>
  </Box>,
  new TtyBackend(),
);
```

## What you get

### Layout
- `<Box>` — yoga-backed flex container; full Box-model (flexDirection, gap, padding, margin, border, alignItems, justifyContent, position absolute, …).
- `<Text>` — text node with style props (`color`, `bold`, `dim`, `inverse`, `underline`, `strikethrough`, `wrap`).
- `useTerminalSize()` — reactive `{ width, height }`.

### Input
- `useInput((key) => …)` — subscribe to keys from the active `InputContext`.
- `<Box inert>` — drop a subtree out of input dispatch (no rerender, no layout impact).
- F-keys parsed (F5–F12 via xterm tilde sequences) — see `@flowtty/tty-backend`.

### Focus
- `<FocusGroup>` + `useFocus()` — Tab/Shift-Tab cycle through focusable widgets.
- Pair with `<Button shortcut="…">` for global keyboard shortcuts.

### Widgets
- `<TextInput value onChange onSubmit validate />` — single-line input with cursor, validation, mask mode.
- `<Select<T> items value onChange onSubmit />` — single-pick list.
- `<MultiSelect<T> items value onChange onSubmit onAddNew />` — multi-pick with space-toggle and optional "add new".
- `<Confirm>` — yes/no prompt.
- `<Form>` + `useField()` — form orchestration with per-field validation + global submit.
- `<Button label shortcut onPress />` — focusable + shortcut-bound.

### Dialog stack
- `<DialogHost>` — wraps your app and provides the stack.
- `useDialogHost().openDialog(element, { title, floating, minWidth, maxWidth, maxHeight, padding })` — push a dialog. Returns a promise that resolves when the dialog calls `done(value)` or `cancel()`.
- `useDialog()` — inside a dialog: `done(value)`, `cancel()`.
- Two modes:
  - **Full-screen** (default): wrapper fills the overlay; opaque backdrop masks everything below.
  - **Floating** (`floating: true`): wrapper is content-sized + centered; backdrop is transparent so the parent dialog shows around it.
- `title` paints into the top border line of the wrapper (`┌─ Title ─┐`).

### Chrome primitives
- `<Title>` — bold left-aligned header.
- `<HRule>` — horizontal rule; fills its container's width.
- `<HelpBar>` — inverse padded bottom-row hint.

### Menu (MacOS-style)
- `<Menu items={[…]} title onPage>` — horizontal menubar with cascading dropdowns. F10 to engage, Esc to disengage. Items can be `{ render }` (sets page area via `onPage` callback), `{ submenu }` (nested), or `{ onSelect }` (callback).

### Utilities
- `windowAround(items, cursor, visible)` — cursor-tracked windowing for long lists.
- `splitVisualLines(text, mode, width)` — split body text into visual lines for paginated rendering with optional line-number gutter.

## Source layout

```
src/
  components/    React components (PascalCase .tsx files)
  context/       React Context providers + their API types
  hooks/         React hooks (use*)
  internal/      host, paint, layout, reconciler, render, yoga wrap, borders
  utils/         visualLines, windowAround
  index.ts       public re-exports
```

## Choosing a backend

A backend implements four methods (see `@flowtty/core`'s `Backend` interface). Plug any in via `render(element, backend)`:

| Backend | Package | Use for |
|---|---|---|
| TTY | `@flowtty/tty-backend` | CLI tools, headless servers |
| Test | `@flowtty/core/testing` (`TestBackend`) | unit tests; in-memory frames + key injection |
| Electron | `@flowtty/electron-backend` (planned) | desktop apps with the same React tree |

## See also

- [`@flowtty/core`](../core) — framework-free data model.
- [`@flowtty/tty-backend`](../tty-backend) — TTY implementation.
