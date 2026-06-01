import React from "react";
/**
 * MacOS-style menubar with cascading submenus.
 *
 * Layout:
 *   - Top bar: horizontal row of items (just labels, separated by whitespace).
 *   - 1st-level submenu: vertical bordered panel that DROPS DOWN under the
 *     active top item, left-aligned to it.
 *   - 2nd+ level (cascade): vertical bordered panel to the RIGHT of the parent
 *     panel, top-aligned to the parent's focused item row.
 *
 * Item kinds (tagged by property presence):
 *   - { render }   — Enter / → opens `render()` as a dialog over the menu.
 *   - { submenu }  — Enter / → opens a nested panel. Marker `▸` (closed) or `▾` (open).
 *   - { onSelect } — Enter calls the callback. Menu does NOT auto-close.
 *
 * Keys:
 *   In the top bar:        ←/h, →/l navigate;  ↓/j or Enter open submenu.
 *   In any submenu:        ↑/k, ↓/j navigate;  → / Enter open nested or trigger leaf;
 *                          ← (or Esc) closes the current panel.
 *   Esc at top:            calls onExit (or cancel() in a nested dialog).
 *
 * `useDialogHost().openDialog(<Menu …>)` works — the menu inherits dialog Esc
 * semantics via useDialog().cancel() when onExit isn't provided.
 */

