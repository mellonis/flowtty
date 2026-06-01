import React from 'react';
import { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_BORDER_STYLE } from '@flowtty/core';
import { Box } from './base/Box.js';
import { InputContext, type InputSource } from '../context/inputContext.js';
import { BackendContext } from '../context/backendContext.js';
import {
  DialogHostContext,
  DialogIsTopContext,
  DialogResultContext,
  type DialogHostApi,
  type DialogResult,
  type DialogResultApi,
  type OpenDialogOptions,
} from '../context/dialogContext.js';
import { FocusGroup } from './FocusGroup.js';

interface PendingDialog {
  /** Stable identity for this stack entry, so its resolve/cancel targets THIS
   *  dialog rather than whatever happens to be on top when it fires. */
  id: number;
  element: ReactNode;
  options?: OpenDialogOptions;
  resolve(result: DialogResult<unknown>): void;
}

export function DialogHost(props: { children?: ReactNode }): ReactNode {
  const outerSource = useContext(InputContext);
  const [stack, setStack] = useState<PendingDialog[]>([]);
  const nextId = useRef(0);
  // Per-entry result API, memoized by dialog id so a dialog's { done, cancel }
  // keeps a stable identity across host re-renders (avoids re-rendering dialog
  // content on every stack change via DialogResultContext).
  const apiCache = useRef(new Map<number, DialogResultApi>());

  const mutedSource = useMemo<InputSource>(
    () => ({ subscribe: () => () => {} }),
    [],
  );

  // Resolve a SPECIFIC dialog (by id) and remove it from the stack — not
  // necessarily the top. A dialog may resolve asynchronously (timer, awaited
  // work) after another has been pushed on top of it; popping the top would
  // close the wrong one. Other entries are untouched (still pending).
  const closeById = useCallback((id: number, result: DialogResult<unknown>) => {
    setStack((s) => {
      const idx = s.findIndex((d) => d.id === id);
      if (idx === -1) return s;
      s[idx]!.resolve(result);
      return [...s.slice(0, idx), ...s.slice(idx + 1)];
    });
    apiCache.current.delete(id);
  }, []);

  // Stable per-entry { done, cancel }, bound to that entry's id.
  const apiForEntry = useCallback((id: number): DialogResultApi => {
    const cache = apiCache.current;
    let api = cache.get(id);
    if (!api) {
      api = {
        done: (value) => closeById(id, { status: 'done', value }),
        cancel: () => closeById(id, { status: 'cancelled' }),
      };
      cache.set(id, api);
    }
    return api;
  }, [closeById]);

  const backend = useContext(BackendContext);
  // One-shot warning when a non-floating dialog is opened on a bounded-region
  // backend — the dialog wrapper sizes to 100%×100% of the overlay, which is
  // the live region (small). Content taller than that will be clipped. Suggest
  // floating:true as the fix. NOT a hard refuse — small full-screen dialogs
  // still work and the user might intend the clipping behavior.
  const fullScreenWarned = useRef(false);

  // Push a new dialog onto the top of the stack. Previous dialogs are NOT
  // cancelled — they stay open, just visually behind + input-muted until the
  // newly-opened dialog closes.
  const openDialog = useCallback(<T,>(element: ReactNode, options?: OpenDialogOptions): Promise<DialogResult<T>> => {
    if (
      backend?.fullScreen === false &&
      !options?.floating &&
      !fullScreenWarned.current
    ) {
      fullScreenWarned.current = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[flowtty] openDialog: the current backend declares fullScreen=false ` +
        `(e.g. @flowtty/inline-tty-backend), so dialog content will be ` +
        `clipped to the live region. Pass { floating: true, minWidth, maxWidth } ` +
        `to render as a content-sized floating dialog instead.`,
      );
    }
    return new Promise<DialogResult<T>>((resolve) => {
      const id = nextId.current++;
      setStack((s) => [
        ...s,
        { id, element, options, resolve: resolve as (r: DialogResult<unknown>) => void },
      ]);
    });
  }, [backend]);

  const hostApi = useMemo<DialogHostApi>(() => ({ openDialog }), [openDialog]);

  const hasOpenDialog = stack.length > 0;

  return (
    <DialogHostContext.Provider value={hostApi}>
      {/* Host content: muted when ANY dialog is open. */}
      <InputContext.Provider value={hasOpenDialog ? mutedSource : outerSource}>
        <FocusGroup isActive={!hasOpenDialog}>{props.children}</FocusGroup>
      </InputContext.Provider>
      {/* Stack: render each dialog as a full-screen absolute overlay in stack
          order. Tree order = paint order (M1f two-pass) so the top stack
          entry paints on top of lower entries. Input gating: only the topmost
          dialog gets the real outerSource; lower dialogs get mutedSource. */}
      {stack.map((d, i) => {
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
          border: DEFAULT_BORDER_STYLE,
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
        content = <Box {...wrapperProps}>{d.element}</Box>;
      }
      // Overlay opacity: full-screen wrappers (or unwrapped elements) get an
      // OPAQUE overlay that masks everything underneath. Floating wrappers
      // leave the surrounding overlay TRANSPARENT — the wrapper itself is the
      // only opaque region, so lower stack entries remain visible around it.
      const overlayBg = o?.floating ? undefined : 'default';
      return (
        <Box
          key={d.id}
          position="absolute"
          top={0} left={0}
          width="100%" height="100%"
          justifyContent="center" alignItems="center"
          // Backdrop: opaque ('default') for full-screen dialogs to mask
          // everything underneath; transparent (undefined) for floating
          // dialogs so the wrapper is the only opaque region and lower stack
          // entries show around it. See `overlayBg` computed above.
          backgroundColor={overlayBg}
        >
          {/* Each dialog gets a result API bound to its OWN stack entry, so an
              async done()/cancel() from a lower (input-muted) dialog resolves
              that dialog rather than whatever is currently on top. */}
          <InputContext.Provider value={isTop ? outerSource : mutedSource}>
            <DialogResultContext.Provider value={apiForEntry(d.id)}>
              <DialogIsTopContext.Provider value={isTop}>
                <FocusGroup isActive={isTop}>{content}</FocusGroup>
              </DialogIsTopContext.Provider>
            </DialogResultContext.Provider>
          </InputContext.Provider>
        </Box>
      );
      })}
    </DialogHostContext.Provider>
  );
}
