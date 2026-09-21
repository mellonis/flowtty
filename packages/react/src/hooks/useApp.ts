import { useContext } from 'react';
import { AppContext, type AppApi } from '../context/appContext.js';

/**
 * The running app: `exit(result?)` quits from inside a component, and
 * `bell()` / `notify(title, body?)` ask for the person's attention when they
 * are looking at another window. See docs/app.md (getting attention).
 */
export function useApp(): AppApi {
  return useContext(AppContext);
}
