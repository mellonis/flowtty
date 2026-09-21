# flowtty things-tui Dogfood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** second dogfood app for flowtty — a TUI that talks to the **poetry-api** REST service at `https://api.poetry.ddev.site` (DDEV local). v1 scope: login → list "things" (poetry CMS items) → view a single thing's fields read-only. Different stress profile than articles-tui (which talks to the local filesystem): this exercises **authenticated HTTP + network latency + remote state** in a TUI, surfacing API gaps around loading indicators, error recovery, token expiry, and async-state lifecycles.

**Decisions confirmed:**
- Location: `flowtty/examples/things-tui/` (sibling to articles-tui)
- Scope v1: login + list + view (NO editing)
- Auth: prompt for credentials on each run, in-memory token (no persistence)
- API target: DDEV local `https://api.poetry.ddev.site` (config via env var `API_BASE_URL` later if needed; hardcoded for v1)

**Architecture:**
- Pure TS+JSX (.tsx files), `tsx` runtime, import flowtty via relative `../../src/index.js`
- Tiny `api.ts` module: fetch helper that injects Bearer token + parses JSON + throws typed errors. Token lives in module-scope (`let token: string | null`); set after login, read by every request.
- State machine (similar to articles-tui App): `'login' | 'list' | 'detail'`.
- Network calls happen in `async` event handlers (useInput / Button onPress), NOT in render. Loading and error states tracked in React state.

**Tech Stack:**
- TypeScript ESM (.tsx)
- React 19, flowtty (local src)
- `node:fetch` (Node 20+ has fetch built-in — no dep)

**Out of scope (v1):**
- Editing fields (next dogfood iteration; would need multi-line text editor primitive in flowtty)
- Creating new things (POST), deleting (DELETE)
- Token persistence across runs
- Refresh-token flow (re-prompt on 401 is enough)
- Search, pagination beyond first page
- Section navigation
- Comments/votes/notifications endpoints

---

## Scope check

Single subdir, ~10 small files. 3 tasks: setup+login, list, detail+README+polish.

---

## File Structure

```
examples/things-tui/
  index.tsx                       — entry; renders <DialogHost><App/></DialogHost>
  api.ts                          — fetch helper + endpoint typed functions (login, listThings, getThing)
  types.ts                        — Thing, ThingSummary, LoginResponse, AppView, etc.
  DialogChrome.tsx                — bordered dialog wrapper (cyan-when-top, etc.) — COPY from articles-tui pattern
  App.tsx                         — top-level state machine ('login' | 'list' | 'detail') + token + status message
  LoginView.tsx                   — email + password TextInputs + submit button
  ThingsListView.tsx              — fetch list + table + ↑↓/jk + Enter to open + Esc to logout
  ThingDetailView.tsx             — fetch one + read-only field display + Esc back
package.json                      — add `"things-tui": "tsx examples/things-tui/index.tsx"` script
```

---

### Task 1: Setup — api.ts + types.ts + DialogChrome.tsx + LoginView.tsx + App.tsx skeleton + index.tsx + npm script

**Files:** all of the above EXCEPT ThingsListView and ThingDetailView (those are Task 2 and 3).

- [ ] **Step 1: Read first** — `examples/articles-tui/DialogChrome.tsx`, `examples/articles-tui/App.tsx`, `examples/articles-tui/LangDialog.tsx` (pattern reference for dialog component shape). `poetry/poetry-api/CLAUDE.md` for endpoint contracts (look for `/auth/login` and `/cms/things` sections).

- [ ] **Step 2: Create `types.ts`:**

```ts
// examples/things-tui/types.ts
export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  user?: { id: number; login: string; isAdmin?: boolean; isEditor?: boolean };
}

// Fields returned by GET /cms/things (list summary — exact shape TBD via the API; this is a starting guess).
export interface ThingSummary {
  id: number;
  title: string;
  statusId?: number;
  startDate?: string;
  finishDate?: string;
}

// Fields returned by GET /cms/things/:id (single — verify against the API).
export interface Thing extends ThingSummary {
  content?: string;     // BBCode body
  notes?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export type AppView =
  | { kind: 'login' }
  | { kind: 'list' }
  | { kind: 'detail'; id: number };
```

- [ ] **Step 3: Create `api.ts`:**

```ts
// examples/things-tui/api.ts
import type { LoginResponse, ThingSummary, Thing } from './types.js';

const BASE = 'https://api.poetry.ddev.site';

let token: string | null = null;

export function setToken(t: string | null): void { token = t; }
export function getToken(): string | null { return token; }

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) {
    throw new ApiError(res.status, body, `${init.method ?? 'GET'} ${path} → ${res.status}`);
  }
  return body as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  // poetry-api uses `login` field for the user identifier; CLAUDE.md confirms /auth/login.
  // Body shape TBD — verify with the API; typical shape: { login, password } returning { accessToken, refreshToken, user }.
  return req<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: email, password }),
  });
}

export async function listThings(): Promise<ThingSummary[]> {
  return req<ThingSummary[]>('/cms/things');
}

export async function getThing(id: number): Promise<Thing> {
  return req<Thing>(`/cms/things/${id}`);
}
```

