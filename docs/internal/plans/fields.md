# Fields: consumed keys, focus by click, TextInput frame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the built-in components consume the keys they act on (#46); every field takes focus on a click, and `Button` fires on one (#45); `TextInput` gets the `frame` prop `Select` has (#44). One branch, one commit per issue, one alpha.

**Architecture:** (#46) each component's `useInput` handler returns `true` when it acted — the reducers already say so: `editorReducer` / `selectReducer` / `multiSelectReducer` return `noop` for a key they ignore, so "acted" is `action.kind !== 'noop'`; the hand-written handlers (`Button`, `FocusGroup`, `ScrollBox`, `Menu`) return `true` on the branches that do something. (#45) `FocusGroupApi.focus(id)` sets the focused id; `useFocus()` returns `focus()` bound to the caller; a shared hook `useClick(rectRef, onClick)` does the rect test on `mousedown` and consumes the press; every focusable calls `focus()` from it, `Button` also presses. (#44) `TextInput` wraps its band the way `Select` does: `none` in a row of its own with no background, `border` inside a bordered box, the error line below either.

**Tech Stack:** TypeScript ESM, React, Vitest.

**Spec:** flowtty issues #46, #45, #44 (bodies are the spec; decisions in chat: all three in one alpha, in that order).

## Global Constraints

- Published surfaces cite `docs/*.md` pages only. `.tsx` imports React; explicit return types on exports.
- A handler that did nothing returns nothing: a key a component ignores still falls through.
- No default change in looks (#44's `field` stays the default).

---

## File Structure

```
packages/react/src/hooks/useClick.ts (+spec)              # CREATE — rect test on mousedown, consumed
packages/react/src/context/focusContext.ts                # MODIFY — FocusGroupApi.focus
packages/react/src/components/FocusGroup.tsx (+spec)      # MODIFY — focus(id); Tab consumed
packages/react/src/hooks/useFocus.ts (+spec)              # MODIFY — returns focus()
packages/react/src/components/{TextInput,TextArea,ListSelect,ListMultiSelect,Select,Checkbox,Button,ScrollBox,Menu}.tsx (+specs)
docs/input.md, docs/components.md, CHANGELOG.md
```

---

### Task 1 (#46): the components consume the keys they act on

- [ ] **RED** — a new spec `packages/react/src/components/consumed.spec.tsx` with a `mount` helper (FocusGroup + column) and `press()` return values:
  1. `TextInput` focused: `a`, `backspace`, `left`, `home` → `true`; `tab`, `escape` (no `onCancel`), `return` (no `onSubmit`) → `false`; with `onSubmit` `return` → `true`; with `onCancel` `escape` → `true`.
  2. An app-level `useInput` binding `q` does not fire while a focused `TextInput` is typed into; it does once focus is on a `Button`.
  3. `TextArea` focused: printable and `return` (multiline insert) → `true`; `tab` → `false`.
  4. `ListSelect` focused: `down`, `return`, a printable (filter) → `true`; `tab` → `false`. `ListMultiSelect`: `down`, `j`, `' '`, `return` → `true`.
  5. `Button` focused: `return` → `true`; its `shortcut` from anywhere → `true`; `x` → `false`.
  6. `FocusGroup`: `tab` with two fields → `true`; with none → `false`.
  7. `ScrollBox` with overflowing content: `pagedown` → `true`; `wheeldown` inside → `true`, outside → `false`.
  8. `Menu` engaged: `right` → `true`; disengaged: `right` → `false`, `f10` → `true`.
- [ ] **GREEN** — `TextInput` / `TextArea`: `return action.kind !== 'noop'` after handling (`TextArea` also returns `true` when its `onKey` consumed); `submit` with no `onSubmit` and `cancel` with no `onCancel` return nothing (the reducers still report them — check `onSubmit` / `onCancel` presence). `ListSelect` / `ListMultiSelect`: same on their reducers (`ListMultiSelect`'s add-row Enter returns `true`). `Button`: `true` on both branches. `FocusGroup`: `true` after moving. `ScrollBox`: `true` where `goTo` is called. `Menu`: `true` for `f10`; when disengaged only `escape` with `onExit`; engaged: the branches that do something.
- [ ] `npm test`; commit `feat(react): the built-in components consume the keys they act on`.

### Task 2 (#45): focus by click

- [ ] **RED** — `useClick.spec.tsx`: a component using `useClick(rectRef, fn)` with an `onLayout` rect: a press inside calls `fn` and `press()` returns `true`; outside: not called, `false`. `FocusGroup.spec.tsx`: `focus(id)` moves focus (through a component calling `useFocus().focus()`); an unknown id is ignored. `consumed.spec.tsx` (or a new `clickFocus.spec.tsx`): two `TextInput`s — a click on the second focuses it and Tab continues from it; a click on a `Button` presses it and focuses it; a click on a `Checkbox` toggles and focuses; a click on a `Select` field opens it and focuses; a click on a `ListSelect` row focuses the list (rows are not picked by click — out of scope); a click outside every field changes nothing.
- [ ] **GREEN** — `focusContext.ts`: `focus(id: string): void` on the api (noop outside a group). `FocusGroup`: `focus = useCallback((id) => { if (idsRef.current.includes(id)) setFocusedId(id); }, [])`. `useFocus()` returns `{ isFocused, focus }` with `focus = () => group.focus(id)`. `hooks/useClick.ts`:

```ts
export function useClick(rectRef: RefObject<Rect | null>, onClick: (key: Key) => void): void {
  useInput((key) => {
    if (key.name !== 'mousedown') return;
    const r = rectRef.current;
    if (r === null || key.x === undefined || key.y === undefined) return;
    if (key.x < r.left || key.x >= r.left + r.width || key.y < r.top || key.y >= r.top + r.height) return;
    onClick(key);
    return true;
  });
}
```

  Every focusable keeps a rect from `onLayout` (TextInput's band box, TextArea's outer box, the lists' outer box, Button's row, Checkbox and Select already have one) and calls `useClick(rectRef, () => { focus(); … })`; `Button` also `onPress()`; `Select` and `Checkbox` replace their inline rect test with the hook (and call `focus()` too).
- [ ] `npm test`; commit `feat(react): a click focuses a field; Button presses on a click`.

### Task 3 (#44): `TextInput frame`

- [ ] **RED** — `TextInput.spec.tsx`: `frame="none"` renders the value with no background, sized to its text (a second field on the same row starts right after it); `frame="border"` is three rows with the value on the middle one and the error line below the box; the default is unchanged (the band, stretched).
- [ ] **GREEN** — `TextInputProps.frame?: 'field' | 'none' | 'border'`; the band box gets `backgroundColor={frame === 'field' ? FIELD_BG : undefined}` and, for `none`, is wrapped in a `flexDirection="row"` box; for `border`, in `<Box border={DEFAULT_BORDER_STYLE} flexDirection="column">`; `onLayout` (width and the click rect) stays on the band box. Text color: `FIELD_FG` only on the band.
- [ ] Docs: `docs/components.md` (TextInput: `frame`; Choosing: the three looks are shared by TextInput and Select), `docs/input.md` (Focus + Button: a click focuses, `useFocus().focus()`, `useClick`; the mouse section: presses are consumed by the field they land in). `CHANGELOG.md` `## Unreleased`: Added (focus by click, `useClick`, `TextInput frame`), Changed (components consume their keys — a root handler no longer sees them).
- [ ] `npm test && npm run typecheck`; commit `feat(react): TextInput frame — field, none, border`.
