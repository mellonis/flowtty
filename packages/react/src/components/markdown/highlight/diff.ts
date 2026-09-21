// Unified diffs / patches. Line-based on purpose: a diff's meaning is the
// leading character of each row, and the row `kind` lets the layout decorate
// the whole row rather than just the glyph.

import { TOKEN_COLORS } from './tokenColors.js';
import type { CodeLine, CodeLineKind, TokenType } from './types.js';

const HUNK_RE = /^@@+ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * The two starting line numbers of a hunk header — where the following rows sit
 * in the old file and in the new one — or undefined when `line` is not a hunk
 * header. This is what lets a rendered diff number its rows the way the patch
 * does instead of counting from one.
 */
export function hunkNumbers(line: string): { removed: number; added: number } | undefined {
  const m = HUNK_RE.exec(line);
  return m ? { removed: Number(m[1]), added: Number(m[2]) } : undefined;
}

// The metadata git puts around a hunk. `+++` / `---` are matched separately,
// before `+` / `-`, so an added/removed row never swallows a file header.
const FILE_HEADER_RE =
  /^(?:diff --git |diff --cc |index |mode |old mode |new mode |new file mode|deleted file mode|similarity index |dissimilarity index |rename |copy |Binary files |GIT binary patch|From |Subject: |Index: |={5,}$)/;

function row(line: string, token: TokenType, kind: CodeLineKind): CodeLine {
  const seg = { text: line, ...TOKEN_COLORS[token] };
  return kind === undefined ? { segs: [seg] } : { segs: [seg], kind };
}

export function highlightDiff(lines: readonly string[]): CodeLine[] {
  return lines.map((line) => {
    if (line.startsWith('+++') || line.startsWith('---')) return row(line, 'header', 'header');
    if (HUNK_RE.test(line)) return row(line, 'hunk', 'hunk');
    if (FILE_HEADER_RE.test(line)) return row(line, 'header', 'header');
    if (line.startsWith('+')) return row(line, 'added', 'added');
    if (line.startsWith('-')) return row(line, 'removed', 'removed');
    return row(line, 'plain', undefined);
  });
}

/**
 * A block with no fence label is a diff when it carries a hunk header or a
 * `diff --git` line — the two markers no other language produces by accident.
 * A bare `+ … / - …` block is far more often a list, so it does not count.
 */
export function detectLanguage(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    if (HUNK_RE.test(line) || line.startsWith('diff --git ')) return 'diff';
  }
  return undefined;
}
