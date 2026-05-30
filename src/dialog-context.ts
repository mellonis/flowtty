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
   */
  openDialog<T = unknown>(element: ReactNode): Promise<DialogResult<T>>;
}

/** Dialog-side API: the dialog's own components call these to resolve. */
export interface DialogResultApi {
  done(value: unknown): void;
  cancel(): void;
}

const noopHost: DialogHostApi = {
  openDialog: <T = unknown>() =>
    Promise.resolve({ status: 'cancelled' } as DialogResult<T>),
};
const noopResult: DialogResultApi = { done() {}, cancel() {} };

export const DialogHostContext = createContext<DialogHostApi>(noopHost);
export const DialogResultContext = createContext<DialogResultApi>(noopResult);
