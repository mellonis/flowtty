# flowtty M1b — `<TextInput>` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a workflow-grade `<TextInput>` component — controlled string editor over the M1a `useInput` layer, with the proven `articles.mjs` line-editor features (NBSP-safe insertion, Mac Option-modifier typography, full emacs/word/cursor bindings, mask for passwords, `validate`-gated submit, `onSubmit`/`onCancel`).

**Architecture:** Two layers — a **pure editor reducer** (`src/editor.ts`) that takes `(value, cursor, Key) → action` (no React, exhaustively unit-tested), and a thin **React component** (`src/text-input.ts`) that uses `useInput` to feed keys to the reducer and calls `onChange`/`onSubmit`/`onCancel`. Rendering reuses M0's `<Box><Text>` (Text auto-sized by Yoga measure func); cursor is shown as a 1-cell `▏` inserted at the cursor index. Two small carry-forwards from M1a's review land first as foundation fixes: wrap key dispatch in `reconciler.flushSync` (so `flush()` returns to pure microtasks) and gate `freeRecursive` on `indexOf >= 0` in `removeChildFromContainer` (defensive against future error-recovery paths).

**Tech Stack:** Same as M1a — TypeScript ESM, React 19, `react-reconciler@0.31.0`, `yoga-layout@3.2.1`, Vitest 4.

