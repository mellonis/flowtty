# flowtty followups

Running log of flowtty gaps + ergonomics issues discovered while porting `site/scripts/articles.mjs` to a flowtty TUI. Each entry: brief description + when it was hit + suggested action. Cleaned up + prioritized at the end.

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

Safer pattern (used after the fix):

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

(More entries added as Tasks 2-6 surface issues.)
