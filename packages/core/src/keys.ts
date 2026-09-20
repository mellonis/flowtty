// A normalized terminal key event. Backends may construct Key values directly
// (synthetic keys for the test backend) or produce them from parsed raw bytes
// (the TTY backend, shipping in a later plan).
export interface Key {
  /**
   * Canonical name of the key. For printable ASCII characters this is the
   * character itself ('a', '!', ' '). For named keys: 'return', 'escape',
   * 'tab', 'backspace', 'delete', 'up', 'down', 'left', 'right', 'home',
   * 'end', 'pageup', 'pagedown'. A bracketed paste is one key named 'paste'
   * whose content is in `text`.
   */
  name: string;
  /**
   * Payload of a 'paste' key: the pasted text, line endings normalized to `\n`.
   * A paste is delivered whole — its newlines and letters are text, never
   * 'return' or single-letter keys — so an app inserts it instead of acting on it.
   * Undefined for every other key.
   */
  text?: string;
  /** Raw byte sequence as received from the source (empty for synthetic keys). */
  sequence: string;
  ctrl: boolean;
  meta: boolean; // Option / Alt
  shift: boolean;
}