**NOTE:** the body shapes (`login` field name, response field names) are guesses based on the CLAUDE.md context. **VERIFY against the real API responses on first smoke test** and adjust. Possible alternative: API uses `email` instead of `login`; response uses `token` instead of `accessToken`. The implementer can use curl to check:
```bash
curl -X POST https://api.poetry.ddev.site/auth/login -H 'Content-Type: application/json' -d '{"login":"admin","password":"X"}' | jq .
```
Update api.ts to match the actual contract. If the API needs `email` vs `login`, adjust accordingly.

- [ ] **Step 4: Create `DialogChrome.tsx`** — copy the implementation from `examples/articles-tui/DialogChrome.tsx` verbatim, just adjust the relative-import path if necessary.

- [ ] **Step 5: Create `LoginView.tsx`:**

```tsx
import { useState } from 'react';
import { Box, TextInput, Button, FocusGroup } from '../../src/index.js';
import { DialogChrome } from './DialogChrome.js';
import { login, setToken, ApiError } from './api.js';

interface LoginViewProps {
  onSuccess: () => void;
}

export function LoginView({ onSuccess }: LoginViewProps) {
  const [emailValue, setEmailValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await login(emailValue, passwordValue);
      setToken(res.accessToken);
      onSuccess();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`Login failed (${e.status})`);
      } else {
        setError(String(e));
      }
      setLoading(false);
    }
  };

  return (
    <DialogChrome title="Login to api.poetry.ddev.site" minWidth={50}>
      <FocusGroup>
        <Box>Login (email or username):</Box>
        <TextInput value={emailValue} onChange={setEmailValue} onSubmit={() => {/* tab to password */}} />
        <Box>Password:</Box>
        <TextInput value={passwordValue} onChange={setPasswordValue} mask onSubmit={submit} />
        <Box marginTop={1} flexDirection="row" gap={2}>
          <Button label={loading ? 'Logging in…' : 'Login'} shortcut="return" onPress={submit} />
        </Box>
        {error && <Box color="red">{error}</Box>}
      </FocusGroup>
    </DialogChrome>
  );
}
```

**NOTE:** the focus system + button setup might need adjustment — see if Tab actually moves between TextInputs in the FocusGroup. flowtty's TextInput plugs into the focus system (per the Focus+Button plan T3). If it doesn't auto-cycle Tab between inputs, the user will work around by clicking Enter on the password field (which calls submit). For v1, manual Enter-to-submit on password field is fine.

- [ ] **Step 6: Create `App.tsx` (skeleton with login + placeholder list/detail):**

```tsx
import { useState } from 'react';
import { Box } from '../../src/index.js';
import { LoginView } from './LoginView.js';
import type { AppView } from './types.js';

interface AppProps { onExit: () => void; }

export function App({ onExit }: AppProps) {
  const [view, setView] = useState<AppView>({ kind: 'login' });
  if (view.kind === 'login') {
    return <LoginView onSuccess={() => setView({ kind: 'list' })} />;
  }
  if (view.kind === 'list') {
    return <Box>{'(list view: coming in Task 2)'}</Box>;
  }
  if (view.kind === 'detail') {
    return <Box>{`(detail view for thing ${view.id}: coming in Task 3)`}</Box>;
  }
  return null;
}
```

(`onExit` is accepted but not used in v1 skeleton; ListView in Task 2 will wire it to the Esc handler.)

- [ ] **Step 7: Create `index.tsx`:**

```tsx
import { render, DialogHost, TtyBackend } from '../../src/index.js';
import { App } from './App.js';

let handle: { unmount: () => void } | null = null;
handle = await render(
  <DialogHost>
    <App onExit={() => handle?.unmount()} />
  </DialogHost>,
  new TtyBackend(),
);
```

- [ ] **Step 8: Add npm script** to `package.json`:
```json
"things-tui": "tsx examples/things-tui/index.tsx"
```

- [ ] **Step 9: Sanity-load** + run a smoke check (DDEV must be running):
```bash
ddev list  # verify poetry-api is running and accessible
curl -sf https://api.poetry.ddev.site/health  # should return {status: 'ok', ...}
npx tsx -e "import('./examples/things-tui/index.tsx').catch(e => {console.error(String(e)); process.exit(0);})" < /dev/null
```
The example should render the LoginView without crashing. Full smoke-test is the user's job.

