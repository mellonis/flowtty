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
          Box,
          {
            // Full-screen absolute overlay; flexbox centers the dialog content.
            // Resolves the M1c.4 "renders below host" visual caveat — the paint
            // two-pass (M1f T2) ensures this Box overlays the host content.
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            justifyContent: 'center', alignItems: 'center',
          },
          createElement(
            InputContext.Provider,
            { value: outerSource },
            createElement(DialogResultContext.Provider, { value: dialogApi }, dialog.element),
          ),
        )
      : null,
  );
}
