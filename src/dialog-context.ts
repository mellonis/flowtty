import { createContext, type ReactNode } from 'react';

/** Result returned to the openDialog caller. */
export type DialogResult<T> =
  | { status: 'done'; value: T }
  | { status: 'cancelled' };

/** Host-side API: any descendant can call openDialog. */
export interface DialogHostApi {
  /**
   * Mount `element` as a modal dialog. Returns a promise that resolves when
   * the dialog calls done(value) (→ {status:'done',value}) or cancel()
   * (→ {status:'cancelled'}). Calling openDialog while one is already open
   * PUSHES a new dialog on top of the stack — previously open dialogs stay
   * alive, render behind the new one, and receive input again when the top
   * dialog is closed.
   *
   * Options:
   *   - `title` — when set, the overlay wraps the element in a full-screen
   *     bordered Box with `title` painted into the top border. Use when you
   *     want a "window-frame" chrome the dialog content doesn't have to
   *     render itself. The element fills the inside of the frame.
   */
  openDialog<T = unknown>(element: ReactNode, options?: OpenDialogOptions): Promise<DialogResult<T>>;
}

export interface OpenDialogOptions {
  /** Painted into the top border line of the wrapper. Truncated with `…` if too long. */
  title?: string;
  /**
   * When true, the wrapper is content-sized (with optional min/max constraints)
   * and the DialogHost overlay centers it on the screen — i.e. a "floating"
   * dialog. When false (default), the wrapper fills the overlay (full-screen
   * windowed view).
   */
  floating?: boolean;
  /** Minimum wrapper width. Effective in floating mode. */
  minWidth?: number | string;
  /** Maximum wrapper width. Defaults to '80%' in floating mode. */
  maxWidth?: number | string;
  /** Maximum wrapper height. Defaults to '80%' in floating mode. */
  maxHeight?: number | string;
  /** Padding (cells) inside the wrapper between border and content. */
  padding?: number;
}

/** Dialog-side API: the dialog's own components call these to resolve. */
export interface DialogResultApi {
  done(value: unknown): void;
  cancel(): void;
}

const noopHost: DialogHostApi = {
  openDialog: <T = unknown>(_e?: unknown, _o?: OpenDialogOptions) =>
    Promise.resolve({ status: 'cancelled' } as DialogResult<T>),
};
const noopResult: DialogResultApi = { done() {}, cancel() {} };

export const DialogHostContext = createContext<DialogHostApi>(noopHost);
export const DialogResultContext = createContext<DialogResultApi>(noopResult);

/** True when this dialog is the topmost on the stack (receives input + should
 *  render its focused/active visual treatment). Lower stacked dialogs read false.
 *  Outside a DialogHost the default is true (so standalone dialog components
 *  outside a stack render in their "active" style). */
export const DialogIsTopContext = createContext<boolean>(true);
