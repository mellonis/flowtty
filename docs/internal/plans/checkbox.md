# Checkbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a focusable `<Checkbox>` with a `mixed` state, one marker helper shared with the multi lists, and `checkboxFrame` on `ListMultiSelect` / `Select multiple`.

**Architecture:** `checkboxMarker(state, frame)` is a pure function in `components/checkboxMarker.ts` returning `{ text, color }`; `Checkbox.tsx` is a controlled focusable built like `Button` (`useFocus`, `useInput`, a row box), consuming Space and a click inside its `onLayout` rect; the two lists replace their `'[x] '` / `'[ ] '` string prefixes with the helper's text under a new `checkboxFrame` prop that defaults to `brackets`.

**Tech Stack:** TypeScript ESM, React, Vitest, no new dependencies.

**Spec:** flowtty issue #42 (the whole design, agreed in chat: dash glyph `⊟` for mixed, `▣` the fallback; defaults stay `brackets`; `mixed → true`; Enter does not toggle; "select all" is a docs snippet, not a list feature).

## Global Constraints

- Published surfaces cite `docs/*.md` pages only.
- `.tsx` imports React; exported declarations carry explicit types.
- No behaviour change for the lists with the default `checkboxFrame`.

---

## File Structure

```
packages/react/src/components/checkboxMarker.ts         # CREATE — the helper
packages/react/src/components/checkboxMarker.spec.ts    # CREATE
packages/react/src/components/Checkbox.tsx              # CREATE
packages/react/src/components/Checkbox.spec.tsx         # CREATE
packages/react/src/components/ListMultiSelect.tsx       # MODIFY — checkboxFrame
packages/react/src/components/ListMultiSelect.spec.tsx  # MODIFY — the glyph form
packages/react/src/components/Select.tsx                # MODIFY — checkboxFrame on multiple
packages/react/src/components/Select.spec.tsx           # MODIFY
packages/react/src/index.ts                             # MODIFY — exports
docs/components.md, docs/input.md, CHANGELOG.md         # MODIFY
```

---

### Task 1: the marker helper

- [ ] **RED** `checkboxMarker.spec.ts`:

```ts
test('the marker per state and frame', () => {
  expect(checkboxMarker(false, 'brackets')).toEqual({ text: '[ ]' });
  expect(checkboxMarker(true, 'brackets')).toEqual({ text: '[x]', color: 'green' });
  expect(checkboxMarker('mixed', 'brackets')).toEqual({ text: '[-]' });
  expect(checkboxMarker(false, 'none')).toEqual({ text: '☐' });
  expect(checkboxMarker(true, 'none')).toEqual({ text: '☑', color: 'green' });
  expect(checkboxMarker('mixed', 'none')).toEqual({ text: '⊟' });
});
```

- [ ] **GREEN** `checkboxMarker.ts`:

```ts
export type CheckboxState = boolean | 'mixed';
export type CheckboxFrame = 'brackets' | 'none';
export interface CheckboxMarker { text: string; color?: string }
export function checkboxMarker(state: CheckboxState, frame: CheckboxFrame): CheckboxMarker {
  const glyphs = frame === 'none' ? { off: '☐', on: '☑', mixed: '⊟' } : { off: '[ ]', on: '[x]', mixed: '[-]' };
  if (state === 'mixed') return { text: glyphs.mixed };
  return state ? { text: glyphs.on, color: 'green' } : { text: glyphs.off };
}
```

---

### Task 2: `<Checkbox>`

**Interface:** `CheckboxProps { checked: CheckboxState; onChange: (next: boolean) => void; label?: string; frame?: CheckboxFrame; isFocused?: boolean }`.

- [ ] **RED** `Checkbox.spec.tsx` (fixtures in a `FocusGroup` inside a column box; a `Probe` reading `lastBuffer` styles):
  1. renders `[ ] label`, `[x] label` (marker green), `[-] label`; `frame="none"` renders `☐ label` / `☑ label` / `⊟ label`;
  2. focused: marker bold + cyan, label bold; unfocused (after Tab to a TextInput): marker dim, nothing bold;
  3. Space calls `onChange(true)` from false and `onChange(false)` from true, and is consumed; from `'mixed'` it calls `onChange(true)`;
  4. Enter does not call `onChange` and is not consumed; Tab is not consumed;
  5. a press inside the checkbox toggles even when a `TextInput` beside it has focus;
  6. `isFocused={false}` overrides the group: Space does nothing.

- [ ] **GREEN** `Checkbox.tsx` (after `Button`'s shape): `useFocus`, `rectRef` from `onLayout`, `useInput` returning `true` for Space (when focused) and for a `mousedown` inside the rect; the row: `<Text color={focused ? 'cyan' : marker.color} bold={focused} dim={!focused && marker.color === undefined}>{marker.text}</Text>` + `<Text bold={focused}>{' ' + label}</Text>` when a label is given. The green of a checked marker wins over `dim`; focus turns it cyan.

---

### Task 3: `checkboxFrame` on the lists

- [ ] **RED** `ListMultiSelect.spec.tsx`: with `checkboxFrame="none"` the rows read `☑ Team` / `☐ Hobby`; `Select.spec.tsx` (multiple): the popup rows read `☑ Team` with `checkboxFrame="none"`.
- [ ] **GREEN**: `ListMultiSelectProps.checkboxFrame?: CheckboxFrame` (default `brackets`); the row label becomes `${checkboxMarker(on, frame).text} ${label}`. `SelectMultipleProps.checkboxFrame?: CheckboxFrame`, passed to the popup, same substitution. The marker's green is not applied inside the lists (their rows already carry the cursor color); only the text is used.
- [ ] `index.ts`: export `Checkbox`, `CheckboxProps`, `CheckboxState`, `CheckboxFrame`, `checkboxMarker`.

---

### Task 4: docs and changelog

- [ ] `docs/components.md`: index entry; a row in the Choosing table ("`Checkbox` — one yes / no, or *select all* over a list"); a `## Checkbox` section after `## Menu` with the props, keys, the frames table and the select-all snippet:

```tsx
const all = picked.length === 0 ? false : picked.length === tags.length ? true : 'mixed';
<Checkbox label="select all" checked={all} onChange={(on) => setPicked(on ? tags.map((t) => t.value) : [])} />
<ListMultiSelect items={tags} value={picked} onChange={setPicked} onSubmit={next} />
```

  a sentence on `checkboxFrame` in `## Select` (multiple) and `## ListMultiSelect`.
- [ ] `docs/input.md`: add `Checkbox` to the focusable list sentence.
- [ ] `CHANGELOG.md`: `## Unreleased` / `### Added`.
- [ ] `npm test && npm run typecheck`.
