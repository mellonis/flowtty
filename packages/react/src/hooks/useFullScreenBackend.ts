import { useEffect, useRef } from 'react';
import { useBackend } from './useBackend.js';

/**
 * Returns true when the current backend can give the component the full
 * render area (e.g. TtyBackend alt-screen, TestBackend). Returns false on
 * "bounded live region" backends (e.g. @flowtty/inline-tty-backend) where
 * components that need to overlay larger panels would produce broken UI.
 *
 * Side effect: when the check fails, emits a one-shot console.warn naming
 * the calling component, then settles into "return false" steady-state.
 *
 * Typical use — refuse to render in the inline case:
 *
 *     export function Menu(props) {
 *       if (!useFullScreenBackend('Menu')) return null;
 *       // … normal render
 *     }
 *
 * When no backend is in scope (some test setups), this returns true — the
 * component assumes it has the layout area and renders normally.
 */
export function useFullScreenBackend(componentName: string): boolean {
  const backend = useBackend();
  // Missing flag is treated as full-screen (preserves backward compat for
  // backends written before the flag existed). Only an EXPLICIT `false`
  // declines.
  const isFullScreen = backend == null || backend.fullScreen !== false;
  const warned = useRef(false);
  useEffect(() => {
    if (!isFullScreen && !warned.current) {
      warned.current = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[flowtty] <${componentName}> requires a full-screen backend ` +
        `(e.g. @flowtty/tty-backend). The current backend declares ` +
        `fullScreen=false (e.g. @flowtty/inline-tty-backend) — component ` +
        `will not render.`,
      );
    }
  }, [isFullScreen, componentName]);
  return isFullScreen;
}
