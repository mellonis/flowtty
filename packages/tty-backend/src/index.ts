export { TtyBackend, type TtyBackendOptions } from './tty.js';
export { detectHyperlinkSupport } from './hyperlinks.js';
export { isInteractive } from './interactive.js';
export { detectColorDepth, rgbToAnsi256, rgbToAnsi16, type ColorDepth } from './colorDepth.js';
export { parseKeypress, decodeKeys } from './key-parser.js';
// ANSI helpers — exposed so sibling TTY backends (e.g. @flowtty/inline-tty-backend)
// can reuse the SGR / cursor / screen-control sequences instead of duplicating.
// App code typically should not assemble escape sequences itself.
export {
  RESET, HIDE_CURSOR, SHOW_CURSOR, CLEAR,
  ALT_SCREEN_ON, ALT_SCREEN_OFF,
  BRACKETED_PASTE_ON, BRACKETED_PASTE_OFF,
  MOUSE_ON, MOUSE_OFF,
  OSC8_CLOSE, osc8Open,
  sgr, cursorTo, cellsEqual, parseColor, takeUnknownColors, detectColorSupport,
  type SgrOptions,
} from './ansi.js';
