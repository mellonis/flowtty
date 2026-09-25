import { Buffer, type Style } from '../cells.js';
import { clusterWidth, graphemes, stringWidth } from '../graphemes.js';
import { wrapText, wrapTextLines, type WrapMode, type WrappedLine } from '../wrap.js';
import { BORDER_CHARS } from './borders.js';
import { layoutOf, type Rect } from './layout.js';
import { contentRectOf, intersectRects, isScrollViewport, paddingRectOf, scrollStateOf } from './geometry.js';
import { ownText, type Instance, type Container, type TextRun } from './host.js';

export function paint(container: Container, width: number, height: number): Buffer {
  const buffer = new Buffer(width, height);
  for (const root of container.children) paintInstance(root, buffer, 0, 0);
  return buffer;
}

// Cell style for the text content of a text-bearing box. Reads style props
// off `inst.props` (which are passed through from <Text>/<Box>).
function textStyleOf(inst: Instance): Style {
  const p = inst.props;
  const style: Style = {};
  if (p.color !== undefined) style.fg = fgOf(p.color);
  if (p.bold) style.bold = true;
  if (p.dim) style.dim = true;
  if (p.underline) style.underline = true;
  if (p.inverse) style.inverse = true;
  if (p.strikethrough) style.strikethrough = true;
  if (p.link !== undefined) style.link = p.link;
  if (p.backgroundColor !== undefined) style.bg = p.backgroundColor;
  return style;
}

// One Style per cluster of the joined runs: the box's text style, with whatever
// the run sets laid over it.
function runStyles(runs: readonly TextRun[], base: Style): Style[] {
  const out: Style[] = [];
  for (const run of runs) {
    const style: Style = { ...base };
    if (run.color !== undefined) style.fg = fgOf(run.color);
    if (run.backgroundColor !== undefined) style.bg = run.backgroundColor;
    if (run.bold !== undefined) style.bold = run.bold;
    if (run.dim !== undefined) style.dim = run.dim;
    if (run.underline !== undefined) style.underline = run.underline;
    if (run.inverse !== undefined) style.inverse = run.inverse;
    if (run.strikethrough !== undefined) style.strikethrough = run.strikethrough;
    if (run.link !== undefined) style.link = run.link;
    for (const _cluster of graphemes(run.text)) out.push(style);
  }
  return out;
}

// A foreground to put on a cell: `'default'` is the "terminal's own
// foreground" sentinel (see docs/layout.md, inherited colors), so it resolves
// to no fg at all — cells never carry the sentinel.
function fgOf(color: string | undefined): string | undefined {
  return color === 'default' ? undefined : color;
}

// Gate a buffer write on a clip rect. If clip is null, write unconditionally.
// A wide cluster whose second column is outside the clip would be torn: the
// first column gets a blank instead (the buffer's own edge is Buffer.set's job).
function setClipped(buffer: Buffer, x: number, y: number, char: string, style: Style, clip: Rect | null): void {
  if (clip !== null) {
    if (x < clip.left || y < clip.top || x >= clip.left + clip.width || y >= clip.top + clip.height) return;
    if (x + 1 >= clip.left + clip.width && clusterWidth(char) === 2) char = ' ';
  }
  buffer.set(x, y, char, style);
}

/**
 * Record "the text painted in this span carries on at the start of the row
 * below" — what a drag-selection needs to paste a soft-wrapped paragraph back
 * as one line (see docs/input.md, selection).
 *
 * Both rows have to be on screen and inside the clip, and the span is narrowed
 * to the clip and to the buffer: a mark over cells nobody can see would join
 * rows a selection cannot reach anyway. Nothing about layout or paint changes.
 */
function markContinuation(
  buffer: Buffer,
  y: number,
  x0: number,
  x1: number,
  join: string,
  clip: Rect | null,
): void {
  if (clip !== null) {
    if (y < clip.top || y + 1 >= clip.top + clip.height) return;
    x0 = Math.max(x0, clip.left);
    x1 = Math.min(x1, clip.left + clip.width);
  }
  // The row below has to be on the frame as well — a mark on the last row joins
  // to nothing. `Buffer.markContinuation` drops a mark off the top or bottom;
  // the columns are clamped here, where the buffer's width is known.
  if (y + 1 >= buffer.height) return;
  x0 = Math.max(x0, 0);
  x1 = Math.min(x1, buffer.width);
  if (x1 <= x0) return;
  buffer.markContinuation({ y, x0, x1, join });
}

