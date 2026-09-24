import { createElement, type ReactNode } from 'react';
import { UNKNOWN_COLOR_SCHEME, type Backend, type Buffer, type Key, type TerminalColorScheme } from '@flowtty/core';
import { getYoga, computeLayout, contentHeight, paint, SelectionController, type Point } from '@flowtty/core/host';
import { createRoot, type Root } from './reconciler.js';
import { InputContext, type InputSource, type KeySubscriber } from '../context/inputContext.js';
import { BackendContext } from '../context/backendContext.js';
import { AbortContext } from '../context/abortContext.js';
import { AppContext, type AppApi } from '../context/appContext.js';
import { TerminalSizeProvider } from '../hooks/useTerminalSize.js';
import { ColorSchemeProvider } from '../hooks/useColorScheme.js';
import { ErrorBoundary, type ErrorSource } from '../components/ErrorBoundary.js';

// One backend key listener per render tree; useInput subscribers are managed
// here, not registered with the backend individually. Each key dispatches
// inside a single root.flushSync — which first flushes pending passive effects
// (see Root.flushSync) and THEN snapshots the subscriber set — so
// (un)subscriptions committed just before the key (dialog opened, box turned
// inert) take effect before delivery. With per-subscriber backend listeners
// that ordering is impossible: the backend's fan-out list is snapshotted
// before any React work runs, so a stale handler still receives the key that
// should have been muted.
// The backend listener attaches on the first subscriber and detaches on the
// last, preserving TtyBackend's lazy raw-mode claim and unmount cleanup.
// `beforeDispatch` is the render root's own look at each key — the selection
// controller — and runs first, outside flushSync: it is not React state, and
// the key still goes on to every subscriber afterwards. `afterDispatch` runs
// once the commit is done, which is where anything the key asked to be redrawn
// belongs: by then React has queued its own paint (resetAfterCommit →
// queueMicrotask), so work queued there lands after it and can stand down.
function makeKeySource(
  backend: Backend & { onKey: NonNullable<Backend['onKey']> },
  root: Root,
  beforeDispatch?: (key: Key) => void,
  afterDispatch?: () => void,
): InputSource {
  // Two phases: the capture handlers first, then the ordinary ones — each in
  // subscription order, which is mount order (a child subscribes before its
  // parent, since effects run inside-out), stopping at the first that consumes.
  const capture = new Set<KeySubscriber>();
  const bubble = new Set<KeySubscriber>();
  const count = () => capture.size + bubble.size;
  let detachBackend: (() => void) | undefined;
  return {
    subscribe(handler, options) {
      if (count() === 0) {
        detachBackend = backend.onKey((key) => {
          beforeDispatch?.(key);
          let consumed = false;
          root.flushSync(() => {
            for (const s of [...capture, ...bubble]) {
              if (s(key) === true) { consumed = true; break; }
            }
          });
          afterDispatch?.();
          return consumed;
        });
      }
      const phase = options?.capture ? capture : bubble;
      phase.add(handler);
      return () => {
        phase.delete(handler);
        if (count() === 0) {
          detachBackend?.();
          detachBackend = undefined;
        }
      };
    },
  };
}

export interface RenderOptions {
  /** Called when an error is caught at ANY layer (React boundary, process-level handler).
   *  After this fires, flowtty has already called backend.dispose(); the terminal is restored.
   *  Default behavior (when onError not provided): print error to stderr + process.exit(1). */
  onError?: (info: { error: unknown; source: ErrorSource }) => void;
  /** Let a drag over the committed frame select text — inverse cells, no
   *  re-layout and no re-render. Default true, and inert until the backend
   *  delivers mouse keys, so an app without `{ mouse: true }` pays nothing.
   *  Set false to leave the frame entirely to the app.
   *  See docs/input.md (selection). */
  selection?: boolean;
  /** Put what a drag selected on the system clipboard when the button comes
   *  back up. Default true, and free where the backend has no clipboard — it
   *  simply reports that nothing was delivered. Set false to leave the
   *  clipboard entirely to the app; `onCopy` still fires either way.
   *  See docs/input.md (selection). */
  copyOnSelect?: boolean;
  /** Something was copied: by a finished drag (`source: 'selection'`) or by the
   *  app itself through `useApp().copy()` (`source: 'api'`).
   *
   *  Fires even when `delivered` is false — the terminal has no clipboard
   *  sequence, the text was too large, or `copyOnSelect: false` — which is what
   *  lets an app fall back on `pbcopy` / `wl-copy` / `clip.exe` of its own. An
   *  empty selection fires nothing at all. See docs/app.md (the clipboard). */
  onCopy?: (event: CopyEvent) => void;
}

