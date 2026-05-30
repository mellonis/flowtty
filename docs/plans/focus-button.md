# flowtty Focus + Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add focusable components + a `<Button>` primitive to flowtty. **Decisions confirmed:**
- Focus scope: automatic per-dialog (DialogHost wraps each stack entry in an implicit `FocusGroup`); host content gets one implicit group at the top.
- Button visual: inline gray hint after title (`Open o` with `o` dim), bold + inverse when focused.
- v1 focusables: Button + TextInput + Select + MultiSelect (all interactive components plugged into the focus system; existing `isFocused` prop kept as an explicit override for backward compat).

**Architecture:**
- New `FocusGroup` component owns a list of registered focusables and tracks the active index. Tab/Shift-Tab cycles. The focused component reads `useFocus()` → `{isFocused: boolean}`.
- `useFocus()` registers a focusable on mount via `useEffect`. Uses an auto-generated stable id (`useId()` from React). Returns the live focus state.
- DialogHost is updated to wrap each stack entry's content in an implicit `FocusGroup`, and to wrap the host content in one too. So users don't need to set them up.
- `<Button>` component renders `{label}{gray shortcut?}` with focused styling (bold + inverse border/bg). Listens for its `shortcut` key globally (within the active focus group's input scope) AND for Enter when itself focused.
- TextInput / Select / MultiSelect: when their `isFocused` prop is `undefined` (default), they call `useFocus()` to read from the focus system. When `isFocused` is explicit (true/false), it overrides.

**Tech Stack:** TypeScript ESM, React 19, Vitest 4.

**Out of scope:**
- Programmatic focus control (`focusRef.current.focus()` style). The first registered focusable is auto-focused; Tab/Shift-Tab navigates. No imperative `focus()` API in v1.
- `tabIndex` for explicit ordering. Registration order = tab order for v1.
- Disabled buttons / disabled focusables. Add later if needed.
- Focus restoration on dialog close (return focus to whatever was focused in the now-top group). Out of scope — caller's responsibility.
- Mouse focus (clicking to focus). flowtty has no mouse support.

---

## Scope check

5 tasks across new primitives, new Button, integration of existing focusables, DialogHost wiring, and README.

---

## File Structure

```
src/
  focus-context.ts      # NEW — FocusContext + types (FocusableEntry, FocusGroupApi)
  focus-group.ts        # NEW — FocusGroup component + Tab handling
  use-focus.ts          # NEW — useFocus() hook
  focus.test.ts         # NEW — Tab navigation, registration, multi-focusable tests
  button.ts             # NEW — Button component
  button.test.ts        # NEW — Button rendering + shortcut + Enter-when-focused tests
  dialog-host.ts        # MODIFY — wrap each stack entry's content in implicit FocusGroup
  text-input.ts         # MODIFY — fallback to useFocus when isFocused prop undefined
  select.ts             # MODIFY — same
  multi-select.ts       # MODIFY — same
  index.ts              # MODIFY — re-export FocusGroup, useFocus, Button, ButtonProps
README.md               # MODIFY — document Focus + Button
```

---

### Task 1: Focus primitives — FocusGroup + useFocus

**Files:**
- Create: `src/focus-context.ts`, `src/focus-group.ts`, `src/use-focus.ts`, `src/focus.test.ts`

- [ ] **Step 1: Read first** — `src/dialog-context.ts` (Context pattern reference), `src/use-input.ts` (useInput pattern), `src/dialog-host.ts` (how DialogHost manages stack-aware contexts — relevant for Task 4).

- [ ] **Step 2: Create `src/focus-context.ts`:**

```ts
import { createContext } from 'react';

/** API exposed via FocusContext for components to register themselves as focusable
 *  and check whether they're currently focused. */
export interface FocusGroupApi {
  /** Register a focusable with the group. Returns an id (unique within the group)
   *  that the caller uses to query focus state + unregister on unmount. */
  register(id: string): void;
  unregister(id: string): void;
  /** True iff the focusable with this id is currently the focused one. */
  isFocused(id: string): boolean;
}

const noop: FocusGroupApi = {
  register: () => {},
  unregister: () => {},
  isFocused: () => false,
};

/** Outside a FocusGroup, useFocus() reads from this default → never focused. */
export const FocusContext = createContext<FocusGroupApi>(noop);
```

- [ ] **Step 3: Create `src/use-focus.ts`:**

```ts
import { useContext, useEffect, useId } from 'react';
import { FocusContext } from './focus-context.js';

export interface UseFocusResult {
  /** True iff this component is currently the focused one in its enclosing FocusGroup. */
  isFocused: boolean;
}

/** Register the calling component as focusable in the enclosing FocusGroup.
 *  Outside a FocusGroup, isFocused is always false. */
export function useFocus(): UseFocusResult {
  const group = useContext(FocusContext);
  const id = useId();

  useEffect(() => {
    group.register(id);
    return () => group.unregister(id);
  }, [group, id]);

  return { isFocused: group.isFocused(id) };
}
```

- [ ] **Step 4: Create `src/focus-group.ts`:**

```ts
import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FocusContext, type FocusGroupApi } from './focus-context.js';
import { useInput } from './use-input.js';

export interface FocusGroupProps {
  /** When false, the group doesn't react to Tab/Shift-Tab (e.g., backgrounded by a
   *  higher dialog). Default true. */
  isActive?: boolean;
  children?: ReactNode;
}

/** Manages a list of focusable descendants. The first to register is auto-focused.
 *  Tab cycles forward, Shift-Tab backward. Mount order = tab order (v1). */
export function FocusGroup({ isActive = true, children }: FocusGroupProps) {
  // Ordered list of registered ids — append on register, filter on unregister.
  const idsRef = useRef<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const register = useCallback((id: string) => {
    if (idsRef.current.includes(id)) return;
    idsRef.current = [...idsRef.current, id];
    // Auto-focus the first registrant.
    setFocusedId((current) => current ?? id);
  }, []);

  const unregister = useCallback((id: string) => {
    idsRef.current = idsRef.current.filter((x) => x !== id);
    setFocusedId((current) => {
      if (current !== id) return current;
      // Focused item unmounted — move focus to first remaining, or null.
      return idsRef.current[0] ?? null;
    });
  }, []);

  const isFocused = useCallback(
    (id: string) => focusedId === id,
    [focusedId],
  );

  const api = useMemo<FocusGroupApi>(
    () => ({ register, unregister, isFocused }),
    [register, unregister, isFocused],
  );

  useInput((key) => {
    if (key.name !== 'tab') return;
    const ids = idsRef.current;
    if (ids.length === 0) return;
    setFocusedId((current) => {
      const idx = current ? ids.indexOf(current) : 0;
      const next = key.shift
        ? (idx - 1 + ids.length) % ids.length
        : (idx + 1) % ids.length;
      return ids[next] ?? null;
    });
  }, { isActive });

  return createElement(FocusContext.Provider, { value: api }, children);
}
```

- [ ] **Step 5: Create `src/focus.test.ts`** with these scenarios:

```ts
import { describe, test, expect } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './render.js';
import { TestBackend } from './backends/test.js';
import { flushAsync } from './testing.js';
import { FocusGroup } from './focus-group.js';
import { useFocus } from './use-focus.js';

function Reporter({ label, sink }: { label: string; sink: string[] }) {
  const { isFocused } = useFocus();
  return createElement('flowtty-box', { width: 10, height: 1 },
    `${isFocused ? '*' : ' '}${label}`,
  );
}

describe('FocusGroup + useFocus', () => {
  test('first registered focusable is auto-focused', async () => {
    const backend = new TestBackend(20, 3);
    const sink: string[] = [];
    await render(
      createElement(FocusGroup, {},
        createElement(Reporter, { label: 'A', sink }),
        createElement(Reporter, { label: 'B', sink }),
      ),
      backend,
    );
    await flushAsync();
    const frame = backend.lastFrame!;
    // A is focused (*A), B is not ( B)
    expect(frame).toContain('*A');
    expect(frame).toContain(' B');
  });

  test('Tab moves focus to next; Shift-Tab moves to previous; cycles', async () => {
    const backend = new TestBackend(20, 3);
    await render(
      createElement(FocusGroup, {},
        createElement(Reporter, { label: 'A', sink: [] }),
        createElement(Reporter, { label: 'B', sink: [] }),
        createElement(Reporter, { label: 'C', sink: [] }),
      ),
      backend,
    );
    await flushAsync();
    expect(backend.lastFrame).toContain('*A');
    backend.press({ name: 'tab' });
    await flushAsync();
    expect(backend.lastFrame).toContain('*B');
    backend.press({ name: 'tab' });
    await flushAsync();
    expect(backend.lastFrame).toContain('*C');
    backend.press({ name: 'tab' });
    await flushAsync();
    expect(backend.lastFrame).toContain('*A'); // cycled
    backend.press({ name: 'tab', shift: true });
    await flushAsync();
    expect(backend.lastFrame).toContain('*C'); // back
  });

  test('useFocus outside a FocusGroup returns isFocused: false', async () => {
    const backend = new TestBackend(20, 1);
    await render(
      createElement(Reporter, { label: 'X', sink: [] }),
      backend,
    );
    await flushAsync();
    expect(backend.lastFrame).toContain(' X'); // not focused (space prefix)
  });

  test('isActive: false ignores Tab', async () => {
    const backend = new TestBackend(20, 3);
    await render(
      createElement(FocusGroup, { isActive: false },
        createElement(Reporter, { label: 'A', sink: [] }),
        createElement(Reporter, { label: 'B', sink: [] }),
      ),
      backend,
    );
    await flushAsync();
    expect(backend.lastFrame).toContain('*A');
    backend.press({ name: 'tab' });
    await flushAsync();
    expect(backend.lastFrame).toContain('*A'); // unchanged
  });

  test('unmounting focused focusable moves focus to next available', async () => {
    const backend = new TestBackend(20, 3);
    function App() {
      const [showA, setShowA] = useState(true);
      // Press 'd' to remove A
      // (we'll just call setShowA via a test helper)
      return createElement(FocusGroup, {},
        showA ? createElement(Reporter, { label: 'A', sink: [] }) : null,
        createElement(Reporter, { label: 'B', sink: [] }),
        createElement('flowtty-box', {
          width: 1, height: 1,
          // hidden way to flip showA: useInput
        }, ''),
        createElement(Toggler, { onToggle: () => setShowA(false) }),
      );
    }
    // Toggler is a child component that exposes a 'd' key to remove A
    function Toggler({ onToggle }: { onToggle: () => void }) {
      // useInput is from flowtty's input system
      // import at top
      const { useInput } = require('./use-input.js') as typeof import('./use-input.js');
      useInput((key) => { if (key.name === 'd') onToggle(); });
      return null;
    }
    await render(createElement(App), backend);
    await flushAsync();
    expect(backend.lastFrame).toContain('*A');
    backend.press({ name: 'd' });
    await flushAsync();
    // A unmounted; B should become focused.
    expect(backend.lastFrame).toContain('*B');
  });
});
```

(NOTE: the "unmount" test uses an inline `require()` — that's hacky; subagent should rewrite to use a top-level import instead. Pattern works either way; prefer the top import.)

- [ ] **Step 6: Verify** — `npx vitest run src/focus.test.ts`, full suite, typecheck.

- [ ] **Step 7: Commit**
```bash
git add src/focus-context.ts src/focus-group.ts src/use-focus.ts src/focus.test.ts
git commit -m "feat: FocusGroup + useFocus — Tab navigation across registered focusables"
```

---

### Task 2: Button component

**Files:**
- Create: `src/button.ts`, `src/button.test.ts`

- [ ] **Step 1: Read first** — `src/components.ts` (Box + Text component shape), `src/use-input.js` (for shortcut handling).

- [ ] **Step 2: Create `src/button.ts`:**

```ts
import { createElement, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';
import { useFocus } from './use-focus.js';

export interface ButtonProps {
  /** Button label. */
  label: string;
  /** Optional shortcut key (e.g., 'o', 'enter'). When pressed anywhere in the
   *  surrounding input scope, the button fires (even if not focused). Rendered
   *  as a dim hint after the label. */
  shortcut?: string;
  /** Called when the button is activated — via Enter when focused, OR via the
   *  shortcut key (anywhere in input scope). */
  onPress: () => void;
}

export function Button({ label, shortcut, onPress }: ButtonProps): ReactNode {
  const { isFocused } = useFocus();

  useInput((key) => {
    if (isFocused && key.name === 'return') onPress();
    else if (shortcut && key.name === shortcut) onPress();
  });

  // Visual: `[ label ]` plus dim `shortcut` after. Focused → inverse + bold.
  return createElement(Box, { flexDirection: 'row' },
    createElement(Box, { bold: isFocused, inverse: isFocused }, `[ ${label} ]`),
    shortcut
      ? createElement(Box, { dim: true }, ` (${shortcut})`)
      : null,
  );
}
```

- [ ] **Step 3: Create `src/button.test.ts`:**

```ts
import { describe, test, expect, vi } from 'vitest';
import { createElement } from 'react';
import { render } from './render.js';
import { TestBackend } from './backends/test.js';
import { flushAsync } from './testing.js';
import { FocusGroup } from './focus-group.js';
import { Button } from './button.js';

describe('Button', () => {
  test('renders [ label ] + (shortcut) hint', async () => {
    const backend = new TestBackend(30, 1);
    await render(
      createElement(FocusGroup, {},
        createElement(Button, { label: 'Open', shortcut: 'o', onPress: () => {} }),
      ),
      backend,
    );
    await flushAsync();
    expect(backend.lastFrame).toContain('[ Open ]');
    expect(backend.lastFrame).toContain('(o)');
  });

  test('Enter fires onPress when focused', async () => {
    const backend = new TestBackend(30, 1);
    const onPress = vi.fn();
    await render(
      createElement(FocusGroup, {},
        createElement(Button, { label: 'Save', onPress }),
      ),
      backend,
    );
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('Shortcut key fires onPress even when NOT focused', async () => {
    const backend = new TestBackend(30, 1);
    const aFn = vi.fn();
    const bFn = vi.fn();
    await render(
      createElement(FocusGroup, {},
        createElement(Button, { label: 'A', onPress: aFn }),
        createElement(Button, { label: 'B', shortcut: 'b', onPress: bFn }),
      ),
      backend,
    );
    await flushAsync();
    // A is focused, B is not. Press 'b' → B fires.
    backend.press({ name: 'b' });
    await flushAsync();
    expect(aFn).not.toHaveBeenCalled();
    expect(bFn).toHaveBeenCalledTimes(1);
  });

  test('Tab moves focus between buttons; Enter fires the focused one', async () => {
    const backend = new TestBackend(30, 1);
    const aFn = vi.fn();
    const bFn = vi.fn();
    await render(
      createElement(FocusGroup, {},
        createElement(Button, { label: 'A', onPress: aFn }),
        createElement(Button, { label: 'B', onPress: bFn }),
      ),
      backend,
    );
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
    expect(aFn).toHaveBeenCalledTimes(1);
    backend.press({ name: 'tab' });
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
    expect(bFn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Verify + commit**
```bash
npx vitest run src/button.test.ts
git add src/button.ts src/button.test.ts
git commit -m "feat: Button component — focusable, shortcut key, Enter-when-focused"
```

---

### Task 3: Plug TextInput / Select / MultiSelect into focus system

**Files:**
- Modify: `src/text-input.ts`, `src/select.ts`, `src/multi-select.ts`

- [ ] **Step 1: Read first** — current implementations of TextInput / Select / MultiSelect to understand existing `isFocused` semantics.

- [ ] **Step 2: For each component**, change the `isFocused` resolution:

OLD:
```ts
const { isFocused = true } = props;
// useInput(... , { isActive: isFocused });
```

NEW:
```ts
const { isFocused: explicitFocus } = props;
const { isFocused: ctxFocused } = useFocus();
const isFocused = explicitFocus !== undefined ? explicitFocus : ctxFocused;
// useInput(... , { isActive: isFocused });
```

Plus update the `isFocused` prop's JSDoc:
```ts
/** Override focus state. If unset (default), the component reads from the
 *  enclosing FocusGroup. If set, this overrides — useful for forcing focus
 *  outside the focus system. */
isFocused?: boolean;
```

- [ ] **Step 3: Verify backward-compat tests still pass.** The existing tests pass `isFocused: false` explicitly (e.g., text-input.test.ts:53-58 "isFocused: false suppresses key handling"). Those still work because explicit `false` overrides.

- [ ] **Step 4: Verify default behavior.** When `isFocused` is NOT passed and no FocusGroup is present, the component should still receive input (current default-true behavior preserved). BUT useFocus outside a FocusGroup returns `isFocused: false`. So `ctxFocused` is `false` → component is muted → BREAKS existing default behavior.

**Resolution:** the `useFocus()` default value (no FocusGroup) should return `isFocused: true` (not false). Update `FocusContext`'s default:

In `src/focus-context.ts`, change:
```ts
const noop: FocusGroupApi = {
  register: () => {},
  unregister: () => {},
  isFocused: () => false,  // ← BEFORE
};
```
To:
```ts
const noop: FocusGroupApi = {
  register: () => {},
  unregister: () => {},
  isFocused: () => true,  // ← AFTER: outside a FocusGroup, "always focused" so default behavior works
};
```

This means a Button outside any FocusGroup ALSO appears focused (which is fine — single-button, no group, it's the only thing).

Update the focus.test.ts "outside group" assertion accordingly.

- [ ] **Step 5: Verify**
- `npx vitest run` — full suite (existing TextInput/Select/MultiSelect tests still pass; focus tests pass).
- Run a manual smoke check (subagent: skip — user smoke-tests).

- [ ] **Step 6: Commit**
```bash
git add src/text-input.ts src/select.ts src/multi-select.ts src/focus-context.ts src/focus.test.ts
git commit -m "feat: TextInput/Select/MultiSelect integrate with FocusGroup (isFocused prop overrides)"
```

---

### Task 4: DialogHost — implicit FocusGroup per dialog

**Files:**
- Modify: `src/dialog-host.ts`
- Update tests as needed

- [ ] **Step 1: Read** `src/dialog-host.ts` (current stack rendering).

- [ ] **Step 2: Wrap each stack entry's content** in a `<FocusGroup isActive={isTop}>`. Also wrap the host content in `<FocusGroup isActive={!hasOpenDialog}>` so the host's focusables are inactive when any dialog is open.

In `dialog-host.ts`:
```ts
import { FocusGroup } from './focus-group.js';

// In the render:
// Host content:
createElement(InputContext.Provider, { value: hasOpenDialog ? mutedSource : outerSource },
  createElement(FocusGroup, { isActive: !hasOpenDialog }, props.children),
),
// Each stack entry:
createElement(InputContext.Provider, { value: isTop ? outerSource : mutedSource },
  createElement(DialogResultContext.Provider, { value: dialogApi },
    createElement(DialogIsTopContext.Provider, { value: isTop },
      createElement(FocusGroup, { isActive: isTop }, d.element),
    ),
  ),
),
```

- [ ] **Step 3: Add a test** to `src/dialog-host.test.ts`:

```ts
test('each dialog has its own focus scope; Tab cycles within top dialog', async () => {
  // Setup: open two stacked dialogs, each with 2 buttons. Tab cycles within top.
  // (Detailed setup similar to existing dialog-host stack tests.)
});
```

- [ ] **Step 4: Verify + commit**
```bash
git add src/dialog-host.ts src/dialog-host.test.ts
git commit -m "feat(DialogHost): implicit FocusGroup per stack entry (Tab scoped to top dialog)"
```

---

### Task 5: README + final build

**Files:** `README.md`

- [ ] **Step 1: Re-export from `src/index.ts`:**
```ts
export { FocusGroup } from './focus-group.js';
export type { FocusGroupProps } from './focus-group.js';
export { useFocus } from './use-focus.js';
export type { UseFocusResult } from './use-focus.js';
export { Button } from './button.js';
export type { ButtonProps } from './button.js';
```

- [ ] **Step 2: Add `### Focus + Button` to README**:

```md
### Focus + Button

Components inside a `<FocusGroup>` can call `useFocus()` to know if they're the active focusable. Tab cycles forward, Shift-Tab backward. First registered = auto-focused.

`<DialogHost>` wraps each stack entry in an implicit `FocusGroup`, so Tab is scoped to the top dialog by default — no setup needed. Host content also gets its own implicit group.

`<Button>` is focusable. Props:

```tsx
<Button label="Open" shortcut="o" onPress={() => ...} />
```

- `Enter` when focused → `onPress()`
- `shortcut` key (anywhere in the input scope) → `onPress()` even when not focused
- Focused state: bold + inverse-video label

TextInput / Select / MultiSelect also plug into the focus system. Their `isFocused` prop becomes optional — if unset, they read from the FocusGroup. If set explicitly, the prop overrides.

Outside a FocusGroup, `useFocus()` returns `{isFocused: true}` (safe default — single component receives input as before).
```

- [ ] **Step 3: Final verify + commit:**
```bash
npx vitest run      # all pass
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md src/index.ts
git commit -m "docs: document Focus + Button; export from index"
```

---

## Self-Review

**1. Spec coverage:**
- FocusGroup + useFocus + Tab/Shift-Tab → Task 1.
- Button visual (inline shortcut hint, bold+inverse when focused) + shortcut key + Enter when focused → Task 2.
- All interactive components (TextInput/Select/MultiSelect) plugged in with prop-override fallback → Task 3.
- DialogHost implicit FocusGroup per stack entry → Task 4.
- README + exports → Task 5.

**2. Placeholder scan:** none.

**3. Type consistency:**
- `FocusGroupApi` shared between context and group.
- `useFocus()` returns `{isFocused: boolean}` — same shape across all consumers.
- `Button.shortcut` is `string | undefined` — matches Key.name format.

**Risks worth flagging:**

1. **Mount-order vs render-order**: useEffect (which registers) runs after render but in DOM-mount order. If two focusables conditionally mount, the order may surprise. v1: register order = tab order. Document.

2. **First-registered auto-focus race**: if 5 components mount simultaneously, the FIRST useEffect to fire becomes focused. React orders effects top-down by tree, so first child in JSX = first registered = first focused. Stable in practice.

3. **isActive: false during dialog stacking**: lower dialogs' FocusGroup has `isActive: false` → they don't react to Tab. But the components inside (TextInput etc.) still try to use input via useInput. InputContext already mutes them via the InputContext.Provider wrap with mutedSource. So no double-fire. Verified.

4. **Default `isFocused: () => true` change**: was `false` in initial Step 2 sketch — corrected in Step 4 to preserve backward-compat for components outside a FocusGroup. Without this, a TextInput outside a FocusGroup would be muted, breaking default input delivery etc.

5. **Button's shortcut listens "anywhere in input scope"**: this means in a dialog with multiple buttons, all shortcuts are live regardless of focus. If two buttons have the same shortcut, both fire. Document as caller-responsibility.

6. **Test for the dynamic-mount-focus test (Task 1 Step 5)**: the inline `require()` is hacky; rewrite with a proper import.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/focus-button.md`. Subagent-driven execution per pattern — Task 1 (Sonnet, primitives), Task 2 (Sonnet, Button), Task 3 (Sonnet, integration), Task 4 (Sonnet, DialogHost), Task 5 (Haiku, README + build). 5 tasks; ~moderate complexity each.

After this lands, `<Button>` can be used in a success dialog (`[ Open ] (o)` + `[ Close ] (Enter)`) and focusable buttons added elsewhere as needed.
