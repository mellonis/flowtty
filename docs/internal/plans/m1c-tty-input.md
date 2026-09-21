# flowtty M1c — TTY Input Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `TtyBackend` deliver real keyboard input — implement `TtyBackend.onKey` over `process.stdin` in raw mode, with a ported `parseKeypress(bytes) → Key[]` decoder that handles printable chars, control bytes (`Ctrl-A`..`Z`, Tab, Enter, Backspace), the `ESC`-key, **CSI** sequences (arrows / `Home`/`End`/`Delete`/`PageUp`/`PageDown`), **SS3** sequences (alternate arrow/function-key encoding), and the **Mac Option-as-Meta** prefix (`ESC <char>` → `{name: <char>, meta: true}`). Acceptance is the M1a counter from `examples/` running on `TtyBackend` and reacting to actual keypresses.

**Architecture:** Pure decoder (`src/key-parser.ts`) — a single function `parseKeypress(input: string): Key[]` with no I/O, exhaustively unit-tested. `TtyBackend` (existing) gains `onKey`, `dispose` cleanup, and stdin lifecycle management; it pipes raw bytes through `parseKeypress` and dispatches the resulting `Key[]` to subscribers. The M1a `InputContext` wiring in `render.ts` already lights up automatically as soon as `backend.onKey` is defined — no `render.ts` changes needed.

**Tech Stack:** Same as M1b — TypeScript ESM, React 19, `react-reconciler@0.31.0`, `yoga-layout@3.2.1`, Vitest 4.

**Out of scope (later M1c plans):** `<Select>` / `<MultiSelect>` / `<Confirm>` prompts, `<Form>` + intra-form focus ring, embedded dialogs (`openDialog`), bracketed-paste, mouse, Kitty keyboard protocol, modifier-encoded arrows (`CSI 1;5A` etc.), grapheme/wide-char support beyond what already exists.

---

## Scope check

This is the first of ~3 M1c-scope plans:

