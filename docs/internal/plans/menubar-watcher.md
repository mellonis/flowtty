# Menu-bar watcher for flow-assist — design

Date: 2026-11-15
Status: implemented — the host half in the `flow-assist` repository, the app half in
the standalone `flow-assist-menubar` repository.

## Intent and why

Long unattended runs of flow-assist (typically detached in tmux) need a person only
at two moments: a `y/n` confirmation and a question from the assistant. Today those
moments are easy to miss — the host fires one desktop notification each ("a toast and
a system alert say so once"), and nothing shows the current state of every session
after that. This project adds a macOS **menu-bar watcher**: a small always-visible
app that shows what each session and its agents are doing, grouped by how much they
need you. First step is strictly **read-only**: it observes, it never acts.

## Goals

1. A menu-bar icon whose glyph reflects the worst state across all sessions
   (`⏸ n` something waits for you — `⚙` everything running — `✓` an answer is
   unread — dimmed nothing/no host).
2. A dropdown organized as **state sections with the agent tree inline**
   (chosen composition A): `Needs you` / `Working` / `Answers unread`; each session
   is a row and its agents — subagents, background tasks, shells — sit under it,
   indented, in the host's own vocabulary (`⏸ waiting for a y/n`,
   `? asks its parent`, `⚙ working`, `○ sh-2 · bun test · running 2m · 112 lines`).
3. macOS notifications on the state flips that matter: a session enters
   `waiting` (y/n or question), or an answer arrives and is unread. While something
   stays waiting, re-notify at most every 10 minutes (the host's own alert fires once).
4. Everything comes from state the host writes to disk. The watcher never talks to a
   live process, and nothing it does can affect the host's work.

## Non-goals (this version)

- Answering the y/n, answering questions, sending messages (future step 2).
- Launching, supervising or re-launching flow-assist (tmux/your shell does that).
- Per-session "jump to this chat inside the TUI" (the TUI has no remote control).
- History, statistics, export. Linux/Windows. Auto-update, signing/notarization.

## Anti-goals

- The watcher is never required: the host must behave exactly the same without it,
  and survive its absence, misconfiguration or a corrupt read.
- It must never write into the host's files and never block or slow the host.
- No network, no telemetry.

## Constraints

- **`waiting` is not on disk today.** `Conversation.confirm/question/parentAsk` live
  in process memory; the journal records a `confirm` when it is *answered*. The
  watcher would be blind exactly at the key moment without a small host change —
  this is the reason for approach 2 below.
- **Several flow-assist processes can run at once** (one per tmux window / project),
  each with its own session locks. Any shared writable state is contention; state
  must be per-session, written only by the process that owns the session.
- **Secrets.** `saveSession` writes session files through the masking in
  `src/assistant/secrets.ts`. The new state files carry labels and short status
  text (a tool name, a command line) and must go through the same masking and the
  same `0600` permissions.
- Host code follows the repo's own rules: TypeScript strict, comments in English,
  present tense. The watcher is a separate macOS app: Swift + SwiftUI, menu-bar
  only (no Dock icon).

## Approaches

1. **Pure file watcher, zero host changes.** Reads `sessions/` as-is. Rejected: the
   one signal that matters — "waiting for a y/n or a question" — is invisible on
   disk (see Constraints). The host's `answers unread` (via `answeredAt > seenAt`)
   would work, but the menu would lie about the main event.
2. **Small host patch persisting its state + the watcher.** Chosen. The host already
   computes everything needed (`statusOf`, the `TreeNode[]` of `agent-tree.ts`,
   `nodeState()`); it gains a tiny writer that mirrors that state to disk on change.
   The watcher stays trivial and exact. Trade-off: we own and maintain a patch to the
   host — acceptable, it is our host (and the patch is on the host's side of the API
   boundary, versioned, so it can be kept small).
3. **Live channel (unix socket under the host's `sockets/` dir).** Real-time, no
   polling. Deferred: it is approach 2 plus networking before any of it has proven
   useful. The state-file format is the contract either way; a push channel can be
   layered on later without redesign.

Menu composition: three mockups were reviewed; **A — state sections with the agent
tree inline** was chosen. B (sessions first, tree in hover submenus) keeps the
dropdown short but hides the tree behind hover, which is worse for a glance. C
(agents all the way up) answers "what needs me now" fastest but loses "what is this
session doing". The icon glyph and the footer rows are as in mockup A (kept in
`.superpowers/brainstorm/` of the host repo).

## The how

### Host side (patch in the flow-assist repo)

- A new unit (e.g. `src/assistant/state-file.ts`) writes
  `sessions/<mirror>/<id>.state.json` — beside `<id>.json` — whenever the
  conversation's status or its tree changes, coalesced (debounced write, plus a
  forced write when a wait opens/closes and when a turn ends).
