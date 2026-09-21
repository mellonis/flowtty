# Contributing

Thanks for looking. flowtty is small enough to read in an afternoon; this page is
what you need to change it without surprises.

## Setup

```bash
git clone <this repo> && cd flowtty
npm install
npm test                # vitest, the whole workspace
npm run typecheck       # tsc --noEmit across all packages
npm run showcase        # the self-playing tour, in a 100x30 terminal
```

Use a current Node LTS — the build tool (tsdown) needs 22.18+; tests and examples
are less picky. There is no lint step: `npm test` and `npm run typecheck`
are the gates, and a change is done when both pass.

**Nothing needs building to work on the code.** Tests, examples and the typecheck
run straight off `src/*.ts` — every package's `exports` point at its sources.
`npm run build` exists for publishing only.

If `tsx` or vitest dies with `Cannot find module '@esbuild/…'` or a similar
platform package, the install is out of sync, not the code:
`rm -rf node_modules package-lock.json && npm install`.

## Where things are

```
packages/core                 buffer, layout (Yoga), paint, reducers, TestBackend — no React, no Node
packages/react                reconciler, components, hooks, render()
packages/tty-backend          full-screen terminal: frame diff, key parsing, color, mouse
packages/inline-tty-backend   a live region with an append-only log above it
packages/examples             runnable apps, the showcase, and the code the docs quote
docs/                         the documentation; docs/internal/ is history, not reference
```

The dependency graph is a DAG and stays one: `core` imports nothing of React or
Node in its main entry; adapters and backends depend on `core`; only examples
depend on everything.

How a keystroke becomes bytes: a backend's `onKey` → the handler runs inside
`flushSync`, so state updates land at once → the reconciler commits → one repaint
per microtask: Yoga layout → paint into a cell `Buffer` → `backend.draw(buffer)`.

To add to the library rather than fix it, start from
[Writing a component](docs/writing-a-component.md) or
[Writing a backend](docs/writing-a-backend.md); [Testing](docs/testing.md) covers
`TestBackend`.

## Things that will bite you

- **Yoga's defaults are not CSS's.** `flexShrink` is `0` — a child keeps its
  natural size and overflows unless you say `flexShrink={1}`. A box is a column
  by default, and `<Text>` is a box, not an inline span: two styled runs on one
  line need a `flexDirection="row"` parent.
- **Every `.tsx` file imports React** (`import React from 'react'`). The example
  runner uses the classic JSX transform; without the import the tests pass and the
  example crashes with "React is not defined".
- **Exported declarations need explicit types** inside `packages/*/src`. The
  `.d.ts` files are generated file by file, without a type checker, so an exported
  function needs its return type and an exported `const` its annotation
  (`createContext<T>(…)` needs `: Context<T>`). The build fails with TS9007 /
  TS9010 and names the spot.
- **`onLayout` fires on every paint.** Compare before `setState`, or it loops.
- **The grid is one cell per code point.** Measure text with `[...s].length`, not
  `stringWidth`, when you pad or align — see `docs/terminal.md`.
- **A new `@flowtty/*` package or subpath** has to be added in three places that
  must agree: `tsconfig.base.json` `paths`, `vitest.config.ts` `resolve.alias`,
  and the package's `exports`. `packages/examples/tsconfig.json` repeats the paths
  too (it is flat on purpose — the example runner does not follow `extends`).

## Tests

Tests sit next to the code as `*.spec.ts(x)`. A bug fix starts with a test that
fails for the right reason; a feature starts with the test that describes it.

- Assert on `backend.lastFrame` for content and layout, on
  `backend.lastBuffer.get(x, y).style` for styling.
- `TestBackend.press()` rejects key names no terminal produces (`'space'`,
  `'enter'`) — a printable key is named by its character.
- Anything about how a real terminal or a real process behaves — signals, a piped
  stdout, the exit code — is worth checking against a real process, not only a
  stub. `packages/examples/inline-build-log/piped.spec.ts` shows one way.
- The showcase's script (`packages/examples/showcase/script.ts`) is an end-to-end
  test of most components at once; if you add a component, consider a scene.

## Style

Match the code around you: its naming, its comment density, its idiom. Files
whose main export is a class or a component are `PascalCase`; the rest are
`camelCase`. Comments say *why*; they cite `README.md` or a page under `docs/` by
page and topic, never an issue number, a pull request, or anything under
`docs/internal/`.

## Documentation

Reference material goes on a page under `docs/`, not into the README, which stays
a landing page. Code that a page quotes lives as a real file under
`packages/examples` with a test holding the page to it — see
`packages/examples/extending/docs.spec.ts` and `packages/examples/quickstart.spec.tsx`.

## Releasing (maintainers)

Bump the four package versions and their cross-dependencies together, commit, then
`npm run release:publish -- --otp <code>`. The script builds, points `exports` at
`dist/` for the publish, publishes in dependency order, tags `alpha`, and always
restores the source form. Never publish by hand, and never commit the flipped
`exports`.
