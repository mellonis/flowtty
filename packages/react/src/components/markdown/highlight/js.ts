// JavaScript / TypeScript, and the JSX markup inside them. The JS half is the
// shared engine with a keyword set; the markup half is the same tag tokenizer
// `html` uses, so a tag looks identical in both.

import { createState, resumeOpen, tokenize } from './engine.js';
import { createMarkupState, markupTag, type MarkupOptions } from './markup.js';
import { createBuilder } from './tokenColors.js';
import type { CodeLine, EngineState, LangSpec, SegBuilder } from './types.js';

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'super', 'this',
  'import', 'from', 'export', 'default', 'async', 'await', 'try', 'catch', 'finally',
  'throw', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'yield', 'true',
  'false', 'null', 'undefined', 'interface', 'type', 'enum', 'implements', 'public',
  'private', 'protected', 'readonly', 'static', 'as', 'namespace', 'declare',
  'satisfies', 'keyof', 'infer', 'abstract', 'get', 'set',
]);

// A `<` opens JSX only when the token before it cannot end an expression. A
// keyword can (`return <div>`), an identifier or a closing bracket cannot
// (`a < b`, `useState<string>()`). `<T,>(x) => x` mis-colors one segment.
const JSX_OPENERS = new Set([
  'return', 'yield', 'await', 'typeof', 'in', 'of', 'case', 'default', 'do', 'else',
  'extends', 'void', 'delete', 'new',
]);

function opensTag(line: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(line[j]!)) j--;
  if (j < 0) return true;
  const prev = line[j]!;
  if (!/[\w$)\]]/.test(prev)) return true;
  let k = j;
  while (k >= 0 && /[\w$]/.test(line[k]!)) k--;
  return JSX_OPENERS.has(line.slice(k + 1, j + 1));
}

// `{…}` inside a tag is JavaScript again. The engine's brace depth tells us
// which `}` closes it, so an expression may span lines.
function runExpr(line: string, from: number, state: EngineState, b: SegBuilder): number {
  const markup = state.markup!;
  const base = markup.exprBase ?? 0;
  const at = tokenize(line, JS_SPEC, state, b, from, (i) => line[i] === '}' && state.depth === base + 1);
  if (at < line.length) {
    b.push('}', 'plain');
    state.depth = base;
    markup.inExpr = false;
    return at + 1;
  }
  markup.inExpr = true;
  markup.exprBase = base;
  return line.length;
}

function markupOptions(state: EngineState): MarkupOptions {
  return {
    expr: (line, i, b) => {
      b.push('{', 'plain');
      state.depth++;
      state.markup!.exprBase = state.depth - 1;
      return runExpr(line, i + 1, state, b);
    },
  };
}

const JS_SPEC: LangSpec = {
  keywords: JS_KEYWORDS,
  lineComments: ['//'],
  blockComments: [{ start: '/*', end: '*/' }],
  strings: [
    { start: "'" },
    { start: '"' },
    { start: '`', multiline: true },
  ],
  hook: (line, i, state, b) => {
    const markup = state.markup;
    if (!markup || line[i] !== '<') return i;
    const next = line[i + 1];
    if (next === undefined) return i;
    if (next !== '/' && !/[A-Za-z>]/.test(next)) return i;
    if (next !== '/' && !opensTag(line, i)) return i;
    return markupTag(line, i, markup, b, markupOptions(state));
  },
};

/** JS / TS (and their JSX) for a whole fenced block. */
export function highlightJs(lines: readonly string[]): CodeLine[] {
  const state = createState();
  state.markup = createMarkupState();
  const opts = markupOptions(state);
  return lines.map((line) => {
    const b = createBuilder();
    const markup = state.markup!;
    let i = resumeOpen(line, state, b);
    if (i === 0 && !state.open) {
      if (markup.inExpr) {
        i = runExpr(line, 0, state, b);
        if (!markup.inExpr && i < line.length && markup.mode !== 'text') {
          i = markupTag(line, i, markup, b, opts);
        }
      } else if (markup.mode !== 'text') {
        i = markupTag(line, 0, markup, b, opts);
      }
    }
    if (i < line.length) tokenize(line, JS_SPEC, state, b, i);
    return { segs: b.segs };
  });
}
