import type { Level, LogLine } from './types.js';

// Strip ANSI escape sequences (CSI color codes + two-char ESC sequences). The
// painter is cell-based; raw escapes embedded in a line would corrupt layout,
// so sanitize before lines enter the buffer.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-Z\\\]^_]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '');
}

const ERROR_RE = /\b(error|err|fatal|panic)\b/i;
const WARN_RE = /\b(warn|warning)\b/i;
const DEBUG_RE = /\b(debug|trace)\b/i;

export function classifyLevel(s: string): Level {
  if (ERROR_RE.test(s)) return 'error';
  if (WARN_RE.test(s)) return 'warn';
  if (DEBUG_RE.test(s)) return 'debug';
  return 'info';
}

export function filterLines(lines: readonly LogLine[], query: string): LogLine[] {
  if (query === '') return lines.slice();
  const q = query.toLowerCase();
  return lines.filter((l) => l.text.toLowerCase().includes(q));
}
