import { useContext } from 'react';
import {
  DialogHostContext,
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