/** What `onCopy` is called with. See docs/app.md (the clipboard). */
export interface CopyEvent {
  /** The text that was copied, exactly as it went to the backend. */
  text: string;
  /** Whether a clipboard sequence was actually written. `false` where the
   *  terminal has none, where the backend refused the text (too large), and
   *  where `copyOnSelect: false` turned the write off. It says the bytes went
   *  out, not that the clipboard changed — no terminal answers that. */
  delivered: boolean;
  /** `'selection'` for a finished drag, `'api'` for `useApp().copy()` or
   *  `RenderHandle.copy()`. */
  source: 'selection' | 'api';
}

// SIGINT only arrives as a signal when stdin is not in raw mode (no key
// subscriber), or from `kill -INT`; in raw mode Ctrl-C is a key the backend handles.
const TERMINATION_SIGNALS = ['SIGTERM', 'SIGHUP', 'SIGINT'] as const;

export interface RenderHandle {
  /** Unmount the tree and restore the terminal. Idempotent. */
  unmount(): void;
  /**
   * Resolves once the app is gone and the backend has restored the terminal —
   * the place to print a summary or set an exit code. Resolves with the value
   * passed to `useApp().exit(value)`, or `undefined` for a plain unmount. Also
   * resolves after a handled error (the error itself goes to `onError`).
   */
  waitUntilExit(): Promise<unknown>;
  /** Ring the terminal bell, from outside the tree — the same thing
   *  `useApp().bell()` does. Silent when the backend cannot ring one, and after
   *  unmount. See docs/app.md (getting attention). */
  bell(): void;
  /** Post a desktop notification, from outside the tree — the same thing
   *  `useApp().notify()` does. Silent when the backend cannot post one, and
   *  after unmount. See docs/app.md (getting attention). */
  notify(title: string, body?: string): void;
  /** Put `text` on the system clipboard, from outside the tree — the same thing
   *  `useApp().copy()` does. Returns whether a clipboard sequence was written:
   *  false when the backend has no clipboard, when it refused the text, and
   *  after unmount. Fires `onCopy` with `source: 'api'`.
   *  See docs/app.md (the clipboard). */
  copy(text: string): boolean;
  /** Hand the terminal to another program for the duration of `fn`, from
   *  outside the tree — the same thing `useApp().suspend()` does. Resolves with
   *  what `fn` returned; rejects with what it threw, after unmount, and while
   *  another suspension is in progress. See docs/app.md (handing the terminal
   *  over). */
  suspend<T>(fn: () => T | Promise<T>): Promise<T>;
  /** Select from `anchor` to `head` (frame cells, both inclusive) from outside
   *  the tree — the same thing `useApp().select()` does. Returns the text.
   *  See docs/app.md (selecting from code). */
  select(anchor: Point, head: Point): string;
  /** Select the word under a cell — the same thing `useApp().selectWord()` does. */
  selectWord(x: number, y: number): string;
  /** Select the line under a cell — the same thing `useApp().selectLine()` does. */
  selectLine(x: number, y: number): string;
  /** Drop whatever is selected — the same thing `useApp().clearSelection()` does. */
  clearSelection(): void;
  /** Whether the terminal is light or dark, as of now — the same answer
   *  `useApp().colorScheme` gives inside the tree. See docs/app.md (the color
   *  scheme). */
  readonly colorScheme: TerminalColorScheme;
}

