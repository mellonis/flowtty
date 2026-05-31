import { createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Box } from './components.js';
import { InputContext, type InputSource } from './input-context.js';
import {
  DialogHostContext,
  DialogIsTopContext,
  DialogResultContext,
  type DialogHostApi,
  type DialogResult,
  type DialogResultApi,
  type OpenDialogOptions,
} from './dialog-context.js';
import { FocusGroup } from './focus-group.js';

interface PendingDialog {
  element: ReactNode;
  options?: OpenDialogOptions;
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
  const openDialog = useCallback(<T,>(element: ReactNode, options?: OpenDialogOptions): Promise<DialogResult<T>> => {
    return new Promise<DialogResult<T>>((resolve) => {
      setStack((s) => [
        ...s,
        { element, options, resolve: resolve as (r: DialogResult<unknown>) => void },
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
      createElement(FocusGroup, { isActive: !hasOpenDialog }, props.children),
    ),
    // Stack: render each dialog as a full-screen absolute overlay in stack
    // order. Tree order = paint order (M1f two-pass) so the top stack entry
    // paints on top of lower entries. Input gating: only the topmost dialog
    // gets the real outerSource; lower dialogs get mutedSource.
    ...stack.map((d, i) => {
      const isTop = i === stack.length - 1;
      // Wrap the element when title is set OR floating is requested. Two modes:
      //   - default (full-screen): wrapper fills the overlay; inner element
      //     can use width:'100%' / height:'100%' to span the inside.
      //   - floating: wrapper is content-sized with optional min/max constraints;
      //     the overlay's alignItems/justifyContent centers it.
      const o = d.options;
      let content: ReactNode = d.element;
      if (o?.title != null || o?.floating) {
        const wrapperProps: Record<string, unknown> = {
          border: 'single',
          flexDirection: 'column',
          padding: o.padding,
        };
        if (o.title != null) wrapperProps.borderTitle = o.title;
        if (o.floating) {
          wrapperProps.maxWidth = o.maxWidth ?? '80%';
          wrapperProps.maxHeight = o.maxHeight ?? '80%';
          if (o.minWidth !== undefined) wrapperProps.minWidth = o.minWidth;
          // Floating wrappers mask their OWN area only — the overlay around them
          // stays transparent so the previous dialog (parent wizard etc.) shows
          // through, matching desktop "floating dialog over parent" UX.
          wrapperProps.backgroundColor = 'default';
        } else {
          wrapperProps.width = '100%';
          wrapperProps.height = '100%';
        }
        content = createElement(Box, wrapperProps, d.element);
      }
      // Overlay opacity: full-screen wrappers (or unwrapped elements) get an
      // OPAQUE overlay that masks everything underneath. Floating wrappers
      // leave the surrounding overlay TRANSPARENT — the wrapper itself is the
      // only opaque region, so lower stack entries remain visible around it.
      const overlayBg = o?.floating ? undefined : 'default';
      return createElement(
        Box,
        {
          key: i,
          position: 'absolute',
          top: 0, left: 0,
          width: '100%', height: '100%',
          justifyContent: 'center', alignItems: 'center',
          // Backdrop: opaque ('default') for full-screen dialogs to mask
          // everything underneath; transparent (undefined) for floating
          // dialogs so the wrapper is the only opaque region and lower stack
          // entries show around it. See `overlayBg` computed above.
          backgroundColor: overlayBg,
        },
        createElement(
          InputContext.Provider,
          { value: isTop ? outerSource : mutedSource },
          // dialogApi resolves the TOP — all dialogs share the same instance,
          // but only the top dialog can interact (input is gated), so calls
          // from lower dialogs (e.g. via async timers) would pop the wrong
          // entry. Accept that constraint; flag in README if it bites.
          createElement(DialogResultContext.Provider, { value: dialogApi },
            createElement(DialogIsTopContext.Provider, { value: isTop },
              createElement(FocusGroup, { isActive: isTop }, content),
            ),
          ),
        ),
      );
    }),
  );
}
