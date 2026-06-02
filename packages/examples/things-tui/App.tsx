/** @jsxImportSource react */
import { useState } from 'react';
import { LoginView } from './LoginView.js';
import { MainMenuView } from './MainMenuView.js';
import { setToken } from './api.js';
import type { AppView } from './types.js';

interface AppProps { onExit: () => void; }

// Auth state machine only — sub-views are pushed as dialogs over MainMenuView,
// which stays mounted for the entire authed session. Cursor preservation falls
// out for free: dialogs stack, parents stay mounted underneath.
export function App({ onExit }: AppProps) {
  const [view, setView] = useState<AppView>({ kind: 'login' });
  const logout = () => { setToken(null); setView({ kind: 'login' }); };

  if (view.kind === 'login') {
    return <LoginView onSuccess={() => setView({ kind: 'main-menu' })} onExit={onExit} />;
  }
  return <MainMenuView onLogout={logout} />;
}
