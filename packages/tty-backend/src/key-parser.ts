import type { Key } from '@flowtty/core';

/**
 * Decode a chunk of input bytes (utf-8 string from stdin) into normalized Key
 * events, returning any trailing bytes that form an incomplete escape sequence.
 *
 * Callers that read stdin in chunks must prepend `rest` to the next chunk so a
 * sequence split across reads (e.g. ESC[ in one read, A in the next) decodes as
 * one key instead of surfacing as a stray Escape. A lone trailing ESC is NOT
 * buffered — without a timer we can't tell "Escape pressed" from "start of a
 * sequence", and treating it as Escape is the more useful default.
 *
 * Handles:
 *  - printable ASCII / Unicode (one Key per code point; `name === sequence`)
 *  - control bytes: Tab, Return (CR/LF), Backspace (DEL/BS), Escape, Ctrl-A..Z
 *  - CSI sequences: ESC [ <params> <final> (arrows, Home, End, Delete, PageUp/Down, Insert)
 *  - SS3 sequences: ESC O <letter> (alternate arrow/Home/End encoding)
 *  - Function keys F1..F12: SS3 (ESC O P..S) for unmodified F1–F4, CSI letter
 *    (ESC[1;<mod>P..S) for modified F1–F4, and tilde form (ESC[11~..[24~) for all
 *  - Mac Option-as-Meta: ESC <char> → {name: <char>, meta: true}
 *
 * NOT handled (later): bracketed paste, mouse, Kitty protocol, F13+.
 */
export function decodeKeys(input: string): { keys: Key[]; rest: string } {
  const out: Key[] = [];
  // Iterate by Unicode code point so astral characters (emoji, etc.) stay
  // intact instead of splitting into UTF-16 surrogate halves. Every byte of an
  // escape sequence is ASCII, so this is also correct for the sequence paths.
  const chars = [...input];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i]!;

    if (c === '\x1b') {
      // Lone ESC at end of buffer → the Escape key itself.
      if (i + 1 >= chars.length) {
        out.push({ name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false });
        i++;
        continue;
      }
      const next = chars[i + 1]!;

      // CSI: ESC [ <params> <final-byte 0x40-0x7E>
      if (next === '[') {
        let j = i + 2;
        while (j < chars.length) {
          const code = chars[j]!.charCodeAt(0);
          if (code >= 0x40 && code <= 0x7E) break;
          j++;
        }
        if (j < chars.length) {
          const final = chars[j]!;
          const params = chars.slice(i + 2, j).join('');
          // CSI Z = Shift+Tab (xterm backtab). Carry the shift modifier.
          if (final === 'Z' && params === '') {
            out.push({
              name: 'tab',
              sequence: chars.slice(i, j + 1).join(''),
              ctrl: false, meta: false, shift: true,
            });
            i = j + 1;
            continue;
          }
          // Modifier-encoded sequences carry the modifier as a trailing param:
          // letters → "1;<mod>" + final (ESC[1;5D = Ctrl+Left); tilde-family →
          // "<code>;<mod>~" (ESC[3;5~ = Ctrl+Delete). The modifier value minus 1
          // is a bitmask: 1=Shift, 2=Alt/Meta, 4=Ctrl.
          const parts = params.split(';');
          const mod = parts.length > 1 ? decodeModifier(Number(parts[parts.length - 1])) : NO_MOD;
          const name = final === '~' ? tildeName(parts[0] ?? '') : csiFinalName(final, parts);
          out.push({
            name,
            sequence: chars.slice(i, j + 1).join(''),
            ctrl: mod.ctrl, meta: mod.meta, shift: mod.shift,
          });
          i = j + 1;
          continue;
        }
        // No final byte yet — the CSI is split across reads. Hand it back as
        // `rest` so the next chunk can complete it.
        return { keys: out, rest: chars.slice(i).join('') };
      }

      // SS3: ESC O <letter>
      if (next === 'O') {
        if (i + 2 < chars.length) {
          const final = chars[i + 2]!;
          out.push({
            name: ss3Name(final),
            sequence: chars.slice(i, i + 3).join(''),
            ctrl: false, meta: false, shift: false,
          });
          i += 3;
          continue;
        }
        // Missing the SS3 final letter — split across reads; buffer it.
        return { keys: out, rest: chars.slice(i).join('') };
      }

      // Meta-prefix: ESC + <char> → that char with meta=true.
      const charKey = parseChar(next);
      out.push({ ...charKey, meta: true, sequence: '\x1b' + next });
      i += 2;
      continue;
    }

    // Collapse a CRLF pair into a single return. Some terminals and pasted
    // text use \r\n line endings; without this each newline emits two Enter
    // keys (e.g. a double form submit).
    if (c === '\r' && chars[i + 1] === '\n') {
      out.push({ name: 'return', sequence: '\r\n', ctrl: false, meta: false, shift: false });
      i += 2;
      continue;
    }

    out.push(parseChar(c));
    i++;
  }
  return { keys: out, rest: '' };
}

