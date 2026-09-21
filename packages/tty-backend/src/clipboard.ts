// Putting text on the person's clipboard through the terminal: OSC 52.
//
// Pure and framework-free — text in, bytes out, plus one small factory that
// holds the detection and the size cap. Nothing here writes to a stream; the
// backends do that, as ONE write each and never from inside draw(), so the
// frame-diff baseline stays valid (the sequence moves no cursor and changes no
// cell). Shaped exactly like notification.ts next door.
//
// WRITE-ONLY, by construction. OSC 52 also has a `?` form that asks the
// terminal to send the clipboard BACK, over the same channel the app reads keys
// from. flowtty never emits it: the payload of every sequence built here is
// base64, and base64 has no `?`.
//
// See docs/app.md (the clipboard) and docs/terminal.md (the clipboard).
import { Buffer as NodeBuffer } from 'node:buffer';

const ESC = '\x1b';
/** String Terminator — ends an OSC, as for notifications. */
const ST = `${ESC}\\`;

/**
 * How many bytes of BASE64 a clipboard write may carry, by default.
 *
 * xterm caps what it will accept in one OSC 52 (its `maxStringParmLen`
 * derivative), and the terminals that copied the sequence copied the ceiling
 * with it; 74,994 is the figure that circulates as the safe common limit. Over
 * it, a terminal quietly keeps the part it liked, so flowtty writes NOTHING
 * instead: half a paste presented as a whole one is worse than none.
 */
export const DEFAULT_CLIPBOARD_LIMIT = 74_994;

/**
 * Which sequence carries a clipboard write.
 *
 * - `'osc52'` — `ESC ] 52 ; c ; <base64 of UTF-8> ST`, the xterm sequence.
 * - `'none'`  — nothing is sent, and `copy()` reports that it did not.
 */
export type ClipboardProtocol = 'osc52' | 'none';

/**
 * The bytes that put `text` on the clipboard, or `''` when nothing should be
 * written: an empty text (there is nothing to put anywhere), or a payload over
 * `limit`.
 *
 * The cap is measured on the base64, because that is what the terminal parses —
 * and it is checked AFTER encoding, so the answer is whole-or-nothing rather
 * than a guess from the input's length.
 */
export function clipboardSequence(text: string, limit: number = DEFAULT_CLIPBOARD_LIMIT): string {
  if (text === '') return '';
  const payload = NodeBuffer.from(text, 'utf8').toString('base64');
  if (payload.length > limit) return '';
  return `${ESC}]52;c;${payload}${ST}`;
}

/** Inside tmux? (Its own passthrough is a separate, opt-in thing — see below.) */
function isTmux(env: NodeJS.ProcessEnv): boolean {
  return (env.TMUX !== undefined && env.TMUX !== '') || (env.TERM ?? '').startsWith('tmux');
}

/** Inside GNU screen? */
function isScreen(env: NodeJS.ProcessEnv): boolean {
  return (env.STY !== undefined && env.STY !== '') || (env.TERM ?? '').startsWith('screen');
}

/** tmux's DCS passthrough. Every ESC in the payload has to be doubled. It only
 *  reaches the terminal when the pane has `allow-passthrough` on — which is why
 *  auto-detection never sends it, and only an explicitly forced protocol does. */
function wrapForTmux(sequence: string): string {
  return `${ESC}Ptmux;${sequence.replace(/\x1b/gu, `${ESC}${ESC}`)}${ST}`;
}

/**
 * Whether a clipboard write is worth attempting in the terminal described by
 * `env`.
 *
 * | Environment | Protocol | Why |
 * | --- | --- | --- |
 * | `TERM_PROGRAM=Apple_Terminal` | `'none'` | Apple Terminal implements no OSC 52; the bytes would be swallowed and the app would report a copy that never happened |
 * | GNU screen (`STY`, `TERM=screen*`) | `'none'` | screen has no clipboard of its own and its passthrough is a different, size-limited form |
 * | `TERM=dumb`, `TERM=linux` | `'none'` | no escape handling / no clipboard behind the console |
 * | tmux (`TMUX`, `TERM=tmux*`) | `'osc52'` | tmux reads OSC 52 from the application itself — its `set-clipboard` option governs it, and must not be `off` |
 * | anything else | `'osc52'` | the one sequence there is; a terminal that does not know it swallows the OSC |
 *
 * Deliberately short, like `detectNotificationProtocol`: a terminal is listed
 * only where its own behaviour is known. Everything unverified falls through to
 * the attempt, which is inert where it is not understood — and `copy()` still
 * reports `true` there, because there is no way to ask a terminal whether a
 * write landed. `onCopy`'s `delivered` says "a sequence went out", not "the
 * clipboard changed" (docs/input.md, selection).
 */
export function detectClipboardSupport(env: NodeJS.ProcessEnv = process.env): ClipboardProtocol {
  const term = env.TERM ?? '';
  if (term === 'dumb' || term === 'linux') return 'none';
  if (env.TERM_PROGRAM === 'Apple_Terminal') return 'none';
  if (isScreen(env)) return 'none';
  return 'osc52';
}

export interface ClipboardOptions {
  /** Which protocol to write with. `'auto'` (the default) picks one from the
   *  environment (`detectClipboardSupport`); `'none'` stays silent. */
  clipboard?: ClipboardProtocol | 'auto';
  /** The environment to detect from. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Cap on the base64 payload, in bytes. Default {@link DEFAULT_CLIPBOARD_LIMIT}. */
  limit?: number;
}

/** A clipboard write, over one output stream. */
export interface Clipboard {
  /** Put `text` on the clipboard, as one write. Returns whether a sequence was
   *  actually written — false for `'none'`, for an empty text and for one over
   *  the cap. */
  copy(text: string): boolean;
  /** The protocol in force, after detection. */
  readonly protocol: ClipboardProtocol;
}

/**
 * Bind a clipboard write to one `write`. Each call writes at most once, with
 * the whole sequence in that single write — a copy between two frames therefore
 * leaves a frame-diffing backend's baseline valid.
 *
 * Only a forced protocol is wrapped for tmux: tmux understands OSC 52 from the
 * application itself (its `set-clipboard` option), while the DCS passthrough
 * needs `allow-passthrough` on the pane, and bytes nobody asked for would show
 * up as text in a pane without it.
 */
export function createClipboard(write: (bytes: string) => void, options: ClipboardOptions = {}): Clipboard {
  const env = options.env ?? process.env;
  const requested = options.clipboard ?? 'auto';
  const protocol = requested === 'auto' ? detectClipboardSupport(env) : requested;
  const limit = options.limit ?? DEFAULT_CLIPBOARD_LIMIT;
  const wrap = requested !== 'auto' && protocol !== 'none' && isTmux(env);

  return {
    protocol,
    copy(text: string): boolean {
      if (protocol === 'none') return false;
      const sequence = clipboardSequence(text, limit);
      if (sequence === '') return false;
      write(wrap ? wrapForTmux(sequence) : sequence);
      return true;
    },
  };
}
