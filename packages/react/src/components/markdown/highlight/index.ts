// Fenced-code highlighting. One entry point per fenced block, so multi-line
// constructs (block comments, triple-quoted strings, XML comments and CDATA)
// carry their state from one line to the next.
//
// Every highlighter only ever emits slices of the line it was given: the
// concatenated seg texts of a line always equal the source line.

import { detectLanguage, hunkNumbers } from './diff.js';
import { findLanguage, HIGHLIGHTED_LANGUAGES, type HighlightedLanguage } from './languages.js';
import type { CodeLine, CodeLineKind, CodeSeg } from './types.js';

export type { CodeLine, CodeLineKind, CodeSeg, HighlightedLanguage };
export { detectLanguage, hunkNumbers, HIGHLIGHTED_LANGUAGES };

/**
 * Highlight a whole fenced block. Whole-block (not per-line) so multi-line
 * constructs carry state. The concatenated seg texts of line i equal lines[i]
 * exactly. An unknown or missing language — and `text` / `log` / `plain` — is
 * one plain segment per line: no color, not dim.
 */
export function highlightBlock(lines: readonly string[], lang: string): CodeLine[] {
  const name = lang.trim() === '' ? detectLanguage(lines) : lang;
  const def = name === undefined ? undefined : findLanguage(name);
  const out = def
    ? def.highlight(lines)
    : lines.map((line): CodeLine => ({ segs: [{ text: line }] }));
  // A line always has at least one segment, so a caller can style a whole row
  // without special-casing the empty line.
  for (const line of out) if (line.segs.length === 0) line.segs.push({ text: '' });
  return out;
}

/**
 * Canonical language for a fence label (alias → name), or undefined when the
 * label is not highlighted. An empty label is not resolved here — an unlabeled
 * block goes through `detectLanguage`.
 */
export function resolveLanguage(lang: string): string | undefined {
  return findLanguage(lang)?.name;
}
