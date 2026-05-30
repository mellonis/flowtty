import { createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Box } from './components.js';
import { InputContext, type InputSource } from './input-context.js';
import {
  DialogHostContext,
  DialogResultContext,
  type DialogHostApi,
  type DialogResult,
  type DialogResultApi,
} from './dialog-context.js';

interface PendingDialog {
  element: ReactNode;
  resolve(result: DialogResult<unknown>): void;
}

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
