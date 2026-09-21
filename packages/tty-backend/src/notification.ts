// Getting the person's attention while they are looking at another window: the
// bell, and a desktop notification posted through the terminal.
//
// Pure and framework-free — text in, bytes out, plus one small factory that
// holds the bell's rate limit. Nothing here writes to a stream; the backends
// do that, as ONE write each and never from inside draw(), so the frame-diff
// baseline stays valid (neither sequence moves the cursor or changes a cell).
//
// See docs/app.md (getting attention) and docs/terminal.md (notifications).

const ESC = '\x1b';
/** String Terminator — ends an OSC. Preferred over BEL: a terminal that does not
 *  know the sequence swallows it either way, and no bell rings if it does not. */
const ST = `${ESC}\\`;
/** The bell, as one byte. */
export const BEL = '\x07';

/** How many code points of title (and of body) survive sanitizing. */
const DEFAULT_MAX_LENGTH = 256;
/** At most one bell per second, so a loop cannot turn the terminal into a buzzer. */
const BELL_INTERVAL_MS = 1000;

/**
 * Which escape sequence carries a desktop notification.
 *
 * - `'osc9'`   — `ESC ] 9 ; text ST`, the form iTerm2 introduced. One text field;
 *                title and body are joined with `: `.
 * - `'osc777'` — `ESC ] 777 ; notify ; title ; body ST`, the form rxvt-unicode
 *                introduced. Title and body stay separate fields.
 * - `'none'`   — nothing is sent.
 */
export type NotificationProtocol = 'osc9' | 'osc777' | 'none';

/**
 * Make `text` safe to put inside an escape sequence, and short enough to show.
 *
 * Every C0 control, DEL and every C1 control (0x80–0x9f — which includes 0x9c,
 * ST) is removed: an embedded ESC, BEL or ST would end the sequence early and
 * leave the rest of the text to be read as terminal input. Newlines, tabs and
 * runs of whitespace collapse to a single space (a notification is one line),
 * the result is trimmed, and it is capped at `maxLength` code points — counted
 * by code point, so an astral character is never cut in half.
 */
export function sanitizeNotificationText(text: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
  const oneLine = text
    // Whitespace controls become a space so words do not glue together…
    .replace(/[\t\n\v\f\r]/gu, ' ')
    // …every other control simply goes.
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const points = [...oneLine];
  if (points.length <= maxLength) return oneLine;
  // trimEnd, not trim: a cut through a word can leave a trailing space.
  return points.slice(0, maxLength).join('').trimEnd();
}

/**
 * ConEmu and Windows Terminal read `OSC 9 ; <digits> ; …` as a numbered
 * sub-command — `9;4` is a progress report, `9;9` a working directory. A
 * message whose first field is numeric would be swallowed or acted on instead
 * of shown, so make the first field non-numeric with a leading space.
 */
function neutralizeSubCommand(text: string): string {
  return /^\d+;/u.test(text) ? ` ${text}` : text;
}

/** OSC 777 splits its fields on `;`, so a `;` inside one would move the rest of
 *  the title into the body (rxvt-unicode escapes nothing). A comma reads the same. */
function oneField(text: string): string {
  return text.replace(/;/gu, ',');
}

/**
 * The bytes that post a desktop notification, or `''` when there is nothing to
 * send — the protocol is `'none'`, or the text sanitized away to nothing.
 * `maxLength` caps title and body (see `sanitizeNotificationText`).
 */
