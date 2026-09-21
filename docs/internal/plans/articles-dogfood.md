# flowtty Articles Dogfood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** port the full interactive wizard of `site/scripts/articles.mjs` (1249 lines) to a flowtty-based `site/scripts/articles-tui.mjs` sibling file. Use `npm link` to consume the local flowtty checkout (built dist/). Cover every interactive flow: list, create (with cancelable form + tag picker + add-new), article view with **paginated body** (validates `onLayout` + `useTerminalSize`), tags list, edit-article-tags, delete-with-typed-confirm, publish, withdraw. Non-interactive CLI subcommands (`articles create [flags]`, `articles list`, `articles publish <id>`, etc.) stay in articles.mjs untouched.

The dogfood's PRIMARY value is **surfacing gaps in flowtty's API** — missing helpers, awkward patterns, doc holes. At the end of each task, document anything that felt clunky as a follow-up plan candidate in `flowtty/docs/plans/_followups.md` (create on first hit). Do NOT pause the dogfood to fix flowtty mid-port unless something is genuinely blocking.

**Architecture:**
- *Repo layout:* implementation lives in `mellonis/site` repo (`site/scripts/articles-tui.mjs` + minor `package.json` additions); plan lives in flowtty repo. Most commits land in site; flowtty additions only if a missing helper truly blocks progress.
- *Link:* `npm link` in flowtty (creates global symlink to built dist) + `npm link flowtty` in site (adds symlink under `site/node_modules/`). React + react-reconciler installed as regular deps in site (flowtty's peer/regular requirements — verify in Task 1).
- *File format:* `.mjs` with `createElement` calls (no JSX) — matches articles.mjs's style, avoids adding a TS/JSX build step to site/scripts/. Verbose but trivial to deploy. JSDoc types on shared helpers.
- *Code reuse:* import helper functions from articles.mjs by relative path (`./articles.mjs`). `slugify`, `listFolders`, `readFrontmatter`, `statusOf`, `buildRows`, `loadRegisteredTags`, `addArticleTagToContent`, `writeArticleSkeleton`, `setDraftFlag`, `updateIdeasStatus` — all already-exported functions. NEW code is purely React-component-and-state-machine.
- *State machine:* top-level App component holds current view (`'list' | 'create' | 'view' | 'tags-list' | 'edit-tags' | 'delete-confirm'`) + per-view state (cursor index, selected article id, etc.). Views are mounted/unmounted as state changes; React handles cleanup.

**Tech Stack:**
- Node 20+ (site's existing requirement).
- React 19, react-reconciler (via flowtty's deps — installed by npm link).
- flowtty (from local link).
- `.mjs` files in site/scripts/, no transpile step.

**Out of scope:**
- Replacing articles.mjs in-place (deferred — user chose sibling-file approach).
- Non-interactive subcommands (`articles create [flags]` etc.) — stay in articles.mjs.
- Removing `npm link` and publishing flowtty to npm — that's a separate decision.
- Cross-process state sync (one TUI instance at a time).

---

## Scope check

Substantial dogfood spanning two repos. **6 tasks**, each producing a runnable binary you can exercise. Don't batch; merge each task before starting the next so any flowtty gap discovered can be plan-resolved cleanly.

---

## File Structure (site repo unless noted)

```
site/
  scripts/
    articles-tui.mjs        # NEW — entire TUI port
    articles.mjs            # READ ONLY (import helpers from here)
  package.json              # MODIFY — add flowtty + react + react-reconciler deps; add npx script (optional)

flowtty/
  docs/plans/_followups.md  # NEW (on first hit) — log gaps discovered during the port
```

---

### Task 1: Setup — npm link + skeleton + hello-world

**Files:**
- *flowtty repo:* none (assuming dist is built and link-ready)
- *site repo:* MODIFY `package.json`; CREATE `scripts/articles-tui.mjs`

- [ ] **Step 1: In flowtty repo** — verify dist is built and `package.json` is link-ready.

```bash
cd /Users/mellonis/Developer/mellonis-workspace/flowtty
npm run build
cat package.json | grep -E '"main"|"exports"|"types"'
```

Expected: `dist/index.js` (ESM) referenced by `exports`/`main`. If not, fix package.json before linking (this is a flowtty issue; resolve in flowtty repo first).

```bash
npm link  # creates global symlink to this checkout's package
```

- [ ] **Step 2: In site repo** — link flowtty and install React peers.

```bash
cd /Users/mellonis/Developer/mellonis-workspace/site
npm link flowtty
# React 19 + react-reconciler are flowtty's runtime deps. If they're declared
# as peers in flowtty's package.json, site needs them installed; if regular
# deps, npm link should pull them in transitively. Check with:
node -e "console.log(require.resolve('react'))"
node -e "console.log(require.resolve('react-reconciler'))"
# If either fails: npm i react@^19 react-reconciler@^0.31
```

- [ ] **Step 3: Create `site/scripts/articles-tui.mjs`** — minimal hello-world that exits on Esc.

```js
#!/usr/bin/env node
import { createElement } from 'react';
import { render, Box, TtyBackend, useInput } from 'flowtty';

function App({ onExit }) {
  useInput((key) => {
    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) onExit();
  });
  return createElement(Box, {},
    createElement(Box, {}, 'flowtty articles-tui — hello'),
    createElement(Box, {}, 'press Esc to exit'),
  );
}

const backend = new TtyBackend();
const handle = await render(
  createElement(App, { onExit: () => handle.unmount() }),
  backend,
);
```

(NOTE: verify `useInput` is exported from flowtty + the `Key` shape — check the just-merged terminal-size flowtty + existing M1b input. If the import or hook name differs, adjust.)

- [ ] **Step 4: Smoke test.**

```bash
node site/scripts/articles-tui.mjs
```

Expected: alt-screen takeover; "flowtty articles-tui — hello" + "press Esc to exit" rendered; Esc returns to shell cleanly with original scrollback intact.

If anything is broken (key not received, screen not cleared, crash on exit), STOP and fix before continuing — this is foundational.

- [ ] **Step 5: Commit in site repo:**

```bash
cd /Users/mellonis/Developer/mellonis-workspace/site
git add scripts/articles-tui.mjs package.json package-lock.json
git commit -m "wip: articles-tui scaffolding (flowtty dogfood, hello-world)"
```

---

### Task 2: List view — table + selection + row-specific keys

**Files:**
- *site repo:* MODIFY `scripts/articles-tui.mjs`

Goal: replicate `listInteractive` from articles.mjs. Header help text changes based on selection (create-row vs article-row). Table columns: id, status, date, title. Selection marker `▸` on highlighted row.

- [ ] **Step 1: Import the data helpers from articles.mjs:**

```js
import { listFolders, buildRows, statusOf } from './articles.mjs';
```

(If those functions aren't exported from articles.mjs, add `export` keywords to the relevant ones — articles.mjs lives in site repo, you may edit it minimally to expose helpers. Don't change their behavior.)

- [ ] **Step 2: Build the `ListView` component.**

State: `idx` (selected row), 0 = "+ new article", 1..N = folders[idx-1].
Render: help-line at top + blank line + header row + rows.
Use `<Box flexDirection="column">` for vertical stack. Each row is a `<Box flexDirection="row">` with text children (use simple string children, NOT a Table component — flowtty doesn't have one).

For column padding, use simple JS `padEnd(n)` on the strings, or set fixed-width `<Box width={n}>` cells. The articles.mjs code uses padEnd — match it for byte-perfect comparison ability later.

Selection highlight: use `<Text bold>` (or just `bold` prop on Box) for the selected row.

- [ ] **Step 3: Key handling via `useInput`:**

```js
useInput((key) => {
  if (key.name === 'up' || key.name === 'k') /* idx-- mod N */;
  else if (key.name === 'down' || key.name === 'j') /* idx++ mod N */;
  else if (key.name === 'return' || key.name === 'enter') {
    if (idx === 0) onAction({ kind: 'create' });
    else onAction({ kind: 'view', id: folders[idx-1] });
  }
  else if (key.name === 'd') /* delete if idx > 0 */;
  else if (key.name === 'p') /* publish if status !== published */;
  else if (key.name === 'w') /* withdraw if status !== draft */;
  else if (key.name === 't') onAction({ kind: 'tags-list' });
  else if (key.name === 'escape') onAction(null);  // quit
});
```

- [ ] **Step 4: App wires ListView, logs the action to a debug line:**

For this task, the App just renders ListView and shows the resolved action below (no routing yet — that comes in Task 6).

- [ ] **Step 5: Smoke test** — run, navigate with arrows, try each row-specific key, verify the help line updates between "+ new article" row and article rows.

- [ ] **Step 6: Log any flowtty gaps to `flowtty/docs/plans/_followups.md`:** (create the file if it doesn't exist; entries are 1-3 lines describing what was awkward.)

- [ ] **Step 7: Commit in site repo:**

```bash
git add scripts/articles-tui.mjs scripts/articles.mjs  # if you exported helpers
git commit -m "wip: articles-tui list view"
```

---

### Task 3: Create wizard — multi-step form with cancel, validation, tag picker

**Files:**
- *site repo:* MODIFY `scripts/articles-tui.mjs`, MODIFY `scripts/articles.mjs` (export `writeArticleSkeleton`, `loadRegisteredTags`, `addArticleTagToContent`, `slugify`, `SLUG_RE` if not already)

Goal: replicate `createInteractive` (articles.mjs:1022-1110). Sequence: lang (en/ru select) → title (text required) → slug (text, kebab-validated, unique) → multi-select tags (with `+ new tag` option). Esc at any step → "cancel and return to menu? Y/n" prompt → on confirm, exit back to App with `null`.

- [ ] **Step 1: Component shell.**

`CreateView({ onDone })` — `onDone(slug | null)` resolves the flow. Internal state: current step (`'lang' | 'title' | 'slug' | 'tags' | 'confirm-cancel'`), accumulated values, last error.

Use flowtty's `<Form>` if it fits; if multi-step doesn't map cleanly to Form's submit semantics, manage step state manually with useState + per-step components (`<Select>`, `<TextInput>`, `<MultiSelect>`).

- [ ] **Step 2: Per-step rendering** — only one prompt visible at a time.

For each step, show the prompt + current value being edited + error line (if validation failed last time).

Step 1 (`lang`): `<Select items={[{label:'en',value:'en'}, {label:'ru',value:'ru'}]} onSelect={lang => goto('title', {lang})}>`.

Step 2 (`title`): `<TextInput required onSubmit={t => goto('slug', {title:t})}>`. Re-prompt on empty.

Step 3 (`slug`): `<TextInput defaultValue={slugify(title, lang)} onSubmit={s => { /* validate kebab, uniqueness; on fail show error and re-prompt */ }}>`.

Step 4 (`tags`): `<MultiSelect items={knownTags} preSelected={[]} onAddNew={tagAddPrompt} onSubmit={tags => { if (tags.length === 0) showError; else writeAndDone(tags); }}>`.

`tagAddPrompt`: a sub-prompt component or a callback that returns the new tag id (kebab-validated, unique check, registers via `addArticleTagToContent`). This is the M1c.4 onAddNew pattern.

- [ ] **Step 3: Esc handling.**

Each step's input handler catches Esc → setStep('confirm-cancel').

Confirm-cancel step: `<Confirm message="cancel and return to main menu?" defaultValue="yes" onSelect={(yes) => yes ? onDone(null) : setStep(previousStep)}>`.

- [ ] **Step 4: On final submit** — call `writeArticleSkeleton({ slug, date: TODAY, tags, originalLang, title })`, then `onDone(slug)`.

(TODAY = today's ISO date string, computable inline.)

- [ ] **Step 5: App wires it** — adds a state `view: 'list' | 'create'`. Pressing Enter on "+ new article" sets view='create'. CreateView's onDone resets view='list' (and stores newly-created slug in state for Task 4 to navigate to it).

- [ ] **Step 6: Smoke test:**

```bash
node scripts/articles-tui.mjs
# navigate to "+ new article", Enter
# fill in lang/title/slug/tags
# verify the article folder is created in content/articles/
# also try Esc cancel mid-flow
# verify slug validation (e.g. type "Has Space")
# verify uniqueness check (re-enter an existing slug)
```

- [ ] **Step 7: Log flowtty gaps + commit (site repo):**

```bash
git add scripts/articles-tui.mjs scripts/articles.mjs
git commit -m "wip: articles-tui create wizard"
```

---

### Task 4: Article view with paginated body (the onLayout + useTerminalSize test)

**Files:**
- *site repo:* MODIFY `scripts/articles-tui.mjs`, MODIFY `scripts/articles.mjs` (export `readFrontmatter` if not already)

Goal: replicate `articleView` (articles.mjs:355-446). Frontmatter at top (always visible). Body below, paginated to fit the viewport. Locale toggle (`t` = swap, `r` = ru, `e` = en). Nav keys: Space/Enter/→/↓/j next page, ←/↑/k prev page. Esc returns to list. The pagination MUST react to terminal resize.

- [ ] **Step 1: `ArticleView({ id, initialOpts, onDone })` component.**

State: `lang` (en/ru), `pageIdx` (0-based), `size` (from onLayout; null until first measure).

Read both en.md + ru.md, split frontmatter/body for the current `lang`. Frontmatter = the YAML block above the second `---`; body = everything after.

- [ ] **Step 2: Layout.**

```js
createElement(Box, { flexDirection: 'column', width: '100%', height: '100%' },
  // Frontmatter section (fixed height — auto-sized by content)
  createElement(Box, { flexDirection: 'column' }, /* parsed frontmatter rows */),
  // Help line
  createElement(Box, {}, '─'.repeat(80)),  // or use border / a divider
  // Paginated body region — flexGrow:1, onLayout to measure
  createElement(Box, {
    flexGrow: 1,
    onLayout: (rect) => {
      if (!size || size.width !== rect.width || size.height !== rect.height) {
        setSize({ width: rect.width, height: rect.height });
        // Clamp pageIdx if it overflows new pagination
        setPageIdx((p) => Math.min(p, maxPageIdx(size, body)));
      }
    },
  },
    size ? createElement(Pages, { lines: paginate(body, size), index: pageIdx }) : null,
  ),
);
```

`paginate(text, size)`: wraps text to `size.width` then chunks into arrays of `size.height` lines each. Returns `pages: string[][]`.

`<Pages>`: renders `pages[index]` as a column of Text. If `index >= pages.length`, render the last page.

- [ ] **Step 3: Key handling.**

```js
useInput((key) => {
  if (key.name === 'space' || key.name === 'return' || key.name === 'right' || key.name === 'down' || key.name === 'j')
    setPageIdx((p) => Math.min(p + 1, maxPageIdx));
  else if (key.name === 'left' || key.name === 'up' || key.name === 'k')
    setPageIdx((p) => Math.max(p - 1, 0));
  else if (key.name === 't') setLang((l) => l === 'en' ? 'ru' : 'en');
  else if (key.name === 'r') setLang('ru');
  else if (key.name === 'e') setLang('en');
  else if (key.name === 'escape') onDone();
});
```

- [ ] **Step 4: Resize behavior verification.**

Run the binary, navigate to a long article, resize the terminal window. Body should re-paginate (page count changes; current page index should clamp if it now exceeds total). If the body doesn't re-paginate on resize, debug: is `useTerminalSize` updating? Does onLayout fire with new rect? Does the diff guard let new values through?

- [ ] **Step 5: Wire into App** — pressing Enter on an article row sets `view: 'view'` with the selected `id`. ArticleView's `onDone` returns to list.

- [ ] **Step 6: Smoke test** — navigate to existing article, page through, toggle locale, resize terminal, Esc back to list.

- [ ] **Step 7: Log gaps + commit (site repo):**

```bash
git add scripts/articles-tui.mjs scripts/articles.mjs
git commit -m "wip: articles-tui article view with paginated body"
```

---

### Task 5: Tags list + Edit article tags

**Files:**
- *site repo:* MODIFY `scripts/articles-tui.mjs`, MODIFY `scripts/articles.mjs` (export tag helpers if needed)

Goal: two read/edit views.

- *Tags list view* (`tagsListView` at articles.mjs:447): static table of all registered tags + usage count. Esc returns to list.

- *Edit article tags* (`editArticleTagsView` at articles.mjs:513): multi-select picker pre-checked with the article's current tags + `+ new tag` option. On submit, rewrite the article's frontmatter `tags:` line. Esc cancels.

- [ ] **Step 1: TagsListView.**

Read all tags via `loadRegisteredTags()`, compute usage count by scanning article frontmatters. Render as a sorted table. No selection or actions — just display + Esc.

- [ ] **Step 2: EditArticleTagsView({ id, onDone }).**

Load article's current tags from frontmatter. Use `<MultiSelect>` with `preSelected` = current tags, `onAddNew` = same kebab-validated add prompt as Task 3.

On submit: rewrite the article's frontmatter `tags:` field (preserve everything else). Reuse the writing logic from articles.mjs if it exposes a helper; if not, parse + serialize the YAML carefully.

- [ ] **Step 3: Wire into App** — `t` from list view → `'tags-list'`. From article view's `edit-tags` action (we'll add that hook in this task) → `'edit-tags'` with the article id.

For now, also add an `edit-tags` key binding in ArticleView (`g` or `m`; check articles.mjs for the existing binding) that resolves `onDone({ action: 'edit-tags' })`. App routes to EditArticleTagsView, then back to ArticleView on completion.

- [ ] **Step 4: Smoke test** — `t` from list → tags listed. Open article → edit-tags binding → multi-select picker → toggle some → submit → verify frontmatter updated on disk.

- [ ] **Step 5: Log gaps + commit (site repo):**

```bash
git add scripts/articles-tui.mjs scripts/articles.mjs
git commit -m "wip: articles-tui tags list + edit article tags"
```

---

### Task 6: Wizard main loop — delete confirm, publish, withdraw, final polish

**Files:**
- *site repo:* MODIFY `scripts/articles-tui.mjs`, MODIFY `package.json` (optional `bin` entry)

Goal: complete the state machine. Add the remaining actions from `listInteractive`:

- `d` from list → DeleteConfirmView (typed-id confirmation, then `rmSync` the folder).
- `p` from list → call `setDraftForFolder(id, false)` + show "publishing..." + brief result.
- `w` from list → call `setDraftForFolder(id, true)` + show "withdrawing..." + brief result.

- [ ] **Step 1: DeleteConfirmView({ id, onDone }).**

Render a danger banner + the article id + a TextInput prompting "Type the article id to confirm". On submit: if typed === id, run `rmSync(join(ARTICLES_DIR, id), { recursive: true, force: true })`; else show "mismatch — aborted". Either way, brief "press any key" before returning.

For "press any key", a small `<PressAnyKey>` helper component using useInput. Log to followups if this pattern recurs — might want it in flowtty.

- [ ] **Step 2: Publish/withdraw inline actions.**

These don't need a full view — just an async function called from App's action handler that calls the existing site helper and stays on list. Optionally flash a 1-line "published: <id>" / "withdrawn: <id>" status above the list for 1 second (or until next key). Skip the flash for first version if it's annoying to implement.

- [ ] **Step 3: Top-level App state machine** — finalize routing:

```js
function App() {
  const [view, setView] = useState({ kind: 'list', cursor: 0 });
  // ... switch on view.kind, render the appropriate component, wire onDone/onAction
}
```

Each view's resolution sets `view` back to `{ kind: 'list', cursor: <preserved-cursor> }`.

- [ ] **Step 4: Optional — add a bin entry to `site/package.json`:**

```json
"bin": {
  "articles-tui": "scripts/articles-tui.mjs"
},
```

Then `npm link` (in site) makes `articles-tui` runnable globally. Skip if too aggressive for now; `node scripts/articles-tui.mjs` is fine.

- [ ] **Step 5: Full smoke test:**

Exercise every action: list nav, create a draft article, view it (page through, toggle locale, resize), edit its tags, publish it, withdraw it, delete it. Verify all side effects on disk match articles.mjs's behavior.

- [ ] **Step 6: Final commit (site repo) + write the followups summary in flowtty:**

```bash
git add scripts/articles-tui.mjs package.json
git commit -m "feat: articles-tui — full flowtty-based wizard (dogfood port)"
```

In `flowtty/docs/plans/_followups.md`, consolidate the gaps logged across tasks into a prioritized list with brief notes.

```bash
cd /Users/mellonis/Developer/mellonis-workspace/flowtty
git add docs/plans/_followups.md
git commit -m "docs: log flowtty followups from articles dogfood"
```

---

## Self-Review

**1. Spec coverage:**
- Setup + npm link → Task 1.
- List view (table, selection, row keys) → Task 2.
- Create wizard (multi-step form, validation, tag picker with add-new, Esc-cancel) → Task 3.
- Article view with paginated body + resize reactivity → Task 4.
- Tags list + edit-article-tags → Task 5.
- Delete-confirm, publish, withdraw, state machine wiring → Task 6.

**2. Placeholder scan:** code snippets are illustrative shape rather than literal copy-paste — each task's implementer will adapt to flowtty's actual API surface and the articles.mjs helpers' actual signatures. Tasks 2-6 explicitly call out reading helper signatures first. No literal "TODO" placeholders.

**3. Cross-repo coordination:** plan is committed in flowtty; implementation lands in site. Each task's commit instructions specify which repo. `_followups.md` is the only flowtty deliverable (no code changes expected unless a true blocker surfaces).

**Risks worth flagging for the implementer:**

1. **npm link symlink fragility:** if site's package.json declares `"flowtty"` as a dependency and `npm install` runs, it'll overwrite the symlink with the registry version (which doesn't exist yet — flowtty isn't published). Either DON'T add flowtty to dependencies (rely on the symlink only) or add `"flowtty": "*"` with a `.npmrc` `package-lock=false` for site. Document whichever choice in Task 1.

2. **React peer deps:** flowtty's package.json may declare React as a peerDependency. `npm link flowtty` doesn't auto-install peers — site needs `react@^19` + `react-reconciler@^0.31` installed directly. Verify in Task 1 by checking `require.resolve('react')` AFTER linking.

3. **`.mjs` + JSX**: `.mjs` files don't support JSX. Plan uses `createElement` throughout — verbose but works. If implementer is tempted to add a JSX loader, ask first; that's tooling drift.

4. **articles.mjs helper exports**: the existing helpers are mostly module-private. Tasks 2-6 instruct the implementer to add `export` keywords as needed. Don't modify their behavior — just expose them. If a function is too tightly coupled to articles.mjs's internal state to extract cleanly, copy it into articles-tui.mjs as a private helper rather than refactoring articles.mjs.

5. **Resize-during-paint race**: Task 4's onLayout-driven pagination triggers a re-render when terminal size changes. If the user resizes mid-render or rapid-fires resizes, React's batching should handle it — but watch for flicker or stale page state. The diff guard in onLayout is essential.

6. **Smoke tests are manual** (interactive TUI). Each task ends with "run the binary and exercise X". If the user wants automated tests, that's a separate plan (would require a test backend that pipes simulated keys + reads buffer snapshots — flowtty's TestBackend already supports this, but writing scenario tests for the wizard is its own effort).

7. **Followups discipline**: it's tempting to pause the dogfood to fix flowtty issues mid-port. Resist unless blocking. Log to `_followups.md`, move on. The dogfood's value is the BREADTH of API exposure, not perfection of any one component.

8. **One-frame placeholder in Task 4**: `useState(null)` for size means first frame shows no body. If that flashes visibly, consider rendering a "Loading…" placeholder or pre-computing an estimated size from `useTerminalSize()` as a first-paint approximation while waiting for onLayout to fire. Defer the fix until you see if it's actually annoying.

9. **Esc + Ctrl-C ambiguity**: TtyBackend default-handles Ctrl-C as exit (M1d). The App's Esc handler in some views should NOT also exit the process — Esc returns to parent view; only the list view's Esc quits the app. Make sure the App's view-stack logic is clear about this.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/articles-dogfood.md`. Subagent-driven execution per your request — each task is substantial (smoke testing, gap logging, cross-repo commits). Sonnet for all six tasks (mechanical execution would miss the discovery work that's the whole point).

Once confirmed, I'll commit the plan on master in flowtty, then dispatch Task 1 (setup + npm link + hello-world). Subsequent tasks dispatched one at a time after smoke verification of the previous.