- **M1c — TTY input (this plan):** parser + `TtyBackend.onKey` → real-terminal interactivity for everything that already exists (TextInput, counter). Acceptance = the counter example running on `TtyBackend`.
- **M1c.2 (next):** `<Select>` + `<MultiSelect>` + `<Confirm>` prompts (test backend + the just-shipped TTY backend will both light up).
- **M1c.3 (after):** intra-form focus ring + `<Form>` + `<Form.Field>` + cancel propagation, plus the embedded-`openDialog` pattern (MultiSelect's "+ add new" sub-prompt is the natural first user).

Each plan produces working, testable software on its own. This one's acceptance is a runnable interactive example on a real TTY.

---

## File Structure

```
src/
  key-parser.ts          # NEW — parseKeypress(input: string): Key[]
  key-parser.test.ts     # NEW — comprehensive sequence/byte coverage
  backends/tty.ts        # MODIFY — implement onKey + stdin lifecycle + dispose cleanup
  backends/tty.test.ts   # ADD — mock-stdin integration tests for onKey
  editor.ts              # MODIFY (small) — OPT_MAP['space'] → OPT_MAP[' '] (consistency with parser)
  editor.test.ts         # MODIFY (small) — Option+Space test uses name: ' ' instead of 'space'
  index.ts               # MODIFY — export parseKeypress (useful for users writing custom backends)
  README.md              # MODIFY — M1c status + real-terminal usage
examples/
  counter.ts             # NEW — the M1a counter on TtyBackend (manual smoke target)
```

Responsibilities:

- **`key-parser.ts`** is pure: takes a string of input bytes, returns a normalized `Key[]`. No `process.stdin`, no React, no Yoga. Drives the contract for any backend that has a byte source.
- **`backends/tty.ts`** owns the stdin lifecycle (raw mode on/off, listener add/remove, cursor show/hide) and just plumbs bytes through the parser; no decoding lives in this file.
- The two small `editor.ts`/`editor.test.ts` edits resolve an M1b inconsistency that surfaces the moment a real keyboard sends `ESC + ' '` for Option+Space (the parser produces `name: ' '`, not `name: 'space'`).

---

### Task 1: `parseKeypress` — the pure decoder

**Files:**
- Create: `src/key-parser.ts`
- Create: `src/key-parser.test.ts`

- [ ] **Step 1: Write the failing test `src/key-parser.test.ts`** (covers every byte class the parser must handle):

```ts
import { expect, test } from 'vitest';
import { parseKeypress } from './key-parser.js';

test('printable ASCII becomes one key per char (name === char, no modifiers)', () => {
  expect(parseKeypress('hi')).toEqual([
    { name: 'h', sequence: 'h', ctrl: false, meta: false, shift: false },
    { name: 'i', sequence: 'i', ctrl: false, meta: false, shift: false },
  ]);
});

test('printable Space → name " " (a single byte; consumers normalize, parser does not)', () => {
  const keys = parseKeypress(' ');
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatchObject({ name: ' ', sequence: ' ', ctrl: false, meta: false });
});

test('Return / newline / Tab / Backspace map to canonical names', () => {
  expect(parseKeypress('\r')[0]!.name).toBe('return');
  expect(parseKeypress('\n')[0]!.name).toBe('return');
  expect(parseKeypress('\t')[0]!.name).toBe('tab');
  expect(parseKeypress('\x7f')[0]!.name).toBe('backspace'); // DEL is what most terminals send for Backspace
  expect(parseKeypress('\x08')[0]!.name).toBe('backspace'); // BS for completeness
});

test('lone ESC at end of buffer → escape key (not an unterminated meta-prefix)', () => {
  expect(parseKeypress('\x1b')).toEqual([
    { name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false },
  ]);
});

test('Ctrl-A..Z → name is lowercase letter with ctrl=true', () => {
  expect(parseKeypress('\x01')[0]).toMatchObject({ name: 'a', ctrl: true, meta: false, shift: false });
  expect(parseKeypress('\x05')[0]).toMatchObject({ name: 'e', ctrl: true });
  expect(parseKeypress('\x17')[0]).toMatchObject({ name: 'w', ctrl: true });
});

test('CSI arrows ESC[A/B/C/D → up/down/right/left', () => {
  expect(parseKeypress('\x1b[A')[0]!.name).toBe('up');
  expect(parseKeypress('\x1b[B')[0]!.name).toBe('down');
  expect(parseKeypress('\x1b[C')[0]!.name).toBe('right');
  expect(parseKeypress('\x1b[D')[0]!.name).toBe('left');
});

test('CSI ESC[H / ESC[F → home/end', () => {
  expect(parseKeypress('\x1b[H')[0]!.name).toBe('home');
  expect(parseKeypress('\x1b[F')[0]!.name).toBe('end');
});

test('CSI ~ family: ESC[3~ delete, ESC[5~ pageup, ESC[6~ pagedown, ESC[1~ home, ESC[4~ end, ESC[2~ insert', () => {
  expect(parseKeypress('\x1b[3~')[0]!.name).toBe('delete');
  expect(parseKeypress('\x1b[5~')[0]!.name).toBe('pageup');
  expect(parseKeypress('\x1b[6~')[0]!.name).toBe('pagedown');
  expect(parseKeypress('\x1b[1~')[0]!.name).toBe('home');
  expect(parseKeypress('\x1b[4~')[0]!.name).toBe('end');
  expect(parseKeypress('\x1b[2~')[0]!.name).toBe('insert');
});

test('SS3 ESC O A/B/C/D → up/down/right/left (alternate arrow encoding)', () => {
  expect(parseKeypress('\x1bOA')[0]!.name).toBe('up');
  expect(parseKeypress('\x1bOB')[0]!.name).toBe('down');
  expect(parseKeypress('\x1bOH')[0]!.name).toBe('home');
  expect(parseKeypress('\x1bOF')[0]!.name).toBe('end');
});

test('Mac Option-as-Meta: ESC + char → {name: char, meta: true} (word ops + typography)', () => {
  // Option+b → meta+b (editor.ts reads this as word-back)
  expect(parseKeypress('\x1bb')[0]).toMatchObject({ name: 'b', meta: true, ctrl: false });
  // Option+Space → meta+' ' (editor.ts OPT_MAP[' '] → NBSP after Task 1 cleanup)
  expect(parseKeypress('\x1b ')[0]).toMatchObject({ name: ' ', meta: true });
  // Option+- → meta+'-' (editor.ts OPT_MAP['-'] → en-dash)
  expect(parseKeypress('\x1b-')[0]).toMatchObject({ name: '-', meta: true });
});

test('Mac Option+Backspace: ESC + DEL → {name: backspace, meta: true} (editor.ts word-back)', () => {
  expect(parseKeypress('\x1b\x7f')[0]).toMatchObject({ name: 'backspace', meta: true });
});

test('multiple keys in one chunk decode in order', () => {
  // User types "ab" + presses Right arrow → 3 keys in one chunk
  expect(parseKeypress('ab\x1b[C').map((k) => k.name)).toEqual(['a', 'b', 'right']);
});

test('unterminated CSI mid-buffer becomes escape + the remaining literal bytes', () => {
  // Pathological / paste: ESC [ then end of input → escape; the [ is consumed as a literal
  // (Pragmatic: report 'escape' to surface the issue rather than swallow silently.)
  const keys = parseKeypress('\x1b[');
  expect(keys[0]!.name).toBe('escape');
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/key-parser.test.ts`. (Module not found.)

- [ ] **Step 3: Write `src/key-parser.ts`:**

```ts
import type { Key } from './keys.js';

/**
 * Parse a chunk of input bytes (utf-8 string from stdin) into normalized Key events.
 *
 * Handles:
 *  - printable ASCII / Unicode (one Key per code unit; `name === sequence`)
 *  - control bytes: Tab, Return (CR/LF), Backspace (DEL/BS), Escape, Ctrl-A..Z
 *  - CSI sequences: ESC [ <params> <final> (arrows, Home, End, Delete, PageUp/Down, Insert)
 *  - SS3 sequences: ESC O <letter> (alternate arrow/Home/End encoding)
 *  - Mac Option-as-Meta: ESC <char> → {name: <char>, meta: true}
 *
 * NOT handled (later milestones): bracketed paste, mouse, Kitty protocol,
 * modifier-encoded arrows (CSI 1;5A etc.), F-keys beyond SS3.
 */
export function parseKeypress(input: string): Key[] {
  const out: Key[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;

    if (c === '\x1b') {
      // Lone ESC at end of buffer → the Escape key itself.
      if (i + 1 >= input.length) {
        out.push({ name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false });
        i++;
        continue;
      }
      const next = input[i + 1]!;

      // CSI: ESC [ <params> <final-byte 0x40-0x7E>
      if (next === '[') {
        let j = i + 2;
        while (j < input.length) {
          const code = input.charCodeAt(j);
          if (code >= 0x40 && code <= 0x7E) break;
          j++;
        }
        if (j < input.length) {
          const final = input[j]!;
          const params = input.slice(i + 2, j);
          out.push({
            name: csiName(final, params),
            sequence: input.slice(i, j + 1),
            ctrl: false, meta: false, shift: false,
          });
          i = j + 1;
          continue;
        }
        // Unterminated CSI → surface as Escape; drop the buffered prefix.
        out.push({ name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false });
        i = input.length;
        continue;
      }

      // SS3: ESC O <letter>
      if (next === 'O') {
        if (i + 2 < input.length) {
          const final = input[i + 2]!;
          out.push({
            name: ss3Name(final),
            sequence: input.slice(i, i + 3),
            ctrl: false, meta: false, shift: false,
          });
          i += 3;
          continue;
        }
        // Unterminated SS3 → escape
        out.push({ name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false });
        i = input.length;
        continue;
      }

      // Meta-prefix: ESC + <char> → that char with meta=true.
      // (Mac Option-modifier sends this; word ops + OPT_MAP typography both read it.)
      const charKey = parseChar(next);
      out.push({ ...charKey, meta: true, sequence: '\x1b' + next });
      i += 2;
      continue;
    }

    out.push(parseChar(c));
    i++;
  }
  return out;
}

function parseChar(c: string): Key {
  if (c === '\r' || c === '\n') return { name: 'return', sequence: c, ctrl: false, meta: false, shift: false };
  if (c === '\t') return { name: 'tab', sequence: c, ctrl: false, meta: false, shift: false };
  if (c === '\x7f' || c === '\x08') return { name: 'backspace', sequence: c, ctrl: false, meta: false, shift: false };
  if (c === '\x1b') return { name: 'escape', sequence: c, ctrl: false, meta: false, shift: false };
  const code = c.charCodeAt(0);
  // Ctrl-A..Z = 0x01..0x1A, excluding the named ones handled above.
  if (code >= 0x01 && code <= 0x1A) {
    const letter = String.fromCharCode(code + 0x60); // 0x01 → 'a'
    return { name: letter, sequence: c, ctrl: true, meta: false, shift: false };
  }
  // Printable / Unicode passthrough.
  return { name: c, sequence: c, ctrl: false, meta: false, shift: false };
}

function csiName(final: string, params: string): string {
  switch (final) {
    case 'A': return 'up';
    case 'B': return 'down';
    case 'C': return 'right';
    case 'D': return 'left';
    case 'H': return 'home';
    case 'F': return 'end';
    case '~':
      switch (params) {
        case '1': return 'home';
        case '2': return 'insert';
        case '3': return 'delete';
        case '4': return 'end';
        case '5': return 'pageup';
        case '6': return 'pagedown';
        default: return `csi-tilde-${params}`;
      }
    default: return `csi-${final}`;
  }
}

function ss3Name(final: string): string {
  switch (final) {
    case 'A': return 'up';
    case 'B': return 'down';
    case 'C': return 'right';
    case 'D': return 'left';
    case 'H': return 'home';
    case 'F': return 'end';
    case 'P': return 'f1';
    case 'Q': return 'f2';
    case 'R': return 'f3';
    case 'S': return 'f4';
    default: return `ss3-${final}`;
  }
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/key-parser.test.ts`. All ~13 tests pass. `npm run typecheck` clean.

- [ ] **Step 5: M1b consistency cleanup — `OPT_MAP['space']` → `OPT_MAP[' ']`**

The parser produces `name: ' '` for the space byte (matches the `Key` doc: "for printable ASCII chars this is the character itself"). But M1b's `OPT_MAP` keys Option+Space under `'space'`, so a real terminal sending `ESC ' '` would miss the typography branch. Fix it.

In `src/editor.ts`, find the `OPT_MAP` constant and replace:
```ts
const OPT_MAP: Record<string, [string] | [string, string]> = {
  ' ': [' '],                       // U+00A0 NBSP (was: 'space')
  '-':   ['–', '—'],             // en-dash U+2013, em-dash U+2014
  '[':   ['“', '”'],             // left/right double quote
  ']':   ['‘', '’'],             // left/right single quote
};
```

In `src/editor.test.ts`, find the Option+Space test and update the key name:
```ts
test('Option+Space inserts NBSP (U+00A0)', () => {
  const action = reduce(s('a', 1), key({ name: ' ', meta: true }));   // ← was 'space'
  expect(action.kind === 'edit' && action.state.value).toBe('a ');
});
```

- [ ] **Step 6: Verify cleanup + full suite green**

- `npx vitest run` → all tests pass (65 existing + ~13 new parser = ~78).
- `npm run typecheck` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/key-parser.ts src/key-parser.test.ts src/editor.ts src/editor.test.ts
git commit -m "feat: parseKeypress decoder + OPT_MAP space-key consistency"
```

---

### Task 2: `TtyBackend.onKey` — raw-mode stdin + parser integration

**Files:**
- Modify: `src/backends/tty.ts`

The existing `TtyBackend` writes to stdout (`HIDE_CURSOR` in constructor, `draw()`, `dispose()` restores). It has no `onKey`. This task wires `process.stdin` in raw mode through `parseKeypress` and delivers Keys to subscribers.

- [ ] **Step 1: Read `src/backends/tty.ts`** to confirm the current shape (constructor, `size`, `draw`, `dispose`).

- [ ] **Step 2: Replace `src/backends/tty.ts`** with:

```ts
import type { Buffer, Style } from '../cells.js';
import type { Key } from '../keys.js';
import { CLEAR, HIDE_CURSOR, RESET, SHOW_CURSOR, sgr } from '../ansi.js';
import { parseKeypress } from '../key-parser.js';
import type { Backend } from './types.js';

export class TtyBackend implements Backend {
  private readonly subscribers = new Set<(key: Key) => void>();
  private readonly inputDataHandler = (chunk: Buffer | string): void => {
    const s = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    const keys = parseKeypress(s);
    for (const key of keys) {
      for (const h of [...this.subscribers]) h(key);
    }
  };
  private inputAttached = false;
  private cursorHidden = false;

  constructor(
    private readonly out: NodeJS.WriteStream = process.stdout,
    private readonly input: NodeJS.ReadStream = process.stdin,
  ) {
    this.out.write(HIDE_CURSOR);
    this.cursorHidden = true;
  }

  size() {
    return { width: this.out.columns ?? 80, height: this.out.rows ?? 24 };
  }

  // M0: full-frame redraw (no diffing). Clears, then writes every line with
  // per-cell SGR. Frame-diffing is a later optimization behind this same seam.
  draw(buffer: Buffer): void {
    let outStr = CLEAR;
    for (let y = 0; y < buffer.height; y++) {
      let line = '';
      let last: Style | null = null;
      for (let x = 0; x < buffer.width; x++) {
        const cell = buffer.get(x, y);
        const styleStr = sgr(cell.style);
        if (JSON.stringify(cell.style) !== JSON.stringify(last)) {
          line += RESET + styleStr;
          last = cell.style;
        }
        line += cell.char;
      }
      outStr += line + RESET + (y < buffer.height - 1 ? '\n' : '');
    }
    this.out.write(outStr);
  }

  onKey(handler: (key: Key) => void): () => void {
    // Lazy: only flip stdin into raw mode + attach when the first subscriber arrives.
    if (!this.inputAttached) {
      if (this.input.isTTY) this.input.setRawMode(true);
      this.input.on('data', this.inputDataHandler);
      this.input.resume();
      this.inputAttached = true;
    }
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
      // Note: we intentionally do NOT detach the stdin listener when the last
      // subscriber leaves — render() always unsubscribes on unmount, and we
      // want dispose() (not onKey-unsubscribe) to own the lifecycle cleanup.
    };
  }

  dispose(): void {
    if (this.inputAttached) {
      this.input.removeListener('data', this.inputDataHandler);
      if (this.input.isTTY) this.input.setRawMode(false);
      this.input.pause();
      this.inputAttached = false;
    }
    if (this.cursorHidden) {
      this.out.write(SHOW_CURSOR + RESET);
      this.cursorHidden = false;
    }
  }
}
```

(Key additions: `subscribers` Set; `inputDataHandler` as a class-bound arrow so `removeListener` can find it; lazy `onKey` flips raw mode on first subscribe; `dispose` removes the listener + restores cooked mode + shows cursor; both `dispose` and `cursorHidden`/`inputAttached` flags are idempotent.)

- [ ] **Step 3: Verify the existing tests still pass + typecheck clean**

`npx vitest run` → all should still pass (the existing `tty.test.ts` tests construct TtyBackend with a stub stream and exercise `draw`/`dispose`; they don't touch `onKey`, and the new lazy `onKey` doesn't affect those paths).

`npm run typecheck` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/backends/tty.ts
git commit -m "feat: TtyBackend.onKey — raw-mode stdin + parseKeypress integration"
```

