# Consumed keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a `useInput` handler can say "I handled this key" by returning `true`, which stops the key from reaching later subscribers and from triggering a backend default (Ctrl+C / Ctrl+D exit, Ctrl+Z suspend) — so Ctrl+Z can undo inside a field and suspend everywhere else, and an app can cancel a request on Ctrl+C.

**Architecture:** the key path already has one fan-out point per layer — the backend's subscriber set, the render root's `makeKeySource`, and `useInput`'s ref call — and each returns `void` today. Every layer's handler type becomes `(key) => boolean | void`; `true` means consumed. The render root dispatches in subscription order and stops at the first `true`; the backend dispatches to its subscribers first and applies its built-in default for Ctrl+C / Ctrl+D / Ctrl+Z only when none consumed. Scoping (dialogs muting what is under them, `inert`) is untouched: consumption orders subscribers *within* the live scope.

**Tech Stack:** TypeScript ESM, Vitest, no new dependencies.

**Spec:** the flowtty issue "useInput: let a handler consume a key, so a default (Ctrl+Z suspend, Ctrl+C exit) can be overridden per focus" (#39), with the decisions taken in chat: the signal is a strict `true` return (an async handler's Promise does not count); delivery order is subscription order (children before parents on mount, later mounts after), documented as a rule; Ctrl+C, Ctrl+D and Ctrl+Z all become overridable; built-in components keep returning nothing (a follow-up decides which of them should consume).

## Global Constraints

- Published surfaces cite `docs/*.md` pages only — never this note, never issue numbers.
- Exported functions carry explicit return types (oxc dts).
- Only `=== true` consumes. `undefined`, `false`, a Promise, anything else: not consumed.
- An app that consumes Ctrl+C owns its own exit; `kill -INT` / `SIGTERM` still restore the terminal through `render()`'s signal handlers, and Ctrl+C with no subscriber at all still exits.
- No behaviour change for handlers that return nothing.

---

## File Structure

```
packages/core/src/backend.ts                          # MODIFY — onKey handler returns boolean | void
packages/core/src/testing/test-backend.ts             # MODIFY — press() returns whether consumed
packages/core/src/testing/test-backend.spec.ts        # MODIFY
packages/react/src/context/inputContext.ts            # MODIFY — KeySubscriber returns boolean | void
packages/react/src/hooks/useInput.ts                  # MODIFY — handler type, doc
packages/react/src/hooks/useInput.spec.ts             # MODIFY — order, stop at true, async not consumed
packages/react/src/internal/render.ts                 # MODIFY — makeKeySource reports consumed
packages/react/src/internal/render.spec.ts            # MODIFY — press() returns consumed through render
packages/tty-backend/src/tty.ts                       # MODIFY — subscribers first, defaults after
packages/tty-backend/src/tty.spec.ts                  # MODIFY
packages/inline-tty-backend/src/InlineTtyBackend.ts   # MODIFY — same
packages/inline-tty-backend/src/InlineTtyBackend.spec.ts
docs/input.md                                         # MODIFY — new section "Keys and useInput"
docs/writing-a-backend.md                             # MODIFY — onKey bullet
docs/testing.md                                       # MODIFY — press() return
docs/app.md                                           # MODIFY — Ctrl+C / Ctrl+Z overridable
docs/internal/plans/_followups.md                     # MODIFY — built-in components consuming
CHANGELOG.md                                          # MODIFY — Unreleased / Added
```

---

### Task 1: the handler type in core, `press()` reports it

**Files:**
- Modify: `packages/core/src/backend.ts` (`onKey`)
- Modify: `packages/core/src/testing/test-backend.ts` (`press`, `type`, `wheel`, `mouse` where they return `press`'s result)
- Test: `packages/core/src/testing/test-backend.spec.ts`

**Interfaces:**
- Produces: `Backend.onKey?(handler: (key: Key) => boolean | void): () => void`; `TestBackend.press(key): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
test('press() reports whether a subscriber consumed the key: only a strict true counts', () => {
  const b = new TestBackend(4, 1);
  expect(b.press({ name: 'a' })).toBe(false);          // nobody listening
  b.onKey(() => undefined);
  expect(b.press({ name: 'a' })).toBe(false);
  b.onKey((k) => k.name === 'z' && k.ctrl);           // false for anything else
  expect(b.press({ name: 'a' })).toBe(false);
  expect(b.press({ name: 'z', ctrl: true })).toBe(true);
  b.onKey(async () => {});                             // a Promise is not `true`
  expect(b.press({ name: 'a' })).toBe(false);
});
```

- [ ] **Step 2: Run** — `npx vitest run packages/core/src/testing/test-backend.spec.ts -t "consumed"` — expected: FAIL, `expected undefined to be false`.

- [ ] **Step 3: Implement**

`backend.ts`:

```ts
  /**
   * Subscribe to raw key events. Returns an unsubscribe function. A handler
   * that returns `true` has consumed the key: a backend then skips its own
   * default for it (Ctrl+C / Ctrl+D exit, Ctrl+Z suspend). Only a strict `true`
   * counts. Backends without an input source omit this method.
   * See docs/input.md (keys and useInput).
   */
  onKey?(handler: (key: Key) => boolean | void): () => void;
```

`test-backend.ts`: the subscriber set becomes `Set<(key: Key) => boolean | void>`, `onKey` takes that type, and `press` ends with:

```ts
    let consumed = false;
    for (const h of [...this.subscribers]) if (h(k) === true) consumed = true;
    return consumed;
```

with the return type `boolean` and this line added to its doc comment: "Returns whether a subscriber consumed the key (returned `true`) — the same answer a TTY backend acts on." `TestBackend` delivers to every subscriber even after a `true`: the render root is the only subscriber in practice and does its own stopping; a test with two raw subscribers sees both. Leave `type`, `paste`, `wheel`, `mouse` returning `void`.

- [ ] **Step 4: Run** — `npx vitest run packages/core` — expected: PASS.

---

### Task 2: `useInput` returns, the render root stops at the first `true`

**Files:**
- Modify: `packages/react/src/context/inputContext.ts`
- Modify: `packages/react/src/hooks/useInput.ts`
- Modify: `packages/react/src/internal/render.ts` (`makeKeySource`)
- Test: `packages/react/src/hooks/useInput.spec.ts`, `packages/react/src/internal/render.spec.ts`

**Interfaces:**
- Produces: `KeySubscriber = (key: Key) => boolean | void`; `useInput(handler: (key: Key) => boolean | void, opts?)`; the backend listener installed by `makeKeySource` returns `boolean`.

- [ ] **Step 1: Write the failing tests** (in `render.spec.ts`, through a real render so order and stopping are the production path)

```ts
describe('consumed keys', () => {
  test('keys go to subscribers in subscription order — children first — and stop at the first true', async () => {
    const backend = new TestBackend(8, 1);
    const seen: string[] = [];
    function Child({ eats }: { eats: boolean }) {
      useInput((k) => { seen.push(`child:${k.name}`); return eats; });
      return createElement(Text, null, 'x');
    }
    function Parent() {
      useInput((k) => { seen.push(`parent:${k.name}`); });
      return createElement(Child, { eats: true });
    }
    const app = await render(createElement(Parent), backend);
    await flushAsync(backend);
    expect(backend.press({ name: 'a' })).toBe(true);
    expect(seen).toEqual(['child:a']);
    app.unmount();
  });

  test('a handler that returns nothing lets the key go on, and press() reports false', async () => {
    const backend = new TestBackend(8, 1);
    const seen: string[] = [];
    function Child() {
      useInput((k) => { seen.push(`child:${k.name}`); });
      return createElement(Text, null, 'x');
    }
    function Parent() {
      useInput((k) => { seen.push(`parent:${k.name}`); });
      return createElement(Child);
    }
    const app = await render(createElement(Parent), backend);
    await flushAsync(backend);
    expect(backend.press({ name: 'a' })).toBe(false);
    expect(seen).toEqual(['child:a', 'parent:a']);
    app.unmount();
  });

  test('an async handler does not consume: its Promise is not true', async () => {
    const backend = new TestBackend(8, 1);
    function App() {
      useInput(async () => {});
      return createElement(Text, null, 'x');
    }
    const app = await render(createElement(App), backend);
    await flushAsync(backend);
    expect(backend.press({ name: 'a' })).toBe(false);
    app.unmount();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run packages/react/src/internal/render.spec.ts -t "consumed"` — expected: FAIL (`press()` returns `false` where `true` is expected; `seen` has both entries).

- [ ] **Step 3: Implement**

`inputContext.ts`:

```ts
/** A `useInput` handler. Returning `true` consumes the key: no later
 *  subscriber sees it, and no backend default runs for it. Only a strict
 *  `true` counts — an async handler's Promise does not. */
export type KeySubscriber = (key: Key) => boolean | void;
```

`useInput.ts`: the handler parameter becomes `(key: Key) => boolean | void`; add to the doc comment:

```ts
 * Return `true` to consume the key: subscribers later in delivery order do not
 * see it, and the backend skips its default for it (Ctrl+C / Ctrl+D exit,
 * Ctrl+Z suspend). Delivery order is subscription order — on mount, children
 * before parents, since React runs effects inside-out; a component mounted
 * later comes after. Only a strict `true` counts: an async handler returns a
 * Promise, which does not. See docs/input.md (keys and useInput).
```

`render.ts`, in `makeKeySource`:

```ts
        detachBackend = backend.onKey((key) => {
          beforeDispatch?.(key);
          let consumed = false;
          root.flushSync(() => {
            // Subscription order, stopping at the first handler that consumes:
            // a child subscribes before its parent (effects run inside-out), so
            // the innermost handler gets the key first.
            for (const s of [...subscribers]) {
              if (s(key) === true) { consumed = true; break; }
            }
          });
          afterDispatch?.();
          return consumed;
        });
```

and `subscribers` becomes `Set<KeySubscriber>` (import the type).

- [ ] **Step 4: Run** — `npx vitest run packages/react` and `npm run typecheck` — expected: PASS; typecheck clean (components' handlers return `void`, assignable to `boolean | void`).

---

### Task 3: the TTY backends apply their defaults only when nobody consumed

**Files:**
- Modify: `packages/tty-backend/src/tty.ts` (`inputDataHandler`, `subscribers` type, `onKey` type)
- Modify: `packages/inline-tty-backend/src/InlineTtyBackend.ts` (same)
- Test: `packages/tty-backend/src/tty.spec.ts`, `packages/inline-tty-backend/src/InlineTtyBackend.spec.ts`

- [ ] **Step 1: Write the failing tests** (`tty.spec.ts`; mirror the first one in the inline spec with its stubs)

```ts
test('a subscriber that consumes Ctrl+C keeps the app alive; Ctrl+C with nobody consuming still exits', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);
  try {
    const { stub } = makeStub();
    const stdin = makeStdinStub();
    const b = new TtyBackend(stub, stdin);
    let cancels = 0;
    const off = b.onKey((k) => { if (k.ctrl && k.name === 'c') { cancels++; return true; } });
    stdin.emit('data', '\x03');
    expect(cancels).toBe(1);
    expect(exitSpy).not.toHaveBeenCalled();
    off();
    b.onKey(() => {});
    expect(() => stdin.emit('data', '\x03')).toThrow('exit:130');
  } finally {
    exitSpy.mockRestore();
  }
});

test('a subscriber that consumes Ctrl+Z keeps the terminal: no suspend, no SIGTSTP', () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
  try {
    const { stub, writes } = makeStub();
    const stdin = makeStdinStub();
    const b = new TtyBackend(stub, stdin, { colorScheme: false });
    b.onKey((k) => k.ctrl && k.name === 'z');
    writes.length = 0;
    stdin.emit('data', '\x1a');
    expect(writes).toEqual([]);
    expect(kill).not.toHaveBeenCalled();
    b.dispose();
  } finally {
    kill.mockRestore();
  }
});
```

- [ ] **Step 2: Run** — expected: FAIL (`exit:130` thrown on the first Ctrl+C; Ctrl+Z suspends).

- [ ] **Step 3: Implement** — in both backends, the loop body of `inputDataHandler` becomes:

```ts
    for (const key of keys) {
      // Subscribers first: one that returns true has consumed the key, and
      // the defaults below stand down for it. See docs/input.md (keys and
      // useInput).
      let consumed = false;
      for (const h of [...this.subscribers]) if (h(key) === true) consumed = true;
      if (consumed) continue;
      // Ctrl-C / Ctrl-D in raw mode are delivered as keypresses (NOT signals —
      // raw mode swallows SIGINT). Default-handle them as "exit with restore"
      // so an app that does not take them over is not unkillable.
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        this.dispose();
        process.exit(130);
      }
      // Ctrl+Z, the shell's suspend, arrives as a key in raw mode too. …
      if (key.ctrl && key.name === 'z' && this.options.suspendKey !== false) {
        this.suspend();
        process.kill(process.pid, 'SIGTSTP');
      }
    }
```

(`continue` after the Ctrl+Z branch is no longer needed: it is the last thing in the loop. Drop it.) `subscribers` becomes `Set<(key: Key) => boolean | void>` and `onKey`'s parameter type matches. Note that a subscriber now sees Ctrl+C / Ctrl+D / Ctrl+Z, which it did not before — document it (Task 4).

- [ ] **Step 4: Run** — `npm test` — expected: PASS (the existing Ctrl+C / Ctrl+D / Ctrl+Z tests subscribe handlers that return nothing).

---

### Task 4: docs, follow-up note, changelog

**Files:**
- Modify: `docs/input.md` (index list + a new first section)
- Modify: `docs/writing-a-backend.md` (`onKey` line in the contract + bullet)
- Modify: `docs/testing.md` ("Sending input")
- Modify: `docs/app.md` ("Quitting…" and "Handing the terminal over")
- Modify: `docs/internal/plans/_followups.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: `docs/input.md`** — add `- [Keys and useInput](#keys-and-useinput)` first in the index, and before "## Paste and the mouse":

```markdown
## Keys and useInput

`useInput(handler)` subscribes a component to the keys of its input scope:

```tsx
useInput((key) => {
  if (key.name === 'q') exit();
});
```

`key` is `{ name, sequence, ctrl, meta, shift }`, plus `text` for a paste and
`x` / `y` / `button` for the mouse (next section). Every subscriber in the scope
receives every key, in **subscription order**: on mount, children before parents
— React runs effects inside-out — and a component mounted later comes after the
ones already there. A `<DialogHost>` mutes the scopes under its top dialog, and
`<Box inert>` mutes a subtree, so "the innermost live handler first" is what an
app sees in practice.

**Return `true` to consume the key.** Subscribers later in the order do not see
it, and the backend skips its own default for it. There are three such
defaults in the TTY backends: Ctrl+C and Ctrl+D exit the app (raw mode swallows
`SIGINT`, so the key is all there is), and Ctrl+Z suspends it (see
[Handing the terminal over](app.md#handing-the-terminal-over)). A field that
undoes on Ctrl+Z returns `true` while focused, and the app still suspends
everywhere else; an app that cancels a running request on Ctrl+C returns `true`
while one is running, and exits on its own the second time:

```tsx
useInput((key) => {
  if (key.ctrl && key.name === 'c' && running) { cancel(); return true; }
});
```

An app that consumes Ctrl+C owns its exit: nothing else quits it from the
keyboard (`kill -INT` and `SIGTERM` still restore the terminal). Only a strict
`true` consumes — an async handler returns a Promise, which does not, so an
`async` handler never swallows keys by accident. Handlers that return nothing
behave as before. `TestBackend.press()` returns whether the key was consumed,
so a test can assert it.

The built-in components (`TextInput`, `Select`, …) consume nothing yet; a
global shortcut still fires while a field is focused.
```

- [ ] **Step 2: `docs/writing-a-backend.md`** — contract line: `onKey?(handler: (key: Key) => boolean | void): () => void;   // returns an unsubscribe; true from the handler = consumed`. In the `onKey` bullet, add: "A handler that returns `true` has consumed the key. Deliver to subscribers first and apply any default of yours — the TTY backends exit on Ctrl+C / Ctrl+D and suspend on Ctrl+Z — only when none did; see [Keys and useInput](input.md#keys-and-useinput)."

- [ ] **Step 3: `docs/testing.md`** — after the `press()` paragraph: "`press()` returns whether a `useInput` handler consumed the key (returned `true`) — the answer a TTY backend acts on to skip its Ctrl+C / Ctrl+Z default. See [Keys and useInput](input.md#keys-and-useinput)."

- [ ] **Step 4: `docs/app.md`** — in "Quitting…", after the `useInput … exit()` example, one sentence: "Ctrl+C and Ctrl+D exit by default; a handler that returns `true` for them takes that over — see [Keys and useInput](input.md#keys-and-useinput)." In "Handing the terminal over", the Ctrl+Z paragraph: replace "An app that uses Ctrl+Z itself — an editor's undo — turns that off with `suspendKey: false` in the backend options, and Ctrl+Z arrives as `{ name: 'z', ctrl: true }`." with "A handler that returns `true` for Ctrl+Z — an editor's undo, while the editor is focused — keeps the terminal; `suspendKey: false` in the backend options turns the default off for the whole run instead. Either way the key arrives as `{ name: 'z', ctrl: true }`."

- [ ] **Step 5: `_followups.md`** — append a note: "### Built-in components consuming keys — `TextInput`, `TextArea`, `Select`, `MultiSelect`, `Menu`, `Button` return nothing from their `useInput` handlers, so a global shortcut fires while a field is focused and `Button shortcut` fires from inside a field. Now that `true` consumes, decide per component which keys it should consume when focused (a focused field: every printable key and its editing keys; a menu: its navigation keys). Behaviour change for apps that rely on the fall-through — an alpha note."

- [ ] **Step 6: `CHANGELOG.md`** — under `## Unreleased` / `### Added` (the section exists from the suspend work), a bullet:

```markdown
- A `useInput` handler that returns `true` consumes the key: later subscribers
  do not see it, and the backend skips its default for it — Ctrl+C / Ctrl+D no
  longer exit and Ctrl+Z no longer suspends when a handler took them. Keys are
  delivered in subscription order (children before parents on mount). Backend
  `onKey` handlers return `boolean | void`; `TestBackend.press()` returns
  whether the key was consumed. See docs/input.md (keys and useInput).
```

and under a `### Changed` heading in the same section: "Ctrl+C, Ctrl+D and Ctrl+Z now reach `useInput` handlers before the backend acts on them; a handler that returns nothing changes nothing."

- [ ] **Step 7: Run** — `npm test && npm run typecheck` — expected: PASS.

---

## Self-review

- Spec coverage: `true` consumes (T1–T3), order defined and documented (T2, T4), defaults overridable for Ctrl+C / Ctrl+D / Ctrl+Z (T3), `press()` reports (T1), built-in components deferred (T4 follow-up).
- Names: `KeySubscriber`, `consumed`, `press(): boolean` — consistent across tasks.
