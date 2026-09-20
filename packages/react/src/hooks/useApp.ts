import { useContext } from 'react';
import { AppContext, type AppApi } from '../context/appContext.js';

/** The running app: `exit(result?)` quits from inside a component. */
export function useApp(): AppApi {
  return useContext(AppContext);
}