**Out of scope** (later plans): `<Select>` / `<MultiSelect>` / `<Confirm>` / `<Form>` (M1c), intra-form focus ring (M1c — `isFocused` is a prop on TextInput now, but the focus *manager* lands with Form), TTY-backend stdin wiring (M1c), element-level styling beyond what the cursor needs (later milestone), error-display inside TextInput (consumer's responsibility — they own the `validate` function and can render the error themselves).

---

## Scope check

This is the second plan of three for the M1 milestone:

- **M1a (merged):** repaint-on-commit + raw key delivery via `useInput` + test-backend key injection + unmount Yoga free.
- **M1b (this plan):** `<TextInput>` + two carry-forward foundation fixes.
- **M1c (next):** `<Select>` / `<MultiSelect>` / `<Confirm>` + intra-form focus ring + `<Form>` + TTY-backend stdin raw-mode + key parser → real-terminal interactivity end-to-end.

Each produces working, testable software on its own. M1b's acceptance is an interactive TextInput that the test backend can type into, edit with all bindings, validate, and submit.

---

## File Structure

```
src/
  reconciler.ts          # MODIFY: expose flushSync on Root; gate freeRecursive on indexOf >= 0
  reconciler.test.ts     # ADD: flushSync availability test
  render.ts              # MODIFY: wrap subscribe handler in root.flushSync
  testing.ts             # MODIFY: flush() back to pure microtasks (drops the setTimeout(0))

  editor.ts              # NEW: pure editor state + reduce(state, key) → action; OPT_MAP table
  editor.test.ts         # NEW: exhaustive unit tests per action family (movement, deletion, insertion, typography, submit/cancel)

  text-input.ts          # NEW: React TextInput component (controlled, cursor as local state)
  text-input.test.ts     # NEW: integration tests (mount, type, edit, validate, submit/cancel)

  index.ts               # MODIFY: export TextInput + TextInputProps
  README.md              # MODIFY: M1b status + usage example with Zod
```

Responsibilities:

- **`editor.ts`** is pure — no React, no I/O, no Yoga. Takes `(value, cursor, key)` and returns an action describing what changed (or `'submit'`/`'cancel'`/`'noop'`). All bindings live here. Exhaustively unit-testable.
- **`text-input.ts`** is the thin React shell: holds cursor as `useState`, reads `value` from props (controlled), dispatches `useInput` events through the editor, calls `onChange`/`onSubmit`/`onCancel`, renders `<Box><Text>` with the cursor bar.
- **`reconciler.ts` / `render.ts` / `testing.ts`** changes are infra cleanups carried forward from M1a's final review — small, mechanical.

---

### Task 1: `Root.flushSync` exposure + key dispatch wrap

The M1a TODO: external-event state updates currently bounce through React's Scheduler at `DefaultEventPriority`, requiring `flush()` to wait a macrotask. Wrap key-handler invocation in `reconciler.flushSync(...)` so the state update is processed synchronously inside the dispatch call; `flush()` then needs only microtasks (for the scheduled paint).

**Files:**
- Modify: `src/reconciler.ts`
- Modify: `src/render.ts`
- Modify: `src/testing.ts`
- Modify: `src/reconciler.test.ts`

- [ ] **Step 1: Add failing test to `src/reconciler.test.ts`** (append):

```ts
test('Root exposes flushSync; renders inside it commit synchronously', async () => {
  const Yoga = await getYoga();
  let commits = 0;
  const { root } = createRoot(Yoga, () => { commits++; });
  root.flushSync(() => {
    root.render(createElement('flowtty-box'));
  });
  // After flushSync returns, the commit has happened; the scheduled paint is still in a microtask.
  await Promise.resolve();
  await Promise.resolve();
  expect(commits).toBe(1);
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/reconciler.test.ts`. (`root.flushSync` doesn't exist yet.)

- [ ] **Step 3: Modify `src/reconciler.ts`** — extend the `Root` interface and `createRoot`. `react-reconciler@0.31.0` exposes `flushSync` on the reconciler instance (verified in M0 T5 review). The Root wrapper calls through.

   Find the existing `Root` interface and add `flushSync`:
   ```ts
   export interface Root {
     render(element: ReactNode): void;
     unmount(): void;
     flushSync(fn: () => void): void;
   }
   ```

   In `createRoot`, add the `flushSync` method to the returned `root` object:
   ```ts
   return {
     container,
     root: {
       render(element) { /* existing */ },
       unmount() { /* existing */ },
       flushSync(fn) {
         // Cast: 0.31.0 runtime exposes flushSync but @types/react-reconciler@0.28.9
         // may declare it under a different name; this matches the cjs runtime export
         // (same provenance as updateContainerSync / flushSyncWork already used).
         (reconciler as unknown as { flushSync: (fn: () => void) => void }).flushSync(fn);
       },
     },
   };
   ```
   **If `reconciler.flushSync` is undefined at runtime**, the cjs build may name it `flushSyncWork` or expose it differently — inspect `node_modules/react-reconciler/cjs/react-reconciler.production.js` for the matching export, adjust the cast property name to whatever the runtime actually exposes. The test in Step 1 is the proof.

- [ ] **Step 4: Modify `src/render.ts`** — wrap the InputContext-provider's `subscribe` so dispatched handlers run inside `flushSync`. Find the existing tree-wrapping block and change it:
   ```ts
   const tree = backend.onKey
     ? createElement(
         InputContext.Provider,
         {
           value: {
             subscribe(handler) {
               return backend.onKey!((key) => {
                 // Process the state update synchronously so flush() needs only microtasks.
                 root.flushSync(() => handler(key));
               });
             },
           } as InputSource,
         },
         element,
       )
     : element;
   ```

- [ ] **Step 5: Simplify `src/testing.ts`** `flush()` back to pure microtasks (drop the `setTimeout(0)` round, remove the M1b TODO comment that called for this):
   ```ts
   export async function flush(): Promise<void> {
     await Promise.resolve();
     await Promise.resolve();
   }
   ```

- [ ] **Step 6: Verify** — the M1a interactive-counter acceptance test in `src/render.test.ts` MUST still pass (it presses 'i', then `await flush()`, then asserts the frame updated). If it fails now, `root.flushSync` isn't actually flushing the state update synchronously — debug by checking the cast property name against the runtime.
   - `npx vitest run` → all 33 + 1 new = 34 pass.
   - `npm run typecheck` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/reconciler.ts src/render.ts src/testing.ts src/reconciler.test.ts
git commit -m "feat: Root.flushSync + wrap key dispatch — flush() back to pure microtasks"
```

---

### Task 2: Defensive `freeRecursive` gate in `removeChildFromContainer`

M1a's final review flagged: `removeChildFromContainer` calls `yogaNode.freeRecursive()` unconditionally on type `'box'`, ignoring whether `indexOf` actually found the child. Empirically safe in 0.31.0's current unmount path, but one-line defensive fix.

**Files:**
- Modify: `src/reconciler.ts`

- [ ] **Step 1: Modify `src/reconciler.ts`** — find `removeChildFromContainer` in the host config, change:
   ```ts
   removeChildFromContainer: (container: Container, child: Instance | TextInstance) => {
     const i = container.children.indexOf(child as Instance);
     if (i >= 0) {
       container.children.splice(i, 1);
       if ((child as { type: string }).type === 'box') {
         (child as Instance).yogaNode.freeRecursive();
       }
     }
   },
   ```
   (The free now sits inside the `if (i >= 0)` branch — won't fire if the child wasn't actually in the container.)

- [ ] **Step 2: Verify**
   - `npx vitest run` → all 34 still pass (the existing unmount-frees-yoga test from M1a still passes, because `indexOf` does find the child during real unmount).
   - `npm run typecheck` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/reconciler.ts
git commit -m "fix: gate freeRecursive on indexOf >= 0 in removeChildFromContainer"
```

---

### Task 3: Editor — cursor movement

The pure editor state machine. Movement-only this task: cursor never modifies the string.

**Files:**
- Create: `src/editor.ts`
- Create: `src/editor.test.ts`

- [ ] **Step 1: Write the failing test `src/editor.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { reduce, type EditorState } from './editor.js';
import type { Key } from './keys.js';

function key(partial: Partial<Key> & { name: string }): Key {
  return { sequence: '', ctrl: false, meta: false, shift: false, ...partial };
}

const s = (value: string, cursor: number): EditorState => ({ value, cursor });

test('left arrow moves cursor one back (clamped at 0)', () => {
  expect(reduce(s('hello', 3), key({ name: 'left' }))).toEqual({ kind: 'edit', state: s('hello', 2) });
  expect(reduce(s('hello', 0), key({ name: 'left' }))).toEqual({ kind: 'edit', state: s('hello', 0) });
});

test('right arrow moves cursor one forward (clamped at value.length)', () => {
  expect(reduce(s('hello', 3), key({ name: 'right' }))).toEqual({ kind: 'edit', state: s('hello', 4) });
  expect(reduce(s('hello', 5), key({ name: 'right' }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('home (and Ctrl-A) jumps to start', () => {
  expect(reduce(s('hello', 3), key({ name: 'home' }))).toEqual({ kind: 'edit', state: s('hello', 0) });
  expect(reduce(s('hello', 3), key({ name: 'a', ctrl: true }))).toEqual({ kind: 'edit', state: s('hello', 0) });
});

test('end (and Ctrl-E) jumps to end', () => {
  expect(reduce(s('hello', 1), key({ name: 'end' }))).toEqual({ kind: 'edit', state: s('hello', 5) });
  expect(reduce(s('hello', 1), key({ name: 'e', ctrl: true }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('Option+left and Option+B jump to previous word start', () => {
  // "hello world foo" with cursor at 13 → previous word start is 12 ("foo")
  expect(reduce(s('hello world foo', 13), key({ name: 'left', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 12) });
  expect(reduce(s('hello world foo', 13), key({ name: 'b', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 12) });
  // From within "world", goes to start of "world"
  expect(reduce(s('hello world foo', 9), key({ name: 'left', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 6) });
  // From cursor 0, stays at 0
  expect(reduce(s('hello', 0), key({ name: 'left', meta: true }))).toEqual({ kind: 'edit', state: s('hello', 0) });
});

test('Option+right and Option+F jump to end of current/next word', () => {
  // "hello world foo" with cursor at 0 → end of "hello" is 5
  expect(reduce(s('hello world foo', 0), key({ name: 'right', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 5) });
  expect(reduce(s('hello world foo', 0), key({ name: 'f', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 5) });
  // Skips whitespace then to end of next word
  expect(reduce(s('hello world foo', 5), key({ name: 'right', meta: true }))).toEqual({ kind: 'edit', state: s('hello world foo', 11) });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/editor.test.ts`.

- [ ] **Step 3: Write `src/editor.ts`:**
```ts
import type { Key } from './keys.js';

export interface EditorState {
  value: string;
  cursor: number;
}

export type EditorAction =
  | { kind: 'edit'; state: EditorState }
  | { kind: 'submit' }
  | { kind: 'cancel' }
  | { kind: 'noop' };

// A "word char" is alphanumeric. Whitespace and punctuation are word boundaries.
const isWord = (c: string) => /[\p{L}\p{N}_]/u.test(c);

function wordLeft(value: string, cursor: number): number {
  let c = cursor;
  // Skip non-word chars left
  while (c > 0 && !isWord(value[c - 1]!)) c--;
  // Then skip word chars left to start of word
  while (c > 0 && isWord(value[c - 1]!)) c--;
  return c;
}

function wordRight(value: string, cursor: number): number {
  let c = cursor;
  // Skip non-word chars right
  while (c < value.length && !isWord(value[c]!)) c++;
  // Then skip word chars right to end of word
  while (c < value.length && isWord(value[c]!)) c++;
  return c;
}

export function reduce(state: EditorState, key: Key): EditorAction {
  const { value, cursor } = state;
  const clamp = (n: number) => Math.max(0, Math.min(value.length, n));

  // Cursor movement
  if (key.name === 'left' && key.meta) return { kind: 'edit', state: { value, cursor: wordLeft(value, cursor) } };
  if (key.name === 'b' && key.meta) return { kind: 'edit', state: { value, cursor: wordLeft(value, cursor) } };
  if (key.name === 'right' && key.meta) return { kind: 'edit', state: { value, cursor: wordRight(value, cursor) } };
  if (key.name === 'f' && key.meta) return { kind: 'edit', state: { value, cursor: wordRight(value, cursor) } };
  if (key.name === 'left') return { kind: 'edit', state: { value, cursor: clamp(cursor - 1) } };
  if (key.name === 'right') return { kind: 'edit', state: { value, cursor: clamp(cursor + 1) } };
  if (key.name === 'home') return { kind: 'edit', state: { value, cursor: 0 } };
  if (key.name === 'end') return { kind: 'edit', state: { value, cursor: value.length } };
  if (key.name === 'a' && key.ctrl) return { kind: 'edit', state: { value, cursor: 0 } };
  if (key.name === 'e' && key.ctrl) return { kind: 'edit', state: { value, cursor: value.length } };

  return { kind: 'noop' };
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/editor.test.ts` → 6 pass. `npx vitest run` → 34 + 6 = 40. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/editor.ts src/editor.test.ts
git commit -m "feat: editor — cursor movement (arrows, home/end, word ops, Ctrl-A/E)"
```

---

### Task 4: Editor — deletion + kill bindings

Adds backspace / forward-delete / word-delete-back / word-delete-forward / Ctrl-K (kill to end) / Ctrl-U (kill to start) / Ctrl-W (delete word back, same as Option+Backspace).

**Files:**
- Modify: `src/editor.ts`
- Modify: `src/editor.test.ts`

- [ ] **Step 1: Append failing tests to `src/editor.test.ts`:**
```ts
test('backspace deletes left of cursor', () => {
  expect(reduce(s('hello', 3), key({ name: 'backspace' }))).toEqual({ kind: 'edit', state: s('helo', 2) });
  expect(reduce(s('hello', 0), key({ name: 'backspace' }))).toEqual({ kind: 'edit', state: s('hello', 0) });
});

test('delete (forward) removes right of cursor', () => {
  expect(reduce(s('hello', 1), key({ name: 'delete' }))).toEqual({ kind: 'edit', state: s('hllo', 1) });
  expect(reduce(s('hello', 5), key({ name: 'delete' }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('Ctrl-D deletes forward (emacs alias for delete)', () => {
  expect(reduce(s('hello', 1), key({ name: 'd', ctrl: true }))).toEqual({ kind: 'edit', state: s('hllo', 1) });
});

test('Option+Backspace and Ctrl-W delete the previous word', () => {
  expect(reduce(s('hello world', 11), key({ name: 'backspace', meta: true }))).toEqual({ kind: 'edit', state: s('hello ', 6) });
  expect(reduce(s('hello world', 11), key({ name: 'w', ctrl: true }))).toEqual({ kind: 'edit', state: s('hello ', 6) });
});

test('Option+D (and meta+delete) deletes the next word', () => {
  expect(reduce(s('hello world', 5), key({ name: 'd', meta: true }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('Ctrl-K kills from cursor to end', () => {
  expect(reduce(s('hello world', 5), key({ name: 'k', ctrl: true }))).toEqual({ kind: 'edit', state: s('hello', 5) });
});

test('Ctrl-U kills from cursor to start', () => {
  expect(reduce(s('hello world', 6), key({ name: 'u', ctrl: true }))).toEqual({ kind: 'edit', state: s('world', 0) });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Extend `src/editor.ts` `reduce` function.** Add these branches BEFORE the `return { kind: 'noop' }` line (after the movement branches from Task 3):

```ts
// Deletion: word-level (check meta-modified BEFORE plain delete/backspace)
if (key.name === 'backspace' && key.meta) {
  const start = wordLeft(value, cursor);
  return { kind: 'edit', state: { value: value.slice(0, start) + value.slice(cursor), cursor: start } };
}
if (key.name === 'w' && key.ctrl) {
  const start = wordLeft(value, cursor);
  return { kind: 'edit', state: { value: value.slice(0, start) + value.slice(cursor), cursor: start } };
}
if (key.name === 'd' && key.meta) {
  const end = wordRight(value, cursor);
  return { kind: 'edit', state: { value: value.slice(0, cursor) + value.slice(end), cursor } };
}
if (key.name === 'delete' && key.meta) {
  const end = wordRight(value, cursor);
  return { kind: 'edit', state: { value: value.slice(0, cursor) + value.slice(end), cursor } };
}

// Kill bindings
if (key.name === 'k' && key.ctrl) {
  return { kind: 'edit', state: { value: value.slice(0, cursor), cursor } };
}
if (key.name === 'u' && key.ctrl) {
  return { kind: 'edit', state: { value: value.slice(cursor), cursor: 0 } };
}

// Deletion: single char
if (key.name === 'backspace') {
  if (cursor === 0) return { kind: 'edit', state };
  return { kind: 'edit', state: { value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 } };
}
if (key.name === 'delete' || (key.name === 'd' && key.ctrl)) {
  if (cursor === value.length) return { kind: 'edit', state };
  return { kind: 'edit', state: { value: value.slice(0, cursor) + value.slice(cursor + 1), cursor } };
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/editor.test.ts` → all editor tests pass. Full suite green. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/editor.ts src/editor.test.ts
git commit -m "feat: editor — backspace/delete + word deletion + Ctrl-K/U/W kill bindings"
```

---

### Task 5: Editor — insertion + NBSP-safe printable handling + submit/cancel

Plain printable insertion + Enter (submit) + Esc (cancel). NBSP-safety: an inserted character is preserved byte-exact (the editor never re-encodes; if the Key.name is U+00A0, it inserts U+00A0).

**Files:**
- Modify: `src/editor.ts`
- Modify: `src/editor.test.ts`

- [ ] **Step 1: Append failing tests to `src/editor.test.ts`:**
```ts
test('printable character inserts at cursor and advances it', () => {
  expect(reduce(s('hllo', 1), key({ name: 'e', sequence: 'e' }))).toEqual({ kind: 'edit', state: s('hello', 2) });
  expect(reduce(s('', 0), key({ name: 'X', sequence: 'X' }))).toEqual({ kind: 'edit', state: s('X', 1) });
});

test('printable character with ctrl/meta is NOT inserted (those are bindings)', () => {
  expect(reduce(s('hi', 2), key({ name: 'a', ctrl: true }))).toMatchObject({ kind: 'edit', state: s('hi', 0) }); // Ctrl-A = home
  expect(reduce(s('hi', 2), key({ name: 'q', ctrl: true }))).toEqual({ kind: 'noop' }); // unbound ctrl-q is noop, NOT insert
});

test('NBSP (U+00A0) inserts byte-exact (the value contains U+00A0, not space)', () => {
  const action = reduce(s('a', 1), key({ name: ' ', sequence: ' ' }));
  expect(action).toEqual({ kind: 'edit', state: s('a ', 2) });
  // Explicit byte assertion
  if (action.kind === 'edit') {
    expect(action.state.value.charCodeAt(1)).toBe(0x00A0);
  }
});

test('Enter / return → submit', () => {
  expect(reduce(s('hello', 5), key({ name: 'return' }))).toEqual({ kind: 'submit' });
  expect(reduce(s('hello', 5), key({ name: 'enter' }))).toEqual({ kind: 'submit' });
});

test('Escape → cancel', () => {
  expect(reduce(s('hello', 5), key({ name: 'escape' }))).toEqual({ kind: 'cancel' });
});

test('unbound key returns noop', () => {
  expect(reduce(s('hello', 5), key({ name: 'f5' }))).toEqual({ kind: 'noop' });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Extend `src/editor.ts`** — add submit/cancel/insert branches. Append BEFORE the `return { kind: 'noop' }` line:

```ts
// Submit / cancel
if (key.name === 'return' || key.name === 'enter') return { kind: 'submit' };
if (key.name === 'escape') return { kind: 'cancel' };

// Printable insertion — only single-character names, no modifiers.
// (ctrl/meta combinations that don't match an earlier branch are noops, NOT insertions.)
if (!key.ctrl && !key.meta && key.name.length === 1) {
  const ch = key.name;
  return { kind: 'edit', state: { value: value.slice(0, cursor) + ch + value.slice(cursor), cursor: cursor + 1 } };
}
```

(Single-char check covers letters, digits, punctuation, space, and any single Unicode code point including U+00A0 — provided the key source delivers them with `name` set to the character. The TestBackend's `press({ name: 'x' })` and `type('hi')` already produce keys with the character as `name`.)

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/editor.test.ts`. Full suite green. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/editor.ts src/editor.test.ts
git commit -m "feat: editor — printable insertion (NBSP-byte-exact), Enter/Esc submit/cancel"
```

---

### Task 6: Editor — Mac Option-modifier typography (OPT_MAP)

Mac convention: hold Option and press a key → typography character. e.g., Option+Space → NBSP, Option+- → en-dash, Option+Shift+- → em-dash. The editor receives `Key { meta: true, name: 'space' | '-' | ... }` and looks up the typography character.

**Files:**
- Modify: `src/editor.ts`
- Modify: `src/editor.test.ts`

- [ ] **Step 1: Append failing tests to `src/editor.test.ts`:**
```ts
test('Option+Space inserts NBSP (U+00A0)', () => {
  const action = reduce(s('a', 1), key({ name: 'space', meta: true }));
  expect(action.kind === 'edit' && action.state.value).toBe('a ');
});

test('Option+- inserts en-dash (U+2013)', () => {
  const action = reduce(s('a', 1), key({ name: '-', meta: true }));
  expect(action.kind === 'edit' && action.state.value).toBe('a–');
});

test('Option+Shift+- inserts em-dash (U+2014)', () => {
  const action = reduce(s('a', 1), key({ name: '-', meta: true, shift: true }));
  expect(action.kind === 'edit' && action.state.value).toBe('a—');
});

test('Option+[ and Option+Shift+[ insert curly double quotes', () => {
  expect((reduce(s('', 0), key({ name: '[', meta: true })) as { state: EditorState }).state.value).toBe('“'); // "
  expect((reduce(s('', 0), key({ name: '[', meta: true, shift: true })) as { state: EditorState }).state.value).toBe('”'); // "
});

test('Option+] and Option+Shift+] insert curly single quotes', () => {
  expect((reduce(s('', 0), key({ name: ']', meta: true })) as { state: EditorState }).state.value).toBe('‘'); // '
  expect((reduce(s('', 0), key({ name: ']', meta: true, shift: true })) as { state: EditorState }).state.value).toBe('’'); // '
});

test('Option+letter that has no typography mapping is a noop (NOT word op)', () => {
  // 'z' has no entry in OPT_MAP and no word/movement binding
  expect(reduce(s('hi', 2), key({ name: 'z', meta: true }))).toEqual({ kind: 'noop' });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Extend `src/editor.ts`** — add the OPT_MAP table near the top of the file (before `reduce`):

```ts
// Mac Option-modifier typography map. Each entry: keyName → [unshifted, shifted?].
// Inserted byte-exact (NBSP, en/em dash, curly quotes).
const OPT_MAP: Record<string, [string] | [string, string]> = {
  space: [' '],                       // NBSP
  '-':   ['–', '—'],             // en-dash, em-dash
  '[':   ['“', '”'],             // left/right double quote
  ']':   ['‘', '’'],             // left/right single quote
};
```

Add an insertion branch in `reduce` BEFORE the word-deletion branches (so Option+Space inserts NBSP rather than being interpreted as Option+printable):

```ts
// Typography: Option+key with a typography mapping
if (key.meta && OPT_MAP[key.name]) {
  const entry = OPT_MAP[key.name]!;
  const ch = (key.shift && entry[1] !== undefined) ? entry[1]! : entry[0]!;
  return { kind: 'edit', state: { value: value.slice(0, cursor) + ch + value.slice(cursor), cursor: cursor + 1 } };
}
```

- [ ] **Step 4: Run, verify PASS** — all editor tests pass. Full suite green. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/editor.ts src/editor.test.ts
git commit -m "feat: editor — Mac Option-modifier typography (NBSP, en/em dash, curly quotes)"
```

---

### Task 7: `<TextInput>` component — controlled, with cursor bar + mask

The React shell. Reads `value` from props, holds cursor as local state, dispatches through `reduce`, renders `<Box><Text>` with a `▏` cursor bar inserted at the cursor index.

**Files:**
- Create: `src/text-input.ts`
- Create: `src/text-input.test.ts`

- [ ] **Step 1: Write the failing test `src/text-input.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { TextInput } from './text-input.js';

test('TextInput renders the value with a trailing cursor bar', async () => {
  function App() {
    return createElement(TextInput, { value: 'hi', onChange: () => {} });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  // Cursor defaults to end of value → 'hi' + '▏' (3 cells)
  expect(backend.lastFrame).toBe('hi▏');
});

test('typing appends characters and onChange fires per key', async () => {
  let captured = '';
  function App() {
    const [v, setV] = useState('');
    captured = v;
    return createElement(TextInput, { value: v, onChange: setV });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.type('hi');
  await flush();
  expect(captured).toBe('hi');
  expect(backend.lastFrame).toBe('hi▏');
});

test('backspace removes the char before cursor', async () => {
  function App() {
    const [v, setV] = useState('hello');
    return createElement(TextInput, { value: v, onChange: setV });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.press({ name: 'backspace' });
  await flush();
  // 'hell' + cursor bar
  expect(backend.lastFrame).toBe('hell▏');
});

test('mask renders bullets instead of characters', async () => {
  function App() {
    return createElement(TextInput, { value: 'secret', onChange: () => {}, mask: true });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('••••••▏'); // •••••• + bar
});

test('isActive: false suppresses key handling (value unchanged)', async () => {
  let captured = '';
  function App() {
    const [v, setV] = useState('a');
    captured = v;
    return createElement(TextInput, { value: v, onChange: setV, isFocused: false });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.type('xy');
  await flush();
  expect(captured).toBe('a');
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/text-input.test.ts`.

- [ ] **Step 3: Write `src/text-input.ts`:**
```ts
import { createElement, useState, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';
import { reduce, type EditorState } from './editor.js';

export interface TextInputProps {
  /** Controlled value. Required (no defaultValue / uncontrolled mode in M1b). */
  value: string;
  /** Called whenever the value changes (per edit). */
  onChange: (value: string) => void;
  /** Called on Enter/Return — only if validate (if provided) returns null. */
  onSubmit?: (value: string) => void;
  /** Called on Escape. */
  onCancel?: () => void;
  /** Sync validator. Return null/undefined = valid; return string = error message (blocks onSubmit). */
  validate?: (value: string) => string | null | undefined;
  /** When true, render U+2022 (•) per character instead of the actual value. */
  mask?: boolean;
  /** When false, the input does not handle keys. Default true. */
  isFocused?: boolean;
}

const CURSOR = '▏'; // LEFT ONE EIGHTH BLOCK — a thin 1-cell vertical bar

export function TextInput(props: TextInputProps): ReactNode {
  const { value, onChange, onSubmit, onCancel, validate, mask, isFocused = true } = props;
  const [cursor, setCursor] = useState(value.length);
  const safeCursor = Math.max(0, Math.min(value.length, cursor));

  useInput((key) => {
    const action = reduce({ value, cursor: safeCursor } as EditorState, key);
    if (action.kind === 'edit') {
      if (action.state.value !== value) onChange(action.state.value);
      if (action.state.cursor !== safeCursor) setCursor(action.state.cursor);
    } else if (action.kind === 'submit') {
      const err = validate ? validate(value) : null;
      if (!err) onSubmit?.(value);
    } else if (action.kind === 'cancel') {
      onCancel?.();
    }
  }, { isActive: isFocused });

  const display = mask ? '•'.repeat(value.length) : value;
  const withCursor = display.slice(0, safeCursor) + CURSOR + display.slice(safeCursor);

  return createElement(Box, null, createElement(Text, null, withCursor));
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/text-input.test.ts`. Full suite green. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/text-input.ts src/text-input.test.ts
git commit -m "feat: TextInput component — controlled, cursor bar, mask, isFocused"
```

---

### Task 8: TextInput — validate-gated submit + acceptance e2e

Verify the validate/submit/cancel wiring end-to-end with a realistic flow.

**Files:**
- Modify: `src/text-input.test.ts`

- [ ] **Step 1: Append the acceptance test to `src/text-input.test.ts`:**
```ts
test('M1b acceptance: type, edit with cursor moves, validate-gated submit, then cancel', async () => {
  const events: string[] = [];
  function App() {
    const [v, setV] = useState('');
    return createElement(TextInput, {
      value: v,
      onChange: setV,
      validate: (x) => (x.length < 3 ? 'too short' : null),
      onSubmit: (final) => { events.push(`submit:${final}`); },
      onCancel: () => { events.push('cancel'); },
    });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);

  // Type "helo"
  backend.type('helo');
  await flush();
  expect(backend.lastFrame).toBe('helo▏');

  // Move cursor back one and insert 'l' to make "hello"
  backend.press({ name: 'left' });
  await flush();
  expect(backend.lastFrame).toBe('hel▏o');
  backend.press({ name: 'l', sequence: 'l' });
  await flush();
  expect(backend.lastFrame).toBe('hell▏o');

  // Submit — validate passes (length 5 >= 3) → onSubmit fires with "hello"
  backend.press({ name: 'return' });
  await flush();
  expect(events).toEqual(['submit:hello']);

  // Clear with Ctrl-U (kill to start), then try submit with a too-short value
  backend.press({ name: 'a', ctrl: true });    // home
  backend.press({ name: 'k', ctrl: true });    // kill to end → empty
  await flush();
  backend.type('hi');
  await flush();
  backend.press({ name: 'return' });           // validate fails (length 2 < 3) → no submit
  await flush();
  expect(events).toEqual(['submit:hello']);    // unchanged

  // Cancel
  backend.press({ name: 'escape' });
  await flush();
  expect(events).toEqual(['submit:hello', 'cancel']);
});
```

- [ ] **Step 2: Run, verify PASS** — `npx vitest run src/text-input.test.ts`. Full suite green. Typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add src/text-input.test.ts
git commit -m "test: TextInput acceptance — type/edit/validate-gated submit/cancel e2e"
```

---

### Task 9: Public exports + README

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Update `src/index.ts`** — add the TextInput exports. Find the existing export block and append:
```ts
export { TextInput } from './text-input.js';
export type { TextInputProps } from './text-input.js';
```

- [ ] **Step 2: Update `README.md`** — find the existing `## Status` section, replace its content with:

```md
## Status

M1b (interactive prompts: TextInput). The renderer + interactivity loop from
M1a now have their first prompt-grade component: `<TextInput>` with the proven
articles.mjs line-editor bindings — emacs (`Ctrl-A`/`E`/`B`/`F`/`D`/`H`/`K`/`U`/`W`),
word ops (`Option`+`Left`/`Right`/`B`/`F`/`D`/`Backspace`), Mac Option-modifier
typography (`Option`+`Space` → NBSP, `Option`+`-` → en/em dash, `Option`+`[`/`]`
→ curly quotes), masking, and validate-gated submit (Zod-compatible).

### Usage with Zod

\`\`\`tsx
import { z } from 'zod';
import { useState } from 'react';
import { render, TextInput, Box, Text } from 'flowtty';

const Slug = z.string().regex(/^[a-z0-9-]+$/, 'kebab-case only');

function App() {
  const [v, setV] = useState('');
  const validate = (x: string) => {
    const r = Slug.safeParse(x);
    return r.success ? null : r.error.issues[0]?.message ?? 'invalid';
  };
  return (
    <Box>
      <TextInput value={v} onChange={setV} validate={validate} onSubmit={(s) => console.log('slug:', s)} />
    </Box>
  );
}
\`\`\`

### Still deferred (M1c and later)

- TTY-backend stdin raw-mode + key parsing — synthetic keys via TestBackend
  work today; real-terminal interactivity ships with M1c.
- `<Select>` / `<MultiSelect>` / `<Confirm>` + intra-form focus ring + `<Form>` — M1c.
- Frame diffing — full TTY redraw each `draw()`.
- Element-level styling (color/bold/etc.) on text — paint hardcodes empty style.
- Error display inside TextInput — consumers own `validate` and render errors themselves.
```

(Use real triple-backtick fences in the file; the escaped ones above are only because they're inside this plan's own code block.)

- [ ] **Step 3: Final verification:**
- `npx vitest run` — all tests pass.
- `npm run typecheck` — clean.
- `npm run build` — ESM + dts succeed; `dist/index.js`, `dist/index.d.ts`, `dist/testing.js`, `dist/testing.d.ts` rebuilt.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts README.md
git commit -m "chore: export TextInput + document M1b state and Zod usage"
```

---

## Self-Review

**1. Spec coverage** (M1b portion of `docs/design.md`):
- `<TextInput>` with prose niceties (NBSP / emacs / OPT_MAP / word ops / masking / validate) → Tasks 3–8.
- The Zod-via-`validate` pattern → Task 9 README example.
- Carried-forward M1a follow-ups (flushSync key dispatch, defensive freeRecursive gate) → Tasks 1, 2.

**2. Placeholder scan:** no "TBD" / "implement later" / vague guidance. The OPT_MAP is the minimal-useful subset (NBSP, en/em dash, curly quotes); extending it is a one-line addition per entry later, not a placeholder.

**3. Type consistency:** `EditorState` (`value`, `cursor`), `EditorAction` (the discriminated union), `reduce(state, key) → EditorAction`, `TextInputProps` shape, `CURSOR` constant are referenced consistently across `editor.ts`, `editor.test.ts`, `text-input.ts`, `text-input.test.ts`. `Root.flushSync(fn: () => void): void` matches between `reconciler.ts` (interface + implementation) and `render.ts` (call site).

**Risks worth flagging for the implementer (not blockers):**

1. **`root.flushSync` runtime name (Task 1).** The cast uses `flushSync`; if `react-reconciler@0.31.0`'s runtime exposes it under a different name (`flushSyncWork` is a sibling; T5 review confirmed that name exists), update the cast property to the actual runtime export. The test in Step 1 is the proof.

2. **Cursor-bar width assumption (Tasks 7, 8).** Tests assert `lastFrame === 'hi▏'` (3 cells) — this relies on U+258F rendering as exactly 1 display column and on the Yoga measure func computing width as code-point count (which it already does via `[...l].length` in `host.ts` `measureText`). If a future change makes measurement width-aware, these assertions remain correct.

3. **`Option`-modifier word-ops vs typography overlap (Tasks 4, 6).** `Option+B` is word-back; `Option+-` is en-dash. The reducer order matters: typography (Task 6) is checked BEFORE word/movement so that printable-symbol typography (Space/`-`/`[`/`]`) takes precedence, while `Option+B`/`F`/`D` (movement/deletion) come AFTER typography only because those letters aren't in `OPT_MAP`. The tests exercise both paths — if an implementer adds a letter to `OPT_MAP` later, the ordering needs revisiting.

4. **The TextInput test assertions include the cursor bar (`▏`).** If you change the cursor character, update every test assertion in `src/text-input.test.ts`.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/m1b-text-input.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Same as M0 / M1a.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
