import { createElement, type ReactNode } from 'react';
import { type Backend, type Key } from '@flowtty/core';
import { getYoga, computeLayout, contentHeight, paint } from '@flowtty/core/host';
import { createRoot, type Root } from './reconciler.js';
import { InputContext, type InputSource } from '../context/inputContext.js';
import { BackendContext } from '../context/backendContext.js';
import { AbortContext } from '../context/abortContext.js';
import { AppContext, type AppApi } from '../context/appContext.js';
import { TerminalSizeProvider } from '../hooks/useTerminalSize.js';
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
function makeKeySource(backend: Backend & { onKey: NonNullable<Backend['onKey']> }, root: Root): InputSource {
  const subscribers = new Set<(key: Key) => void>();
  let detachBackend: (() => void) | undefined;
  return {
    subscribe(handler) {
      if (subscribers.size === 0) {
        detachBackend = backend.onKey((key) => {
          root.flushSync(() => {
            for (const s of [...subscribers]) s(key);
          });
        });
      }
      subscribers.add(handler);
      return () => {
        subscribers.delete(handler);
        if (subscribers.size === 0) {
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
  // One AbortController per render root. Its signal is handed to the tree (via
  // AbortContext) so user async/timers can cancel on teardown. The controller
  // is never exposed — only abort()ed here, in the teardown paths below.
  const abortController = new AbortController();
  // Assigned once backend.onResize is wired below; referenced earlier by the
  // teardown closures, so it's declared up here (undefined until then).
  let unsubResize: (() => void) | undefined;
  const draw = () => {
    if (unmounted) return;
    const { width, height } = backend.size();
    // A non-finite height means an unbounded surface: lay out with the height
    // left auto (Yoga grows the tree to its content) and paint a buffer exactly
    // as tall as what came out. Infinity must never reach paint() — the buffer
    // allocates width × height cells.
    const bounded = Number.isFinite(height) ? height : undefined;
    computeLayout(container, width, bounded);
    backend.draw(paint(container, width, bounded ?? contentHeight(container)));
  };

  const { container, root } = createRoot(Yoga, draw);

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
        { value: makeKeySource(backend as Backend & { onKey: NonNullable<Backend['onKey']> }, root) },
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
  const appApi: AppApi = {
    exit: (result) => {
      exitResult = result;
      queueMicrotask(() => handle.unmount());
    },
    bell,
    notify,
  };
  const withApp = createElement(AppContext.Provider, { value: appApi }, withAbort);
  const tree = createElement(TerminalSizeProvider, { backend }, withApp);

  root.render(tree);
  // Wait for the initial scheduled paint (via resetAfterCommit → queueMicrotask).
  await Promise.resolve();
  await Promise.resolve();

  // Repaint on terminal resize. Backends with fixed dimensions (e.g. the test
  // backend) omit onResize and this is a no-op.
  unsubResize = backend.onResize?.(draw);

  const handle: RenderHandle = {
    waitUntilExit: () => exited,
    bell,
    notify,
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
