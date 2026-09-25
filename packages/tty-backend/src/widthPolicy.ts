import type { WidthPolicy } from '@flowtty/core';

// One variable each multiplexer sets in the processes it hosts.
const MULTIPLEXER_MARKERS = ['TMUX', 'STY', 'ZELLIJ', 'HERDR_ENV', 'HERDR_PANE_ID', 'HERDR_SESSION'] as const;

/**
 * The width policy for the terminal an environment describes. macOS
 * Terminal.app measures per code point — a skin-tone or ZWJ emoji advances four
 * columns, a VS16 sequence one — so it gets `'codepoint'`; everything else
 * draws grapheme clusters to width and gets `'cluster'`. Inside a multiplexer
 * (tmux, screen, zellij, herdr) the multiplexer's own emulator measures,
 * whatever terminal hosts it — and some pass the host's TERM_PROGRAM through,
 * so their own markers are checked first. See docs/terminal.md (display width).
 */
export function detectWidthPolicy(env: NodeJS.ProcessEnv = process.env): WidthPolicy {
  if (MULTIPLEXER_MARKERS.some((key) => env[key] !== undefined && env[key] !== '')) return 'cluster';
  return env.TERM_PROGRAM === 'Apple_Terminal' ? 'codepoint' : 'cluster';
}