export async function render(
  element: ReactNode,
  backend: Backend,
  options: RenderOptions = {},
): Promise<RenderHandle> {
  const Yoga = await getYoga();

  // Settled exactly once, after teardown — by then the backend has restored the
  // terminal, so whoever awaits it can print to the normal screen.
  let exitResult: unknown;
  let resolveExit!: (value: unknown) => void;
  const exited = new Promise<unknown>((resolve) => { resolveExit = resolve; });

  let unmounted = false;
  // The terminal is another program's (`suspend()`): state still commits, but
  // nothing is painted until it is ours again.
  let suspended = false;
  let paints = 0;
  // One AbortController per render root. Its signal is handed to the tree (via
  // AbortContext) so user async/timers can cancel on teardown. The controller
  // is never exposed — only abort()ed here, in the teardown paths below.
  const abortController = new AbortController();
  // Assigned once backend.onResize is wired below; referenced earlier by the
  // teardown closures, so it's declared up here (undefined until then).
  let unsubResize: (() => void) | undefined;
  // The last frame paint produced, WITHOUT the selection overlay. Kept so a
  // drag can re-show the same frame with a different highlight — no layout, no
  // React work — and so the selection reads its text out of what is on screen.
  let lastPaint: Buffer | null = null;
  let selection: SelectionController | null = null;
  // The highlight changed but the frame on screen does not show it yet. A paint
  // clears it, because a painted frame always carries the current highlight.
  let overlayStale = false;
  const draw = () => {
    if (unmounted || suspended) return;
    const { width, height } = backend.size();
    // A non-finite height means an unbounded surface: lay out with the height
    // left auto (Yoga grows the tree to its content) and paint a buffer exactly
    // as tall as what came out. Infinity must never reach paint() — the buffer
    // allocates width × height cells.
    const bounded = Number.isFinite(height) ? height : undefined;
    computeLayout(container, width, bounded);
    const frame = paint(container, width, bounded ?? contentHeight(container));
    lastPaint = frame;
    // A selection over text that changed is a lie — the controller checks this
    // frame's cells against the ones it highlighted and drops it if they moved.
    selection?.observe(frame);
    // decorate() hands the frame straight back when nothing is selected, so a
    // buffer is only ever copied for an actual highlight.
    backend.draw(selection === null ? frame : selection.decorate(frame));
    paints += 1;
    overlayStale = false;
  };

  // Show a highlight that changed without one. Deferred to a microtask by
  // `flushOverlay` so a repaint the same key caused gets there first — a drag
  // that changes nothing else is then the only thing that draws, and a key that
  // both drops a selection and changes the content draws once, not twice.
  const drawOverlay = () => {
    if (!overlayStale) return;
    overlayStale = false;
    if (unmounted || lastPaint === null || selection === null) return;
    backend.draw(selection.decorate(lastPaint));
  };
  const flushOverlay = () => {
    if (overlayStale) queueMicrotask(drawOverlay);
  };

  // A callback the app gave us, run where its throwing cannot break flowtty.
  // Without this an `onCopy` that shells out to `pbcopy` and gets ENOENT would
  // escape the backend's stdin handler as an uncaughtException — from inside
  // the key path, so the key it came with never reached the app either.
  const runCallback = (fn: () => void): void => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'callback');
    }
  };

  // What a finished drag selected, held until the key it came with has been
  // dispatched. The order is deliberate: selection bookkeeping, then every
  // `useInput` subscriber, then the app's `onCopy` — so no app callback can
  // stand between a `mouseup` and the code waiting for it.
  let pendingCopy: string | null = null;
  // Who made the selection being delivered: a drag or click, or the app
  // through the code API below.
  let selectSource: 'selection' | 'api' = 'selection';
  const deliverCopy = () => {
    const text = pendingCopy;
    pendingCopy = null;
    if (text === null || unmounted) return;
    const delivered = options.copyOnSelect === false ? false : backend.copy?.(text) ?? false;
    const source = selectSource;
    runCallback(() => options.onCopy?.({ text, delivered, source }));
  };

  const { container, root } = createRoot(Yoga, draw);

  if (options.selection !== false) {
    selection = new SelectionController({
      container,
      frame: () => lastPaint,
      present: () => { overlayStale = true; },
      // A finished drag is a copy: put the text on the clipboard (unless the
      // app turned that off) and tell the app either way. An empty selection —
      // a drag over blank cells — is not a copy and says nothing. The copy
      // itself waits for `deliverCopy`, once the key has been dispatched.
      onSelect: (text: string) => {
        if (text !== '') pendingCopy = text;
      },
    });
  }

  // If the backend provides a key source, wrap the tree in an InputContext
  // provider so useInput subscribers receive its keys (see makeKeySource for
  // the dispatch semantics). Otherwise, the default no-op source in
  // InputContext is used (passive view).
  let cleanedUp = false;

  const onUncaughtException = (error: unknown) => handleError(error, 'uncaughtException');
  const onUnhandledRejection = (reason: unknown) => handleError(reason, 'unhandledRejection');

  // Release everything render() acquired: the resize subscription and the two
  // process listeners. Wired to the root abort signal below, so any teardown
  // path that calls abortController.abort() releases these automatically — one
  // trigger, fired once. Does NOT unmount the React root or dispose the backend.
  const detachListeners = () => {
    unsubResize?.();
    process.removeListener('uncaughtException', onUncaughtException);
    process.removeListener('unhandledRejection', onUnhandledRejection);
    for (const sig of TERMINATION_SIGNALS) process.removeListener(sig, onSignal);
  };

  // A termination signal must not leave the terminal in the alt screen with the
  // cursor hidden (and bracketed paste / mouse reporting still on): restore it,
  // then let the signal do what it would have done. With our listener gone the
  // default action applies again, so re-raising makes the process die BY the
  // signal and its exit status says so. If the app has a handler of its own, it
  // owns the outcome — we only restore the terminal.
  const onSignal = (signal: NodeJS.Signals) => {
    const appHandlesIt = process.listenerCount(signal) > 1;
    handle.unmount();
    if (!appHandlesIt) process.kill(process.pid, signal);
  };
  // abort() IS the teardown trigger: both unmount() and the error path call it,
  // and this releases the listeners synchronously. `once` so it can't double-fire.
  abortController.signal.addEventListener('abort', detachListeners, { once: true });

  const handleError = (error: unknown, source: ErrorSource) => {
    if (cleanedUp) return;
    cleanedUp = true;
    // Mark unmounted FIRST so any queued paint microtask (e.g. from a re-render
    // after the boundary commits null children) becomes a no-op. Otherwise the
    // queued paint runs after dispose() exits alt-screen and writes 24 blank
    // lines to the main screen above the error trace.
    unmounted = true;
    // Fire the root signal so user async/timers bail out now — the React
    // unmount on this path is deferred to a microtask, so component cleanups
    // run late; the signal lets side effects stop before that.
    abortController.abort();
    // Restore terminal so any stderr that follows is readable.
    try { backend.dispose?.(); } catch { /* ignore — dispose must not mask the real error */ }
    resolveExit(exitResult);
    if (options.onError) {
      // A custom onError may not exit the process, so the resize + process
      // listeners must be released — abort() above already did that via the
      // signal. We still have to unmount the React tree, deferred to a
      // microtask: the 'react' source path runs inside the ErrorBoundary's
      // commit-phase componentDidCatch, where unmounting synchronously is unsafe.
      queueMicrotask(() => { try { root.unmount(); } catch { /* already torn down */ } });
      try { options.onError({ error, source }); } catch { /* user's onError can't break the path */ }
    } else {
      // Default: print to stderr (after dispose, so the trace is visible) + exit non-zero.
      console.error(error);
      process.exit(1);
    }
  };

  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);
  for (const sig of TERMINATION_SIGNALS) process.on(sig, onSignal);

  const innerTree = backend.onKey
    ? createElement(
        InputContext.Provider,
        {
          value: makeKeySource(
            backend as Backend & { onKey: NonNullable<Backend['onKey']> },
            root,
            selection === null ? undefined : (key) => selection?.handleKey(key),
            selection === null ? undefined : () => { flushOverlay(); deliverCopy(); },
          ),
        },
        element,
      )
    : element;

  const boundedTree = createElement(ErrorBoundary, {
    onError: ({ error, source }) => handleError(error, source),
  }, innerTree);
  // BackendContext exposes the backend to components that need to feature-detect
  // optional capabilities (e.g. <Static> checks for printStatic).
  const withBackend = createElement(BackendContext.Provider, { value: backend }, boundedTree);
  const withAbort = createElement(AbortContext.Provider, { value: abortController.signal }, withBackend);
  // exit() is usually called from a key handler, i.e. inside flushSync — tearing
  // the tree down there is unsafe, so the unmount is deferred to a microtask.
  // Both are feature-detected on the backend and drop through when it has
  // neither — an app asks for attention the same way whatever it renders into.
  // After unmount there is no terminal of ours left to interrupt.
  const bell = () => { if (!unmounted) backend.bell?.(); };
  const notify = (title: string, body?: string) => { if (!unmounted) backend.notify?.(title, body); };
  // One place decides what a copy means: hand the text to the backend if it has
  // a clipboard, then tell the app what happened — whether it landed or not, so
  // an app can run `pbcopy` of its own on the way down. After unmount there is
  // no terminal of ours to write to and nothing is reported.
  const copy = (text: string): boolean => {
    if (unmounted) return false;
    const delivered = backend.copy?.(text) ?? false;
    // Told after the fact, and through the guarded path: the caller gets its
    // answer whatever the app's own callback does with it.
    runCallback(() => options.onCopy?.({ text, delivered, source: 'api' }));
    return delivered;
  };
  // One suspension at a time: the backend's suspend/resume are not a stack,
  // and a second hand-over from inside the first would take the terminal back
  // under the child's feet. While suspended, draw() is a no-op — state updates
  // still commit, and the frame they add up to is painted on resume.
  const suspend = async <T>(fn: () => T | Promise<T>): Promise<T> => {
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
  // Selection from code: the same controller a drag drives, told the source is
  // the app. Delivered at once — there is no key dispatch to wait for — and
  // through the same overlay path (`flushOverlay`), so a call from a key
  // handler still paints once. Inert with `selection: false` and after unmount.
  const selectFrom = (make: () => string): string => {
    if (unmounted || selection === null) return '';
    selectSource = 'api';
    try {
      const text = make();
      flushOverlay();
      deliverCopy();
      return text;
    } finally {
      selectSource = 'selection';
    }
  };
  const select = (anchor: Point, head: Point): string => selectFrom(() => selection!.select(anchor, head));
  const selectWord = (x: number, y: number): string => selectFrom(() => selection!.selectWord(x, y));
  const selectLine = (x: number, y: number): string => selectFrom(() => selection!.selectLine(x, y));
  // `clear()` is the resize path and asks for no redraw; here one is wanted.
  const clearSelection = (): void => {
    if (unmounted || selection === null) return;
    const had = selection.segments.length > 0;
    selection.clear();
    if (had) { overlayStale = true; flushOverlay(); }
  };
  // Read through to the backend on every access: the answer changes when the
  // terminal says so, and this object is created once.
  const colorScheme = (): TerminalColorScheme => backend.colorScheme?.() ?? UNKNOWN_COLOR_SCHEME;
  const appApi: AppApi = {
    exit: (result) => {
      exitResult = result;
      queueMicrotask(() => handle.unmount());
    },
    bell,
    notify,
    copy,
    suspend,
    select,
    selectWord,
    selectLine,
    clearSelection,
    get colorScheme() { return colorScheme(); },
  };
  const withApp = createElement(AppContext.Provider, { value: appApi }, withAbort);
  const withScheme = createElement(ColorSchemeProvider, { backend }, withApp);
  const tree = createElement(TerminalSizeProvider, { backend }, withScheme);

  root.render(tree);
  // Wait for the initial scheduled paint (via resetAfterCommit → queueMicrotask).
  await Promise.resolve();
  await Promise.resolve();

  // Repaint on terminal resize. Backends with fixed dimensions (e.g. the test
  // backend) omit onResize and this is a no-op. A resize re-flows everything,
  // so whatever was selected no longer covers the text it was taken from: drop
  // it before the frame that replaces it.
  unsubResize = backend.onResize?.(() => {
    selection?.clear();
    draw();
  });

  const handle: RenderHandle = {
    waitUntilExit: () => exited,
    bell,
    notify,
    copy,
    suspend,
    select,
    selectWord,
    selectLine,
    clearSelection,
    get colorScheme() { return colorScheme(); },
    unmount() {
      if (unmounted) return;
      unmounted = true;
      // Block a later error path from re-running teardown on an already-torn tree.
      cleanedUp = true;
      // abort() is the teardown trigger: it releases the listeners (via the
      // signal) and lets user async/timers bail before we unmount + dispose.
      abortController.abort();
      root.unmount();
      backend.dispose?.();
      resolveExit(exitResult);
    },
  };
  return handle;
}
