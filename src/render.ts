import type { ReactNode } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { computeLayout } from './layout.js';
import { paint } from './paint.js';
import type { Backend } from './backends/types.js';

export async function render(element: ReactNode, backend: Backend): Promise<{ unmount(): void }> {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);

  const draw = () => {
    const { width, height } = backend.size();
    computeLayout(container, width, height);
    backend.draw(paint(container, width, height));
  };

  // M0: synchronous render + immediate single paint. (Repaint-on-state-update
  // comes in a later milestone.)
  root.render(element);
  draw();

  return {
    unmount() {
      root.unmount();
      backend.dispose?.();
    },
  };
}