/**
 * One-shot decode for callers that don't buffer across reads (and for tests).
 * An incomplete trailing sequence surfaces as a bare Escape — the historical
 * behavior — rather than being silently dropped.
 */
export function parseKeypress(input: string): Key[] {
  const { keys, rest } = decodeKeys(input);
  if (rest.length > 0) {
    keys.push({ name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false });
  }
  return keys;
}

function parseChar(c: string): Key {
  if (c === '\r' || c === '\n') return { name: 'return', sequence: c, ctrl: false, meta: false, shift: false };
  if (c === '\t') return { name: 'tab', sequence: c, ctrl: false, meta: false, shift: false };
  if (c === '\x7f' || c === '\x08') return { name: 'backspace', sequence: c, ctrl: false, meta: false, shift: false };
  if (c === '\x1b') return { name: 'escape', sequence: c, ctrl: false, meta: false, shift: false };
  const code = c.charCodeAt(0);
  if (code >= 0x01 && code <= 0x1A) {
    const letter = String.fromCharCode(code + 0x60);
    return { name: letter, sequence: c, ctrl: true, meta: false, shift: false };
  }
  return { name: c, sequence: c, ctrl: false, meta: false, shift: false };
}

interface Modifier { ctrl: boolean; meta: boolean; shift: boolean; }
const NO_MOD: Modifier = { ctrl: false, meta: false, shift: false };

/** Decode an xterm CSI modifier param (1-based) into modifier flags. */
function decodeModifier(value: number): Modifier {
  if (!Number.isFinite(value) || value < 2) return NO_MOD;
  const m = value - 1;
  return { shift: (m & 1) !== 0, meta: (m & 2) !== 0, ctrl: (m & 4) !== 0 };
}

/** Name for a CSI sequence whose key is encoded in the final byte (arrows, Home/End). */
function csiFinalName(final: string, parts: string[]): string {
  switch (final) {
    case 'A': return 'up';
    case 'B': return 'down';
    case 'C': return 'right';
    case 'D': return 'left';
    case 'H': return 'home';
    case 'F': return 'end';
    // vt220-style F1–F4 arrive ONLY as CSI 1;<mod> P/Q/R/S with mod ≥ 2 (e.g.
    // Ctrl+F1 = ESC[1;5P); unmodified F1–F4 use the SS3 form (ESC O P..S). The
    // 1;<mod> guard is what stops a cursor-position report (ESC[<row>;<col>R,
    // the DSR reply) from being misread as F3 — its params are coordinates, not
    // "1;<modifier>". flowtty never issues DSR, so the residual ESC[1;{2..16}R
    // overlap with modified F3 is unreachable in practice.
    case 'P': case 'Q': case 'R': case 'S':
      if (!isVt220FunctionForm(parts)) return `csi-${final}`;
      return final === 'P' ? 'f1' : final === 'Q' ? 'f2' : final === 'R' ? 'f3' : 'f4';
    default: return `csi-${final}`;
  }
}

/** True for the vt220 modified-F1–F4 param form: exactly "1;<mod>" with mod ≥ 2. */
function isVt220FunctionForm(parts: string[]): boolean {
  return parts.length === 2 && parts[0] === '1' && Number(parts[1]) >= 2;
}

/** Name for a CSI tilde-family sequence, keyed by the numeric code (ESC[<code>~). */
function tildeName(code: string): string {
  switch (code) {
    case '1': return 'home';
    case '2': return 'insert';
    case '3': return 'delete';
    case '4': return 'end';
    case '5': return 'pageup';
    case '6': return 'pagedown';
    // Function keys F1..F12 (xterm/vt100 standard tilde form). Note the gap:
    // there is no code 16 or 22 in this scheme.
    case '11': return 'f1';
    case '12': return 'f2';
    case '13': return 'f3';
    case '14': return 'f4';
    case '15': return 'f5';
    case '17': return 'f6';
    case '18': return 'f7';
    case '19': return 'f8';
    case '20': return 'f9';
    case '21': return 'f10';
    case '23': return 'f11';
    case '24': return 'f12';
    default: return `csi-tilde-${code}`;
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
