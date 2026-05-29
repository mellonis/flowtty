# `flowtty` — design

> **Staging note.** This spec is authored in the `site` repo (`docs/superpowers/specs/`) because that's where the brainstorming happened. `flowtty` will live in its **own standalone repo `mellonis/flowtty`**, cloned as a workspace sibling (same pattern as `turing-machine-js` / `post-machine-js`). When that repo is scaffolded, this spec moves into it. Nothing here is committed to `site`.

> **How this design evolved** (so a cold reader isn't confused by the git history — each pivot was driven by new information, not indecision):
> - **Wedge** — a small workflow-focused prompt toolkit, not competing with Ink.
> - **Parity** — pivoted to "compete with Ink as a general renderer" (custom react-reconciler + Yoga).
> - **Adapter-seam** — OpenTUI evidence reframed flowtty as a *renderer-agnostic workflow layer* running on multiple backends (OpenTUI / native / test).
> - **App framework (current)** — the goal became "build a real CLI **app** (Midnight Commander) with flowtty." flowtty becomes a **self-contained terminal app framework** — its own renderer plus the app-shell + workflow + prose layers — with MC as the flagship proof-of-concept. OpenTUI is no longer a backend; it's the **prior art** whose architecture (a renderer core + thin framework bindings) flowtty *emulates* in JS/Yoga, and whose gaps (no app structure, no workflow model) flowtty fills.

## What it is

`flowtty` is a **self-contained framework for building terminal CLI apps in React**, owning the whole stack:

- **its own renderer** — a `react-reconciler` host config + **Yoga** flexbox layout (no OpenTUI, no Ink underneath);
- an **opinionated app shell** — region/pane model, focus *across* regions, key routing, and a menu / function-key bar;
- a **workflow / dialog layer** — `await`-able flows, both standalone (`runWorkflow`) and **embedded** (in-app modal dialogs that return a value without tearing down the app);
- **workflow-grade prompt primitives** — `TextInput`, `Select`, `MultiSelect`, `Confirm`, with prose niceties nobody else has (NBSP-safety, typography inserts, emacs line editing, filter-as-you-type).

**The proof-of-concept is a minimal Midnight Commander** — two file panels, a simple menu, and copy/move with dialogs — built entirely on flowtty. It's the recognizable benchmark that flowtty can host a real app, deliberately scoped to the core MC loop rather than MC's full feature set (which is explicit overhead, not a goal).

## Why it exists / what makes it distinct

flowtty competes in the same space as Ink and OpenTUI (React renderers for the terminal), so it has to be clearly distinct, not a third clone. Its edge is **not rendering tech** — a JS-reconciler-over-Yoga renderer will not out-perform OpenTUI's Zig core, and that's fine. Its edge is the **layers those frameworks deliberately leave to you**:

1. **Opinionated app structure.** Ink and OpenTUI give you `Box`/`Text`/`Input`/`Select` and stop. flowtty gives you the *application skeleton*: panes/regions, focus across regions, key routing (which region claims a key, what's global, how menu accelerators work), and a function-key bar. This is what you'd otherwise hand-roll for every app — and exactly what MC needs.
2. **A workflow / dialog model.** Neither Ink nor OpenTUI has `await runWorkflow(...)` or first-class forms/wizards/modals/cancel-back. MC's "copy these files to…?" dialog *is* an embedded workflow.
3. **Prose primitives.** NBSP-safety, typography inserts, emacs editing for any text entry — ported from the proven `articles.mjs` line editor.

```jsx
// standalone: a flow that owns the screen and yields a value
const result = await runWorkflow(<CreateArticle />);
// result: { status: 'done', value: {...} } | { status: 'cancelled' } | { status: 'aborted' }

// embedded: a modal dialog inside a running app (the MC case)
const dest = await openDialog(<CopyDialog files={selected} />); // resolves without unmounting the app
```

**Honest framing for the README.** flowtty's renderer is "a `react-reconciler` host config on top of Yoga" — *not* a from-scratch renderer including layout, and *not* faster than a native-core renderer. The value is the app + workflow + prose layers and the ergonomics of building apps like MC with them. It emulates OpenTUI's renderer-core / framework-binding separation, in JS/Yoga rather than Zig.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ App:  runWorkflow(<App/>)  ·  Midnight Commander (the PoC)    │
├──────────────────────────────────────────────────────────────┤
│ App-shell layer (the distinct identity):                     │
│   <Pane>/<Region> · focus-across-regions · key routing ·     │
│   <MenuBar> / function-key bar                               │
├──────────────────────────────────────────────────────────────┤
│ Workflow / dialog layer:                                     │
│   runWorkflow (standalone) · openDialog/useDialog (embedded) │
│   <Form> <Wizard> <Modal>                                    │
├──────────────────────────────────────────────────────────────┤
│ Prompt primitives (own): <TextInput> <Select> <MultiSelect>  │
│   <Confirm>  — NBSP/emacs/typography/filter live HERE        │
├──────────────────────────────────────────────────────────────┤
│ General components: <Box> <Text> <Spacer> <ScrollBox> …      │
├──────────────────────────────────────────────────────────────┤
│ Renderer adapter (thin seam) — lets the test backend stand in│
├───────────────────────────────┬──────────────────────────────┤
│ Native renderer (v1):         │ Test backend:                │
│ react-reconciler + Yoga       │ in-memory cell buffer +      │
│ + ported terminal I/O core    │ synthetic keys (CI)          │
└───────────────────────────────┴──────────────────────────────┘
```

The seam is kept so the **test backend** can stand in for the real renderer (TUI testing is otherwise painful). v1 ships exactly two adapter implementations — the native renderer and the test double. Other backends (e.g. an OpenTUI or Ink backend) are *possible later* but explicitly not planned.

### Renderer (native, v1 core)

Own `react-reconciler` host config; React drives it. Host instances (`Box`, `Text`, …) each own a **Yoga** node; props map to Yoga style; on commit → `Yoga.calculateLayout()` → walk computed boxes → cell buffer → diff → ANSI write. Adopt Yoga (don't hand-roll flexbox) — correctness/perf of layout math comes free; the effort is the host-config integration + components. Terminal I/O (raw-mode, keypress parsing, ANSI, alt-screen) is **ported from `articles.mjs`**.

### App-shell layer (the part that isn't an Ink/OpenTUI clone)

- **`<Pane>` / `<Region>`** — named focusable regions composing the app layout (MC's two panels, menu bar, command line).
- **Focus across regions** — a focus model that moves between regions (Tab / explicit), distinct from focus *within* a form. (flowtty owns this; it's the thing OpenTUI's window-level `useFocus` is *not*.)
- **Key routing** — a deterministic model for "which region/component handles this key," global hotkeys, and menu accelerators (F-keys). This is the hard, valuable core of an app framework.
- **`<MenuBar>` / function-key bar** — the F1–F10 bar pattern.

### Workflow / dialog layer

- **`runWorkflow(element) → Promise<WorkflowResult<T>>`** — *standalone*: mounts a root, owns the screen, resolves on `useWorkflow().done(v)` / `.cancel()`, restores the terminal. `WorkflowResult`: `done` | `cancelled` | `aborted` (the last from `SIGTERM`/`SIGHUP` teardown).
- **`openDialog(element) → Promise<T>` / `useDialog()`** — *embedded* (first-class, because it's how MC's dialogs work): runs a workflow as a modal overlay *inside* a running app, resolving a value **without** unmounting the host.
- **`useWorkflow()`** — `{ done, cancel }` + multi-step `{ next, back, goto, step, values, setValues }`.
- **`<Form>`** (`<Form.Field>` children) — focus ring, per-field validate, aggregated values, cancel-propagates.
- **`<Wizard>`** (`<Wizard.Step>` children) — next/back, per-step validation, accumulating values, **cancel propagation** (declarative analogue of `articles.mjs`'s `CANCELLED` sentinel).
- **`<Modal>`** — renders on the overlay surface; the substrate for embedded dialogs.

### Prompt primitives (own, not wrappers)

`<TextInput>` (ports the `articles.mjs` line editor: emacs bindings, word ops, `OPT_MAP` typography, byte-exact NBSP, masking), `<Select>` (filter-as-you-type), `<MultiSelect>` (checkboxes + inline "+ add new"), `<Confirm>`. Built on normalized `Key` events + styled text, so they work identically on the native renderer and the test backend.

## Acceptance — north star vs v1 gate

Midnight Commander is ~30 years of features (mcedit, archive browsing, SFTP, hex viewer, F1–F10, mouse, VFS, …). "v1 isn't done until MC works" = v1 never ships, which is the abandonment trap we've designed against throughout. So the two are split:

- **v1 acceptance — the minimal MC (the whole gate, deliberately small):** two file panels + navigation (arrows / enter / parent dir) + key routing across the panes + a **simple menu** (top bar and/or F-key triggers) + **copy and move** file operations, each via an embedded confirm dialog (`openDialog`) + the real file I/O. That's it — **no viewer, editor, archive/VFS, SFTP, mouse, hotlist, history, user menus.** Those are explicit overhead, excluded by the user's scope call. Still exercises every layer (renderer, app-shell, dialog, prompts, file I/O), so it's a complete proof without being a multi-year build.
- **Workflow acceptance — the article-create-wizard** (Form + Wizard + Modal + cancel), via `runWorkflow`, kept as the *standalone-workflow* test. Complementary to the MC slice, not competing.
- **Layout-conformance + frame tests** on the test backend.

The minimal MC is **1.0** — and it may well *be* the finished demo, not just a waypoint. Going further toward fuller MC is **optional and post-1.0**, not promised.

## Testing

`flowtty/testing` (the test backend): `renderToString` (plain + styled frame), synthetic input (`press`, `type`), `runWorkflowForTest`, and layout-conformance fixtures. No real TTY in CI. The same harness backs internal tests; because the test backend implements the same adapter as the native renderer, app/workflow code under test runs unchanged on it.

## Packaging

One repo `mellonis/flowtty`, **unscoped** npm package name `flowtty` (matches the unscoped machines-lib convention; `flowtty` is available on npm):

- **`flowtty`** — renderer + general components + app-shell + workflow/dialog layer + prompt primitives. Deps: `react-reconciler` (+ `scheduler`), `yoga-layout`. Peer: `react`.
- **`flowtty/testing`** — test backend + harness.

No `@opentui/*` dependency. TypeScript (real `.d.ts` + JSX types), ESM, `jsxImportSource` / automatic runtime documented.

## Reconciler / Yoga / signal traps (now core v1 work, not "a later backend")

- **`react-reconciler` ↔ React version pin** — verify the exact compatible `react-reconciler` against installed `react` (React 19 line) before locking deps. `react` is a peer dep; `react-reconciler` (+ `scheduler`) and `yoga-layout` are direct deps.
- **Yoga node lifecycle** — free each node on unmount (`freeRecursive`/`free`) or leak Yoga's wasm memory. The most common Yoga bug.
- **Yoga delivery** — verify current `yoga-layout` packaging (wasm) and init (sync vs async).
- **Signal & teardown lifecycle (two layers):**
  - *Layer 1 — synchronous restore:* `setRawMode(false)` + show-cursor + leave-overlay, run directly in `SIGINT`/`SIGTERM`/`SIGHUP` handlers **and** a `process.on('exit')` net. Synchronous, idempotent, best-effort (try/catch — `SIGHUP` may have closed the TTY). Must **not** depend on the AbortController (abort listeners don't fire after `process.exit()`).
  - *Layer 2 — `AbortController`:* per-run controller whose `signal` cancels async work (async `validate`, fetches, key subscriptions) and resolves the workflow as `aborted`.
  - `SIGTERM`/`SIGHUP` listeners override Node's default terminate → handler must `process.exit(128 + signo)` (`130`/`143`/`129`); never leave the process unkillable.
  - Scope handlers per-run (install on mount, remove on unmount); wire `uncaughtException`/`unhandledRejection` to restore-then-rethrow.

## Milestones (sequenced so a shippable thing lands as 1.0)

This is, honestly, a multi-year solo project. The sequence ensures something usable and demoable exists at each step and that 1.0 is a real, finite target rather than "all of MC":

- **M0 — renderer + test backend.** react-reconciler + Yoga + `Box`/`Text` rendering; test backend renders the same tree to a buffer. Static layout works in CI and a real terminal.
- **M1 — prompts.** Input layer + `TextInput`/`Select`/`MultiSelect`/`Confirm` + prose niceties + intra-form focus ring, green on the test backend.
- **M2 — workflows.** `runWorkflow` + `openDialog` (standalone + embedded) + `Form`/`Wizard`/`Modal`; article-create-wizard benchmark passes.
- **M3 — app shell.** `<Pane>`/`<Region>`, focus-across-regions, key routing, `<MenuBar>`/function-key bar.
- **M4 — minimal MC → 1.0. ANNOUNCE here.** Two file panels + navigation + key routing + a simple menu + copy & move (with embedded confirm dialogs) + real file I/O, built entirely on flowtty. Deliberately minimal — this slice may well *be* the finished demo. The proof that flowtty builds real apps.
- **Post-1.0 (optional, not promised):** if it has legs, grow toward fuller MC — more file ops, viewer, mouse, mcedit, etc. Each is additive; none gate 1.0.

## Adoption / off-ramp

**Identity:** "a self-contained framework for building terminal apps in React — proven by Midnight Commander." Levers: the MC demo itself (recognizable, screenshot-friendly), docs, an `/open-source` entry on `mellonis.ru`.

**Success / off-ramp (for future-me, not marketing):**
- *Success:* the core MC slice ships and feels good to build on; a few external users / a third party building something real; the MC demo lands as a portfolio centerpiece.
- *Failure:* by a concrete review date (e.g. **~2027-06**, allowing for the larger scope), the renderer + app shell aren't far enough to demo the MC slice, or there's no traction.
- *Off-ramp:* the renderer + whatever app-shell/MC-slice exists stands as a portfolio artifact regardless; or narrow back to the workflow layer as a focused lib. The unacceptable outcome is an unfinished framework maintained for no one — so favor shipping the M4 slice over breadth.

## Open questions (resolve during planning, not blocking)

1. **Key-routing model** — the core app-shell design: capture/bubble order across regions, global hotkeys, menu accelerators, modal input trapping. This is the hardest piece; prototype it early.
2. **Embedded-dialog API shape** — `openDialog(element): Promise` vs a `useDialog()` hook vs a `<DialogHost>`; focus trapping + input routing while a dialog is open.
3. **Yoga delivery** + **exact `react-reconciler` version** — pin after verifying against installed React.
4. **Normalized `Key` shape** — finalize the type shared by the native renderer's parser and the test backend's synthetic keys.
5. **Testing entry** — separate package vs subpath export.
