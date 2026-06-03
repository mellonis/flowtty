# @flowtty/inline-tty-backend

The inline TTY backend for [flowtty](https://github.com/mellonis/flowtty) — a library for building terminal apps in React.

Unlike [`@flowtty/tty-backend`](https://github.com/mellonis/flowtty/tree/master/packages/tty-backend) (which takes over the whole screen via the alt-screen), this backend renders a **redrawable live region in place**, in the normal scrollback flow, and lets you **append permanent log lines above it** — the Ink `<Static>` pattern.

Use it for build logs, progress UIs, and any command that should leave its output in the terminal after it exits:

- A live region at the bottom that repaints on every commit.
- `printStatic(lines)` — flush lines permanently above the live region (driven by flowtty's `<Static>` component).
- `fullScreen === false`, so full-screen-only components (e.g. `Menu`) correctly opt out.

## Install

```bash
npm install @flowtty/react @flowtty/inline-tty-backend react
```

## Usage

```tsx
import { render, Box, Text, Static } from '@flowtty/react';
import { InlineTtyBackend } from '@flowtty/inline-tty-backend';

await render(
  <Box flexDirection="column">
    <Static items={completedSteps}>
      {(step) => <Text key={step.id}>✓ {step.label}</Text>}
    </Static>
    <Text>Building… {current}</Text>
  </Box>,
  new InlineTtyBackend(),
);
```

`<Static>` lines are printed once and scroll away with the terminal; the live region below keeps redrawing.

## See also

- [`@flowtty/react`](https://github.com/mellonis/flowtty/tree/master/packages/react) — the React adapter.
- [`@flowtty/tty-backend`](https://github.com/mellonis/flowtty/tree/master/packages/tty-backend) — the full-screen alt-screen backend.
- [flowtty on GitHub](https://github.com/mellonis/flowtty) — full docs and examples.
