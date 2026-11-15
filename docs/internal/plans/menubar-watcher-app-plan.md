# Menu-bar watcher — the macOS app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a menu-bar-only macOS app that reads flow-assist's `*.state.json` files and shows every session's agents grouped by how much they need the person, with notifications on the flips that matter.

**Architecture:** a SwiftPM executable bundled into an `LSUIElement` `.app`. Everything decision-shaped (grouping, ordering, state phrases, which notifications to send) is pure Swift tested with `swift test`; SwiftUI only renders the model. The app never writes into the sessions directory — its one piece of state (the notification cache) lives in its own Application Support folder.

**Tech Stack:** Swift 5.9+, SwiftUI `MenuBarExtra`, `UserNotifications`, `DispatchSource`, `swift test`. Target macOS 13+.

**Spec:** `menubar-watcher.md` (sibling of this plan; see `## The how — Watcher side` and the chosen composition A). The host half is `menubar-watcher-host-state-file-plan.md`.

## Global Constraints

- Contract v1 keys are exactly the host plan's: file `version, id, project, title, pid, writtenAt, updatedAt, status, tree`; node `key, label, kind, status, depth, answered, latest, at, until, shell{command, lines, running, state}`. Times are ISO-8601 strings; `until` is a ms epoch or `null`.
- Strictly read-only in the sessions dir: never create, write, move or delete anything there. No network.
- `LSUIElement` — no Dock icon. The app starts its life as a local build in `dist/` (no signing, no auto-update).
- Sections in this order: **Needs you** / **Working** / **Answers unread**; idle sessions are omitted. Glyph ladder: `⏸ n` → `⚙` → `✓` → dimmed `◌`.
- Notifications: on a flip into waiting, on a new unread answer, a reminder at most every 10 minutes while a wait persists, and one catch-up per session on launch/wake for waits older than 10 minutes. Sound off. `lastNotifiedAt` per session id persists in `~/Library/Application Support/flow-assist-menubar/notifications.json`.
- The code and its comments in English (the host repo's language rule).

## Review Focus

- One corrupt or half-copied state file must not take the menu down: pinned by Task 3's `test("a state file that does not parse leaves the rest standing")`.
- A missing or empty sessions dir must read as "no sessions", not an error: pinned by Task 3's `test("a missing sessions dir scans to an empty list")`.
- Relaunch must not re-notify waits it already spoke about: pinned by Task 6's `test("a restart does not re-notify a wait already notified")`.
- An overnight wait must surface on wake: pinned by Task 6's `test("a wait older than ten minutes at launch notifies once and is quiet after")`.
- A relative `sessions.dir` (the host resolves it against its own cwd) must be ignored in favour of the default: pinned by Task 3's `test("a relative sessions.dir is ignored in favour of the default")`.

## File Structure

New repo `flowtty-things/flow-assist-menubar/` (sibling of `flow-assist`):

- `Package.swift` — executable `flow-assist-menubar` + test target.
- `scripts/build-app.sh` — `swift build -c release`, then assembles `dist/flow-assist-menubar.app` (Contents/MacOS binary, `Contents/Info.plist` with `LSUIElement=true`, `CFBundleIdentifier` `ru.mellonis.flow-assist-menubar`).
- `Sources/FlowAssistMenuBar/StateFile.swift` — `StateFileV1`/`StateNode` Decodable + `SessionFile` (only `title, updatedAt, answeredAt, seenAt, closed`).
- `Sources/FlowAssistMenuBar/SessionsLocator.swift` — resolves the sessions dir.
- `Sources/FlowAssistMenuBar/SessionsScanner.swift` — one scan of the dir: `[SessionState]`; owns staleness and parse-tolerance.
- `Sources/FlowAssistMenuBar/DirectoryWatcher.swift` — DispatchSource on the tree + a 30 s reconcile tick feeding the model.
- `Sources/FlowAssistMenuBar/MenuModel.swift` — grouping, ordering, glyph: pure.
- `Sources/FlowAssistMenuBar/Format.swift` — state phrases and durations: pure.
- `Sources/FlowAssistMenuBar/Notifier.swift` — `notificationPlan(…)` pure + delivery + cache.
- `Sources/FlowAssistMenuBar/App.swift` — `@main`, MenuBarExtra/menu wiring, footer actions.
- `Tests/FlowAssistMenuBarTests/` — one test file per pure unit + `Fixtures/`.

---

### Task 1: Scaffold and the app bundle

**Files:**
- Create: `Package.swift`, `Sources/FlowAssistMenuBar/App.swift`, `scripts/build-app.sh`, `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the executable target `flow-assist-menubar`; `scripts/build-app.sh` yields `dist/flow-assist-menubar.app`.

- [ ] **Step 1: Scaffold `Package.swift` and a static `App.swift`**

`App.swift` is `@main struct FlowAssistMenuBarApp: App` with a `MenuBarExtra` (title `"◌"`), its menu listing one static row "No sessions" and the footer rows (`Open flow-assist (tmux)`, `Preferences…` disabled placeholder, `Quit flow-assist-menubar`).

- [ ] **Step 2: Verify the build**

Run: `swift build` — Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Write `scripts/build-app.sh` and run it**

Assembles the bundle per the File Structure note. Run: `bash scripts/build-app.sh` — Expected: `dist/flow-assist-menubar.app` exists; `open dist/flow-assist-menubar.app` shows the `◌` icon with the static menu and no Dock icon.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: menu-bar app skeleton with app-bundle build script"
```

---

### Task 2: Contract decoding

**Files:**
- Create: `Sources/FlowAssistMenuBar/StateFile.swift`, `Tests/FlowAssistMenuBarTests/StateFileDecodingTests.swift`, `Tests/FlowAssistMenuBarTests/Fixtures/state-*.json`

**Interfaces:**
- Consumes: nothing.
- Produces (exact): `struct StateFileV1: Decodable` with the contract keys (`version: Int, id, project: String?, title, pid: Int, writtenAt: Date, updatedAt: Date, status: Status, tree: [StateNode]`), `enum Status: String, Decodable { case working, waiting, held, done, idle }`, `struct StateNode: Decodable` (`key, label, kind, status: String, depth, answered, latest, at: Date, until: Double?, shell: ShellNode?`), plus `struct SessionFile: Decodable { let title: String; let updatedAt: Date; let answeredAt: Date?; let seenAt: Date?; let closed: Bool? }`. Decoding tolerates a missing `shell`/`until`/`answered` (older files) via decodeIfPresent defaults.

- [ ] **Step 1: Write the failing tests**

```swift
func testDecodesAContractV1File()          // fixture with root + task + shell nodes → fields map exactly (kind "subagent", until 1794742192000 as Double, at parsed)
func testToleratesAnOlderFileWithoutOptionals()   // no shell/until/answered → decodes with defaults
func testRejectsAWrongVersion()            // version 2 → throws/nil, the scanner will skip it
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `swift test --filter StateFileDecodingTests`
Expected: FAIL — types not found.

- [ ] **Step 3: Implement `StateFile.swift`**

Straight `Decodable` mirroring the contract; `at`/`updatedAt`/`writtenAt` decode ISO-8601 with fractional seconds tolerated (`.iso8601` plus a fallback strategy).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `swift test --filter StateFileDecodingTests` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: decode the host's state-file contract"
```

---

### Task 3: Locating and scanning sessions

**Files:**
- Create: `Sources/FlowAssistMenuBar/SessionsLocator.swift`, `Sources/FlowAssistMenuBar/SessionsScanner.swift`, `Tests/FlowAssistMenuBarTests/SessionsScannerTests.swift`

**Interfaces:**
- Consumes: `StateFileV1`, `SessionFile` (Task 2).
- Produces (exact):

```swift
struct SessionState: Equatable {
    let id: String
    let title: String
    let project: String?
    let status: StateFileV1.Status          // working | waiting | held | done | idle
    let file: StateFileV1?                  // nil when only the session json is present
    let stale: Bool                         // state file present but its pid is gone / mtime old
}
enum SessionsLocator {
    static func sessionsDir(default defaultDir: String = "~/.config/flow-assist/sessions", hostConfig: String = "~/.config/flow-assist") -> String?
}
struct SessionsScanner { func scan(dir: String) -> [SessionState] }
```

- [ ] **Step 1: Write the failing tests**

```swift
func testAMissingSessionsDirScansToAnEmptyList()
func testAStateFileThatDoesNotParseLeavesTheRestStanding()   // 3 fixtures, middle one corrupt → 2 rows
func testARelativeSessionsDirIsIgnoredInFavourOfTheDefault() // host config sets "sessions": {"dir": "somewhere"} → locator returns the default
func testALockHeldSessionReadsLiveAndAStaleOneDimmed()       // staleness: pid alive (use ProcessInfo.processInfo.processIdentifier) vs long-gone mtime
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `swift test --filter SessionsScannerTests` — Expected: FAIL.

- [ ] **Step 3: Implement locator and scanner**

The locator mirrors the host's rule (`sessionsDir`/`configDir` in `flow-assist/src/assistant/sessions.ts` and `src/config/load.ts`): `sessions.dir` from `config.json`/`config.local.json` when absolute or `~`-prefixed, else `$XDG_CONFIG_HOME/flow-assist/sessions` or `~/.config/flow-assist/sessions`. The scanner walks `sessions/*/<id>.json` and its `<id>.state.json` sibling one level under a mirror of the project path (same layout the host writes), decodes best-effort per file, marks `stale` when the state file's `pid` is not a live process. It never writes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `swift test --filter SessionsScannerTests` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scan the host's sessions dir read-only"
```

---

### Task 4: Menu model — grouping, ordering, phrases

**Files:**
- Create: `Sources/FlowAssistMenuBar/MenuModel.swift`, `Sources/FlowAssistMenuBar/Format.swift`, `Tests/FlowAssistMenuBarTests/MenuModelTests.swift`

**Interfaces:**
- Consumes: `SessionState` (Task 3).
- Produces (exact):

```swift
struct MenuRow: Equatable { let id: String; let title: String; let phrase: String; let nodes: [StateNode] /* tree rows, root included */ }
enum MenuSection: Equatable, CaseIterable { case needsYou, working, answersUnread }
struct MenuModel: Equatable { let sections: [(MenuSection, [MenuRow])] /* in case order, empty sections omitted */ }
enum MenuBuilder {
    static func model(from sessions: [SessionState], now: Date) -> MenuModel
    static func glyph(_ sessions: [SessionState]) -> String   // "⏸ 2" | "⚙" | "✓" | "◌"
}
enum Format {
    static func phrase(_ s: SessionState, now: Date) -> String   // "waiting for a y/n" | "3 working · 12m" | "answered 6m ago" | "waiting 1h 2m"
    static func nodeLine(_ n: StateNode, now: Date) -> String    // "⏸ write_file · README.md — y/n", "○ sh-2 · bun test · running 2m · 112 lines"
}
```

Grouping rule (the spec's, verbatim): `waiting` → `needsYou`; else any node `working|queued|delayed` → `working`; else `unseenAnswer` (`answeredAt > seenAt`, ISO strings compared lexically) → `answersUnread`; else omitted. Sort within a group by the age of the triggering state (the waiting node's `at`, else the newest node `at`), oldest first.

- [ ] **Step 1: Write the failing tests**

```swift
func testAGroupedByStateWithTreeRows()        // 4 SessionStates across the three groups, tree rows carried under their session
func testAModelRoutedAskDoesNotRaiseNeedsYou() // node status "asks", session status "working" → goes to .working
func testGlyphLadder()                        // needsYou n≥1 → "⏸ 2"; else working → "⚙"; else unread → "✓"; else "◌"
func testPhrases()                            // the exact strings in Format's doc comment against fixed now
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `swift test --filter MenuModelTests` — Expected: FAIL.