---

### Task 3: `TtyBackend.onKey` test — mock stdin → keys via parseKeypress

**Files:**
- Modify: `src/backends/tty.test.ts`

- [ ] **Step 1: Append failing tests to `src/backends/tty.test.ts`** (the file already imports `Buffer`, `TtyBackend`, etc.):

```ts
import { EventEmitter } from 'node:events';
// Already imported: TtyBackend, expect, test. Verify by reading the top of the file before adding.

function makeStdinStub() {
  const emitter = new EventEmitter() as EventEmitter & {
    isTTY: boolean;
    setRawMode: (b: boolean) => unknown;
    resume: () => unknown;
    pause: () => unknown;
  };
  emitter.isTTY = true;
  let rawMode = false;
  emitter.setRawMode = (b: boolean) => { rawMode = b; return emitter; };
  emitter.resume = () => emitter;
  emitter.pause = () => emitter;
  // Expose for assertions
  (emitter as unknown as { __rawMode(): boolean }).__rawMode = () => rawMode;
  return emitter as unknown as NodeJS.ReadStream & { __rawMode(): boolean };
}

function makeStdoutStub() {
  const writes: string[] = [];
  const stub = {
    columns: 10, rows: 1,
    write(s: string) { writes.push(s); return true; },
  } as unknown as NodeJS.WriteStream;
  return { stub, writes };
}

test('TtyBackend.onKey: flips raw mode on first subscribe and parses incoming bytes', () => {
  const { stub: out } = makeStdoutStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const received: string[] = [];

  const unsubscribe = back.onKey((k) => received.push(k.name));
  // Should have flipped raw mode on first subscribe.
  expect((stdin as unknown as { __rawMode(): boolean }).__rawMode()).toBe(true);

  // Simulate input: 'a' then ESC[C (right arrow)
  stdin.emit('data', 'a\x1b[C');
  expect(received).toEqual(['a', 'right']);

  unsubscribe();
  back.dispose();
  // After dispose: raw mode restored to cooked.
  expect((stdin as unknown as { __rawMode(): boolean }).__rawMode()).toBe(false);
});

test('TtyBackend.onKey: multiple subscribers each get every key', () => {
  const { stub: out } = makeStdoutStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const a: string[] = [];
  const b: string[] = [];
  back.onKey((k) => a.push(k.name));
  back.onKey((k) => b.push(k.name));
  stdin.emit('data', 'x');
  expect(a).toEqual(['x']);
  expect(b).toEqual(['x']);
  back.dispose();
});

test('TtyBackend.dispose: idempotent (calling twice does not throw)', () => {
  const { stub: out } = makeStdoutStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  back.onKey(() => {});
  expect(() => { back.dispose(); back.dispose(); }).not.toThrow();
});

test('TtyBackend.onKey: meta-prefix ESC + char produces meta-modified Key', () => {
  const { stub: out } = makeStdoutStub();
  const stdin = makeStdinStub();
  const back = new TtyBackend(out, stdin);
  const captured: Array<{ name: string; meta: boolean }> = [];
  back.onKey((k) => captured.push({ name: k.name, meta: k.meta }));

  // Option+b → ESC b
  stdin.emit('data', '\x1bb');
  // Option+Space → ESC ' '
  stdin.emit('data', '\x1b ');

  expect(captured).toEqual([
    { name: 'b', meta: true },
    { name: ' ', meta: true },
  ]);
  back.dispose();
});
```

