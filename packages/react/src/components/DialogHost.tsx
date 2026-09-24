import React from 'react';
import { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_BORDER_STYLE } from '@flowtty/core';
import { Box } from './base/Box.js';
import { InputContext, createMutedSource, type InputSource } from '../context/inputContext.js';
import { BackendContext } from '../context/backendContext.js';
import {
  DialogHostContext,
  DialogHostPresentContext,
  DialogIsTopContext,
  DialogResultContext,
  type DialogHostApi,
  type DialogResult,
  type DialogResultApi,
  type OpenDialogOptions,
} from '../context/dialogContext.js';
import { FocusGroup } from './FocusGroup.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

interface PendingDialog {
  /** Stable identity for this stack entry, so its resolve/cancel targets THIS
   *  dialog rather than whatever happens to be on top when it fires. */
  id: number;
  element: ReactNode;
  options?: OpenDialogOptions;
  resolve(result: DialogResult<unknown>): void;
}

export interface DialogHostProps {
  children?: ReactNode;
  /** Dim everything behind an open floating dialog. Default false; a dialog can
   *  override it with `openDialog(el, { backdrop })`. */
  backdrop?: boolean;
}

// Where an anchored dialog goes: under the anchor when `wanted` rows fit there
// (or there is at least as much room below as above), else above it; flush
// with the anchor's left edge, shifted left to stay inside the host. The
// clamps are what the wrapper may grow to on that side.
export function placeAnchored(
  a: { left: number; top: number; width: number; height: number },
  wanted: number,
  host: { width: number; height: number },
): { top: number; left: number; maxHeight: number; maxWidth: number } {
  const below = host.height - (a.top + a.height);
  const above = a.top;
  const goesBelow = wanted <= below || below >= above;
  const top = goesBelow ? a.top + a.height : Math.max(0, a.top - wanted);
  const left = Math.max(0, Math.min(a.left, host.width - a.width));
  return { top, left, maxHeight: goesBelow ? below : above, maxWidth: host.width - left };
}

export function DialogHost(props: DialogHostProps): ReactNode {
  const outerSource = useContext(InputContext);
  // Anchors are frame cells; the host is assumed to sit at the frame's origin
  // (the usual place for it), and the terminal is what bounds a popup.
  const terminal = useTerminalSize();
  const [stack, setStack] = useState<PendingDialog[]>([]);
  const nextId = useRef(0);
  // Per-entry result API, memoized by dialog id so a dialog's { done, cancel }
  // keeps a stable identity across host re-renders (avoids re-rendering dialog
  // content on every stack change via DialogResultContext).
  const apiCache = useRef(new Map<number, DialogResultApi>());

  // Muting never swaps a subtree's source — that would resubscribe every
  // handler under it, behind the handlers above the host — so the host's
  // source and each dialog's are stable objects that read the stack at delivery.
  const stackRef = useRef<PendingDialog[]>([]);
  const hostSource = useMemo<InputSource>(
    () => createMutedSource(outerSource, () => stackRef.current.length > 0),
    [outerSource],
  );
  const entrySources = useRef(new Map<number, InputSource>());
  const sourceForEntry = (id: number): InputSource => {
    let source = entrySources.current.get(id);
    if (!source) {
      source = createMutedSource(outerSource, () => stackRef.current.at(-1)?.id !== id);
      entrySources.current.set(id, source);
    }
    return source;
  };

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
    entrySources.current.delete(id);
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
  stackRef.current = stack;

  return (
    <DialogHostContext.Provider value={hostApi}>
    <DialogHostPresentContext.Provider value={true}>
      {/* Host content: muted when ANY dialog is open. */}
      <InputContext.Provider value={hostSource}>
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
      // An anchored dialog is placed, not centred: the wrapper is pinned to the
      // anchor and bounded by the room on that side of it.
      const placed = o?.floating && o.anchor ? placeAnchored(o.anchor, o.height ?? 3, terminal) : null;
      if (o?.title != null || o?.floating) {
        const wrapperProps: Record<string, unknown> = {
          border: DEFAULT_BORDER_STYLE,
          flexDirection: 'column',
          padding: o.padding,
          // A drag inside the dialog is confined to what the dialog says, not
          // its border and not the content it covers.
          // See docs/input.md (selection).
          selectionScope: true,
        };
        if (o.title != null) wrapperProps.borderTitle = o.title;
        if (placed !== null && o.anchor) {
          wrapperProps.position = 'absolute';
          wrapperProps.top = placed.top;
          wrapperProps.left = placed.left;
          wrapperProps.minWidth = o.minWidth ?? o.anchor.width;
          wrapperProps.maxWidth = o.maxWidth ?? placed.maxWidth;
          wrapperProps.maxHeight = o.maxHeight ?? placed.maxHeight;
          wrapperProps.backgroundColor = 'default';
        } else if (o.floating) {
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
          justifyContent={placed === null ? 'center' : undefined}
          alignItems={placed === null ? 'center' : undefined}
          // Backdrop: opaque ('default') for full-screen dialogs to mask
          // everything underneath; transparent (undefined) for floating
          // dialogs so the wrapper is the only opaque region and lower stack
          // entries show around it. See `overlayBg` computed above.
          backgroundColor={overlayBg}
          // An unwrapped dialog has no chrome of its own to scope to, so the
          // overlay is the scope; a wrapped one scopes to the wrapper inside it,
          // which is nearer. See docs/input.md (selection).
          selectionScope
          // The scrim is this full-screen overlay itself: it restyles what is
          // under it (host content, lower dialogs), then the dialog paints on
          // top, bright. Floating only — a full-screen dialog covers everything.
          backdrop={o?.floating && (o.backdrop ?? props.backdrop ?? false) ? 'dim' : undefined}
        >
          {/* Each dialog gets a result API bound to its OWN stack entry, so an
              async done()/cancel() from a lower (input-muted) dialog resolves
              that dialog rather than whatever is currently on top. */}
          <InputContext.Provider value={sourceForEntry(d.id)}>
            <DialogResultContext.Provider value={apiForEntry(d.id)}>
              <DialogIsTopContext.Provider value={isTop}>
                <FocusGroup isActive={isTop}>{content}</FocusGroup>
              </DialogIsTopContext.Provider>
            </DialogResultContext.Provider>
          </InputContext.Provider>
        </Box>
      );
      })}
    </DialogHostPresentContext.Provider>
    </DialogHostContext.Provider>
  );
}
