// One tokenizer, parameterised per language. A `LangSpec` names the pieces a
// line-oriented highlighter needs — keywords, comment markers, string
// delimiters, a few extra regex rules — and `tokenizeLine` walks a line once,
// left to right, emitting styled runs. Everything it emits is a slice of the
// input, so a line's segments always re-join to the line.
//
// Cross-line constructs (block comments, triple-quoted strings) live in the
// `EngineState` the caller threads through a whole fenced block.

import { createBuilder } from './tokenColors.js';
import type { EngineState, LangSpec, SegBuilder, StringRule, TokenType } from './types.js';

export function createState(): EngineState {
  return { depth: 0 };
}

/** Index just past the next `end` marker, or -1 when the line runs out. */
function findEnd(line: string, from: number, end: string, escape: boolean): number {
  let i = from;
  while (i < line.length) {
    if (escape && line[i] === '\\') { i += 2; continue; }
    if (line.startsWith(end, i)) return i + end.length;
    i++;
  }
  return -1;
}

// `#` only opens a comment at the start of a word — otherwise `url#frag` and
// `#rrggbb` would swallow the rest of the line.
function commentStartsAt(line: string, i: number, marker: string): boolean {
  if (!line.startsWith(marker, i)) return false;
  if (marker !== '#') return true;
  return i === 0 || /[\s;&|({[]/.test(line[i - 1]!);
}

const NUMBER_RE = /(?:0[xXbBoO][0-9a-fA-F_]+|\.\d[\d_]*|\d[\d_]*(?:\.\d[\d_]*)?)(?:[eE][+-]?\d+)?[a-zA-Z%]*/y;
const DEFAULT_IDENT_RE = /[A-Za-z_$·-￿][\w$·-￿]*/y;

function openString(
  line: string, i: number, rule: StringRule, state: EngineState, b: SegBuilder,
): number {
  const end = rule.end ?? rule.start;
  const token = rule.token ?? 'string';
  const escape = rule.escape ?? true;
  const close = findEnd(line, i + rule.start.length, end, escape);
  if (close >= 0) {
    b.push(line.slice(i, close), token);
    return close;
  }
  b.push(line.slice(i), token);
  if (rule.multiline) state.open = { end, token, escape };
  return line.length;
}

/**
 * Tokenize `line` (from `from`) into `b`, stopping early when `stop` says so.
 * Returns the index it stopped at — `line.length` unless `stop` fired.
 */
export function tokenize(
  line: string, spec: LangSpec, state: EngineState, b: SegBuilder,
  from: number = 0, stop?: (i: number) => boolean,
): number {
  let i = from;
  // Only whitespace so far → rules marked `atLineStart` still apply.
  let atLineStart = from === 0;

  const emit = (text: string, token: TokenType): void => {
    b.push(text, token);
    if (atLineStart && text.trim() !== '') atLineStart = false;
  };

  outer: while (i < line.length) {
    if (stop?.(i)) return i;

    if (spec.hook) {
      const next = spec.hook(line, i, state, b);
      if (next > i) { i = next; atLineStart = false; continue; }
    }

    for (const rule of spec.rules ?? []) {
      if (rule.atLineStart && !atLineStart) continue;
      rule.re.lastIndex = i;
      const m = rule.re.exec(line);
      if (!m || m.index !== i || m[0] === '') continue;
      const token = typeof rule.token === 'function' ? rule.token(m) : rule.token;
      if (token === undefined) continue;
      emit(m[0], token);
      i += m[0].length;
      continue outer;
    }

    for (const rule of spec.strings ?? []) {
      if (!line.startsWith(rule.start, i)) continue;
      const next = openString(line, i, rule, state, b);
      atLineStart = false;
      i = next;
      continue outer;
    }

    for (const marker of spec.lineComments ?? []) {
      if (!commentStartsAt(line, i, marker)) continue;
      emit(line.slice(i), 'comment');
      return line.length;
    }

    for (const c of spec.blockComments ?? []) {
      if (!line.startsWith(c.start, i)) continue;
      const close = findEnd(line, i + c.start.length, c.end, false);
      if (close < 0) {
        emit(line.slice(i), 'comment');
        state.open = { end: c.end, token: 'comment', escape: false };
        return line.length;
      }
      emit(line.slice(i, close), 'comment');
      i = close;
      continue outer;
    }

    if (spec.numbers !== false) {
      NUMBER_RE.lastIndex = i;
      const m = NUMBER_RE.exec(line);
      if (m && m.index === i) { emit(m[0], 'number'); i += m[0].length; continue; }
    }

    const identRe = spec.identRe ?? DEFAULT_IDENT_RE;
    identRe.lastIndex = i;
    const word = identRe.exec(line);
    if (word && word.index === i) {
      const raw = word[0];
      const key = spec.ignoreCase ? raw.toLowerCase() : raw;
      emit(raw, spec.keywords?.has(key) ? 'keyword' : 'plain');
      i += raw.length;
      continue;
    }

    const ch = line[i]!;
    if (ch === '{') state.depth++;
    else if (ch === '}' && state.depth > 0) state.depth--;
    emit(ch, 'plain');
    i++;
  }
  return i;
}

/**
 * Finish a construct the previous line left open. Returns where the line's own
 * tokenizing starts — `line.length` when the construct is still open.
 */
export function resumeOpen(line: string, state: EngineState, b: SegBuilder): number {
  if (!state.open) return 0;
  const { end, token, escape } = state.open;
  const close = findEnd(line, 0, end, escape);
  if (close < 0) {
    b.push(line, token);
    return line.length;
  }
  b.push(line.slice(0, close), token);
  state.open = undefined;
  return close;
}

/** One line of `spec`, continuing whatever `state` left open. */
export function tokenizeLine(line: string, spec: LangSpec, state: EngineState): SegBuilder {
  const b = createBuilder();
  let i = resumeOpen(line, state, b);
  if (i === 0 && spec.lineStart) i = spec.lineStart(line, state, b);
  if (i < line.length) tokenize(line, spec, state, b, i);
  return b;
}