- [ ] **Step 2: Run, verify PASS** — `npx vitest run src/backends/tty.test.ts`. The 4 new tests plus the existing 3 should pass (7 total in this file).

`npx vitest run` → full suite green. `npm run typecheck` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/backends/tty.test.ts
git commit -m "test: TtyBackend.onKey via mock stdin — parser integration, dispose, multi-sub"
```

---

### Task 4: Manual smoke — interactive counter on a real terminal

**Files:**
- Create: `examples/counter.ts`

- [ ] **Step 1: Write `examples/counter.ts`** (a runnable demo, not a vitest test):

```ts
import { createElement, useState } from 'react';
import { render, Box, Text, TtyBackend, useInput } from '../src/index.js';

function Counter() {
  const [n, setN] = useState(0);
  useInput((key) => {
    if (key.name === 'i') setN((x) => x + 1);
    if (key.name === 'd' && !key.ctrl) setN((x) => x - 1);
  });
  return createElement(Box, null, createElement(Text, null, `count: ${n}  (i=+, d=-, Ctrl-C exits)`));
}

const handle = await render(createElement(Counter), new TtyBackend());

// Exit cleanly on Ctrl-C.
process.on('SIGINT', () => {
  handle.unmount();
  process.exit(0);
});
```

- [ ] **Step 2: Manually run and verify** (this is the M1c acceptance — a human visual check, not an automated test):

```bash
npx tsx examples/counter.ts
```

Expected behavior:
- Frame renders `count: 0  (i=+, d=-, Ctrl-C exits)`.
- Pressing `i` increments the count (frame updates).
- Pressing `d` decrements.
- Pressing `Ctrl-C` unmounts cleanly: cursor restored, terminal back to cooked mode, no garbled state.

If the counter doesn't update on keypress:
- The `useInput` subscription isn't receiving keys → check `TtyBackend.onKey` is being called by `render()` (it should be, since `backend.onKey` is defined).
- The `flushSync` wrap from M1b should make each press synchronous; verify the frame updates immediately, not after a delay.

If the terminal is mangled after exit:
- `dispose()` isn't restoring cooked mode + showing cursor → check the `inputAttached`/`cursorHidden` flag logic.

- [ ] **Step 3: Commit**

```bash
git add examples/counter.ts
git commit -m "example: interactive counter on TtyBackend (M1c manual smoke)"
```

---

### Task 5: Public exports + README + final verification

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Update `src/index.ts`** — export `parseKeypress` (useful for users writing their own backends; e.g., a websocket-input backend, or a custom test harness). Add one line to the existing exports:

```ts
export { parseKeypress } from './key-parser.js';
```

- [ ] **Step 2: Update `README.md`** — find the existing `## Status` section, replace with:

