# Followups from articles-CLI dogfood

Running log of flowtty gaps + ergonomics issues discovered while porting `site/scripts/articles.mjs` to a flowtty TUI. Each entry: brief description + when it was hit + suggested action. Cleaned up + prioritized at end of dogfood.

---

## Setup (Task 1)

### react-reconciler doesn't transitively install via `npm link`

flowtty declares `react-reconciler@^0.31.0` as a regular dependency in its `package.json`, but `npm link @flowtty/flowtty` does NOT pull it into the consumer's `node_modules`. The consumer must install it directly.

**Hit when:** Task 1 setup in site repo; `node -e "console.log(require.resolve('react-reconciler'))"` failed until `npm i react-reconciler@^0.31` was run.

**Action:** Either (a) bundle react-reconciler into flowtty's dist (eliminates the install step but bloats dist + locks the reconciler version), or (b) document it prominently in a "Getting started" guide as a required peer install. (b) is cheaper; the bundling tradeoff isn't obvious enough to commit to right now.

### `require.resolve('@flowtty/flowtty')` fails (ESM-only package)

`require.resolve` is a CJS API; flowtty has no CJS `main` field, only ESM `exports`. Consumers using `require.resolve` for sanity checks will see a false failure even when the symlink + dist files are correct.

**Hit when:** verifying the npm link in Task 1.

**Action:** Document in getting-started — use `node --check <file>` or actually `import` the package to verify; don't rely on `require.resolve`. Lower priority (a minor diagnostic gotcha, not a real bug).

### `const handle = await render(...)` with inline-closure exit handler is fragile

The pattern below "works" in real terminals but reads as fragile (closure captures `handle` lexically before the const binding completes, even if the closure only RUNS later):

```js
const handle = await render(
  createElement(App, { onExit: () => handle.unmount() }),
  backend,
);
```

Safer pattern (used in articles-tui after the fix):

```js
let handle = null;
function App() {
  useInput((key) => { if (key.name === 'escape') handle?.unmount(); });
  return ...;
}
const backend = new TtyBackend();
handle = await render(createElement(App), backend);
```

**Hit when:** smoke-testing Task 1 hello-world (originally suspected; actual cause was WebStorm's run console — see next entry).

**Action:** Show the let-pattern in any getting-started snippet that needs self-exit. The const-pattern works in practice but the let-pattern is unambiguously safer and more readable.

### WebStorm's run console doesn't forward Esc properly

When the hello-world is launched from WebStorm's IDE run interface (not a real terminal), Esc keypresses are not forwarded to the running process. Ctrl-C works (TtyBackend's default handler catches it). Esc-cancel UX appears broken — but it's an IDE artifact, not a flowtty bug.

**Hit when:** smoke-testing Task 1 hello-world inside WebStorm's run UI.

**Action:** Document in any future "running flowtty apps" guide: "If Esc seems to not work, you're probably running inside an IDE console that doesn't forward Esc. Use a real terminal (iTerm2, Terminal.app, or WebStorm's external terminal tab)." This is a one-line documentation note, not a flowtty change.

---

## List view (Task 2)

### Shared script + module pattern: top-level side-effectful `await` blocks import

`articles.mjs` ends with `await main()` at top level. A consumer that does `import { listFolders } from './articles.mjs'` triggers the entire CLI wizard at import time — the two competing TUI apps share the same stdin/raw-mode state and produce garbage output.

**Hit when:** first `import { listFolders, buildRows, statusOf } from './articles.mjs'` in articles-tui.mjs would have hung in the wizard.

**Fix applied:** gate with `if (process.argv[1]) { ... pathToFileURL check ... }` at the bottom of articles.mjs. This is standard ES-module "main guard" pattern.

**Action:** flowtty can't prevent this — it's a Node.js module-system concern. Consider adding a note to the getting-started guide: "If you import helpers from a CLI script that ends with a top-level `await`, guard it with an `import.meta.url` check." May be worth showing the pattern in a documentation example.

### No `clearScreen` or `altScreen` lifecycle hook on render()

`listInteractive` in articles.mjs calls `console.clear()` on every render to give a full-screen feel. In flowtty, the TtyBackend's alt-screen handles this, but after unmount the cursor is left wherever it was last painted — there's no `onMount`/`onUnmount` lifecycle callback on the render handle to do post-exit cleanup (e.g. clear a line, move cursor home).

**Hit when:** thinking through how the list view would look after unmount in contrast to how articles.mjs clears the screen on every key press.

**Action:** Lower priority — TtyBackend already uses alt-screen which auto-restores the original scrollback on unmount. But a `handle.onUnmount(cb)` hook or a `cleanup` field on the render return value would be useful for consumers who need post-exit side effects.

---

---

## Create wizard (Task 3)

### `MultiSelect.onAddNew` is `() => void` — can't return the new item id

The M1c.4 design intent was for `onAddNew` to be `async () => Promise<string | null>` so the component could automatically splice in and select the new item when the callback resolves. The actual implementation signature is `() => void`. There's no return channel.

