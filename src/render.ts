import { createElement, type ReactNode } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { computeLayout } from './layout.js';
import { paint } from './paint.js';
import type { Backend } from './backends/types.js';
import { InputContext, type InputSource } from './input-context.js';

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
  const tree = backend.onKey
    ? createElement(
        InputContext.Provider,
        { value: { subscribe: backend.onKey.bind(backend) } as InputSource },
        element,
      )
    : element;

  root.render(tree);
  // Wait for the initial scheduled paint (via resetAfterCommit → queueMicrotask).
  await Promise.resolve();
  await Promise.resolve();

  return {
    unmount() {
      unmounted = true;
      root.unmount();
      backend.dispose?.();
    },
  };
}
