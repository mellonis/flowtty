import { useEffect, useRef } from 'react';
import { useBackend } from '../hooks/useBackend.js';

export interface StaticProps {
  /**
   * Append-only string array. Each new entry beyond the previously-printed
   * count is emitted ABOVE the live region via `backend.printStatic`.
   * Previously-seen entries are NOT re-emitted (the comparison is by length;
   * mutating earlier entries has no visible effect).
   *
   * Entries should already carry any ANSI styling you want — `<Static>` writes
   * them verbatim. Use `colorize`/style helpers from your output formatter.
   *
   * v1 limitation: `items` is `string[]`. A future API may accept ReactNode
   * children via a render function and serialize them through the paint
   * pipeline; not yet implemented.
   */
  items: string[];
}

/**
 * Append-only output ABOVE the live region. Use to render log lines / status
 * updates that should scroll into the terminal's scrollback while the rest of
 * the app keeps redrawing below.
 *
 * Requires a backend that implements `printStatic` (e.g. @flowtty/inline-tty-backend).
 * On backends without it (alt-screen TtyBackend, TestBackend), this component
 * is a silent no-op — the items don't appear anywhere.
 *
 * Returns null — it contributes nothing to the live render tree.
 */
export function Static({ items }: StaticProps): null {
  const backend = useBackend();
  const printed = useRef(0);

  useEffect(() => {
    if (items.length <= printed.current) return;
    const fresh = items.slice(printed.current);
    printed.current = items.length;
    backend?.printStatic?.(fresh);
  }, [items, backend]);

  return null;
}