- [ ] **Step 3: Implement `MenuModel.swift` and `Format.swift`**

Pure functions only; the phrase wording is the spec's mockup A vocabulary.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `swift test --filter MenuModelTests` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: group sessions by attention with the agent tree inline"
```

---

### Task 5: The menu itself and the footer

**Files:**
- Modify: `Sources/FlowAssistMenuBar/App.swift`
- Create: `Sources/FlowAssistMenuBar/DirectoryWatcher.swift`

**Interfaces:**
- Consumes: `MenuBuilder`, `Format` (Task 4), `SessionsScanner` (Task 3).
- Produces: `final class DirectoryWatcher { init(dir: String, onChange: @escaping () -> Void); func start(); func stop() }` — DispatchSource fs events on the sessions dir tree, coalesced, plus a 30 s reconcile call to `onChange`.

- [ ] **Step 1: Wire the model into the menu (composition A)**

`App.swift` holds `@State var sessions: [SessionState]`, rebuilt on `onChange` (main thread). The menu renders `MenuModel.sections` in order: a section header ("Needs you — 2"), for each row a bold session line with `Format.phrase`, and beneath it indented node lines with `Format.nodeLine`; then the separator and footer: `Open flow-assist (tmux)` (runs `open -a Terminal` with `tmux attach -t <name>`; name from `preferences.json` in Application Support, default `flow-assist`), `Preferences…` (disabled placeholder), `Quit flow-assist-menubar` (`NSApplication.shared.terminate`). The icon label is `MenuBuilder.glyph(sessions)`.

- [ ] **Step 2: Verify visually against fixture files**

Run: `swift build && bash scripts/build-app.sh && open dist/flow-assist-menubar.app` with `Fixtures/` copied into a scratch sessions dir (a `--sessions-dir` launch argument overrides the locator for this check).
Expected: sections and rows match mockup A (the `.superpowers/brainstorm/` mockups in the host repo), glyph follows the fixtures as they are edited.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: render the dropdown as state sections with the agent tree"
```