**Workaround:** Consumer must manage a sub-step state machine: on `onAddNew()` call, switch the wizard to an `'add-tag'` step, render `TextInput` there, and on submit call `addArticleTagToContent`, mutate the `knownTags` array held in `useState`, add the new tag to `selectedTags`, and switch back to `'tags'`.

**Action:** Upgrade `onAddNew` to `() => Promise<string | null>` (or `() => Promise<void>` with the component re-reading the items array after the promise resolves). The sync `() => void` forces consumers to invent their own sub-prompt state machine for what should be a self-contained flow. This is the highest-priority ergonomics gap from Task 3.

### `TextInput` has no `defaultValue` prop — seeding a step requires a child component

`TextInput` is fully controlled (`value` + `onChange` required). To seed the slug step with `slugify(title, lang)`, the implementation needs a separate `SlugStep` child component that owns its own `useState` initialised from a prop. A `defaultValue` prop that populates the initial uncontrolled state would eliminate one component and several lines of boilerplate per wizard step.

**Action:** Add an uncontrolled mode (or at least a `defaultValue` seed) to `TextInput`. The controlled pattern is correct for form integration, but single-shot prompts inside a step-wizard are much simpler with an uncontrolled `defaultValue`.

### No `validate` error rendering — consumer must mirror the error in state

`TextInput`'s `validate` callback blocks `onSubmit` on failure, but the component does not render the error string. The consumer must duplicate the validation in its own state (`useState<string | null>`) and render it separately below the input.

**Action:** `TextInput` should render the validation error itself (below the cursor line) when `validate` returns a non-null string. Removes a boilerplate pattern that every wizard step with validation has to repeat.

---

## Wizard dialog UX (post-Task 5 polish)

### `createElement` strips generic component params (Select<T>, MultiSelect<T>)

JSX would auto-infer `T` from `items` / `value` props; `createElement(Select, {...})` does not, so callbacks fall back to `(value: unknown[]) => void`. Workaround: `createElement<SelectProps<T>>(Select, {...})` at every call site.

**Action:** README should document `createElement<Props<T>>(Component, ...)` for typed generic components, OR recommend JSX for app code using flowtty.

### Border-title (top edge: `┌── title ──┐`) not supported

Currently dialogs render their title as the first line INSIDE the border + a dim HR below. Real on-border titles like `┌── New article ──────┐` would need a `borderTitle?: string` prop with paint-time substitution into the top edge.

**Action:** small flowtty feature; ~10 lines paint.ts change.

### Marquee/scrolling Text (no truncate, no wrap)

When a single-line Text doesn't fit, options today are `wrap: 'wrap'` (multi-line) or `wrap: 'truncate'` (ellipsis). A `wrap: 'marquee'` mode that horizontally scrolls within the allocated width on a timer would be nicer for long-but-must-fit values.

**Action:** would need a timer-driven re-render mechanism in flowtty; non-trivial.

### `width: '100%'` on root child doesn't resolve as expected

In a test that does `computeLayout(container, 20, 1)`, a Box with `width: '100%'` whose parent is the root resolved to the box's CONTENT width, not 20. Workaround for the dogfood: `alignItems: 'stretch'` on parents to grow children cross-axis.

**Action:** investigate why Yoga's `calculateLayout(w, h)` ownerSize doesn't satisfy percentage resolution on root children. Possibly need `setWidth(w)` on root before `calculateLayout` — but that overrides explicit widths on root nodes (broke 4 paint tests when tried).

### Cursor variant + behaviour (config)

Hardcoded cursor glyph (`█` block) in `text-input.ts`. No blink (would need timer-driven re-render).

**Action:** add an app-level config (or per-TextInput prop) for `cursorGlyph: string` and optional `cursorBlink: boolean`. Blink requires a timer that toggles a state in TextInput → re-render; probably opt-in only since it adds animation overhead.

---

## Delete / publish / withdraw (Task 6)

### `setDraftForFolder` writes to stdout during alt-screen session

`setDraftForFolder` (and `updateIdeasStatus`) call `console.log` / `console.warn` internally. These writes go to the alt-screen buffer between flowtty repaints. TtyBackend's full-redraw overwrites them on the next frame (invisible in practice) but the pattern is fragile: any stdout write during alt-screen can cause a 1-frame blip.

**Action:** flowtty should document (or enforce) that `process.stdout.write` and `console.log` are unsafe during an active TtyBackend session. A warning shim that throws or bufffers all stdout writes while alt-screen is active would catch this class of bug automatically. A `handle.onUnmount` hook (logged in Task 2) would also let consumers defer logging to after unmount.

### `bumpKey` is not needed — `setStatusMessage` triggers re-render + fresh disk read

After `setDraftForFolder` resolves, calling `setStatusMessage('published: <id>')` causes React to re-render; `ListView` calls `listFolders()` + `statusOf()` fresh from disk on every render, so the updated draft state appears automatically. No extra counter state required.