export function notificationSequence(
  title: string,
  body: string | undefined,
  protocol: NotificationProtocol,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string {
  if (protocol === 'none') return '';
  const cleanTitle = sanitizeNotificationText(title, maxLength);
  const cleanBody = sanitizeNotificationText(body ?? '', maxLength);
  if (cleanTitle === '' && cleanBody === '') return '';

  if (protocol === 'osc777') {
    const fields = cleanBody === ''
      ? oneField(cleanTitle)
      : `${oneField(cleanTitle)};${oneField(cleanBody)}`;
    return `${ESC}]777;notify;${fields}${ST}`;
  }
  // OSC 9 carries one field: title and body joined. Cap the joined text too, and
  // neutralize LAST — a later trim would undo the leading space.
  const joined = cleanBody === '' ? cleanTitle : `${cleanTitle}: ${cleanBody}`;
  return `${ESC}]9;${neutralizeSubCommand(sanitizeNotificationText(joined, maxLength))}${ST}`;
}

/** Inside tmux or GNU screen? Their passthrough is off by default, so an OSC
 *  written straight to the pane is swallowed rather than acted on. */
function isMultiplexed(env: NodeJS.ProcessEnv): boolean {
  const term = env.TERM ?? '';
  return (env.TMUX !== undefined && env.TMUX !== '')
    || (env.STY !== undefined && env.STY !== '')
    || term.startsWith('tmux')
    || term.startsWith('screen');
}

/** tmux specifically — screen's passthrough is a different, size-limited form. */
function isTmux(env: NodeJS.ProcessEnv): boolean {
  return (env.TMUX !== undefined && env.TMUX !== '') || (env.TERM ?? '').startsWith('tmux');
}

/** tmux's DCS passthrough. Every ESC in the payload has to be doubled. It only
 *  reaches the terminal when the pane has `allow-passthrough` on — which is why
 *  auto-detection never sends it, and only an explicitly forced protocol does. */
function wrapForTmux(sequence: string): string {
  return `${ESC}Ptmux;${sequence.replace(/\x1b/gu, `${ESC}${ESC}`)}${ST}`;
}

/**
 * Which notification protocol suits the terminal described by `env`.
 *
 * | Environment | Protocol | Why |
 * | --- | --- | --- |
 * | `TERM=foot*`, `TERM=rxvt-unicode*` | `'osc777'` | the terminal's own protocol, and it keeps title and body apart |
 * | `TERM=dumb`, `TERM=linux` | `'none'` | no escape handling / no desktop behind the console |
 * | tmux, GNU screen (`TMUX`, `STY`, `TERM=tmux*` / `screen*`) | `'none'` | passthrough is off by default, so the sequence would be swallowed |
 * | anything else | `'osc9'` | the widest-understood form — iTerm2, WezTerm, ghostty, kitty, rio and VS Code all read it, and a terminal that does not simply swallows the OSC |
 *
 * Deliberately short: a mapping is listed only where the terminal's own
 * documentation says so. Everything unverified falls through to the default,
 * which is inert where it is not understood.
 */
export function detectNotificationProtocol(env: NodeJS.ProcessEnv = process.env): NotificationProtocol {
  const term = env.TERM ?? '';
  // A console with nothing behind it to notify: the Linux VT has no desktop,
  // and TERM=dumb promises no escape handling at all.
  if (term === 'dumb' || term === 'linux') return 'none';
  if (isMultiplexed(env)) return 'none';
  if (term.startsWith('foot') || term.startsWith('rxvt-unicode')) return 'osc777';
  return 'osc9';
}

export interface AttentionOptions {
  /** Which protocol to post notifications with. `'auto'` (the default) picks one
   *  from the environment (`detectNotificationProtocol`); `'none'` stays silent. */
  notifications?: NotificationProtocol | 'auto';
  /** The environment to detect from. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** The clock the bell's rate limit reads, in ms. Default `Date.now`. */
  now?: () => number;
}

/** The bell and desktop notifications, over one output stream. */
export interface Attention {
  /** Write BEL — at most once per second; calls in between are dropped, not queued. */
  bell(): void;
  /** Post a desktop notification. Title and body are sanitized; a protocol of
   *  `'none'` writes nothing (or rings the bell, when `'none'` was detected
   *  rather than asked for). */
  notify(title: string, body?: string): void;
  /** The protocol in force, after detection. */
  readonly protocol: NotificationProtocol;
}

/**
 * Bind the bell and notifications to one `write`. Each call writes at most once,
 * with the whole sequence in that single write.
 *
 * An explicit `notifications: 'none'` means "stay quiet" and `notify()` does
 * nothing. A `'none'` that detection arrived at means "no protocol reaches this
 * terminal" — there `notify()` rings the bell instead, which is the one
 * attention-getter every terminal has (and which tmux turns into a bell flag on
 * the window in its status line, so it still travels between windows).
 */
export function createAttention(write: (bytes: string) => void, options: AttentionOptions = {}): Attention {
  const env = options.env ?? process.env;
  // Wrapped, not `Date.now` by reference: read it at each call so a test that
  // stubs the clock after construction still moves this one.
  const now = options.now ?? ((): number => Date.now());
  const requested = options.notifications ?? 'auto';
  const protocol = requested === 'auto' ? detectNotificationProtocol(env) : requested;
  const bellFallback = requested === 'auto' && protocol === 'none';
  // Only a forced protocol is wrapped: detection already answered 'none' inside a
  // multiplexer, and wrapping what nobody asked for would write bytes that show
  // up as text in a pane without allow-passthrough.
  const wrap = requested !== 'auto' && protocol !== 'none' && isTmux(env);
  // -Infinity, not 0: with an injected clock starting at 0, a 0 here would drop
  // the very first bell.
  let lastBellAt = -Infinity;

  const attention: Attention = {
    protocol,
    bell(): void {
      const at = now();
      if (at - lastBellAt < BELL_INTERVAL_MS) return;
      lastBellAt = at;
      write(BEL);
    },
    notify(title: string, body?: string): void {
      const sequence = notificationSequence(title, body, protocol);
      if (sequence === '') {
        if (bellFallback) attention.bell();
        return;
      }
      write(wrap ? wrapForTmux(sequence) : sequence);
    },
  };
  return attention;
}
