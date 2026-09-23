# Suspend / resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an app can hand the terminal to another program (`$EDITOR`, a pager, `git commit`) and get it back with its state intact and a full repaint; Ctrl+Z suspends the process the way a shell user expects.

**Architecture:** a new optional backend capability pair, `suspend()` / `resume()`, feature-detected like `bell` / `copy`. `TtyBackend` and `InlineTtyBackend` implement it by undoing and redoing what their constructor and `onKey` did (alt screen / live region, raw mode, mouse and paste reporting, the stdin listener), and `resume()` invalidates the frame-diff baseline and notifies the resize subscribers — which is how `render()` already repaints a full frame, so Ctrl+Z (a backend default, like Ctrl+C) needs nothing from the render root. `render()` adds `suspend(fn)` on the handle and on `useApp()`: it calls the backend pair around `fn`, and while suspended `draw()` is a no-op.

**Tech Stack:** TypeScript ESM, Vitest, no new dependencies. Backend tests use the existing stream stubs in `tty.spec.ts` / `InlineTtyBackend.spec.ts`; signals are exercised through `vi.spyOn(process, 'kill')` and by calling the `SIGCONT` handler that `process.on` captured.

**Spec:** the flowtty issue "app: suspend / resume — hand the terminal to $EDITOR or a pager, and handle Ctrl+Z" (#29), with two amendments decided in chat: `modifyOtherKeys` is never enabled by flowtty, so there is nothing to turn off; and Ctrl+Z is a static backend option (`suspendKey`, on by default), not a per-handler "consumed" — that is issue #39.

## Global Constraints

- Published surfaces (code comments, docs) cite `docs/*.md` pages only — never this note, never issue numbers.
- Every `.tsx` imports React explicitly; exported functions carry explicit return types (oxc dts).
- `dispose()` stays idempotent, and after `suspend()` must not write the leave-alt-screen / cursor sequence a second time.
- No new backend capability is assumed by components: everything is `backend.x?.()`.
- Nothing is written after `dispose()`.

---

## File Structure

```
packages/core/src/backend.ts                          # MODIFY — suspend?/resume? on Backend
packages/core/src/testing/test-backend.ts             # MODIFY — record suspend/resume
packages/core/src/testing/test-backend.spec.ts        # MODIFY — the recording
packages/tty-backend/src/tty.ts                       # MODIFY — suspend/resume, suspendKey, SIGCONT
packages/tty-backend/src/tty.spec.ts                  # MODIFY — byte sequences, keys, Ctrl+Z, dispose after suspend
packages/inline-tty-backend/src/InlineTtyBackend.ts   # MODIFY — same for the live region
packages/inline-tty-backend/src/InlineTtyBackend.spec.ts
packages/react/src/context/appContext.ts              # MODIFY — AppApi.suspend
packages/react/src/hooks/useApp.ts                    # MODIFY — doc comment
packages/react/src/internal/render.ts                 # MODIFY — handle.suspend, draw no-op while suspended
packages/react/src/internal/render.spec.ts            # MODIFY — suspend(fn) semantics
docs/app.md                                           # MODIFY — "Handing the terminal over"
docs/writing-a-backend.md                             # MODIFY — the contract + a bullet
docs/testing.md                                       # MODIFY — TestBackend.suspended
CHANGELOG.md                                          # MODIFY — Unreleased / Added
```

---

### Task 1: the capability on `Backend`, recorded by `TestBackend`

**Files:**
- Modify: `packages/core/src/backend.ts` (after `copy?`)
- Modify: `packages/core/src/testing/test-backend.ts`
- Test: `packages/core/src/testing/test-backend.spec.ts`

**Interfaces:**
- Produces: `Backend.suspend?(): void`, `Backend.resume?(): void`; `TestBackend.suspended: boolean`, `TestBackend.suspensions: number`.

- [ ] **Step 1: Write the failing test**

```ts
test('suspend() and resume() are recorded, so an app can test its editor flow', () => {
  const b = new TestBackend(4, 1);
  expect(b.suspended).toBe(false);
  expect(b.suspensions).toBe(0);
  b.suspend();
  expect(b.suspended).toBe(true);
  expect(b.suspensions).toBe(1);
  b.resume();
  expect(b.suspended).toBe(false);
  expect(b.suspensions).toBe(1);
});
```

- [ ] **Step 2: Run it** — `npx vitest run packages/core/src/testing/test-backend.spec.ts -t "recorded"` — expected: FAIL, `b.suspend is not a function`.

- [ ] **Step 3: Implement**

In `backend.ts`, after `copy?`:

```ts
  /**
   * Hand the terminal to another program: leave the alternate screen (or clear
   * the live region), show the cursor, turn off mouse and paste reporting,
   * leave raw mode and stop reading input — so a child process gets the
   * terminal as the shell left it, and nothing it is typed reaches `onKey`.
   * `resume` is the reverse; it must also forget any frame-diff baseline, so
   * the next `draw` is a full frame, and tell the `onResize` subscribers, so
   * the app repaints (the terminal may have been resized meanwhile). Backends
   * with no terminal to hand over omit both; `render()` then runs the
   * callback and nothing else. See docs/app.md (handing the terminal over).
   */
  suspend?(): void;
  /** The reverse of `suspend`. A no-op when not suspended. */
  resume?(): void;
```

In `test-backend.ts`, after `clipboardAvailable`:

```ts
  /** Whether the app has handed the terminal over (`suspend()` without a
   *  `resume()` yet). Nothing is written anywhere. */
  suspended: boolean = false;
  /** How many times the app suspended. */
  suspensions: number = 0;
```

and the methods, after `copy`:

```ts
  /** Record a hand-over instead of leaving any screen. */
  suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.suspensions += 1;
  }

  /** Record the return. */
  resume(): void {
    this.suspended = false;
  }
```

- [ ] **Step 4: Run** — same command — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(core): Backend.suspend/resume capability, recorded by TestBackend"`.

---

### Task 2: `TtyBackend.suspend()` / `resume()`

**Files:**
- Modify: `packages/tty-backend/src/tty.ts`
- Test: `packages/tty-backend/src/tty.spec.ts`

**Interfaces:**
- Consumes: the `Backend` members from Task 1.
- Produces: `TtyBackend.suspend(): void`, `TtyBackend.resume(): void`; a private `leaveTerminal()` shared with `dispose()`.

- [ ] **Step 1: Write the failing tests**

```ts
test('suspend() hands the terminal back: input off, cursor shown, alt screen left; resume() takes it again and repaints', () => {
  const { stub, writes } = makeStub();
  const stdin = makeStdinStub();
  const b = new TtyBackend(stub, stdin, { mouse: true, colorScheme: false });
  const keys: string[] = [];
  b.onKey((k) => keys.push(k.name));
  const resized = vi.fn();
  b.onResize(resized);
  writes.length = 0;

  b.suspend();
  expect(stdin.__rawMode()).toBe(false);
  expect(stdin.listenerCount('data')).toBe(0);
  expect(writes).toEqual([MOUSE_OFF + BRACKETED_PASTE_OFF, SHOW_CURSOR + RESET + ALT_SCREEN_OFF]);
  stdin.emit('data', 'a'); // typed into the child, not into the app
  expect(keys).toEqual([]);

  writes.length = 0;
  b.resume();
  expect(stdin.__rawMode()).toBe(true);
  expect(stdin.listenerCount('data')).toBe(1);
  expect(writes).toEqual([ALT_SCREEN_ON + HIDE_CURSOR, BRACKETED_PASTE_ON + MOUSE_ON]);
  expect(resized).toHaveBeenCalledTimes(1);
  stdin.emit('data', 'a');
  expect(keys).toEqual(['a']);

  // The next frame is a full one: the diff baseline is gone.
  const buf = new Buffer(6, 1); buf.set(0, 0, { char: 'x', style: {} });
  b.draw(buf); writes.length = 0;
  b.draw(buf);
  expect(writes[0]).toContain(CLEAR);
});

test('suspend() twice, or resume() when not suspended, writes nothing', () => {
  const { stub, writes } = makeStub();
  const b = new TtyBackend(stub, makeStdinStub());
  b.resume();
  expect(writes).toHaveLength(1); // only the constructor's write
  b.suspend(); writes.length = 0;
  b.suspend();
  expect(writes).toEqual([]);
});

test('dispose() after suspend() does not leave the alt screen a second time', () => {
  const { stub, writes } = makeStub();
  const b = new TtyBackend(stub, makeStdinStub());
  b.onKey(() => {});
  b.suspend(); writes.length = 0;
  b.dispose();
  expect(writes).toEqual([]);
});
```

Import `MOUSE_OFF`, `MOUSE_ON`, `BRACKETED_PASTE_ON`, `BRACKETED_PASTE_OFF` from `./ansi.js` in the spec.

Note the existing first test asserts a draw right after construction writes `CLEAR`: the "full frame after resume" assertion relies on the same path (`previousBuffer === null` → `drawFull`).

- [ ] **Step 2: Run** — `npx vitest run packages/tty-backend/src/tty.spec.ts -t "suspend"` — expected: FAIL, `b.suspend is not a function`.

- [ ] **Step 3: Implement**

Add a field next to `disposed`:

```ts
  // The terminal has been handed to another program (`suspend()`): nothing is
  // ours to write to until `resume()`.
  private suspended = false;
```

Extract from `dispose()` the input teardown and the alt-screen exit into one private method, and call it from both places:

```ts
  // Give the terminal back the way the shell had it: input decoding off (the
  // child's keystrokes must not reach a subscriber), raw mode off, reports
  // off, cursor shown, alt screen left. `dispose()` and `suspend()` both end
  // here; `resume()` is its reverse.
  private leaveTerminal(): void {
    if (this.inputAttached) {
      this.input.removeListener('data', this.inputDataHandler);
      if (this.input.isTTY) this.input.setRawMode(false);
      this.input.pause();
      this.pendingInput = '';
      // Reports off first — they were turned on last.
      this.scheme.stop();
      this.out.write((this.options.mouse ? MOUSE_OFF : '') + BRACKETED_PASTE_OFF);
    }
    if (this.terminalEntered) {
      // Show cursor + reset SGR while still in alt-screen, then exit alt-screen
      // so the user's original terminal content returns clean.
      this.out.write(SHOW_CURSOR + RESET + ALT_SCREEN_OFF);
      this.terminalEntered = false;
    }
  }
```

`dispose()` becomes:

```ts
  dispose(): void {
    this.disposed = true;
    // Already handed over: the terminal is the shell's, and writing the
    // leave sequence again would disturb what it shows now.
    if (!this.suspended) this.leaveTerminal();
    this.inputAttached = false;
    if (this.resizeAttached) { … unchanged … }
    // Only now is it safe to print: the alt screen is gone.
    … warnings, unchanged …
  }
```

(`inputAttached` stays `true` across a suspension — it means "a subscriber holds the input", and `resume()` reads it to know whether to take the input back. `dispose()` clears it.)

The pair, after `colorScheme()` / `onColorScheme()`:

```ts
  /**
   * Hand the terminal to another program: alt screen left, cursor shown, raw
   * mode and every report off, and stdin no longer read — so a child gets the
   * terminal as the shell had it, and nothing typed into it reaches a key
   * subscriber. A no-op while suspended, and after dispose.
   * See docs/app.md (handing the terminal over).
   */
  suspend(): void {
    if (this.disposed || this.suspended) return;
    this.suspended = true;
    this.leaveTerminal();
  }

  /**
   * Take the terminal back after `suspend()`: alt screen, cursor hidden, raw
   * mode and reports on, stdin read again. The frame-diff baseline is dropped
   * (the child drew whatever it drew) and the resize subscribers are told, so
   * the app repaints a full frame at whatever size the terminal is now.
   * A no-op when not suspended, and after dispose.
   */
  resume(): void {
    if (this.disposed || !this.suspended) return;
    this.suspended = false;
    this.out.write(ALT_SCREEN_ON + HIDE_CURSOR);
    this.terminalEntered = true;
    if (this.inputAttached) {
      if (this.input.isTTY) this.input.setRawMode(true);
      this.input.on('data', this.inputDataHandler);
      this.input.resume();
      this.out.write(BRACKETED_PASTE_ON + (this.options.mouse ? MOUSE_ON : ''));
      if (this.options.colorScheme !== false) this.scheme.start();
    }
    this.previousBuffer = null;
    for (const h of [...this.resizeSubscribers]) h();
  }
```

`draw()` must not write while suspended: add `if (this.suspended) return;` as its first line (the app may still commit state; the frame arrives on resume).

- [ ] **Step 4: Run** — `npx vitest run packages/tty-backend/src/tty.spec.ts` — expected: all PASS, including the older dispose tests (same bytes, now through `leaveTerminal`).
- [ ] **Step 5: Commit** — `git commit -m "feat(tty-backend): suspend() / resume() hand the terminal over and take it back"`.

---

### Task 3: Ctrl+Z and `SIGCONT` in `TtyBackend`

**Files:**
- Modify: `packages/tty-backend/src/tty.ts` (`TtyBackendOptions`, `inputDataHandler`, `onKey`, `dispose`)
- Test: `packages/tty-backend/src/tty.spec.ts`

**Interfaces:**
- Produces: `TtyBackendOptions.suspendKey?: boolean` (default `true`).

- [ ] **Step 1: Write the failing tests**

```ts
test('Ctrl+Z suspends the backend and stops the process; SIGCONT resumes it', () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
  const on = vi.spyOn(process, 'on');
  try {
    const { stub, writes } = makeStub();
    const stdin = makeStdinStub();
    const b = new TtyBackend(stub, stdin, { colorScheme: false });
    const keys: string[] = [];
    b.onKey((k) => keys.push(k.name));
    const onCont = on.mock.calls.find(([sig]) => sig === 'SIGCONT')?.[1] as (() => void) | undefined;
    expect(onCont).toBeDefined();
    writes.length = 0;

    stdin.emit('data', '\x1a');
    expect(keys).toEqual([]); // not delivered
    expect(writes.at(-1)).toBe(SHOW_CURSOR + RESET + ALT_SCREEN_OFF);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTSTP');

    writes.length = 0;
    onCont!();
    expect(writes[0]).toBe(ALT_SCREEN_ON + HIDE_CURSOR);
    expect(stdin.__rawMode()).toBe(true);
    b.dispose();
  } finally {
    kill.mockRestore(); on.mockRestore();
  }
});

test('suspendKey: false delivers Ctrl+Z as a key', () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
  try {
    const { stub } = makeStub();
    const stdin = makeStdinStub();
    const b = new TtyBackend(stub, stdin, { suspendKey: false });
    const keys: Key[] = [];
    b.onKey((k) => keys.push(k));
    stdin.emit('data', '\x1a');
    expect(keys).toEqual([expect.objectContaining({ name: 'z', ctrl: true })]);
    expect(kill).not.toHaveBeenCalled();
    b.dispose();
  } finally { kill.mockRestore(); }
});

test('SIGCONT after a stop the backend did not ask for (kill -STOP) still takes the terminal back', () => {
  const on = vi.spyOn(process, 'on');
  try {
    const { stub, writes } = makeStub();
    const stdin = makeStdinStub();
    const b = new TtyBackend(stub, stdin, { colorScheme: false });
    b.onKey(() => {});
    const resized = vi.fn(); b.onResize(resized);
    const onCont = on.mock.calls.find(([sig]) => sig === 'SIGCONT')?.[1] as () => void;
    writes.length = 0;
    onCont();
    expect(writes[0]).toBe(ALT_SCREEN_ON + HIDE_CURSOR);
    expect(resized).toHaveBeenCalledTimes(1);
    b.dispose();
  } finally { on.mockRestore(); }
});

test('dispose() removes the SIGCONT listener', () => {
  const before = process.listenerCount('SIGCONT');
  const { stub } = makeStub();
  const b = new TtyBackend(stub, makeStdinStub());
  b.onKey(() => {});
  expect(process.listenerCount('SIGCONT')).toBe(before + 1);
  b.dispose();
  expect(process.listenerCount('SIGCONT')).toBe(before);
});
```

Import `type Key` from `@flowtty/core` in the spec.

- [ ] **Step 2: Run** — `npx vitest run packages/tty-backend/src/tty.spec.ts -t "Ctrl\+Z|SIGCONT|suspendKey"` — expected: FAIL (keys delivered, no `SIGCONT` listener).

- [ ] **Step 3: Implement**

Option, in `TtyBackendOptions`:

```ts
  /** Ctrl+Z suspends the process the way a shell user expects: the terminal
   *  is handed back, `SIGTSTP` stops the process, and `fg` (`SIGCONT`) takes
   *  the terminal again and repaints. On by default. `false` delivers Ctrl+Z
   *  as a key (`{ name: 'z', ctrl: true }`) for an app that uses it — an
   *  editor's undo — and leaves suspension to `useApp().suspend()`.
   *  See docs/app.md (handing the terminal over). */
  suspendKey?: boolean;
```

In `inputDataHandler`, next to the Ctrl+C / Ctrl+D branch:

```ts
      // Ctrl+Z, the shell's suspend, arrives as a key in raw mode too. Hand
      // the terminal back before stopping, so the shell prompt lands on the
      // normal screen; the SIGCONT handler takes it again on `fg`.
      if (key.ctrl && key.name === 'z' && this.options.suspendKey !== false) {
        this.suspend();
        process.kill(process.pid, 'SIGTSTP');
        continue;
      }
```

A handler field, next to `resizeNotify`:

```ts
  // `fg` after Ctrl+Z, or after a `kill -STOP` the backend never saw: either
  // way the terminal is ours again and the screen is whatever the shell left.
  // Marked suspended first when it was not, so resume() re-asserts everything.
  private readonly onContinue = (): void => {
    if (this.disposed) return;
    if (!this.suspended) { this.suspended = true; this.terminalEntered = false; }
    this.resume();
  };
```

Install it where the input is first attached, in `onKey` (after `this.inputAttached = true;`): `process.on('SIGCONT', this.onContinue);`. Remove it in `dispose()`: `if (this.inputAttached) process.removeListener('SIGCONT', this.onContinue);` — placed before `this.inputAttached = false`.

Why in `onKey` and not the constructor: a passive view (no subscriber) never claims raw mode, and the process listener follows the same lazy rule.

- [ ] **Step 4: Run** — `npx vitest run packages/tty-backend/src/tty.spec.ts` — expected: all PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(tty-backend): Ctrl+Z suspends the process, SIGCONT takes the terminal back"`.

---

### Task 4: the same pair on `InlineTtyBackend`

**Files:**
- Modify: `packages/inline-tty-backend/src/InlineTtyBackend.ts`
- Test: `packages/inline-tty-backend/src/InlineTtyBackend.spec.ts`

**Interfaces:**
- Produces: `InlineTtyBackend.suspend(): void`, `resume(): void`; `InlineTtyBackendOptions.suspendKey?: boolean`.

Read the spec file's existing stubs first (`makeStdin` / `makeStdout` or similar — reuse them; do not add a second stub factory).

- [ ] **Step 1: Write the failing tests**

```ts
test('suspend() clears the live region and gives the terminal back; resume() takes it and asks for a repaint', () => {
  const { out, writes } = makeOut();            // the spec's stdout stub
  const input = makeInput();                    // the spec's stdin stub
  const b = new InlineTtyBackend({ stdout: out, stdin: input, height: 2, colorScheme: false });
  const keys: string[] = [];
  b.onKey((k) => keys.push(k.name));
  const resized = vi.fn(); b.onResize(resized);
  const buf = new Buffer(4, 2); buf.set(0, 0, { char: 'a', style: {} });
  b.draw(buf);
  writes.length = 0;

  b.suspend();
  expect(writes).toEqual([BRACKETED_PASTE_OFF, '\r\x1b[1A\x1b[J' + SHOW_CURSOR + RESET]);
  expect(input.listenerCount('data')).toBe(0);
  input.emit('data', 'q');
  expect(keys).toEqual([]);

  writes.length = 0;
  b.resume();
  expect(writes).toEqual([BRACKETED_PASTE_ON]);
  expect(resized).toHaveBeenCalledTimes(1);
  // The next draw starts a fresh region: no erase of rows that are gone.
  writes.length = 0;
  b.draw(buf);
  expect(writes[0]).toBe(HIDE_CURSOR);
  expect(writes[1]!.startsWith('\r')).toBe(false);
  b.dispose();
});

test('dispose() after suspend() writes nothing more', () => {
  const { out, writes } = makeOut();
  const b = new InlineTtyBackend({ stdout: out, stdin: makeInput(), height: 2 });
  b.onKey(() => {});
  b.draw(new Buffer(4, 2));
  b.suspend(); writes.length = 0;
  b.dispose();
  expect(writes).toEqual([]);
});
```

Adjust the option names (`stdout` / `stdin` / `height`) to what `InlineTtyBackendOptions` actually calls them — read the interface at the top of the file.

- [ ] **Step 2: Run** — `npx vitest run packages/inline-tty-backend -t "suspend"` — expected: FAIL, `b.suspend is not a function`.

- [ ] **Step 3: Implement**

Field `private suspended = false;` next to `disposed`. Extract from `dispose()`:

```ts
  // Give the terminal back: input decoding off, raw mode off, paste reports
  // off, the live region erased and the cursor shown. `dispose()` and
  // `suspend()` both end here; `resume()` is the reverse — the region itself
  // comes back with the next draw.
  private leaveTerminal(): void {
    if (this.inputAttached) {
      this.input.removeListener('data', this.inputDataHandler);
      if (this.input.isTTY) this.input.setRawMode(false);
      this.input.pause();
      this.pendingInput = '';
      this.scheme.stop();
      this.out.write(BRACKETED_PASTE_OFF);
    }
    if (this.cursorHidden) {
      this.out.write(this.eraseLiveRegion() + SHOW_CURSOR + RESET);
      this.cursorHidden = false;
      this.liveLines = [];
    }
  }
```

Careful: today `dispose()` writes `SHOW_CURSOR + RESET + '\n'` and keeps the live region on screen (the last frame stays in the scrollback). Keep that: `leaveTerminal(erase: boolean)` — `suspend()` passes `true` (a child must start on a clean line), `dispose()` passes `false` and writes `SHOW_CURSOR + RESET + '\n'` as before. So:

```ts
    if (this.cursorHidden) {
      this.out.write((erase ? this.eraseLiveRegion() : '') + SHOW_CURSOR + RESET + (erase ? '' : '\n'));
      this.cursorHidden = false;
      if (erase) this.liveLines = [];
    }
```

`dispose()`:

```ts
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.suspended) this.leaveTerminal(false);
    if (this.inputAttached) process.removeListener('SIGCONT', this.onContinue);
    this.inputAttached = false;
    … resize teardown and warnings, unchanged …
  }
```

The pair (log-only mode has no terminal to hand over — both are no-ops there):

```ts
  /** Hand the terminal to another program: the live region is erased, the
   *  cursor shown, raw mode and paste reports off, stdin no longer read. The
   *  scrollback above stays. A no-op in log-only mode, while suspended, and
   *  after dispose. See docs/app.md (handing the terminal over). */
  suspend(): void {
    if (this.logOnly || this.disposed || this.suspended) return;
    this.suspended = true;
    this.leaveTerminal(true);
  }

  /** Take the terminal back after `suspend()`: raw mode, paste reports and
   *  stdin again, and the resize subscribers told, so the app draws a fresh
   *  live region below whatever the child printed. */
  resume(): void {
    if (this.logOnly || this.disposed || !this.suspended) return;
    this.suspended = false;
    if (this.inputAttached) {
      if (this.input.isTTY) this.input.setRawMode(true);
      this.input.on('data', this.inputDataHandler);
      this.input.resume();
      this.out.write(BRACKETED_PASTE_ON);
      if (this.followsScheme) this.scheme.start();
    }
    for (const h of [...this.resizeSubscribers]) h();
  }
```

`draw()` and `printStatic()`: first line `if (this.logOnly || this.suspended) return;` (for `printStatic`, keep the log-only branch working: check `suspended` after it).

Ctrl+Z and `SIGCONT`: the same `suspendKey` option (same doc comment as Task 3), the same branch in `inputDataHandler`, the same `onContinue` field except it does not touch `terminalEntered` (there is none): `if (!this.suspended) this.suspended = true; this.resume();`. `process.on('SIGCONT', this.onContinue)` in `onKey` after `this.inputAttached = true;`.

- [ ] **Step 4: Run** — `npx vitest run packages/inline-tty-backend` — expected: all PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(inline-tty-backend): suspend() / resume(), Ctrl+Z and SIGCONT"`.

---

### Task 5: `render()`: `suspend(fn)` on the handle and on `useApp()`

**Files:**
- Modify: `packages/react/src/context/appContext.ts`
- Modify: `packages/react/src/hooks/useApp.ts` (doc comment)
- Modify: `packages/react/src/internal/render.ts`
- Test: `packages/react/src/internal/render.spec.ts`

**Interfaces:**
- Consumes: `Backend.suspend?` / `resume?`, `TestBackend.suspended`.
- Produces: `RenderHandle.suspend<T>(fn: () => T | Promise<T>): Promise<T>`, `AppApi.suspend` with the same signature.

- [ ] **Step 1: Write the failing tests**

```ts
test('suspend(fn) hands the terminal over for the callback and repaints once after it', async () => {
  const backend = new TestBackend(8, 1);
  let setLabel!: (s: string) => void;
  function App() {
    const [label, set] = useState('before');
    setLabel = set;
    return <Text>{label}</Text>;
  }
  const app = await render(<App />, backend);
  await flushAsync(backend);
  const frames = backend.frames.length;

  const result = await app.suspend(async () => {
    expect(backend.suspended).toBe(true);
    act(() => setLabel('after'));
    await flushAsync(backend);
    expect(backend.frames.length).toBe(frames); // nothing painted while suspended
    return 42;
  });

  expect(result).toBe(42);
  expect(backend.suspended).toBe(false);
  expect(backend.suspensions).toBe(1);
  await flushAsync(backend);
  expect(backend.frames.length).toBe(frames + 1);
  expect(backend.lastFrame).toBe('after');
  app.unmount();
});

test('suspend(fn) resumes when the callback throws, and rethrows', async () => {
  const backend = new TestBackend(8, 1);
  const app = await render(<Text>x</Text>, backend);
  await expect(app.suspend(() => { throw new Error('vim: not found'); })).rejects.toThrow('vim: not found');
  expect(backend.suspended).toBe(false);
  app.unmount();
});

test('a nested suspend() is refused', async () => {
  const backend = new TestBackend(8, 1);
  const app = await render(<Text>x</Text>, backend);
  await app.suspend(async () => {
    await expect(app.suspend(() => {})).rejects.toThrow(/already suspended/);
  });
  app.unmount();
});

test('useApp().suspend from a key handler', async () => {
  const backend = new TestBackend(8, 1);
  let done: Promise<unknown> | undefined;
  function App() {
    const { suspend } = useApp();
    useInput((key) => { if (key.name === 'e') done = suspend(() => 'edited'); });
    return <Text>x</Text>;
  }
  const app = await render(<App />, backend);
  await flushAsync(backend);
  backend.press({ name: 'e' });
  expect(backend.suspended).toBe(true);
  await expect(done).resolves.toBe('edited');
  expect(backend.suspended).toBe(false);
  app.unmount();
});
```

Use the spec's existing imports (`render`, `TestBackend`, `flushAsync`, `Text`, `useState`, `useInput`, `useApp`, `act` from `react`) — add what is missing.

- [ ] **Step 2: Run** — `npx vitest run packages/react/src/internal/render.spec.ts -t "suspend"` — expected: FAIL, `app.suspend is not a function`.

- [ ] **Step 3: Implement**

`appContext.ts`, in `AppApi` after `copy`:

```ts
  /** Hand the terminal to another program for the duration of `fn` — an
   *  editor, a pager, `git commit` — and take it back afterwards with a full
   *  repaint; component state survives. Resolves with what `fn` returned, and
   *  rejects with what it threw (the terminal is taken back either way), or
   *  when a suspension is already in progress. Where the backend has no
   *  terminal to hand over, `fn` simply runs. See docs/app.md (handing the
   *  terminal over). */
  suspend<T>(fn: () => T | Promise<T>): Promise<T>;
```

and in the default context: `suspend: async (fn) => fn(),`.

`useApp.ts`: add to the doc comment: "`suspend(fn)` hands the terminal to another program for the duration of `fn` (docs/app.md — handing the terminal over)".

`render.ts`:

- `RenderHandle`: add the same `suspend<T>` member with a doc comment ("from outside the tree — the same thing `useApp().suspend()` does").
- State next to `unmounted`: `let suspended = false;` and `let paints = 0;`.
- `draw()`: `if (unmounted || suspended) return;` … and `paints += 1;` after `backend.draw(...)`.
- The function, next to `copy`:

```ts
  // One suspension at a time: the backend's suspend/resume are not a stack,
  // and a second hand-over from inside the first would take the terminal back
  // under the child's feet. While suspended, draw() is a no-op — state
  // updates still commit, and the frame they add up to is painted on resume.
  const suspend = async <T,>(fn: () => T | Promise<T>): Promise<T> => {
    if (unmounted) throw new Error('flowtty: suspend() after unmount');
    if (suspended) throw new Error('flowtty: suspend() while already suspended');
    suspended = true;
    backend.suspend?.();
    try {
      return await fn();
    } finally {
      suspended = false;
      if (!unmounted) {
        // A TTY backend's resume() tells the resize subscribers, and that
        // repaints; count paints so a backend that does not is painted here.
        const before = paints;
        backend.resume?.();
        if (paints === before) draw();
      }
    }
  };
```

(`render.ts` is `.ts`, so `<T,>` is not needed — write `async <T>(fn: …)`.)

Add `suspend` to `appApi` and to `handle`.

- [ ] **Step 4: Run** — `npx vitest run packages/react/src/internal/render.spec.ts` then `npm test` and `npm run typecheck` — expected: all PASS, typecheck clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(react): useApp().suspend(fn) and handle.suspend(fn) hand the terminal over"`.

---

### Task 6: docs and changelog

**Files:**
- Modify: `docs/app.md` (new section before "Root abort signal")
- Modify: `docs/writing-a-backend.md` (the contract block + a bullet after `copy`)
- Modify: `docs/testing.md` (where `TestBackend`'s fields are listed — find `clipboardAvailable`)
- Modify: `CHANGELOG.md` (`## Unreleased` / `### Added`, above `## 1.0.0-alpha.22`)

- [ ] **Step 1: `docs/app.md`** — a section:

```markdown
## Handing the terminal over

Open `$EDITOR` on a file, page through a diff, run `git commit`: another program
needs the real terminal — the normal screen, cooked mode, no mouse or paste
reporting — and the app needs all of it back afterwards. `suspend(fn)`, on
`useApp()` and on the render handle, does both:

```tsx
function Note({ path }: { path: string }) {
  const { suspend } = useApp();
  useInput((key) => {
    if (key.name === 'e') {
      void suspend(() => spawnSync(process.env.EDITOR ?? 'vi', [path], { stdio: 'inherit' }));
    }
  });
  // …
}
```

While `fn` runs the terminal is the child's: the alternate screen is left (an
inline app clears its live region), the cursor is shown, raw mode and every
report are off, and nothing typed reaches a `useInput` handler. When `fn`
returns — or throws; the terminal is taken back either way, and the error is
rethrown — the app repaints a full frame at whatever size the terminal is now.
Component state survives: nothing is unmounted. State updates committed
meanwhile add up to that one frame.

`suspend` resolves with what `fn` returned. One suspension at a time: a call
while another is in progress rejects. Where the backend has no terminal to hand
over (`TestBackend`, `renderToString`), `fn` simply runs; `TestBackend` records
the hand-over as `suspended` / `suspensions`, so an app can test its editor
flow.

**Ctrl+Z** does the same for the shell: the TTY backends hand the terminal
back, stop the process with `SIGTSTP`, and take the terminal again with a full
repaint when `fg` continues it. An app that uses Ctrl+Z itself — an editor's
undo — turns that off with `suspendKey: false` in the backend options, and
Ctrl+Z arrives as `{ name: 'z', ctrl: true }`. A `kill -STOP` / `fg` cycle the
app never asked for is handled the same way on `SIGCONT`.
```

- [ ] **Step 2: `docs/writing-a-backend.md`** — in the contract block, after `copy?`:

```ts
  suspend?(): void;                                  // hand the terminal to another program
  resume?(): void;                                   // take it back, drop the diff baseline, repaint
```

and a bullet after the `copy` bullet:

```markdown
- **`suspend`** and **`resume`** are what `useApp().suspend(fn)` calls around
  `fn`, and what Ctrl+Z uses. `suspend` undoes what the constructor and `onKey`
  did — leave the alternate screen or clear the live region, show the cursor,
  turn reports off, leave raw mode, and stop reading input, so nothing typed
  into the child reaches a subscriber. `resume` redoes it, forgets any
  frame-diff baseline (the next `draw` must be a full frame) and calls the
  `onResize` subscribers — that is what makes the app repaint, and the terminal
  may well have been resized meanwhile. Make `dispose` after `suspend` write
  nothing: the terminal is not yours then. Omit both where there is no terminal
  to hand over; `render()` then runs `fn` and nothing else.
```

- [ ] **Step 3: `docs/testing.md`** — next to `clipboardAvailable`, one line: "`suspended` / `suspensions` — whether the app has handed the terminal over right now, and how many times it has (see docs/app.md, handing the terminal over)." Match the surrounding format.

- [ ] **Step 4: `CHANGELOG.md`**:

```markdown
## Unreleased

### Added

- `useApp().suspend(fn)` and `handle.suspend(fn)`: hand the terminal to another
  program — `$EDITOR`, a pager, `git commit` — for the duration of `fn`, and
  take it back with a full repaint and the component state intact. Backed by a
  new optional `suspend()` / `resume()` on `Backend`, implemented by both TTY
  backends and recorded by `TestBackend`. See docs/app.md (handing the terminal
  over).
- Ctrl+Z suspends the process: the TTY backends hand the terminal back, stop
  with `SIGTSTP`, and take it again on `fg`. `suspendKey: false` delivers Ctrl+Z
  as a key instead. A `SIGCONT` after a stop the app never asked for repaints
  too.
```

- [ ] **Step 5: Run** — `npm test && npm run typecheck` — expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "docs: handing the terminal over — suspend/resume, Ctrl+Z"`.

---

## Self-review

- Spec coverage: capability (T1–T4), handle + `useApp` (T5), Ctrl+Z default with opt-out and `SIGCONT` for `kill -STOP` (T3, T4), `TestBackend` recording (T1), signals during suspension → `dispose()` writes nothing (T2, T4), docs (T6). Out: `modifyOtherKeys` (never enabled), pty test (stream stubs assert the same bytes), Windows.
- Names used across tasks: `suspend` / `resume` / `suspended` / `suspensions` / `suspendKey` / `leaveTerminal` / `onContinue` — consistent.
