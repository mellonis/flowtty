// The tag tokenizer behind `html` / `xml` / `svg` — and behind JSX markup, so
// `<div className="x">` looks the same in an html block and in a tsx one.
//
// A small state machine: text → tag → text, with side modes for comments,
// CDATA, processing instructions and DOCTYPE. Every mode may stay open at the
// end of a line, so `MarkupState` is threaded through the whole block.

import type { MarkupState, SegBuilder } from './types.js';

export interface MarkupOptions {
  /** JSX: `{…}` inside a tag goes back to the JavaScript tokenizer. */
  expr?: (line: string, i: number, b: SegBuilder) => number;
}

export function createMarkupState(): MarkupState {
  return { mode: 'text' };
}

const NAME_RE = /[A-Za-z_][\w.:-]*/y;
// Anything up to the next delimiter — covers `data-x`, `xml:lang`, `@click`,
// `:prop`, `{...spread}` is handled separately.
const ATTR_RE = /[^\s=/>"'{}<]+/y;
const ENTITY_RE = /&#?[\w-]{1,32};/y;
const SPACE_RE = /\s+/y;

function match(re: RegExp, line: string, i: number): string | undefined {
  re.lastIndex = i;
  const m = re.exec(line);
  return m && m.index === i ? m[0] : undefined;
}

/** A tag name that is a component: `Box`, `Foo.Bar` — not `div`. */
function isComponent(name: string): boolean {
  return /^[A-Z]/.test(name) || name.includes('.');
}

function untilInclusive(line: string, i: number, end: string): number {
  const at = line.indexOf(end, i);
  return at < 0 ? -1 : at + end.length;
}

/** Consume one construct at `i`; returns the next index (always > `i`). */
export function stepMarkup(
  line: string, i: number, state: MarkupState, b: SegBuilder, opts: MarkupOptions = {},
): number {
  switch (state.mode) {
    case 'comment': {
      const end = untilInclusive(line, i, '-->');
      if (end < 0) { b.push(line.slice(i), 'comment'); return line.length; }
      b.push(line.slice(i, end), 'comment');
      state.mode = 'text';
      return end;
    }
    case 'cdata': {
      const at = line.indexOf(']]>', i);
      if (at < 0) { b.push(line.slice(i), 'plain'); return line.length; }
      b.push(line.slice(i, at), 'plain');
      b.push(']]>', 'directive');
      state.mode = 'text';
      return at + 3;
    }
    case 'pi':
    case 'doctype': {
      const end = untilInclusive(line, i, state.mode === 'pi' ? '?>' : '>');
      if (end < 0) { b.push(line.slice(i), 'directive'); return line.length; }
      b.push(line.slice(i, end), 'directive');
      state.mode = 'text';
      return end;
    }
    case 'tag': return stepTag(line, i, state, b, opts);
    default: return stepText(line, i, state, b);
  }
}

function stepTag(
  line: string, i: number, state: MarkupState, b: SegBuilder, opts: MarkupOptions,
): number {
  if (state.quote !== undefined) {
    const at = line.indexOf(state.quote, i);
    if (at < 0) { b.push(line.slice(i), 'string'); return line.length; }
    b.push(line.slice(i, at + 1), 'string');
    state.quote = undefined;
    return at + 1;
  }
  const ch = line[i]!;
  const space = match(SPACE_RE, line, i);
  if (space !== undefined) { b.push(space, 'plain'); return i + space.length; }
  if (ch === '>' || line.startsWith('/>', i) || line.startsWith('?>', i)) {
    const tok = ch === '>' ? '>' : line.slice(i, i + 2);
    b.push(tok, 'tag');
    state.mode = 'text';
    return i + tok.length;
  }
  if (ch === '"' || ch === "'") {
    const at = line.indexOf(ch, i + 1);
    if (at < 0) { b.push(line.slice(i), 'string'); state.quote = ch; return line.length; }
    b.push(line.slice(i, at + 1), 'string');
    return at + 1;
  }
  if (ch === '{' && opts.expr) return opts.expr(line, i, b);
  const attr = match(ATTR_RE, line, i);
  if (attr !== undefined) { b.push(attr, 'attr'); return i + attr.length; }
  b.push(ch, 'plain');
  return i + 1;
}

function stepText(line: string, i: number, state: MarkupState, b: SegBuilder): number {
  if (line.startsWith('<!--', i)) {
    state.mode = 'comment';
    return stepMarkup(line, i, state, b);
  }
  if (line.startsWith('<![CDATA[', i)) {
    b.push('<![CDATA[', 'directive');
    state.mode = 'cdata';
    return i + 9;
  }
  if (line.startsWith('<?', i)) {
    state.mode = 'pi';
    return stepMarkup(line, i, state, b);
  }
  if (line.startsWith('<!', i)) {
    state.mode = 'doctype';
    return stepMarkup(line, i, state, b);
  }
  if (line[i] === '<') {
    const open = line.startsWith('</', i) ? '</' : '<';
    const name = match(NAME_RE, line, i + open.length);
    if (name !== undefined) {
      b.push(open, 'tag');
      b.push(name, isComponent(name) ? 'component' : 'tag');
      state.mode = 'tag';
      return i + open.length + name.length;
    }
    if (line[i + 1] === '>') { b.push('<>', 'tag'); return i + 2; }
    b.push('<', 'plain');
    return i + 1;
  }
  const entity = match(ENTITY_RE, line, i);
  if (entity !== undefined) { b.push(entity, 'entity'); return i + entity.length; }
  // Plain text up to whatever comes next.
  let j = i + 1;
  while (j < line.length && line[j] !== '<' && line[j] !== '&') j++;
  b.push(line.slice(i, j), 'plain');
  return j;
}

/** A whole line of html / xml, continuing `state`. */
export function markupLine(line: string, state: MarkupState, b: SegBuilder): void {
  let i = 0;
  while (i < line.length) i = stepMarkup(line, i, state, b);
}

/**
 * JSX: consume the markup that starts at `i` and hand control back as soon as
 * the tag closes — the text between tags is JavaScript again.
 */
export function markupTag(
  line: string, i: number, state: MarkupState, b: SegBuilder, opts: MarkupOptions,
): number {
  let at = i;
  do {
    at = stepMarkup(line, at, state, b, opts);
  } while (at < line.length && state.mode !== 'text');
  return at;
}