// Draw the box's 8-slot border (4 corners + 4 edge runs) directly into the
// buffer. Called BEFORE children paint so content / nested children overlay
// the border interior. The border itself sits on the outermost cell ring of
// the box rect; Yoga's setBorder(edge, 1) reserved those cells from layout
// so neither own-text nor child layout will land on them.
// Border cells carry a background: borderBackgroundColor if set, else the
// box's effective bg (same fallback rule as own-text) — so a filled box's
// border ring shares its fill instead of punching through to the terminal
// default. The 'default' sentinel resolves to "no bg", mirroring the fill.
// The glyphs take borderColor if set, else the box's effective text color —
// a panel that sets `color` for its text keeps its frame visible on the same
// theme; `borderColor: 'default'` keeps the terminal's own foreground.
function paintBorder(inst: Instance, buffer: Buffer, box: Rect, clip: Rect | null, effectiveBg: string | undefined, effectiveFg: string | undefined): void {
  const style = inst.props.border;
  if (!style) return;
  if (box.width < 2 || box.height < 2) return; // can't draw a border without an interior

  const chars = BORDER_CHARS[style];
  const cellStyle: Style = {};
  const fg = fgOf(inst.props.borderColor ?? effectiveFg);
  if (fg !== undefined) cellStyle.fg = fg;
  const bg = inst.props.borderBackgroundColor ?? effectiveBg;
  if (bg !== undefined && bg !== 'default') cellStyle.bg = bg;

  const x0 = box.left;
  const y0 = box.top;
  const x1 = box.left + box.width - 1;
  const y1 = box.top + box.height - 1;

  // Corners
  setClipped(buffer, x0, y0, chars.tl, cellStyle, clip);
  setClipped(buffer, x1, y0, chars.tr, cellStyle, clip);
  setClipped(buffer, x0, y1, chars.bl, cellStyle, clip);
  setClipped(buffer, x1, y1, chars.br, cellStyle, clip);

  // Top + bottom edges (between corners)
  for (let x = x0 + 1; x < x1; x++) {
    setClipped(buffer, x, y0, chars.h, cellStyle, clip);
    setClipped(buffer, x, y1, chars.h, cellStyle, clip);
  }
  // Left + right edges (between corners)
  for (let y = y0 + 1; y < y1; y++) {
    setClipped(buffer, x0, y, chars.v, cellStyle, clip);
    setClipped(buffer, x1, y, chars.v, cellStyle, clip);
  }

  // borderTitle: overlay " title " on the top edge starting after the top-left
  // corner + 1 edge piece, ending before 1 edge piece + top-right corner. So
  // available width = box.width - 4 (corner+edge on each side). Truncate with
  // an ellipsis cell if it doesn't fit; skip entirely if width < 5.
  const title = inst.props.borderTitle;
  if (title && title !== '') {
    const avail = box.width - 4;
    if (avail >= 1) {
      // Measured in columns, cut by cluster with the ellipsis rule text uses.
      const text = wrapText(` ${title} `, avail, 'truncate')[0]!;
      let x = x0 + 2;
      for (const ch of graphemes(text)) {
        const w = clusterWidth(ch);
        if (w === 0) continue;
        setClipped(buffer, x, y0, ch, cellStyle, clip);
        x += w;
      }
    }
  }
}

