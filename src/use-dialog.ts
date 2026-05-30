import { useContext } from 'react';
import {
  DialogHostContext,
  DialogIsTopContext,
  DialogResultContext,
  type DialogHostApi,
  type DialogResultApi,
} from './dialog-context.js';

/** Inside a dialog component: get { done, cancel } to resolve the openDialog promise. */
export function useDialog(): DialogResultApi {
  return useContext(DialogResultContext);
}

/** Anywhere under a <DialogHost>: get the host's openDialog. */
export function useDialogHost(): DialogHostApi {
  return useContext(DialogHostContext);
}

/** Inside a dialog component: true if THIS dialog is the topmost on the stack.
 *  Lower stacked dialogs read false. Use for visual treatments that highlight
 *  the active dialog (e.g., bold/coloured border vs. dim for inactive). */
export function useDialogIsTop(): boolean {
  return useContext(DialogIsTopContext);
}