---

### Task 6: Notifications, catch-up and the cache

**Files:**
- Create: `Sources/FlowAssistMenuBar/Notifier.swift`, `Tests/FlowAssistMenuBarTests/NotifierTests.swift`
- Modify: `Sources/FlowAssistMenuBar/App.swift`, `README.md`

**Interfaces:**
- Consumes: `SessionState`, `MenuModel` (Task 4).
- Produces (exact):

```swift
struct Notice: Equatable { let sessionId: String; let title: String; let body: String; let isCatchUp: Bool }
enum Notifier {
    static func plan(previous: [SessionState], current: [SessionState], now: Date,
                     lastNotified: [String: Date], isLaunch: Bool) -> [Notice]
    static func cacheURL() -> URL      // ~/Library/Application Support/flow-assist-menubar/notifications.json
}
final class Delivery { func requestPermission(); func send(_ n: Notice); var lastNotified: [String: Date] { get set } }
```

Rules (the spec's): a session that entered `waiting` now → one notice; a new `answersUnread` (its `answeredAt` advanced past the previous one) → one notice; a wait persisting and last notified ≥ 10 min ago → one reminder; on `isLaunch`, a session already `waiting` whose wait began (its waiting node's `at`) more than 10 min ago and never notified in the cache → one catch-up notice. Cache updated on every send.

- [ ] **Step 1: Write the failing tests**

```swift
func testAFlipIntoWaitingNotifiesOnce()
func testARestartDoesNotReNotifyAWaitAlreadyNotified()          // isLaunch, cache says 2 min ago → no notice
func testAWaitOlderThanTenMinutesAtLaunchNotifiesOnceAndIsQuietAfter()  // first plan → catch-up; second plan with updated cache → []
func testAReminderWaitsOutTheTenMinutes()
func testANewUnreadAnswerNotifies()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `swift test --filter NotifierTests` — Expected: FAIL.

- [ ] **Step 3: Implement `Notifier.swift` and the delivery**

`plan` is pure; `Delivery` persists `lastNotified` atomically to `cacheURL()` and posts via `UNUserNotificationCenter` (sound off, one per session). `App.swift` calls `plan(previous:current:now:lastNotified:isLaunch:)` on every rebuild (first rebuild after launch sets `isLaunch`), then `send`s.

- [ ] **Step 4: Run the full test suite and finish the README**

Run: `swift test` — Expected: PASS. `README.md`: what the app watches, the launch argument, the preferences file, how to build/install.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: notify on waits and unread answers, with launch catch-up"
```