- [ ] **Step 10: Commit:**
```bash
git add examples/things-tui/ package.json
git commit -m "feat(things-tui): scaffolding + LoginView (Task 1)"
```

---

### Task 2: ThingsListView

**Files:** `examples/things-tui/ThingsListView.tsx`; update `App.tsx` to render it for `view.kind === 'list'`.

- [ ] **Step 1: Decide loading UX.** When the view mounts: `useEffect` fires `listThings()`, results land in state. While pending, show a "Loading…" placeholder. On error, show the error + a Retry button. On success, render the table.

- [ ] **Step 2: Component shape:**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { Box, useInput, useTerminalSize, Button, FocusGroup } from '../../src/index.js';
import { listThings, setToken, ApiError } from './api.js';
import type { ThingSummary } from './types.js';

interface ThingsListViewProps {
  onSelect: (id: number) => void;
  onLogout: () => void;
}

export function ThingsListView({ onSelect, onLogout }: ThingsListViewProps) {
  const [things, setThings] = useState<ThingSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const { width: termWidth } = useTerminalSize();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listThings();
      setThings(list);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // Token expired or invalid → drop token, route to login.
        setToken(null);
        onLogout();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { void reload(); }, [reload]);

  useInput((key) => {
    if (loading || error || !things) return;
    const rowCount = things.length;
    if (rowCount === 0) return;
    if (key.name === 'up' || key.name === 'k') setCursor((c) => (c - 1 + rowCount) % rowCount);
    else if (key.name === 'down' || key.name === 'j') setCursor((c) => (c + 1) % rowCount);
    else if (key.name === 'return') {
      const t = things[cursor];
      if (t) onSelect(t.id);
    } else if (key.name === 'escape') onLogout();
    else if (key.name === 'r') void reload(); // refresh
  });

  if (loading) return <Box>Loading things…</Box>;
  if (error) {
    return (
      <Box flexDirection="column">
        <Box color="red">Error: {error}</Box>
        <Box>Press 'r' to retry, Esc to logout.</Box>
      </Box>
    );
  }
  if (!things || things.length === 0) return <Box>No things found.</Box>;

  return (
    <Box flexDirection="column" height="100%">
      <Box justifyContent="center"><Box bold>Things</Box></Box>
      <Box dim>{'─'.repeat(termWidth)}</Box>
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="row">
          <Box width={2}>{'  '}</Box>
          <Box width={6} bold>id</Box>
          <Box bold>title</Box>
        </Box>
        <Box dim>{'─'.repeat(termWidth)}</Box>
        {things.map((t, i) => {
          const sel = i === cursor;
          return (
            <Box key={t.id} flexDirection="row">
              <Box width={2}>{sel ? '▸ ' : '  '}</Box>
              <Box width={6} bold={sel}>{String(t.id)}</Box>
              <Box bold={sel} flexGrow={1} wrap="truncate">{t.title}</Box>
            </Box>
          );
        })}
      </Box>
      <Box inverse wrap="truncate">
        {'↑↓/jk navigate · Enter open · r refresh · Esc logout'.padEnd(termWidth)}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Wire into App.tsx:**
```tsx
if (view.kind === 'list') {
  return <ThingsListView
    onSelect={(id) => setView({ kind: 'detail', id })}
    onLogout={() => { setToken(null); setView({ kind: 'login' }); }}
  />;
}
```

(Import setToken from `./api.js` in App.tsx.)

- [ ] **Step 4: Smoke-test verification** (subagent skips; user runs):
```bash
npm run things-tui
# Login → list appears → arrows navigate → Esc returns to login
# Press 'r' to refresh
```

- [ ] **Step 5: Commit:**
```bash
git add examples/things-tui/
git commit -m "feat(things-tui): list view with loading/error/401-logout (Task 2)"
```

---

### Task 3: ThingDetailView + README + final polish

**Files:** `examples/things-tui/ThingDetailView.tsx`; update App.tsx; (optional) docs.

- [ ] **Step 1: Component shape** — same loading/error pattern as ThingsListView:

```tsx
import { useEffect, useState } from 'react';
import { Box, useInput, useTerminalSize } from '../../src/index.js';
import { getThing, ApiError, setToken } from './api.js';
import type { Thing } from './types.js';

interface ThingDetailViewProps {
  id: number;
  onBack: () => void;
  onLogout: () => void;
}

export function ThingDetailView({ id, onBack, onLogout }: ThingDetailViewProps) {
  const [thing, setThing] = useState<Thing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { width: termWidth } = useTerminalSize();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const t = await getThing(id);
        if (!cancelled) setThing(t);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          setToken(null);
          onLogout();
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, onLogout]);

  useInput((key) => {
    if (key.name === 'escape') onBack();
  });

  if (loading) return <Box>Loading thing #{id}…</Box>;
  if (error) {
    return (
      <Box flexDirection="column">
        <Box color="red">Error: {error}</Box>
        <Box>Esc to back.</Box>
      </Box>
    );
  }
  if (!thing) return <Box>Not found.</Box>;

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="column">
        <Box flexDirection="row"><Box bold>id: </Box><Box>{String(thing.id)}</Box></Box>
        <Box flexDirection="row"><Box bold>title: </Box><Box flexGrow={1} wrap="wrap">{thing.title}</Box></Box>
        {thing.statusId !== undefined && (
          <Box flexDirection="row"><Box bold>statusId: </Box><Box>{String(thing.statusId)}</Box></Box>
        )}
        {thing.startDate && (
          <Box flexDirection="row"><Box bold>start: </Box><Box>{thing.startDate}</Box></Box>
        )}
        {thing.finishDate && (
          <Box flexDirection="row"><Box bold>finish: </Box><Box>{thing.finishDate}</Box></Box>
        )}
        {thing.notes && (
          <Box flexDirection="row"><Box bold>notes: </Box><Box flexGrow={1} wrap="wrap">{thing.notes}</Box></Box>
        )}
      </Box>
      <Box dim>{'─'.repeat(termWidth)}</Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {/* Body content — for v1, just dump the raw text; no pagination */}
        <Box wrap="wrap">{thing.content ?? '(no content)'}</Box>
      </Box>
      <Box inverse wrap="truncate">
        {'Esc back'.padEnd(termWidth)}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Wire into App.tsx:**
```tsx
if (view.kind === 'detail') {
  return <ThingDetailView
    id={view.id}
    onBack={() => setView({ kind: 'list' })}
    onLogout={() => { setToken(null); setView({ kind: 'login' }); }}
  />;
}
```

- [ ] **Step 3: Final smoke test** — login + list + open one + back + logout + re-login. Verify all work end-to-end.

- [ ] **Step 4: Commit:**
```bash
git add examples/things-tui/
git commit -m "feat(things-tui): detail view + final wiring (Task 3)"
```

---

## Self-Review

**1. Spec coverage:**
- Setup + login → Task 1.
- List → Task 2.
- Detail → Task 3.
- All scoped to "v1: list+view" per the user's choice.

**2. Placeholder scan:** the api.ts has TBD-shape NOTEs (login body field, response field) — implementer MUST verify via curl on first smoke test. That's intentional, not a placeholder leak.

**3. Type consistency:** `Thing` extends `ThingSummary`; `setToken(null)` on logout clears module-scope token. `ApiError` carries status + body for downstream branching (401 → logout).

**Risks worth flagging:**

1. **API contract guesses**: `accessToken` field name, `login` vs `email` request body field, exact `/cms/things` response shape — all educated guesses from the CLAUDE.md. Implementer runs `curl` against DDEV on first task to confirm and adjusts api.ts accordingly. Log corrections in commit message.

2. **Auth on the GET endpoints**: per CLAUDE.md, `/cms/things` and `/cms/things/:id` require editor + `canEditContent`. If the admin user (login=`admin`) you created via the first-run wizard doesn't have `canEditContent` bit, the list will 403. May need to check rights via `/auth/me` after login and surface a "Your account lacks editor permissions" error early.

3. **DDEV must be running**: the smoke tests assume `ddev start` was run in `poetry/poetry-api/`. If not, all fetches fail with connection refused. The error UI handles this (displays the error message); user should see "fetch failed: connect ECONNREFUSED" and remember to start DDEV.

4. **Token expiry**: not handled in v1. If the token expires mid-session, the next API call returns 401, ListView's 401 branch logs the user out and returns to login. User re-enters credentials.

5. **No multi-line text editor**: viewing a long `content` field with the v1 wrap="wrap" is fine for reading; editing would need a primitive flowtty doesn't have. Logged for future iteration.

6. **Network in TUI surface area**: this is the first flowtty app that does async I/O over the network in the UI loop. Loading states + cancel-on-unmount (via `cancelled` flag in useEffect) handle the basics. If the dogfood surfaces a need for a `useAsyncResource` or `Suspense`-style pattern, that's a followup plan candidate.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/things-tui.md`. Subagent-driven execution per pattern — Task 1 (Sonnet, scaffolding + login), Task 2 (Sonnet, list with loading/error/401), Task 3 (Sonnet, detail + final wiring). Each task's commit lands directly on master (the example is in `examples/things-tui/`, no flowtty source changes expected unless a gap surfaces).

After this dogfood completes, the natural next iteration is **edit support** — would require either: a multi-line text editor primitive in flowtty (new plan), OR shelling out to `$EDITOR` for body editing (cheap workaround; loses TUI consistency).
