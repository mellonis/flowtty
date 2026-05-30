import { createElement, type ReactNode } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { computeLayout } from './layout.js';
import { paint } from './paint.js';
import type { Backend } from './backends/types.js';
import { InputContext, type InputSource } from './input-context.js';
import { TerminalSizeProvider } from './terminal-size.js';

export async function render(element: ReactNode, backend: Backend): Promise<{ unmount(): void }> {
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

  const tree = createElement(TerminalSizeProvider, { backend }, innerTree);

  root.render(tree);
  // Wait for the initial scheduled paint (via resetAfterCommit → queueMicrotask).
  await Promise.resolve();
  await Promise.resolve();

  // Repaint on terminal resize. Backends with fixed dimensions (e.g. the test
  // backend) omit onResize and this is a no-op.
  const unsubResize = backend.onResize?.(draw);

  return {
    unmount() {
      unmounted = true;
      unsubResize?.();
      root.unmount();
      backend.dispose?.();
    },
  };
}
