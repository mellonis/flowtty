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
] as const;

export type NamedKey = typeof NAMED_KEYS[number];

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
   * positioned by `x` / `y`.
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
   * Cell under the pointer for a mouse key ('wheelup' / 'wheeldown'): 0-based
   * column and row, the same coordinates `onLayout` rects use. Undefined for
   * every other key.
   */
  x?: number;
  y?: number;
  /** Raw byte sequence as received from the source (empty for synthetic keys). */
  sequence: string;
  ctrl: boolean;
  meta: boolean; // Option / Alt
  shift: boolean;
}
