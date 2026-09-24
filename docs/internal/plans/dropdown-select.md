# Dropdown Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a real dropdown `Select` — a one-line field showing the current value and `▾` that opens a popup anchored under (or above) it, filtered by typing, single or `multiple` — with the inline lists renamed `ListSelect` / `ListMultiSelect`, no aliases, and one documented vocabulary across the choosing components.

**Architecture:** the popup is a floating dialog: `Select` calls `useDialogHost().openDialog(<SelectPopup>, { floating: true, anchor, height, minWidth })`, so `DialogHost` mutes everything under it — focus is locked the way the owner wants — and closes it with `done` / `cancel`. `DialogHost` learns one thing: an `anchor` rect (frame cells, from the field's `onLayout`) places the wrapper under the anchor, or above it when the wanted `height` does not fit below, instead of centring it. The popup's list logic is the existing `selectReducer` (filter, cursor, submit, cancel) plus a toggle for `multiple`; rows beyond `maxRows` scroll by slicing around the cursor. The field itself is a focusable (`useFocus`) that opens on Enter / Space / ↓ / a click inside its rect, and returns `true` for the keys it takes.

**Tech Stack:** TypeScript ESM, React, Vitest, no new dependencies.

**Spec:** flowtty issue #41, with the decisions taken in chat: `Select` is the dropdown, `ListSelect` / `ListMultiSelect` the inline lists, no deprecated aliases (a `### Changed` entry); the popup rides `DialogHost` (option B) and without one the field warns once and cannot open; the field's look is `frame="field" | "none" | "border"` — `field` (the default) is the same filled band `TextInput` draws, so a form's fields look alike; `none` is bare text for a filter bar; brackets are `Button`'s convention and are not offered; filtering is on by default (`filter={false}` turns it off); focus and open states follow the existing rules (bold + cyan accent when focused, inverse when open).

## Global Constraints

- Published surfaces cite `docs/*.md` pages only — never this note, never issue numbers.
- `.tsx` files import React; exported functions and consts carry explicit types (oxc dts).
- Every hook is called before any early `return null`.
- No behaviour change for `ListSelect` / `ListMultiSelect` beyond the name: their specs move with them and pass unchanged.
- `DialogHost` changes are additive: a dialog without `anchor` renders exactly as today.

---

## File Structure

```
packages/react/src/components/ListSelect.tsx            # RENAME from Select.tsx (component + props renamed)
packages/react/src/components/ListSelect.spec.tsx       # RENAME from Select.spec.tsx
packages/react/src/components/ListMultiSelect.tsx       # RENAME from MultiSelect.tsx
packages/react/src/components/ListMultiSelect.spec.tsx  # RENAME from MultiSelect.spec.tsx
packages/react/src/components/Select.tsx                # CREATE — the dropdown field + popup
packages/react/src/components/Select.spec.tsx           # CREATE
packages/react/src/context/dialogContext.ts             # MODIFY — OpenDialogOptions.anchor / height
packages/react/src/components/DialogHost.tsx            # MODIFY — anchored placement
packages/react/src/components/DialogHost.spec.tsx       # MODIFY — anchored placement tests
packages/react/src/index.ts                             # MODIFY — exports
packages/examples/showcase/scenes/FormScene.tsx         # MODIFY — renames + a dropdown
packages/examples/articles-tui/{LangDialog,TagsDialog,EditArticleTagsView}.tsx  # MODIFY — renames
docs/components.md                                      # MODIFY — Choosing overview, Select, ListSelect, ListMultiSelect, Menu
docs/app.md                                             # MODIFY — openDialog anchor
docs/input.md                                           # MODIFY — the focus mention of the lists
docs/internal/plans/_followups.md                       # MODIFY — TextInput frame, focus by click
CHANGELOG.md                                            # MODIFY — Added / Changed
```

---

### Task 1: rename the inline lists

**Files:** the four renames above, `packages/react/src/index.ts`, the four example files, `docs/input.md` (mentions), `docs/components.md` (section titles only — the rewrite is Task 5).

- [ ] **Step 1:** `git mv` the four files. In `ListSelect.tsx`: `Select` → `ListSelect`, `SelectProps` → `ListSelectProps` (keep `SelectItem` re-export). In `ListMultiSelect.tsx`: `MultiSelect` → `ListMultiSelect`, `MultiSelectProps` → `ListMultiSelectProps`. Update the doc comment's cross-references ("see MultiSelect" → "see ListMultiSelect"). In the two specs, the imports and the `describe` names.
- [ ] **Step 2:** `index.ts`: replace the two export pairs with `ListSelect` / `ListSelectProps` and `ListMultiSelect` / `ListMultiSelectProps`; `SelectItem` keeps coming from `./components/ListSelect.js`.
- [ ] **Step 3:** examples: `LangDialog.tsx` `Select` → `ListSelect`; `TagsDialog.tsx`, `EditArticleTagsView.tsx`, `FormScene.tsx` `MultiSelect` → `ListMultiSelect`, `Select` → `ListSelect`.
- [ ] **Step 4:** `docs/input.md`: "TextInput / Select / MultiSelect also plug into the focus system" → "TextInput / ListSelect / ListMultiSelect / Select …". `docs/components.md`: rename the two headings and index entries (`## ListSelect`, `## ListMultiSelect`) and the code samples' tag names, leaving the prose for Task 5.
- [ ] **Step 5:** `npm test && npm run typecheck` — expected: PASS (the renamed specs pass unchanged; `grep -rn "MultiSelect\b\|<Select\b" packages docs --include='*.ts*' --include='*.md'` shows only the new names and Task-2-onward files).

---

### Task 2: `DialogHost` anchored placement

**Files:**
- Modify: `packages/react/src/context/dialogContext.ts` (`OpenDialogOptions`)
- Modify: `packages/react/src/components/DialogHost.tsx`
- Test: `packages/react/src/components/DialogHost.spec.tsx`

**Interfaces:**
- Produces: `OpenDialogOptions.anchor?: { left: number; top: number; width: number; height: number }` (frame cells) and `OpenDialogOptions.height?: number` (rows the wrapper wants, border included). With `anchor`, the wrapper is placed at `left: anchor.left` (shifted left so it stays inside the host's width) and `top: anchor.top + anchor.height` when `height` rows fit below, else `top: anchor.top - height` when they fit above, else below, clipped by `maxHeight`; `minWidth` defaults to `anchor.width`, `maxWidth` to the room right of `anchor.left`; `justifyContent` / `alignItems` centring is off.

- [ ] **Step 1: Failing tests** (`DialogHost.spec.tsx`, using its existing helpers; read the file first for the `mount`/`open` pattern and copy it):

```tsx
test('an anchored floating dialog sits under the anchor, flush with its left edge', async () => {
  // 20x8 screen; anchor at row 1, cols 2..9; a 3-row (bordered) popup fits below
  … open(<Text>opt</Text>, { floating: true, anchor: { left: 2, top: 1, width: 8, height: 1 }, height: 3 })
  expect(rowsOf(frame).slice(2, 5)).toEqual([
    '  ┌──────┐          ',
    '  │opt   │          ',
    '  └──────┘          ',
  ]);
});

test('an anchored dialog flips above the anchor when there is no room below', async () => {
  // anchor on the last row: the popup's 3 rows go above it
  …
});

test('an anchored dialog is shifted left to stay inside the screen', async () => {
  // anchor at left 15, width 8, on a 20-col screen: the 8-wide popup starts at col 12
  …
});
```

Write the expected frames exactly from the geometry; the `Text` inside has `width` from `minWidth` = anchor width (8) → 6 inner cells.

- [ ] **Step 2: Run** — expected: FAIL (the dialog is centred).

- [ ] **Step 3: Implement** — in `dialogContext.ts`, add to `OpenDialogOptions`:

```ts
  /** Pin a floating dialog to a rect (frame cells — an `onLayout` rect): under
   *  it, flush with its left edge, or above it when `height` rows do not fit
   *  below; shifted left to stay on screen. `minWidth` defaults to the rect's
   *  width. The rest of the screen is still the host's — a popup for a field.
   *  See docs/app.md (DialogHost). */
  anchor?: { left: number; top: number; width: number; height: number };
  /** With `anchor`: the rows the dialog wants, border included, which decides
   *  below or above. Default 3. */
  height?: number;
```

In `DialogHost.tsx`, the overlay reads its own rect through `onLayout` (`const [host, setHost] = useState<Rect | null>(null)` on the outermost host box — diff before set) and, for an anchored entry, computes:

```ts
const placeAnchored = (a: NonNullable<OpenDialogOptions['anchor']>, wanted: number, host: { width: number; height: number }) => {
  const below = host.height - (a.top + a.height);
  const above = a.top;
  const top = wanted <= below || below >= above ? a.top + a.height : Math.max(0, a.top - wanted);
  const maxHeight = top === a.top + a.height ? below : above;
  const left = Math.max(0, Math.min(a.left, host.width - a.width));
  return { top, left, maxHeight, maxWidth: host.width - left };
};
```

and renders the overlay box without `justifyContent`/`alignItems`, with the wrapper `position="absolute" top left` and `minWidth = o.minWidth ?? a.width`, `maxWidth = o.maxWidth ?? maxWidth`, `maxHeight = o.maxHeight ?? maxHeight`. The overlay box needs the host's size: `useTerminalSize()` is the fallback until the first `onLayout`.

- [ ] **Step 4: Run** — `npx vitest run packages/react/src/components/DialogHost.spec.tsx` — expected: PASS, older dialog tests untouched.

---

### Task 3: the `Select` field and its popup

**Files:**
- Create: `packages/react/src/components/Select.tsx`, `packages/react/src/components/Select.spec.tsx`
- Modify: `packages/react/src/index.ts`

**Interfaces:**

```ts
export interface SelectBaseProps<T> extends Pick<BoxProps, 'width' | 'minWidth' | 'maxWidth' | 'flexGrow' | 'flexShrink'> {
  items: SelectItem<T>[];
  /** Shown when nothing is chosen. Default '—'. */
  placeholder?: string;
  /** The field's chrome: the filled band `TextInput` draws (`field`), bare
   *  `value ▾` (`none`, for a filter bar), or a bordered box. Default 'field'. */
  frame?: 'field' | 'none' | 'border';
  /** Typing in the open popup narrows the list. Default true. */
  filter?: boolean;
  /** Rows the popup shows at most before scrolling. Default 8. */
  maxRows?: number;
  isFocused?: boolean;
}
export interface SelectSingleProps<T> extends SelectBaseProps<T> {
  multiple?: false;
  value: T | undefined;
  onChange: (value: T) => void;
}
export interface SelectMultipleProps<T> extends SelectBaseProps<T> {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
  onAddNew?: () => void | T | null | Promise<T | null | void>;
}
export type SelectProps<T> = SelectSingleProps<T> | SelectMultipleProps<T>;
export function Select<T>(props: SelectProps<T>): ReactNode;
```

- [ ] **Step 1: Failing tests** — `Select.spec.tsx`, every fixture under `<DialogHost>` and inside a `FocusGroup` where focus matters; `mount` as in `ScrollList.spec.tsx`:

  1. closed field renders `Team` + `▾` on a band of `FIELD_BG` padded to `width` (assert the bg on `lastBuffer`), placeholder when `value` is undefined, `frame="none"` renders `Team ▾` with no bg, `frame="border"` a 3-row box;
  2. focused field is bold with a cyan arrow; unfocused is not (assert on `lastBuffer` styles);
  3. Enter opens the popup under the field with every label, cursor on the current value; Escape closes without `onChange`; the arrow reads `▴` while open;
  4. ↓ ↓ Enter calls `onChange` with the third value and closes;
  5. typing `ru` shows only matching labels and the filter row; Backspace widens; `filter={false}` ignores letters;
  6. `multiple`: Space toggles and calls `onChange` with the array in item order; the field shows `a, b`, or `N selected` when the labels do not fit; Enter closes;
  7. `onAddNew` row present with `multiple`; Enter on it calls it and selects the new value once it appears in `items`;
  8. no room below: the popup opens above the field (a field on the last row);
  9. more than `maxRows` items: the popup shows `maxRows` rows and scrolls to keep the cursor visible;
  10. mouse: a press inside the field opens; a press on a row picks it (`multiple`: toggles); a press outside the popup closes;
  11. keys taken by the closed focused field are consumed (`backend.press({ name: 'return' })` returns `true`); Tab is not;
  12. without a `DialogHost`: Enter warns once (`vi.spyOn(console, 'warn')`) and opens nothing;
  13. a `<Select>` inside a `FocusGroup` next to a `<TextInput>`: Tab moves between them; after the popup closes the field is still the focused one.

- [ ] **Step 2: Run** — expected: FAIL, `Select` not exported.

- [ ] **Step 3: Implement** `Select.tsx`:

  - The field: `useFocus()`; `onLayout` keeps its rect in a ref; a `[open, setOpen]` state. Value text: single → the label of `value` or `placeholder`; multiple → labels joined by `, `, replaced by `${n} selected` when longer than the inner width (`width` minus the chrome; with no `width` never replaced). Chrome by `frame`: field → a row box with `backgroundColor={FIELD_BG}` (import the constant from where `TextInput` keeps it — move it to a shared module if it is file-local) holding `<Text color={FIELD_FG} bold={focused} wrap="truncate" flexGrow={1}>{text}</Text><Text color={focused ? 'cyan' : FIELD_FG} bold={focused} dim={!focused}>{open ? ' ▴' : ' ▾'}</Text>`, with `width` and `overflow="hidden"`; none → the same texts with no background; border → the same row inside a `Box border={DEFAULT_BORDER_STYLE}`. The whole field `inverse` while open.
  - Opening: `const host = useContext(DialogHostContext)`; if `host === noop` (compare against a `hasDialogHost` boolean provided by a new `DialogHostPresentContext` — add it to `dialogContext.ts`, `false` by default, `true` inside `DialogHost`), warn once (`console.warn('flowtty: <Select> needs a <DialogHost> above it to open its popup.')`, module-level flag) and return. Else `setOpen(true)` and `await host.openDialog(<SelectPopup … />, { floating: true, anchor: rect, height: min(rows, maxRows) + (filter row ? 1 : 0) + 2, backdrop: false })`; when it resolves, `setOpen(false)`.
  - The field's `useInput` (`isActive: isFocused && !open`): `return` / `' '` / `down` open and return `true`; `mousedown` inside the rect opens and returns `true`. Everything else falls through.
  - `SelectPopup` (internal component, receives `items`, `multiple`, `value` snapshot getter via ref, `onChange`, `filter`, `maxRows`, `onAddNew`, the anchor rect): `useDialog()` for `done` / `cancel`; state `{ cursor, filter }` initialised on the current value (single) or 0; `useInput`: `reduce(items, state, key)` when `filter` is on, else the same with printable keys ignored; single: `submit` → `onChange(items[index].value)`, `done()`; multiple: `' '` toggles (in item order, as `ListMultiSelect`), `return` → `done()`; `escape` → `cancel()`; `mousedown` inside its own rect on row `y` → that row (pick / toggle), outside → `cancel()`; `wheelup` / `wheeldown` move the cursor. Every handled key returns `true`. Rendering: optional filter row (`filter: ru`, dim), then the visible rows windowed to `maxRows` around the cursor: `▸ ` marker bold cyan on the cursor row, `[x] ` / `[ ] ` prefixes with `multiple`, `+ add new` last with `onAddNew`. The popup box is `selectable={false}` (chrome, like `Menu`).
  - `index.ts`: `export { Select } from './components/Select.js'; export type { SelectProps, SelectSingleProps, SelectMultipleProps } from './components/Select.js';`.

- [ ] **Step 4: Run** — `npx vitest run packages/react/src/components/Select.spec.tsx`, then `npm test && npm run typecheck` — expected: PASS.

---

### Task 4: the showcase

**Files:** `packages/examples/showcase/scenes/FormScene.tsx` (+ wherever the showcase mounts a `DialogHost` — check `showcase/index.tsx`).

- [ ] Add a `Select` (single, `width={24}`) and a `Select multiple` to the form scene under the renamed lists, so `npm run showcase` shows the popup opening under the field. Run `npx tsc --noEmit -p packages/examples` (the flat tsconfig) — expected: clean.

---

### Task 5: docs, follow-ups, changelog

- [ ] **`docs/components.md`**: index gets `Choosing`, `Select`, `ListSelect`, `ListMultiSelect`, `Menu`. A new section **Choosing** before them: a table — `Select` (a field among others: one line, opens a popup; single or `multiple`), `ListSelect` (every option on screen, one picked: a full-screen picker, a dialog body), `ListMultiSelect` (the same, any number, `onAddNew`), `Menu` (commands, not values: a bar with cascading panels) — and the shared vocabulary: `items: SelectItem<T>[]` (`label`, `value`), controlled `value` / `onChange`, `onSubmit` on Enter (the lists; the dropdown closes instead), `onCancel` on Escape, `onAddNew` on the multi variants, typing filters (`Select`, `ListSelect`), `isFocused` overrides the `FocusGroup`. Then **Select**: the field, `frame`, `placeholder`, `multiple`, `filter`, `maxRows`, keys, mouse, the `DialogHost` requirement and the one-shot warning, the `N selected` rule. **ListSelect** / **ListMultiSelect**: today's prose under the new names. **Menu**: a short section (bar, F10, panels, `onExit`), since it had none.
- [ ] **`docs/app.md`** (DialogHost): a paragraph on `anchor` / `height` with the placement rule.
- [ ] **`_followups.md`**: `TextInput` `frame` to match `Select`; focus by mouse click needs `FocusGroup.focus(id)`; `Button` does not react to clicks.
- [ ] **`CHANGELOG.md`** Unreleased: `### Added` — `Select` dropdown (single / `multiple`, `frame`, filter, anchored popup via `DialogHost`), `openDialog` `anchor`; `### Changed` — `Select` and `MultiSelect` renamed `ListSelect` / `ListMultiSelect`, no aliases: `Select` is now the dropdown.
- [ ] `npm test && npm run typecheck`.

---

## Self-review

- Issue coverage: the dropdown (T3), anchored below/above and clipped (T2, T3 tests 8–9), filtering (T3), single and multiple (T3), controlled, focusable, mouse-aware (T3), renames without aliases (T1), the review and docs (T5), the showcase (T4).
- Out: a `<Select>` without `DialogHost` opening inline; focus by click for other fields; `TextInput` frame.
- Names: `Select` / `ListSelect` / `ListMultiSelect`, `frame` (`field` | `none` | `border`), `filter`, `maxRows`, `anchor`, `height`, `DialogHostPresentContext` — consistent.
