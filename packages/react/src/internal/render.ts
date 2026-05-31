import { createElement, type ReactNode } from 'react';
import { getYoga, computeLayout, paint, type Backend } from '@flowtty/core';
import { createRoot } from './reconciler.js';
import { InputContext, type InputSource } from '../context/inputContext.js';
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
  const handleError = (error: unknown, source: ErrorSource) => {
    if (cleanedUp) return;
    cleanedUp = true;
    // Mark unmounted FIRST so any queued paint microtask (e.g. from a re-render
    // after the boundary commits null children) becomes a no-op. Otherwise the
    // queued paint runs after dispose() exits alt-screen and writes 24 blank
    // lines to the main screen above the error trace.
    unmounted = true;
    // Restore terminal so any stderr that follows is readable.
    try { backend.dispose?.(); } catch { /* ignore — dispose must not mask the real error */ }
    if (options.onError) {
      try { options.onError({ error, source }); } catch { /* user's onError can't break the path */ }
    } else {
      // Default: print to stderr (after dispose, so the trace is visible) + exit non-zero.
      console.error(error);
      process.exit(1);
    }
  };

  const onUncaughtException = (error: unknown) => handleError(error, 'uncaughtException');
  const onUnhandledRejection = (reason: unknown) => handleError(reason, 'unhandledRejection');
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
  const tree = createElement(TerminalSizeProvider, { backend }, boundedTree);

  root.render(tree);
  // Wait for the initial scheduled paint (via resetAfterCommit → queueMicrotask).
  await Promise.resolve();
  await Promise.resolve();

  // Repaint on terminal resize. Backends with fixed dimensions (e.g. the test
  // backend) omit onResize and this is a no-op.
  const unsubResize = backend.onResize?.(draw);

  return {
    unmount() {
      if (unmounted) return;
      unmounted = true;
      unsubResize?.();
      process.removeListener('uncaughtException', onUncaughtException);
      process.removeListener('unhandledRejection', onUnhandledRejection);
      root.unmount();
      backend.dispose?.();
    },
  };
}
