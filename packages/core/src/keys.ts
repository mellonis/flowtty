// A normalized terminal key event. Backends may construct Key values directly
// (synthetic keys for the test backend) or produce them from parsed raw bytes
// (the TTY backend, shipping in a later plan).
/**
 * Every multi-character key name a backend produces. A printable key's name is
 * the character itself (`' '`, `':'`, `'a'`) — there is no `'space'`, `'enter'`
 * or `'colon'`. Sequences the key parser does not recognize surface under a
 * `csi-…` name, which is deliberately not listed here.
 */
export const NAMED_KEYS = [
  'return', 'escape', 'tab', 'backspace', 'delete', 'insert',
  'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  'paste', 'wheelup', 'wheeldown',
  'mousedown', 'mousedrag', 'mouseup',
] as const;

export type NamedKey = typeof NAMED_KEYS[number];

/** Which physical button a mouse key belongs to. The wheel is not a button —
 *  it has its own key names. */
export type MouseButton = 'left' | 'middle' | 'right';

/** A key name: a named key, or the character itself for a printable key. The
 *  `string & {}` arm keeps any character valid while editors still complete the
 *  named ones — it cannot reject a typo like `'space'`; `TestBackend.press` does. */
export type KeyName = NamedKey | (string & {});

export interface Key {
  /**
   * Canonical name of the key. For printable ASCII characters this is the
   * character itself ('a', '!', ' '). For named keys: 'return', 'escape',
   * 'tab', 'backspace', 'delete', 'up', 'down', 'left', 'right', 'home',
   * 'end', 'pageup', 'pagedown'. A bracketed paste is one key named 'paste'
   * whose content is in `text`. Mouse wheel steps are 'wheelup' / 'wheeldown',
   * and a button press, a drag and a release are 'mousedown', 'mousedrag' and
   * 'mouseup' — all five positioned by `x` / `y`.
   */
  name: KeyName;
  /**
   * Payload of a 'paste' key: the pasted text, line endings normalized to `\n`.
   * A paste is delivered whole — its newlines and letters are text, never
   * 'return' or single-letter keys — so an app inserts it instead of acting on it.
   * Undefined for every other key.
   */
  text?: string;
  /**
   * Cell under the pointer for a mouse key ('wheelup', 'wheeldown',
   * 'mousedown', 'mousedrag', 'mouseup'): 0-based column and row, the same
   * coordinates `onLayout` rects use. Undefined for every other key.
   */
  x?: number;
  y?: number;
  /**
   * Which button a 'mousedown' / 'mousedrag' / 'mouseup' belongs to. Undefined
   * for every other key — and, rarely, for a 'mouseup' whose report named no
   * button. Match a release on `name === 'mouseup'`, never on `button`: a drag
   * that never sees its release stays stuck open.
   */
  button?: MouseButton;
  /**
   * How many presses in a row this 'mousedown' is: 1 for a single press, 2 for
   * a second on the same cell with the same button within the double-click
   * interval, 3 for a third; a fourth starts over at 1. The TTY backend counts
   * (`createClickCounter`); a backend that does not sets nothing, which reads
   * as 1. Undefined for every other key. See docs/input.md (selection).
   */
  clicks?: number;
  /** Raw byte sequence as received from the source (empty for synthetic keys). */
  sequence: string;
  ctrl: boolean;
  meta: boolean; // Option / Alt
  shift: boolean;
}

/**
 * Whether a key is a character to type or to filter by: one code point with
 * neither ctrl nor meta, and not a control character — a backend that lets a
 * raw control byte through (or a custom one that names keys loosely) must not
 * get it inserted into a field or eaten by a filter, so an app's own chord
 * still arrives. Shift is fine: a capital is printable.
 */
export function isPrintable(key: Key): boolean {
  if (key.ctrl || key.meta) return false;
  const chars = [...key.name];
  if (chars.length !== 1) return false;
  const code = key.name.codePointAt(0)!;
  return code >= 0x20 && code !== 0x7f;
}
