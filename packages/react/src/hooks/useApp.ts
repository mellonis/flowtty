import { useContext } from 'react';
import { AppContext, type AppApi } from '../context/appContext.js';

/**
 * The running app: `exit(result?)` quits from inside a component,
 * `bell()` / `notify(title, body?)` ask for the person's attention when they
 * are looking at another window (docs/app.md — getting attention), and
 * `copy(text)` puts text on the system clipboard, reporting whether it landed
 * (docs/app.md — the clipboard), `suspend(fn)` hands the terminal to another
 * program for the duration of `fn` (docs/app.md — handing the terminal over),
 * and `colorScheme` says whether the terminal is light or dark as of now
 * (docs/app.md — the color scheme; `useColorScheme()` for the value that
 * re-renders).
 */
export function useApp(): AppApi {
  return useContext(AppContext);
}