```md
## Status

M1c (TTY input layer). `TtyBackend` now delivers real keyboard input — raw-mode
stdin is parsed via `parseKeypress` (CSI arrows, SS3, Mac Option-as-Meta,
Ctrl-A..Z, named keys) and dispatched to `useInput` subscribers the same way
the test backend does. The M1a `useInput` + M1b `<TextInput>` work on a real
terminal now: see `examples/counter.ts`.

### Still deferred (later M1c plans + later milestones)

- `<Select>` / `<MultiSelect>` / `<Confirm>` prompts — next M1c plan.
- `<Form>` + intra-form focus ring + embedded `openDialog` — the M1c plan after that.
- Frame diffing — full TTY redraw each `draw()`.
- Element-level styling (color/bold/etc.) on text — paint hardcodes empty style.
- Bracketed paste, mouse, Kitty keyboard protocol, modifier-encoded arrows
  (`CSI 1;5A` etc.) — not parsed yet (they'd surface as `csi-…` / `ss3-…` names).
```

- [ ] **Step 3: Final verification**

- `npx vitest run` → all tests pass.
- `npm run typecheck` → clean.
- `npm run build` → ESM + dts succeed; `dist/index.js`/`.d.ts` + `dist/testing.js`/`.d.ts` rebuilt (no warnings).
- `npx tsx examples/counter.ts` → still works (sanity check after exports change).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts README.md
git commit -m "chore: export parseKeypress + document M1c TTY-input state"
```

---

## Self-Review

**1. Spec coverage** (M1c portion of `docs/design.md` addressed by this plan):
- "TTY-backend stdin raw-mode + key parsing" → Tasks 1–3.
- The "normalized raw keyboard stream `Key { name, sequence, ctrl, meta, shift }`" contract → Task 1 (`parseKeypress` produces this shape).
- The M1b inconsistency in `OPT_MAP['space']` (which would silently break Option+Space on a real keyboard) → Task 1 Step 5.

**2. Placeholder scan:** no "TBD" / "add error handling" / vague guidance. The deferred parser features (bracketed paste, mouse, Kitty, modifier arrows) are explicitly named with their owning future milestone.

**3. Type consistency:** `Key` (M1a) shape is reused without change; `parseKeypress: (input: string) → Key[]` matches across `key-parser.ts`, `key-parser.test.ts`, and `tty.ts`; `Backend.onKey` (M1a interface) is implemented identically to `TestBackend.onKey` semantics.

**Risks worth flagging for the implementer (not blockers):**

1. **Multi-byte UTF-8 / wide characters in the parser (Task 1).** The current parser iterates by UTF-16 code units (`input[i]`), which is fine for ASCII and BMP code points but splits surrogate pairs. M1c's keyboard input is overwhelmingly ASCII / BMP, so this isn't a real bug today; flag it for the future. If a test fails with a surprising name for a non-ASCII paste, that's the cause.

2. **The `inputDataHandler` arrow-property pattern (Task 2).** Using a class field as `private readonly inputDataHandler = (chunk) => {...}` rather than a method ensures `removeListener` gets the same function reference that `addListener` got. If a future refactor switches to a method + `.bind(this)`, dispose's `removeListener` will silently fail to detach — that's the kind of thing the dispose-idempotency test in Task 3 will NOT catch (it only checks no-throw). A `console.log` in the handler is the quickest way to verify detachment if you ever suspect a leaked listener.

3. **Lazy `onKey` activation (Task 2).** `setRawMode(true)` only fires when the first subscriber arrives — that's intentional (a passive view backend doesn't claim the terminal). But if a consumer wires `onKey` *after* `render(...)` resolves, the first paint will happen in cooked mode briefly. Not an issue for `render.ts` (which subscribes synchronously inside the InputContext.Provider mount), but worth knowing.

4. **Mock stdin uses `EventEmitter` (Task 3).** Sufficient for our `input.on('data', ...)` / `removeListener` / `resume` / `pause` surface, but it isn't a full `NodeJS.ReadStream`. Casts at construction time make TS accept it. If the test's stub doesn't behave like the real stream, the test is the canary.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/m1c-tty-input.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Same as M0 / M1a / M1b.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
