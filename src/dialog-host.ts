import { createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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
  // Capture the outer InputSource ONCE per mount. We'll swap between this
  // (host can hear keys) and a muted no-op source (dialog open → host muted).
  const outerSource = useContext(InputContext);
  const [dialog, setDialog] = useState<PendingDialog | null>(null);

  const mutedSource = useMemo<InputSource>(
    () => ({ subscribe: () => () => {} }),
    [],
  );

  const close = useCallback((result: DialogResult<unknown>) => {
    setDialog((current) => {
      if (current) current.resolve(result);
      return null;
    });
  }, []);

  const openDialog = useCallback(<T,>(element: ReactNode): Promise<DialogResult<T>> => {
    return new Promise<DialogResult<T>>((resolve) => {
      setDialog((current) => {
        // M1c.4 doesn't stack — opening while one is open cancels the prior.
        if (current) current.resolve({ status: 'cancelled' } as DialogResult<unknown>);
        return { element, resolve: resolve as (r: DialogResult<unknown>) => void };
      });
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

  // Layout: host children + dialog as siblings. Stack layout means the dialog
  // renders BELOW the host content in the cell buffer (behaviorally modal —
  // keys gated + awaitable — but visually inline). True overlay positioning
  // needs absolute/z-index (later layout milestone).
  return createElement(
    DialogHostContext.Provider,
    { value: hostApi },
    createElement(
      InputContext.Provider,
      { value: dialog ? mutedSource : outerSource },
      props.children,
    ),
    dialog
      ? createElement(
          InputContext.Provider,
          { value: outerSource },
          createElement(DialogResultContext.Provider, { value: dialogApi }, dialog.element),
        )
      : null,
  );
}