import { useState, type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { useInput } from '../hooks/useInput.js';
import { useDialog, useDialogHost } from '../hooks/useDialog.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useFullScreenBackend } from '../hooks/useFullScreenBackend.js';

export type MenuItem =
  | { key: string; label: string; render: () => ReactNode }
  | { key: string; label: string; submenu: MenuItem[] }
  | { key: string; label: string; onSelect: () => void };

export interface MenuProps {
  items: MenuItem[];
  title?: ReactNode;
  helpHint?: string;
  /**
   * Called on Esc at the top bar (no submenu open) AFTER the menu has been
   * disengaged. If you want Esc to always exit the app, ignore the disengage
   * step in your handler.
   */
  onExit?: () => void;
  /**
   * If provided, items with `render: () => ReactNode` invoke this callback
   * (passing the rendered node) INSTEAD of opening the rendered element as
   * a dialog. Use this for the "menu is persistent chrome, page lives below"
   * layout — caller stores the node in state and renders it next to the menu.
   */
  onPage?: (page: ReactNode) => void;
  /**
   * Page content rendered below the menu bar. Input to these children is MUTED
   * while the menu is engaged (active) — so list navigation doesn't fight
   * menu navigation. Engage with F10 (default), disengage with Esc or F10.
   */
  children?: ReactNode;
}

// ── Layout constants ─────────────────────────────────────────────────────────
const TOP_PAD = 1;                                              // leading/trailing space on top items
const PANEL_PAD = 1;                                            // padding inside panel cells
const SUBMENU_MARK = '▸';
const OPEN_MARK = '▾';

function topItemWidth(item: MenuItem): number {
  return TOP_PAD + [...item.label].length + TOP_PAD;
}
function panelItemText(item: MenuItem, hasAnySubmenu: boolean, isOpen: boolean): string {
  const mark = 'submenu' in item ? (isOpen ? OPEN_MARK : SUBMENU_MARK) : ' ';
  // Right-pad to make room for the marker column when any item in the panel has a submenu.
  const labelArea = [...item.label].length;
  const markCol = hasAnySubmenu ? 1 : 0;
  return ' '.repeat(PANEL_PAD) + item.label + ' '.repeat(Math.max(1, 1)) + (markCol ? mark : '') + ' '.repeat(PANEL_PAD);
}
function panelWidth(items: MenuItem[]): number {
  const hasSub = items.some((it) => 'submenu' in it);
  const maxLabel = items.reduce((m, it) => Math.max(m, [...it.label].length), 0);
  // " label  ▸ " — PANEL_PAD + label + space + (hasSub?1:0) + PANEL_PAD
  return PANEL_PAD + maxLabel + 1 + (hasSub ? 1 : 0) + PANEL_PAD;
}

function itemsAtPath(root: MenuItem[], path: number[]): MenuItem[] {
  let cur = root;
  for (const idx of path) {
    const item = cur[idx];
    if (!item || !('submenu' in item)) return cur;
    cur = item.submenu;
  }
  return cur;
}

export function Menu({ items, title, helpHint, onExit, onPage, children }: MenuProps) {
  // Capability check: Menu needs full-screen space for its cascading dropdowns.
  // On a bounded-live-region backend (e.g. @flowtty/inline-tty-backend) the
  // hook warns once and returns false. We still have to call every other hook
  // to keep the order stable, so we early-return null below — after all hooks.
  const isFullScreen = useFullScreenBackend('Menu');

  // openPath[i] = focused index in panel i that is currently OPEN; its submenu
  // is panel i+1. cursor lives in the DEEPEST visible panel (top bar if depth=0).
  const [openPath, setOpenPath] = useState<number[]>([]);
  const [cursor, setCursor] = useState(0);
  // Idle by default — F10 engages, Esc/F10/leaf-select disengages. While
  // disengaged the menu ignores all keys except F10 and `children` (the page)
  // receives input normally.
  const [active, setActive] = useState(false);
  const { openDialog } = useDialogHost();
  const { cancel } = useDialog();
  const { width: termWidth } = useTerminalSize();

  const depth = openPath.length;                                // # of open submenu panels
  const activeItems = itemsAtPath(items, openPath);             // items in deepest visible level
  const activeLen = activeItems.length;
  const cursorClamped = Math.min(cursor, Math.max(0, activeLen - 1));

  function openCurrent() {
    const item = activeItems[cursorClamped];
    if (!item) return;
    if ('submenu' in item) {
      // Push current cursor into openPath, reset cursor for the new panel.
      setOpenPath((p) => [...p, cursorClamped]);
      setCursor(0);
    } else if ('render' in item) {
      // If onPage is wired, route the rendered node OUT of the menu (caller
      // stores it as the page below the bar). Otherwise fall back to opening
      // it as a dialog over the menu (legacy mode).
      const node = item.render();
      if (onPage) onPage(node);
      else void openDialog(node);
      // Leaf-select fully disengages: collapse all panels AND deactivate so
      // input returns to the page.
      setOpenPath([]);
      setCursor(0);
      setActive(false);
    } else {
      item.onSelect();
      setOpenPath([]);
      setCursor(0);
      setActive(false);
    }
  }

  function closeCurrent() {
    if (depth === 0) {
      // No submenu open: Esc disengages the menu. onExit only fires when
      // already disengaged (so Esc-Esc → onExit semantics).
      if (active) { setActive(false); return; }
      if (onExit) onExit(); else cancel();
      return;
    }
    // Pop the deepest open panel; cursor goes back to the parent index.
    setCursor(openPath[depth - 1]!);
    setOpenPath((p) => p.slice(0, -1));
  }

  useInput((key) => {
    // F10 toggles engagement from either state.
    if (key.name === 'f10') {
      setActive((a) => {
        if (a) { setOpenPath([]); setCursor(0); }
        return !a;
      });
      return;
    }
    // Idle: ignore everything except F10 (handled above) AND Esc (so the user
    // can quit the app via the same key that disengages a focused menu).
    if (!active) {
      if (key.name === 'escape' && onExit) onExit();
      return;
    }

    if (depth === 0) {
      // Top bar
      if (activeLen === 0) {
        if (key.name === 'escape') closeCurrent();
        return;
      }
      if (key.name === 'left' || key.name === 'h' || (key.name === 'tab' && key.shift)) {
        setCursor((c) => (c - 1 + activeLen) % activeLen);
      } else if (key.name === 'right' || key.name === 'l' || (key.name === 'tab' && !key.shift)) {
        setCursor((c) => (c + 1) % activeLen);
      } else if (key.name === 'down' || key.name === 'j' || key.name === 'return') {
        openCurrent();
      } else if (key.name === 'escape') {
        closeCurrent();
      }
    } else {
      // Inside a submenu panel
      if (activeLen === 0) {
        if (key.name === 'escape' || key.name === 'left' || key.name === 'h') closeCurrent();
        return;
      }
      if (key.name === 'up' || key.name === 'k') {
        setCursor((c) => (c - 1 + activeLen) % activeLen);
      } else if (key.name === 'down' || key.name === 'j') {
        setCursor((c) => (c + 1) % activeLen);
      } else if (key.name === 'return' || key.name === 'right' || key.name === 'l') {
        openCurrent();
      } else if (key.name === 'left' || key.name === 'h' || key.name === 'escape') {
        closeCurrent();
      }
    }
  });

  // ── Geometry ─────────────────────────────────────────────────────────────
  // Title (when set) sits INLINE at the left of the top bar (MacOS-style),
  // not on a separate row. It contributes its rendered width to the offsets
  // of all menu items so dropdowns line up correctly.
  const titleText = title != null ? ` ${String(title)} ` : '';
  const titleWidth = titleText.length;
  // Top item left positions: x-cell of the start of item i in the top bar.
  const topX: number[] = [];
  {
    let acc = titleWidth;
    for (const it of items) { topX.push(acc); acc += topItemWidth(it); }
  }

  // No chrome rows above the top bar — title is inline.
  const topBarRow = 0;

  // Compute (left, top) for each open panel with offscreen detection + flip.
  // Panel 1 (1st submenu): top = topBarRow + 1, left = topX[openPath[0]] —
  //   if going off right edge, shift left until it fits (clamp >= 0).
  // Panel i+1 (cascade): prefer parent.left + parent.width. If the resulting
  //   right edge would exceed termWidth, FLIP to parent.left - panel.width.
  //   If THAT goes negative, clamp to 0 (overlapping but visible).
  interface PanelPos { left: number; top: number; width: number; height: number; items: MenuItem[]; openIdx: number | null; }
  const panels: PanelPos[] = [];
  for (let i = 1; i <= depth; i++) {
    const lvlItems = itemsAtPath(items, openPath.slice(0, i));
    const w = panelWidth(lvlItems);
    const h = lvlItems.length + 2;                 // border top+bottom + items
    let left: number;
    let top: number;
    if (i === 1) {
      const anchorIdx = openPath[0]!;
      const preferred = topX[anchorIdx]!;
      left = Math.max(0, Math.min(preferred, termWidth - w));
      top = topBarRow + 1;
    } else {
      const prev = panels[i - 2]!;
      const anchorIdx = openPath[i - 1]!;
      const rightSide = prev.left + prev.width;
      if (rightSide + w <= termWidth) {
        left = rightSide;
      } else {
        // Flip left of parent.
        const leftSide = prev.left - w;
        left = leftSide >= 0 ? leftSide : 0;       // clamp if even flipped doesn't fit
      }
      top = prev.top + 1 + anchorIdx;              // align top of cascade with parent's item row
    }
    const openIdx = i < depth ? openPath[i] ?? null : null;
    panels.push({ left, top, width: w, height: h, items: lvlItems, openIdx });
  }

  // ── Render ──────────────────────────────────────────────────────────────
  function renderTopBar(): ReactNode {
    // Bar spans 100% width, never dim. Focused item gets inverse + bold when
    // the menu is engaged; otherwise items render plain.
    function text(it: MenuItem): string {
      return ' '.repeat(TOP_PAD) + it.label + ' '.repeat(TOP_PAD);
    }
    return (
      <Box key="__topbar" flexDirection="row" width="100%">
        {title != null && <Box key="__title" bold>{titleText}</Box>}
        {items.map((it, i) => {
          const isFocused = depth === 0 && i === cursorClamped;
          const isOpenInPath = depth > 0 && openPath[0] === i;
          const highlight = active && (isFocused || isOpenInPath);
          return (
            <Box key={it.key} bold={highlight} inverse={highlight}>
              {text(it)}
            </Box>
          );
        })}
      </Box>
    );
  }

  function renderPanel(panelIdx: number): ReactNode {
    const p = panels[panelIdx]!;
    const isDeepest = panelIdx === depth - 1;
    const focusedIdx = isDeepest ? cursorClamped : (p.openIdx ?? -1);
    const hasAnySubmenu = p.items.some((it) => 'submenu' in it);
    const maxLabel = p.items.reduce((m, it) => Math.max(m, [...it.label].length), 0);

    return (
      <Box
        key={`panel-${panelIdx}`}
        position="absolute"
        top={p.top} left={p.left}
        width={p.width} height={p.height}
        border="single"
        backgroundColor="default"
        flexDirection="column"
      >
        {p.items.map((it, i) => {
          const focused = i === focusedIdx;
          const opened = !isDeepest && p.openIdx === i;
          const marker = 'submenu' in it ? (opened ? OPEN_MARK : SUBMENU_MARK) : ' ';
          const padded = it.label.padEnd(maxLabel, ' ');
          const text = hasAnySubmenu ? `${padded}  ${marker}` : padded;
          return (
            <Box key={it.key} bold={focused || opened} inverse={focused}>
              {text}
            </Box>
          );
        })}
      </Box>
    );
  }

  // Menu renders: top bar (1 row) + absolutely-positioned dropdown panels +
  // optional `children` as the page area below. Children's input is muted
  // while the menu is engaged (active=true), so list navigation inside the
  // page doesn't fight menu navigation. Press F10 to engage; Esc disengages.
  void helpHint;
  // Refuse to render on backends that can't accommodate the cascade overlay.
  // (The hook above already warned once.) Must come AFTER all other hooks
  // to preserve hook-call order across renders.
  if (!isFullScreen) return null;
  return (
    <Box flexDirection="column" width="100%" height="100%">
      {renderTopBar()}
      {panels.map((_, i) => renderPanel(i))}
      {/* Page area below the bar. `inert={active}` mutes input dispatch into
          the subtree while the menu is engaged — list cursors etc. won't fight
          menu navigation. The Box itself still lays out and paints normally. */}
      {children != null && (
        <Box key="__page" flexGrow={1} flexDirection="column" inert={active}>
          {children}
        </Box>
      )}
    </Box>
  );
}
