# flowtty DialogHost Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** convert `DialogHost` from single-slot to a stack so dialogs can nest. Currently `openDialog` cancels any previously-open dialog (`src/dialog-host.ts:38-40`); after this plan, `openDialog` PUSHES a new dialog on top of the stack without disturbing lower entries. `close()` (from `useDialog().done` / `.cancel`) POPS the TOP dialog. Visually, dialogs render as overlays in stack order — last on top. Input goes to the TOP dialog only; lower dialogs and host content are muted.

This unblocks the articles dogfood's wizard-as-dialog with a true nested "+ new tag" sub-dialog (was: separate state-machine step inside the wizard component; will become: a 2nd-level dialog that pops back to the still-alive wizard on close).

**Architecture:** Replace `dialog: PendingDialog | null` with `stack: PendingDialog[]`. `openDialog` becomes `setStack(s => [...s, entry])`; `close` becomes `setStack(s => { resolve top; return s.slice(0, -1) })`. Render: host content + one `<Box position:absolute>` per stack entry (tree order = paint order = stack order — lower stack entries paint first, top entry paints last on top, via M1f's two-pass paint). Input gating: each layer wraps its subtree in `InputContext.Provider` set to the real `outerSource` ONLY if it's the top (or, for host content, only if stack is empty); otherwise muted.

**Tech Stack:** Same as recent — TypeScript ESM, React 19, Vitest 4.

**Out of scope:**
- Stack-aware Esc handling at the host level (current model: each dialog component decides what its own input does; including whether Esc calls `cancel()`). Nothing changes here — `useInput` inside the top dialog fires on Esc; the dialog's handler calls `useDialog().cancel()` if appropriate, which pops the top.
- Backdrop clicks / mouse routing — flowtty has no mouse support yet.
- Modal vs. modeless: all dialogs are modal in the input sense (block lower layers). Visually, lower dialogs ARE still rendered (so you can SEE the nesting context); they just don't react.

---

## Scope check

Single subsystem (`dialog-host.ts`). Tests in `dialog-host.test.ts` (already exists from M1c.4). One plan, **2 tasks**: stack + tests, then README.

---

## File Structure

```
src/
  dialog-host.ts          # MODIFY — stack state instead of single slot; render loop instead of single render; input gating per-level
  dialog-host.test.ts     # MODIFY — new tests: two openDialog don't cancel; close pops top only; nested input gating; deep stack
README.md                 # MODIFY — update DialogHost section to reflect stack semantics
```

---

### Task 1: stack state + render loop + per-level input gating + tests

**Files:**
- Modify: `src/dialog-host.ts`
- Modify: `src/dialog-host.test.ts`

- [ ] **Step 1: Read first** — `src/dialog-host.ts` (current implementation; ~82 lines), `src/dialog-host.test.ts` (existing tests; understand the helper pattern), `src/input-context.ts` (InputContext shape).

- [ ] **Step 2: Modify `src/dialog-host.ts`** — replace the single-slot state + render with a stack.

Replace the whole `DialogHost` function. Reference shape:

```ts
export function DialogHost(props: { children?: ReactNode }): ReactNode {
  const outerSource = useContext(InputContext);
  const [stack, setStack] = useState<PendingDialog[]>([]);

  const mutedSource = useMemo<InputSource>(
    () => ({ subscribe: () => () => {} }),
    [],
  );

  // Pop the top dialog, resolve it with the given result. Lower stack entries
  // are untouched (still rendered, still pending their own resolution).
  const close = useCallback((result: DialogResult<unknown>) => {
    setStack((s) => {
      if (s.length === 0) return s;
      const top = s[s.length - 1]!;
      top.resolve(result);
      return s.slice(0, -1);
    });
  }, []);

  // Push a new dialog onto the top of the stack. Previous dialogs are NOT
  // cancelled — they stay open, just visually behind + input-muted until the
  // newly-opened dialog closes.
  const openDialog = useCallback(<T,>(element: ReactNode): Promise<DialogResult<T>> => {
    return new Promise<DialogResult<T>>((resolve) => {
      setStack((s) => [
        ...s,
        { element, resolve: resolve as (r: DialogResult<unknown>) => void },
      ]);
    });
  }, []);

  const hostApi = useMemo<DialogHostApi>(() => ({ openDialog }), [openDialog]);
  const dialogApi = useMemo<DialogResultApi>(
    () => ({
      done: (value) => close({ status: 'done', value }),
      cancel: () => close({ status: 'cancelled' }),
    }),
    [close],
  );

  const hasOpenDialog = stack.length > 0;

  return createElement(
    DialogHostContext.Provider,
    { value: hostApi },
    // Host content: muted when ANY dialog is open.
    createElement(
      InputContext.Provider,
      { value: hasOpenDialog ? mutedSource : outerSource },
      props.children,
    ),
    // Stack: render each dialog as a full-screen absolute overlay in stack
    // order. Tree order = paint order (M1f two-pass) so the top stack entry
    // paints on top of lower entries. Input gating: only the topmost dialog
    // gets the real outerSource; lower dialogs get mutedSource.
    ...stack.map((d, i) => {
      const isTop = i === stack.length - 1;
      return createElement(
        Box,
        {
          key: i,
          position: 'absolute',
          top: 0, left: 0,
          width: '100%', height: '100%',
          justifyContent: 'center', alignItems: 'center',
        },
        createElement(
          InputContext.Provider,
          { value: isTop ? outerSource : mutedSource },
          // dialogApi resolves the TOP — all dialogs share the same instance,
          // but only the top dialog can interact (input is gated), so calls
          // from lower dialogs (e.g. via async timers) would pop the wrong
          // entry. Accept that constraint; flag in README if it bites.
          createElement(DialogResultContext.Provider, { value: dialogApi }, d.element),
        ),
      );
    }),
  );
}
```

Key change from the original:
- `useState<PendingDialog | null>(null)` → `useState<PendingDialog[]>([])`
- `setDialog((current) => { if (current) cancel; return new })` → `setStack((s) => [...s, new])`
- `setDialog(null)` → `setStack((s) => s.slice(0, -1))` with `top.resolve(result)`
- `dialog ? ... : null` → `...stack.map(...)`
- Input gating becomes per-level: muted unless top OR host content with empty stack

- [ ] **Step 3: Append failing tests to `src/dialog-host.test.ts`:**

```ts
describe('DialogHost stack', () => {
  test('two consecutive openDialog calls stack instead of cancelling', async () => {
    // First openDialog returns a promise that does NOT resolve when second opens.
    // The first dialog stays alive (its promise is unresolved).
    const backend = new TestBackend(20, 5);
    let openA!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    function Host() {
      const { openDialog } = useDialogHost();
      openA = openDialog;
      return createElement('flowtty-box', { width: 20, height: 5 });
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync();
    const a = openA(createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }));
    const b = openA(createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }));
    await flushAsync();
    // Race a non-promise tick — neither should be resolved yet.
    let resolvedA = false; let resolvedB = false;
    a.then(() => { resolvedA = true; });
    b.then(() => { resolvedB = true; });
    await flushAsync();
    expect(resolvedA).toBe(false);
    expect(resolvedB).toBe(false);
    handle.unmount();
  });

  test('close (via dialogApi.done) resolves the TOP dialog only; lower stays open', async () => {
    const backend = new TestBackend(20, 5);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    let topApi: DialogResultApi | null = null;
    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      return createElement('flowtty-box', { width: 20, height: 5 });
    }
    function CaptureApi() {
      topApi = useDialog();
      return null;
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync();
    // Stack: a (bottom), b (top)
    const a = openD<string>(createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }));
    const b = openD<string>(createElement(CaptureApi));
    await flushAsync();
    expect(topApi).not.toBeNull();
    let aResult: DialogResult<string> | null = null;
    let bResult: DialogResult<string> | null = null;
    a.then((r) => { aResult = r; });
    b.then((r) => { bResult = r; });
    topApi!.done('top-result');
    await flushAsync();
    // b resolved; a still pending
    expect(bResult).not.toBeNull();
    expect(bResult).toEqual({ status: 'done', value: 'top-result' });
    expect(aResult).toBeNull();
    handle.unmount();
  });

  test('three-deep stack: pop one at a time in order', async () => {
    const backend = new TestBackend(20, 5);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    const apis: DialogResultApi[] = [];
    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      return null;
    }
    function CaptureApi() {
      apis.push(useDialog());
      return null;
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync();
    const p1 = openD<string>(createElement(CaptureApi));
    await flushAsync();
    const p2 = openD<string>(createElement(CaptureApi));
    await flushAsync();
    const p3 = openD<string>(createElement(CaptureApi));
    await flushAsync();
    // Apis array now has at least 3 entries (one per mount); the LAST one is
    // the top dialog's. Easier path: each Capture appends; the most recently
    // pushed one is the top.
    const topApi = apis[apis.length - 1]!;
    const results: Array<DialogResult<string> | null> = [null, null, null];
    p1.then((r) => { results[0] = r; });
    p2.then((r) => { results[1] = r; });
    p3.then((r) => { results[2] = r; });
    // Pop p3
    topApi.done('three');
    await flushAsync();
    expect(results[2]).toEqual({ status: 'done', value: 'three' });
    expect(results[1]).toBeNull();
    expect(results[0]).toBeNull();
    // Now p2 is top; its api should be in apis. After p3 popped, render fires
    // again — Capture inside p2 was already mounted; its api is in apis at
    // index apis.length - 2 (before the p3 capture). All dialog components
    // share dialogApi which always pops top — so call apis[<any>].done.
    apis[apis.length - 2]!.done('two');
    await flushAsync();
    expect(results[1]).toEqual({ status: 'done', value: 'two' });
    expect(results[0]).toBeNull();
    // Pop p1
    apis[apis.length - 3]!.done('one');
    await flushAsync();
    expect(results[0]).toEqual({ status: 'done', value: 'one' });
    handle.unmount();
  });

  test('useInput in a lower dialog does NOT fire while a higher dialog is open', async () => {
    const backend = new TestBackend(20, 5);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    const lowerKeys: string[] = [];
    const upperKeys: string[] = [];
    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      return null;
    }
    function LowerDialog() {
      useInput((key) => { lowerKeys.push(key.name); });
      return null;
    }
    function UpperDialog() {
      useInput((key) => { upperKeys.push(key.name); });
      return null;
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync();
    openD(createElement(LowerDialog));
    await flushAsync();
    openD(createElement(UpperDialog));
    await flushAsync();
    backend.press({ name: 'x', sequence: 'x', ctrl: false, meta: false, shift: false });
    await flushAsync();
    expect(upperKeys).toEqual(['x']);
    expect(lowerKeys).toEqual([]); // muted while upper is on top
    handle.unmount();
  });

  test('host content useInput is muted while ANY dialog is open', async () => {
    const backend = new TestBackend(20, 5);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    const hostKeys: string[] = [];
    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      useInput((key) => { hostKeys.push(key.name); });
      return null;
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync();
    // Before any dialog: host receives keys.
    backend.press({ name: 'a', sequence: 'a', ctrl: false, meta: false, shift: false });
    await flushAsync();
    expect(hostKeys).toEqual(['a']);
    // Open a dialog; host is now muted.
    openD(createElement('flowtty-box', { width: 1, height: 1 }));
    await flushAsync();
    backend.press({ name: 'b', sequence: 'b', ctrl: false, meta: false, shift: false });
    await flushAsync();
    expect(hostKeys).toEqual(['a']); // 'b' did NOT reach host
    handle.unmount();
  });
});
```

(Imports needed in the test file beyond what's already there: `useInput`, `type DialogResultApi`, `type DialogResult`, `type ReactNode`. Read the existing test file to see what's already imported and add the rest.)

- [ ] **Step 4: Verify**
  - `npx vitest run src/dialog-host.test.ts` — passes (existing + 5 new).
  - `npx vitest run` — full suite green (current count + 5).
  - `npm run typecheck` — clean.

Common pitfalls:
- **`s[s.length - 1]` under noUncheckedIndexedAccess**: typed as `T | undefined`. Use `!` after the length check: `s[s.length - 1]!`.
- **`apis` array in "three-deep" test**: each Capture component mounts ONCE per opening; subsequent re-renders don't append. The test assumes apis grows monotonically per push. If the implementation re-mounts on each setStack, apis would have MORE than 3 entries — adjust the test indexing (use `.at(-1)` style logic).
- **`backend.press` ergonomics**: from M1b — TestBackend has `press(key)` that fires a synthetic key. Check the actual signature: it might be `press(key: Key)` taking a full Key object as shown in the test, OR it might take a sequence string. Adapt.

- [ ] **Step 5: Commit**
```bash
git add src/dialog-host.ts src/dialog-host.test.ts
git commit -m "feat: DialogHost stack — openDialog pushes; close pops top; input gates by depth"
```

---

### Task 2: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find where DialogHost / useDialog is documented (likely under M1c.4 mention).

- [ ] **Step 2: Update the DialogHost section** to reflect stack semantics. Replace single-slot mentions with stack semantics. Key points to convey:

```md
### DialogHost (stack)

`<DialogHost>` lets components anywhere in its subtree open dialogs via
`useDialogHost().openDialog(element)`. Each call **pushes** a new dialog on
top of the stack — previously open dialogs stay alive, render behind the new
one, and only receive input when they become the top of the stack again.

`useDialog().done(value)` / `.cancel()` **pop** the top dialog, resolving the
`openDialog` promise it returned. Lower stack entries are untouched.

**Input gating:**

- Host content's `useInput` is muted whenever ANY dialog is open.
- Lower dialogs' `useInput` is muted while a higher dialog is on top.
- Only the topmost dialog receives keys.

**Caveat:** all dialogs share a single `dialogApi` instance — calling `done()` or `cancel()` always pops the TOP, regardless of which dialog component triggered it. Since input is gated to the top dialog, normal user-driven flows are safe; the edge case is async side-effects from a lower dialog (e.g. a useEffect / setTimeout) that calls `done` after a new dialog opened on top — it would pop the wrong entry. Wrap async work in `isMounted` guards if you need to be paranoid.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document DialogHost stack semantics"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- openDialog pushes (doesn't cancel) → Task 1 (test).
- close pops top (lower stays) → Task 1 (test).
- Three-deep stack pop-in-order → Task 1 (test).
- Input gating: top dialog gets keys; lower muted; host muted → Task 1 (two tests).
- README → Task 2.

**2. Placeholder scan:** none.

**3. Type consistency:**
- `stack: PendingDialog[]` — array of the existing `PendingDialog` shape.
- `setStack: (updater: (prev: PendingDialog[]) => PendingDialog[]) => void` — standard React setState.
- Other types (`DialogHostApi`, `DialogResultApi`, `DialogResult<T>`) unchanged.

**Risks worth flagging:**

1. **All dialogs share dialogApi**: documented caveat. The "right" fix would be per-dialog dialogApi (only the dialog's OWN done/cancel pops that dialog). Adds complexity. Defer until it bites.

2. **Stack re-render churn**: each setStack triggers a render of all open dialogs. With M1e frame-diff this is cheap (only changed cells written), but conceptually all dialogs re-render. Acceptable.

3. **Visual overlap**: lower dialogs are still painted underneath the top one. With centered overlays of similar size, the lower one's edges might peek out around the top dialog. Acceptable for now; the user can solve via fullscreen-sized dialogs or `backgroundColor` to mask.

4. **The "host muted" test** depends on `useInput` being driven by InputContext. Confirmed in `src/use-input.ts` (`useContext(InputContext)`). If the implementation deviates, test will catch.

5. **TestBackend.press signature** — verify before writing the input tests. If it takes a sequence string, adapt the Key-object calls to match.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/dialog-stack.md`. Subagent-driven execution per the user's request — Task 1 (Sonnet, focused refactor of dialog-host.ts + 5 tests), then Task 2 (Haiku, README + build). After this merges, articles dogfood resumes with wizard-as-dialog + true nested add-tag dialog.