function paintInstance(
  inst: Instance,
  buffer: Buffer,
  offsetX: number,
  offsetY: number,
  inheritedBg: string | undefined = undefined,
  clip: Rect | null = null,
  inheritedFg: string | undefined = undefined,
): void {
  // display: 'none' removes the box from layout (Yoga gives it zero size) AND
  // skips its entire subtree from paint. Without this short-circuit the existing
  // code would loop zero times for own draws and recurse into zero-sized children,
  // which is correct but wasteful in deep trees.
  if (inst.props.display === 'none') return;

  const box: Rect = layoutOf(inst, offsetX, offsetY);
  inst.props.onLayout?.(box);
  const ownBg = inst.props.backgroundColor;
  const effectiveBg = ownBg ?? inheritedBg;
  // The text color a box's descendants paint with when they set none: own
  // `color`, else the parent's. 'default' is passed down as is, so a subtree
  // reset to the terminal foreground stays reset; text resolves it to no fg.
  const effectiveFg = inst.props.color ?? inheritedFg;

  // 1. Fill the box rect with own backgroundColor (if set). Clipped by inherited clip.
  // Sentinel `backgroundColor: 'default'` fills with spaces using NO bg style —
  // overwrites whatever was in those cells without tinting (terminal default bg
  // shows through). Use this for opaque dialogs/overlays that should mask
  // underlying content but match the terminal theme.
  // A box wholly outside the clip draws nothing of its own — every cell would be
  // rejected one by one. Skipping the fill/border/text work (wrapText included)
  // is what keeps a long scrolled list cheap: only the rows in view are drawn.
  // Layout callbacks above and the recursion below still run, since a child can
  // overflow its parent into view and hosts read onLayout of off-screen rows.
  const offscreen = clip !== null && (
    box.left >= clip.left + clip.width || box.left + box.width <= clip.left
    || box.top >= clip.top + clip.height || box.top + box.height <= clip.top
  );

  // 0. Backdrop: restyle the cells already in the buffer, before anything of
  // this box is drawn over them. bold is dropped — a terminal renders bold+dim
  // inconsistently, and the point is to push this content back.
  if (!offscreen && inst.props.backdrop === 'dim') {
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) continue;
        const under = buffer.get(x, y);
        if (under.style.dim && !under.style.bold) continue; // already pushed back
        const { bold: _bold, ...rest } = under.style;
        setClipped(buffer, x, y, under.char, { ...rest, dim: true }, clip);
      }
    }
  }

  if (!offscreen && ownBg !== undefined) {
    const fillStyle: Style = ownBg === 'default' ? {} : { bg: ownBg };
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        setClipped(buffer, x, y, ' ', fillStyle, clip);
      }
    }
  }

  // 1b. Border (if set), clipped by inherited clip.
  if (!offscreen) paintBorder(inst, buffer, box, clip, effectiveBg, effectiveFg);

  // 2. Own text — clipped by content rect (existing behavior) AND inherited clip.
  const text = offscreen ? '' : ownText(inst);
  if (text) {
    const content = contentRectOf(inst, box);
    const mode = (inst.props.wrap ?? 'none') as WrapMode;
    const lines: WrappedLine[] = mode === 'none'
      ? text.split('\n').map((line) => ({ text: line }))
      : wrapTextLines(text, content.width, mode);
    const textStyle = textStyleOf(inst);
    if (textStyle.bg === undefined && effectiveBg !== undefined) {
      textStyle.bg = effectiveBg;
    }
    if (inst.props.color === undefined) {
      const fg = fgOf(effectiveFg);
      if (fg !== undefined) textStyle.fg = fg;
    }
    // With runs, every character has its own style: the run's on top of the box's.
    const styles = inst.props.runs !== undefined ? runStyles(inst.props.runs, textStyle) : null;
    const source = styles ? graphemes(text) : null;
    let at = 0; // position in `source` of the next cluster to be painted
    for (let row = 0; row < lines.length; row++) {
      const lineText = lines[row]?.text ?? '';
      const clusters = graphemes(lineText);
      // A line the WRAP ended (not a newline in the source) carries on at the
      // start of the next row: mark the span it painted, so a selection over
      // the two rows copies them as the one line they were written as. Only
      // when that next row is actually painted — a line cut off by the content
      // height has nothing below it.
      const continues = lines[row]?.continues;
      if (continues !== undefined && row + 1 < Math.min(lines.length, content.height)) {
        const span = Math.min(stringWidth(lineText), content.width);
        markContinuation(buffer, content.top + row, content.left, content.left + span, continues, clip);
      }
      let col = 0;
      for (const ch of clusters) {
        let style = textStyle;
        if (styles && source) {
          // Wrapping only ever DROPS clusters (the space or line break it
          // breaks at) or adds the truncation ellipsis — so walk the source
          // forward to this cluster. One that isn't there (the ellipsis)
          // takes the style of the text it cuts.
          let found = at;
          while (found < source.length && source[found] !== ch) found++;
          if (found < source.length) { style = styles[found]!; at = found + 1; }
          else style = styles[Math.min(at, styles.length - 1)] ?? textStyle;
        }
        const width = clusterWidth(ch);
        if (width === 0) continue; // a lone zero-width mark has no cell
        if (row < content.height && col < content.width) {
          // Sanitize controls (C0, DEL, C1): emitting them to a TTY moves /
          // resets the cursor (\r → col 0, \b → back, U+009B is CSI) and
          // corrupts subsequent cells in the diff-emitted stream. Substitute a
          // space so the cell is still occupied but inert. Tab/newline
          // included — splitting is handled upstream by wrapText.
          const cp = ch.codePointAt(0)!;
          let safe = cp < 0x20 || (cp >= 0x7f && cp < 0xa0) ? ' ' : ch;
          // A wide cluster in the content rect's last column would be torn.
          if (width === 2 && col + 1 >= content.width) safe = ' ';
          setClipped(buffer, content.left + col, content.top + row, safe, style, clip);
        }
        col += width;
      }
    }
  }

  // 2b. A component that wraps text itself paints each resulting row as its own
  // box, so the painter never sees the wrap. `wrapContinues` is how that
  // component says "this row carries on below": the mark covers the cells the
  // row's own text occupies — which the component has to say, since a box that
  // frames its row (a code block's gutter) or pads it (a diff band) paints
  // cells around the text that are not part of it.
  const continuation = inst.props.wrapContinues;
  if (!offscreen && continuation !== undefined) {
    const content = contentRectOf(inst, box);
    // A collapsed box has no last row: `content.top + content.height - 1` would
    // land on the row ABOVE it and join two lines that are not its own.
    if (content.width > 0 && content.height > 0) {
      const from = Math.min(continuation.textStart ?? 0, content.width);
      markContinuation(
        buffer,
        content.top + content.height - 1,
        content.left + from,
        content.left + Math.min(from + continuation.textWidth, content.width),
        continuation.dropped,
        clip,
      );
    }
  }

  // A scroll prop turns the box into a scroll viewport: resolve the effective
  // offset now, against this frame's layout, so a pinned view (scrollBottom: 0)
  // follows growing content without a catch-up frame.
  const scrolls = isScrollViewport(inst);
  let scrollTop = 0;
  if (scrolls || inst.props.onScrollMetrics) {
    const state = scrollStateOf(inst, box);
    scrollTop = state.scrollTop;
    inst.props.onScrollMetrics?.(state.metrics);
  }

  // Compute descendant clip: if this box clips (overflow:hidden, or it scrolls),
  // intersect inherited clip with this box's content rect; otherwise pass through.
  const childClip = inst.props.overflow === 'hidden' || scrolls
    ? intersectRects(clip, contentRectOf(inst, box))
    : clip;

  // 3. Two-pass: stack-flow children first, then absolute children on top.
  // `hitTest.ts` walks the tree in exactly this order to work out which box is
  // under a cell — change the passes, the zIndex sort, the clip intersections
  // or the scroll offset here and that walk has to change with it, or a drag
  // will select against a box other than the one on screen.
  // Within each pass, sort by zIndex (default 0). JS sort is stable per ES2019,
  // so tree order is preserved as the natural tiebreaker. zIndex does NOT cross
  // pass boundaries — absolutes always paint on top of stack-flow.
  const stackFlow: Instance[] = [];
  const absolutes: Instance[] = [];
  for (const child of inst.children) {
    if (child.type !== 'box') continue;
    (child.props.position === 'absolute' ? absolutes : stackFlow).push(child);
  }
  const byZ = (a: Instance, b: Instance) => (a.props.zIndex ?? 0) - (b.props.zIndex ?? 0);
  stackFlow.sort(byZ);
  absolutes.sort(byZ);
  for (const child of stackFlow) paintInstance(child, buffer, box.left, box.top - scrollTop, effectiveBg, childClip, effectiveFg);
  // Overlays of a scroll viewport may sit in its padding (a scrollbar in the
  // column reserved by paddingRight), so they clip to the padding box instead.
  const overlayClip = scrolls ? intersectRects(clip, paddingRectOf(inst, box)) : childClip;
  for (const child of absolutes) paintInstance(child, buffer, box.left, box.top, effectiveBg, overlayClip, effectiveFg);
}
