import type { Buffer, Cell } from '@flowtty/core';
import { OSC8_CLOSE, RESET, detectColorSupport, osc8Open, sgr } from './ansi.js';
import { detectColorDepth, type ColorDepth } from './colorDepth.js';

export interface BufferToAnsiOptions {
  /** Emit fg / bg color codes. Default: from the environment (`detectColorSupport`)
   *  — off when `NO_COLOR` is set, `FORCE_COLOR` overriding it. Bold, dim,
   *  underline, inverse and strikethrough are emitted either way. */
  color?: boolean;
  /** Color depth in bits: 4 (16 colors), 8 (256) or 24 (truecolor). Default: from
   *  the environment (`detectColorDepth`). `#hex` / `rgb()` colors are brought
   *  down to fit. */
  depth?: ColorDepth;
  /** Wrap cells carrying `Style.link` in OSC 8 hyperlinks. Default false: this
   *  text usually ends up in scrollback, a pipe or a log file, where an
   *  unsupported OSC 8 sequence is at best invisible and at worst literal bytes
   *  in a saved log. Turn it on when the destination is known to be a terminal
   *  that honors them (see `detectHyperlinkSupport`). */
  hyperlinks?: boolean;
}

/**
 * Serialize a whole cell `Buffer` into styled lines of text — for printing into
 * the NORMAL screen: scrollback, a pipe, a log file, CI output.
 *
 * Unlike what the TTY backends write, the result addresses nothing: no cursor
 * moves, no clear, no alternate screen. It is just rows of characters with SGR
 * between them, joined with `\n` and with no trailing newline — the styled
 * sibling of `Buffer.toString()`. Print it once and it stays where it lands.
 *
 * SGR is emitted only where the style changes, `RESET` closes every line that
 * opened one (so a background never bleeds to the edge of the terminal), and
 * trailing blanks are dropped unless they carry something visible.
 */
export function bufferToAnsi(buffer: Buffer, options: BufferToAnsiOptions = {}): string {
  const sgrOptions = {
    color: options.color ?? detectColorSupport(),
    depth: options.depth ?? detectColorDepth(),
  };
  const hyperlinks = options.hyperlinks === true;

  const lines: string[] = [];
  for (let y = 0; y < buffer.height; y++) {
    // Trailing filler is dropped: a printed frame sits inside whatever the
    // terminal already shows, and padding a row out to the buffer's width only
    // adds invisible whitespace to a log (and, with a pen open, a stripe of
    // background to the edge). A blank that carries a background, inverse rule
    // or line decoration IS part of the picture, so it stays.
    let end = buffer.width;
    while (end > 0 && isTrailingFiller(buffer.get(end - 1, y), sgrOptions.color)) end--;

    let line = '';
    // The pen, as the *bytes* last emitted rather than the Style object that
    // produced them. Two cells whose styles differ only in a color are one run
    // when color is off, so `color: false` output carries no stray SGR at all.
    let penSgr = '';
    let penLink: string | undefined;

    for (let x = 0; x < end; x++) {
      const cell = buffer.get(x, y);
      // A continuation cell emits nothing: the wide glyph before it already
      // took its column. See docs/terminal.md (display width).
      if (cell.char === '') continue;
      const seq = sgr(cell.style, sgrOptions);
      if (seq !== penSgr) {
        // SGR is additive, so the previous attributes have to be dropped before
        // the new ones go on. Nothing open means nothing to reset.
        if (penSgr !== '') line += RESET;
        line += seq;
        penSgr = seq;
      }
      const link = hyperlinks ? cell.style.link : undefined;
      if (link !== penLink) {
        if (penLink !== undefined) line += OSC8_CLOSE;
        if (link !== undefined) line += osc8Open(link);
        penLink = link;
      }
      line += cell.char;
    }

    // RESET ends any open style before the newline; OSC 8 is not closed by
    // RESET, so it gets its own close.
    if (penLink !== undefined) line += OSC8_CLOSE;
    if (penSgr !== '') line += RESET;
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Is this cell invisible filler at the end of a row? Only an ASCII space counts
 * as blank — NBSP and friends are content, the same rule `Buffer.toString()`
 * applies. A background (when color is on), inverse, underline or strikethrough
 * makes even a space visible, so such a cell is kept.
 */
function isTrailingFiller(cell: Cell, color: boolean): boolean {
  if (cell.char !== ' ') return false;
  const { style } = cell;
  if (style.inverse === true || style.underline === true || style.strikethrough === true) return false;
  // 'default' is the "no background" sentinel, not a color.
  if (color && style.bg !== undefined && style.bg !== 'default') return false;
  return true;
}
