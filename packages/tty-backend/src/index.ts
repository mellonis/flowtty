export { TtyBackend, type TtyBackendOptions } from './tty.js';
export { FinalFrameBackend, type FinalFrameBackendOptions } from './FinalFrameBackend.js';
export { bufferToAnsi, type BufferToAnsiOptions } from './bufferToAnsi.js';
export { detectHyperlinkSupport } from './hyperlinks.js';
export { isInteractive, NotInteractiveError } from './interactive.js';
export { detectColorDepth, rgbToAnsi256, rgbToAnsi16, type ColorDepth } from './colorDepth.js';
export { parseKeypress, decodeKeys } from './key-parser.js';
// The bell and desktop notifications — pure text-to-bytes, plus the small
// factory both TTY backends drive their `bell()` / `notify()` from. Exposed so
// a sibling backend can reuse them instead of assembling OSC sequences itself.
export {
  createAttention, detectNotificationProtocol, notificationSequence, sanitizeNotificationText,
  type Attention, type AttentionOptions, type NotificationProtocol,
} from './notification.js';
// The clipboard write — pure text-to-bytes, plus the small factory both TTY
// backends drive their `copy()` from. Exposed for the same reason: a sibling
// backend should not have to assemble OSC 52 itself.
export {
  createClipboard, clipboardSequence, detectClipboardSupport, DEFAULT_CLIPBOARD_LIMIT,
  type Clipboard, type ClipboardOptions, type ClipboardProtocol,
} from './clipboard.js';
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
