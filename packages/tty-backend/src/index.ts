export { TtyBackend } from './tty.js';
export { detectHyperlinkSupport } from './hyperlinks.js';
export { parseKeypress, decodeKeys } from './key-parser.js';
// ANSI helpers — exposed so sibling TTY backends (e.g. @flowtty/inline-tty-backend)
// can reuse the SGR / cursor / screen-control sequences instead of duplicating.
// App code typically should not assemble escape sequences itself.
export {
  RESET, HIDE_CURSOR, SHOW_CURSOR, CLEAR,
  ALT_SCREEN_ON, ALT_SCREEN_OFF,
  OSC8_CLOSE, osc8Open,
  sgr, cursorTo, cellsEqual, parseColor,
} from './ansi.js';