- Content (contract `version: 1`):

  ```json
  {
    "version": 1,
    "id": "t-…", "project": "…", "title": "…",
    "pid": 4242, "writtenAt": "2026-11-15T09:41:00Z",
    "status": "working | waiting | held | done | idle",
    "tree": [
      { "key": "…", "label": "…", "kind": "task | subagent | shell | …",
        "status": "waiting | asks | working | queued | delayed | idle",
        "depth": 1, "answered": false, "latest": "text", "until": 0,
        "at": "2026-11-15T09:40:12Z",
        "shell": { "command": "…", "lines": 112, "running": true, "state": "…" } }
    ]
  }
  ```

  The tree is exactly the nodes `agent-tree.ts` draws; `status` is the picker's
  `SessionStatus`. `at` is when a node entered its current state — for
  `waiting|asks` the moment the ask opened (the host has it: `PendingConfirm.at` /
  `ParentAskInfo.at`); the menu orders by it, and it is what tells a fresh watcher
  "already waiting" from "just became waiting". Written through the secrets mask,
  `0600`.
- Lifecycle: rewritten while the session is live; **deleted** on `closeSession`
  and by the existing session sweep (`sessions.keep`). A crash leaves a stale
  file; the watcher detects staleness (no lock / pid dead) and dims the row —
  it never deletes or edits host files.

### Watcher side (new app)

- New repo `flow-assist-menubar` (name is a placeholder) in `flowtty-things/`,
  beside `flow-assist`. Swift + SwiftUI, `LSUIElement` (menu-bar only), built with
  SwiftPM plus a script that assembles the `.app` bundle — no Xcode project.
- Reads the same sessions dir the host resolves (`sessions.dir` config or its
  default), overridable in Preferences. Read-only: never writes into it.
- Change detection: `DispatchSource` fs events on the sessions tree (debounced),
  plus a slow (≈30 s) reconcile poll so a missed event cannot strand the UI.
- Dropdown = composition A. The grouping key per session is its `status` — the host
  already computes it exactly (`registry.statusOf`): a wait counts only when a
  **person** must answer it; a subagent question routed to the parent model is no
  wait. `waiting` → **Needs you**; else any node `working|queued|delayed` →
  **Working**; else `unseenAnswer` → **Answers unread**; idle sessions are omitted.
  A `? asks its parent` node is drawn in the session's tree either way; only a
  person-routed ask puts the session in **Needs you**. Sessions are sorted within a
  group by the age of the triggering state (the node's `at`). A row shows the
  session title and a state phrase in the picker's vocabulary (`waiting for a y/n`,
  `3 working · 12m`, `answered 6m ago`) — never a message excerpt. Tree rows below
  carry their own `latest` text for working nodes, as the host draws them.
- Icon glyph: `⏸ n` (n = number of sessions needing you) → `⚙` → `✓` → dimmed
  `◌` (nothing / host not running / all stale).
- Notifications (`UserNotifications`, permission requested at first launch):
  on a flip into `waiting`, on a new unread answer; grouped per session; while a
  wait persists, a reminder at most every 10 minutes. Sound off by default.
  **Catch-up:** a wait already pending when the watcher starts (or the Mac wakes)
  and older than 10 minutes gets one "still waiting" notification per session. The
  watcher remembers `lastNotifiedAt` per session in its own Application Support
  (never in the sessions dir), so repeated restarts cannot re-fire them.
- Footer: `Open flow-assist (tmux)` (opens Terminal and attaches to a configured
  tmux session), `Preferences…`, `Quit watcher`.

### What is left to the builder

- Swift packaging details (bundle skeleton, Info.plist, app name/id).
- Exact menu strings and glyphs beyond mockup A; long-title truncation.
- Debounce and reconcile intervals; fs-event granularity on macOS.
- Tests: the host patch under the repo's `bun test` conventions (the state file is
  pure data — snapshot the JSON against a fixed tree); the watcher's parsing and
  grouping logic as `swift test` units. UI itself is not unit-tested.
- Distribution is local build only in this version.

## Future (explicitly not designed here)

Answering from the menu and a guardian that keeps the host alive are step two. They
would add a host-side inbox (or the socket of approach 3) — the state file stays the
read-only contract, so nothing here is painted into a corner.
