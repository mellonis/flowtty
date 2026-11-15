# Menu-bar watcher — host state file Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** flow-assist mirrors each live session's status and agent tree to `<id>.state.json` beside the session file, so an external watcher can see exactly when something needs the person.

**Architecture:** one new module (`src/assistant/state-file.ts`) holds the v1 contract types, a pure snapshot builder and a small write loop that polls live conversations once a second and writes a session's file only when its snapshot changed. `closeSession` removes the file on clean close; a crash leaves it behind, which the watcher reads as stale.

**Tech Stack:** TypeScript 7 (tsc, `strict`), Bun 1.4 (`bun test`).

**Spec:** `menubar-watcher.md` (in this repo, the `## The how — Host side` section; this plan refines two wire details: timestamps are ISO-8601 strings, and `until` is a ms epoch or `null`, where the spec sample's `0` stood for "none").

## Global Constraints

- Contract v1 field names exactly: `version, id, project, title, pid, writtenAt, updatedAt, status, tree`; node: `key, label, kind, status, depth, answered, latest, at, until, shell{command, lines, running, state}`.
- `kind` is `'chat' | 'task' | 'subagent' | 'shell'`; `status` (node) `'waiting' | 'asks' | 'working' | 'queued' | 'delayed' | 'idle'`; `status` (file) `'working' | 'waiting' | 'held' | 'done' | 'idle'`.
- Every string written to a state file goes through `redactSecrets` (`src/assistant/secrets.ts`); file mode `0600`; writes atomic (tmp in the same dir + rename).
- TypeScript strict, no `any`; comments in English, present tense (repo `AGENTS.md`).
- Nothing about the TUI, sessions or journals changes observably; writer failures are swallowed, never thrown into a redraw or turn.
- Commits on `master`, conventional style (`feat:`, `test:`, `docs:`); tests use the repo's English `test('…')` names.

## Review Focus

- A y/n that opens must land in the file within about a second — the whole feature. Pinned by Task 3's `test('a y/n waiting for the person shows in the session state file', …)`.
- A secret in a label, command or latest text must never reach disk. Pinned by Task 1's `test('labels, latest text and commands are redacted', …)`.
- A full or read-only disk must not break the host. Pinned by Task 2's `test('a failing write never throws out of the tick', …)`.
- With sessions kept in memory (`dir === null` under `bun test`) nothing may be written. Pinned by Task 2's `test('no sessions dir means no writes', …)`.
- A reader must never see a half-written file. Pinned by Task 2's `test('the file is written atomically at 0600', …)`.

## File Structure

- Create `src/assistant/state-file.ts` — contract types, pure builder, stamp tracking, write loop. Type-only imports from `sessions.ts`/`conversation-types.ts`; no runtime cycles.
- Create `src/assistant/__tests__/state-file.test.ts`.
- Modify `src/assistant/sessions.ts:562` — `closeSession` removes the state file.
- Modify `src/plugins/assistant.ts:333` (the chat's `ConversationRegistry`) and `src/main.ts:409` (the CLI's) — start/stop the writer for the sessions dir in use.

---

### Task 1: Contract types and the pure snapshot builder

**Files:**
- Create: `src/assistant/state-file.ts`
- Test: `src/assistant/__tests__/state-file.test.ts`

**Interfaces:**
- Consumes: `TreeNode` (`src/assistant/conversation-types.ts:329` — has `key,label,kind,depth,status,latest,startedAt,until,below,answered,shell`), `redactSecrets(text: string): string`.
- Produces (exact, later tasks rely on these names):

```ts
export interface StateNode {
  key: string;                                       // 'root' for the chat itself
  label: string;
  kind: 'chat' | 'task' | 'subagent' | 'shell';
  status: 'waiting' | 'asks' | 'working' | 'queued' | 'delayed' | 'idle';
  depth: number;
  answered: boolean;
  latest: string;
  at: string;                                        // ISO-8601: when this status began
  until: number | null;                              // ms epoch, from TreeNode.until
  shell: { command: string; lines: number; running: boolean; state: string } | null;
}

export interface StateFileV1 {
  version: 1;
  id: string;
  project: string | null;
  title: string;
  pid: number;
  writtenAt: string;                                 // ISO-8601
  updatedAt: string;                                 // ISO-8601, the session's own
  status: 'working' | 'waiting' | 'held' | 'done' | 'idle';
  tree: StateNode[];                                 // [0] is the chat itself, then conv.tree() order
}

export type StateStamps = Map<string, { status: StateNode['status']; at: number }>;

export interface StateFileInput {
  id: string;
  project: string | null;
  title: string;
  status: StateFileV1['status'];
  updatedAt: number;
  pid: number;
  own: { status: StateNode['status']; latest: string; answered: boolean };
  nodes: TreeNode[];
}

export function stateStamp(stamps: StateStamps, key: string, status: StateNode['status'], now: number): string;
export function buildStateFile(input: StateFileInput, stamps: StateStamps, now: number): StateFileV1;
```

- [ ] **Step 1: Write the failing tests**

```ts
test('a snapshot mirrors the tree under a root row for the chat itself', () => {
  const file = buildStateFile(input({ own: { status: 'working', latest: 'writing', answered: false },
    nodes: [node('a', { label: 'maker', status: 'working', depth: 1 })] }), new Map(), 1000);
  expect(file.version).toBe(1);
  expect(file.tree[0]).toMatchObject({ key: 'root', kind: 'chat', label: 'you', depth: 0 });
  expect(file.tree[1]).toMatchObject({ key: 'a', label: 'maker', status: 'working', depth: 1, until: null });
  expect(file.pid).toBe(4242);                           // the pid passed in, not the test process's
});

test('a node keeps the time its status began across snapshots', () => {
  const stamps: StateStamps = new Map();
  const first = buildStateFile(input({ nodes: [node('a', { status: 'waiting' })] }), stamps, 1000);
  const second = buildStateFile(input({ nodes: [node('a', { status: 'waiting' })] }), stamps, 5000);
  const changed = buildStateFile(input({ nodes: [node('a', { status: 'working' })] }), stamps, 9000);
  expect(second.tree[1].at).toBe(first.tree[1].at);          // 1970-01-01T00:00:01.000Z
  expect(changed.tree[1].at).toBe(new Date(9000).toISOString());
});

test('labels, latest text and commands are redacted', () => {
  // seeds the secret set with TEST_TOKEN=<8+ chars>, then builds a snapshot whose
  // title, label, latest and shell.command each contain that value
  …
  for (const s of JSON.stringify(file).match(/TESTTOKEN|…/)) …             // the value is gone
  expect(JSON.stringify(file)).toContain('‹secret');                       // in its named form
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/assistant/__tests__/state-file.test.ts`
Expected: FAIL — `state-file` module not found.

- [ ] **Step 3: Implement `state-file.ts`**

`stateStamp` keeps one `{status, at}` per key: on a status change it re-stamps `at = now`, then returns `new Date(at).toISOString()`. `buildStateFile` maps `input` into `StateFileV1`: the root node is `key: 'root'`, `kind: 'chat'`, `label: 'you'`, `depth: 0` carrying `input.own`; each `TreeNode` copies `key, label, kind, depth, status` (`kind` passes through — `ChildSpec['kind'] | 'shell'` is exactly the contract's set), `answered = n.answered === true`, `until = n.until ?? null`, `shell = n.shell ? { command, lines, running, state } : null`, `latest` and `at` from `stateStamp(stamps, n.key, n.status, now)`. Every string (`title, label, latest, shell.command, shell.state`) goes through `redactSecrets`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/assistant/__tests__/state-file.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/assistant/state-file.ts src/assistant/__tests__/state-file.test.ts
git commit -m "feat: snapshot a conversation as contract-v1 state data"
```

---

### Task 2: The state-file writer

**Files:**
- Modify: `src/assistant/state-file.ts`
- Test: `src/assistant/__tests__/state-file.test.ts`

**Interfaces:**
- Consumes: `buildStateFile`, `StateFileInput`, `StateStamps` from Task 1; `fs`.
- Produces (exact):

```ts
export function startStateFiles(opts: {
  dir: string | null;
  sources: () => StateFileInput[];
  intervalMs?: number;                               // default 1000
  now?: () => number;
}): { stop(): void; flushNow(): void };
export function removeStateFile(dir: string, id: string): void;
```

- [ ] **Step 1: Write the failing tests**

```ts
test('a state file is written only when the snapshot changes', …)     // flushNow() twice, same source → one write; changed source → second write
test('a session that leaves is its state file removed', …)            // sources() drops one input → its '<id>.state.json' is gone from the temp dir
test('the file is written atomically at 0600', …)                     // after flushNow(): (fs.statSync(f).mode & 0o777) === 0o600 and no '*.tmp' sibling left
test('no sessions dir means no writes', …)                            // dir: null → flushNow() writes nothing anywhere, returns without throwing
test('a failing write never throws out of the tick', …)               // dir pointing at a read-only path → flushNow() returns, no throw
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/assistant/__tests__/state-file.test.ts`
Expected: FAIL — `startStateFiles is not a function`.

- [ ] **Step 3: Implement the writer**

One closure holds `stamps`, `last: Map<string, string>` (session id → serialized snapshot) and the timer. Each tick: for every `sources()` input, build the snapshot, serialize; when the string differs from `last`, write `path.join(dir, `${id}.state.json`)` via `fs.writeFileSync(tmp, …, { mode: 0o600 })` + `fs.renameSync`; ids seen last tick but not this one get `removeStateFile`. `removeStateFile` unlinks best-effort. Every tick runs inside `try/catch` — nothing escapes. `stop()` clears the timer.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/assistant/__tests__/state-file.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assistant/state-file.ts src/assistant/__tests__/state-file.test.ts
git commit -m "feat: write session state files on change, atomically"
```

---

### Task 3: Wiring into the host

**Files:**
- Modify: `src/assistant/state-file.ts` (add the input builder)
- Modify: `src/assistant/sessions.ts` — `closeSession` (:562), `removeSession`/`deleteSession`, `pruneSessions` (:654) all remove the state file of the session they take away
- Modify: `src/plugins/assistant.ts:333` (chat registry), `src/main.ts:409` (CLI registry)
- Test: `src/assistant/__tests__/state-file.test.ts`, one rig test in `src/__tests__/`

**Interfaces:**
- Consumes: `startStateFiles`, `removeStateFile` (Task 2); `Conversation` (`src/assistant/conversation.ts` — `sessionId, title, status, tree()`, `confirm`, `question`, `parentAsk`), `ConversationRegistry.statusOf(id)`.
- Produces (exact):

```ts
export function stateInputOf(conv: Conversation, status: StateFileV1['status'], forPid: number, now: number): StateFileInput;
```

- [ ] **Step 1: Write the failing tests**

```ts
test('closing a session takes its state file with it', …)             // temp dir holds <id>.state.json + <id>.json; closeSession(dir, id) → the state file is gone
test('pruning old sessions takes their state files with them', …)     // keep=1 over two sessions → the pruned one's state file is gone
test('a y/n waiting for the person shows in the session state file', …)  // rig test (see src/__tests__/ask-person.rig.test.ts for the harness):
//  rig sends a turn whose tool asks for a write; after rig.until(() => …waiting…),
//  startStateFiles({ dir, sources: … }); flushNow();
//  read <id>.state.json → status 'waiting', tree[0].status 'waiting', tree[0].latest names the tool.
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/assistant/__tests__/state-file.test.ts` and `bun test src/__tests__/`
Expected: FAIL (no `stateInputOf`; the state file is not removed).

- [ ] **Step 3: Implement `stateInputOf` and wire the host**

`stateInputOf` maps a live conversation onto `StateFileInput`: `own.status` is `'waiting'` when `conv.confirm || conv.question` (a wait for the person), `'asks'` when `conv.parentAsk`, else `'working'` when `conv.status === 'working'`, else `'idle'`; `own.latest` is `conv.confirm ? `${conv.confirm.name} — y/n`` : the open question's text (from `conv.question.state`, see `AskState`) : '' ; `nodes: conv.tree()`. In `plugins/assistant.ts` right after the registry is created (line 333): `startStateFiles({ dir: sessDir, sources: () => registry.live().map((c) => stateInputOf(c, registry.statusOf(c.sessionId) ?? 'idle', process.pid, Date.now())) })`, stopped on unmount beside `closeAll`. Same for the CLI registry at `main.ts:409`, stopped where its conversations close (`main.ts` ~501). Everywhere `sessions.ts` takes a session file off disk — `closeSession` (`sessions.ts:562`), `removeSession`/`deleteSession`, `pruneSessions` (`sessions.ts:654`) — `removeStateFile(dir, id)` joins it, best-effort.

- [ ] **Step 4: Run the tests and the typecheck to verify they pass**

Run: `bun test && bun run typecheck:src`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "feat: mirror live session state for an external watcher"
```
