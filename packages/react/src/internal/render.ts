import { createElement, type ReactNode } from 'react';
import { type Backend } from '@flowtty/core';
import { getYoga, computeLayout, paint } from '@flowtty/core/host';
import { createRoot } from './reconciler.js';
import { InputContext, type InputSource } from '../context/inputContext.js';
import { BackendContext } from '../context/backendContext.js';
import { AbortContext } from '../context/abortContext.js';
import { TerminalSizeProvider } from '../hooks/useTerminalSize.js';
import { ErrorBoundary, type ErrorSource } from '../components/ErrorBoundary.js';

export interface RenderOptions {
  /** Called when an error is caught at ANY layer (React boundary, process-level handler).
   *  After this fires, flowtty has already called backend.dispose(); the terminal is restored.
   *  Default behavior (when onError not provided): print error to stderr + process.exit(1). */
  onError?: (info: { error: unknown; source: ErrorSource }) => void;
}

export async function render(
  element: ReactNode,
  backend: Backend,
  options: RenderOptions = {},
): Promise<{ unmount(): void }> {
  const Yoga = await getYoga();

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
    computeLayout(container, width, height);
    backend.draw(paint(container, width, height));
  };

  const { container, root } = createRoot(Yoga, draw);

  // If the backend provides a key source, wrap the tree in an InputContext
  // provider so useInput subscribers receive its keys. Otherwise, the
  // default no-op source in InputContext is used (passive view).
  //
  // Wrap each dispatched key in root.flushSync so the state update is processed
  // synchronously inside the handler — flush() then only needs microtask rounds
  // for the scheduled repaint instead of a macrotask for the Scheduler to drain.
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

  const innerTree = backend.onKey
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

  const boundedTree = createElement(ErrorBoundary, {
    onError: ({ error, source }) => handleError(error, source),
  }, innerTree);
  // BackendContext exposes the backend to components that need to feature-detect
  // optional capabilities (e.g. <Static> checks for printStatic).
  const withBackend = createElement(BackendContext.Provider, { value: backend }, boundedTree);
  const withAbort = createElement(AbortContext.Provider, { value: abortController.signal }, withBackend);
  const tree = createElement(TerminalSizeProvider, { backend }, withAbort);

  root.render(tree);
  // Wait for the initial scheduled paint (via resetAfterCommit → queueMicrotask).
  await Promise.resolve();
  await Promise.resolve();

  // Repaint on terminal resize. Backends with fixed dimensions (e.g. the test
  // backend) omit onResize and this is a no-op.
  unsubResize = backend.onResize?.(draw);

  return {
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
    },
  };
}
