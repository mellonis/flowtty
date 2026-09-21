import { Buffer, type Style } from '../cells.js';
import { wrapText, type WrapMode } from '../wrap.js';
import { BORDER_CHARS } from './borders.js';
import { layoutOf, type Rect } from './layout.js';
import { ownText, type Instance, type Container, type TextRun } from './host.js';
import { Edge } from './yoga.js';

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
  if (p.color !== undefined) style.fg = p.color;
  if (p.bold) style.bold = true;
  if (p.dim) style.dim = true;
  if (p.underline) style.underline = true;
  if (p.inverse) style.inverse = true;
  if (p.strikethrough) style.strikethrough = true;
  if (p.link !== undefined) style.link = p.link;
  if (p.backgroundColor !== undefined) style.bg = p.backgroundColor;
  return style;
}

// One Style per character of the joined runs: the box's text style, with whatever
// the run sets laid over it.
function runStyles(runs: readonly TextRun[], base: Style): Style[] {
  const out: Style[] = [];
  for (const run of runs) {
    const style: Style = { ...base };
    if (run.color !== undefined) style.fg = run.color;
    if (run.backgroundColor !== undefined) style.bg = run.backgroundColor;
    if (run.bold !== undefined) style.bold = run.bold;
    if (run.dim !== undefined) style.dim = run.dim;
    if (run.underline !== undefined) style.underline = run.underline;
    if (run.inverse !== undefined) style.inverse = run.inverse;
    if (run.strikethrough !== undefined) style.strikethrough = run.strikethrough;
    if (run.link !== undefined) style.link = run.link;
    for (const _ch of run.text) out.push(style);
  }
  return out;
}

// Gate a buffer write on a clip rect. If clip is null, write unconditionally.
function setClipped(buffer: Buffer, x: number, y: number, char: string, style: Style, clip: Rect | null): void {
  if (clip !== null) {
    if (x < clip.left || y < clip.top || x >= clip.left + clip.width || y >= clip.top + clip.height) return;
  }
  buffer.set(x, y, char, style);
}

// Intersection of two rects. Null treated as "no clip" (returns the other rect).
// Returns an empty (width:0 / height:0) rect when there's no overlap — setClipped
// will skip all writes against it.
function intersectRects(a: Rect | null, b: Rect): Rect {
  if (a === null) return b;
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return { left, top, width: 0, height: 0 };
  return { left, top, width: right - left, height: bottom - top };
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
function paintBorder(inst: Instance, buffer: Buffer, box: Rect, clip: Rect | null, effectiveBg: string | undefined): void {
  const style = inst.props.border;
  if (!style) return;
  if (box.width < 2 || box.height < 2) return; // can't draw a border without an interior

  const chars = BORDER_CHARS[style];
  const cellStyle: Style = {};
  if (inst.props.borderColor !== undefined) cellStyle.fg = inst.props.borderColor;
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
      const raw = ` ${title} `;
      const titleChars = [...raw];
      const drawN = Math.min(titleChars.length, avail);
      for (let i = 0; i < drawN; i++) {
        const ch = i === drawN - 1 && titleChars.length > avail ? '…' : titleChars[i]!;
        setClipped(buffer, x0 + 2 + i, y0, ch, cellStyle, clip);
      }
    }
  }
}

// Inner content rect (padding + border subtracted). Yoga's computed values are
// only valid AFTER computeLayout, so this must be called inside paintInstance,
// not at applyProps time. Border cells and padding cells are reserved by Yoga
// in the LAYOUT phase (so children land inside the content rect automatically),
// but own-text painting still needs the inset coordinates explicitly.
function contentRectOf(inst: Instance, box: Rect): Rect {
  const n = inst.yogaNode;
  const padT = n.getComputedPadding(Edge.Top)    + n.getComputedBorder(Edge.Top);
  const padR = n.getComputedPadding(Edge.Right)  + n.getComputedBorder(Edge.Right);
  const padB = n.getComputedPadding(Edge.Bottom) + n.getComputedBorder(Edge.Bottom);
  const padL = n.getComputedPadding(Edge.Left)   + n.getComputedBorder(Edge.Left);
  return {
    left:   box.left + padL,
    top:    box.top  + padT,
    width:  Math.max(0, box.width  - padL - padR),
    height: Math.max(0, box.height - padT - padB),
  };
}

// The box minus its border ring (padding included).
function paddingRectOf(inst: Instance, box: Rect): Rect {
  const n = inst.yogaNode;
  const t = n.getComputedBorder(Edge.Top);
  const r = n.getComputedBorder(Edge.Right);
  const b = n.getComputedBorder(Edge.Bottom);
  const l = n.getComputedBorder(Edge.Left);
  return { left: box.left + l, top: box.top + t, width: Math.max(0, box.width - l - r), height: Math.max(0, box.height - t - b) };
}

function paintInstance(
  inst: Instance,
  buffer: Buffer,
  offsetX: number,
  offsetY: number,
  inheritedBg: string | undefined = undefined,
  clip: Rect | null = null,
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
  if (!offscreen) paintBorder(inst, buffer, box, clip, effectiveBg);

  // 2. Own text — clipped by content rect (existing behavior) AND inherited clip.
  const text = offscreen ? '' : ownText(inst);
  if (text) {
    const content = contentRectOf(inst, box);
    const mode = (inst.props.wrap ?? 'none') as WrapMode;
    const lines = mode === 'none' ? text.split('\n') : wrapText(text, content.width, mode);
    const textStyle = textStyleOf(inst);
    if (textStyle.bg === undefined && effectiveBg !== undefined) {
      textStyle.bg = effectiveBg;
    }
    // With runs, every character has its own style: the run's on top of the box's.
    const styles = inst.props.runs !== undefined ? runStyles(inst.props.runs, textStyle) : null;
    const source = styles ? [...text] : null;
    let at = 0; // position in `source` of the next character to be painted
    for (let row = 0; row < lines.length; row++) {
      const chars = [...(lines[row] ?? '')];
      for (let col = 0; col < chars.length; col++) {
        const ch = chars[col]!;
        let style = textStyle;
        if (styles && source) {
          // Wrapping only ever DROPS characters (the space or line break it
          // breaks at) or adds the truncation ellipsis — so walk the source
          // forward to this character. One that isn't there (the ellipsis)
          // takes the style of the text it cuts.
          let found = at;
          while (found < source.length && source[found] !== ch) found++;
          if (found < source.length) { style = styles[found]!; at = found + 1; }
          else style = styles[Math.min(at, styles.length - 1)] ?? textStyle;
        }
        if (row >= content.height || col >= content.width) continue;
        // Sanitize C0 control bytes (NUL..US): emitting them to a TTY moves /
        // resets the cursor (e.g. \r → col 0, \b → back) and corrupts subsequent
        // cells in the diff-emitted stream. Substitute a space so the cell is
        // still occupied but inert. Tab/newline included — splitting is handled
        // upstream by wrapText.
        const safe = ch.charCodeAt(0) < 0x20 ? ' ' : ch;
        setClipped(buffer, content.left + col, content.top + row, safe, style, clip);
      }
    }
  }

  // A scroll prop turns the box into a scroll viewport: resolve the effective
  // offset now, against this frame's layout, so a pinned view (scrollBottom: 0)
  // follows growing content without a catch-up frame.
  const scrolls = inst.props.scrollTop !== undefined || inst.props.scrollBottom !== undefined;
  let scrollTop = 0;
  if (scrolls || inst.props.onScrollMetrics) {
    const viewport = contentRectOf(inst, box);
    // Content height = the lowest bottom edge among flow children, measured from
    // the content rect's top. Absolute children are overlays and don't count.
    let contentBottom = 0;
    for (const child of inst.children) {
      if (child.type !== 'box' || child.props.position === 'absolute' || child.props.display === 'none') continue;
      const n = child.yogaNode;
      contentBottom = Math.max(contentBottom, n.getComputedTop() + n.getComputedHeight() + n.getComputedMargin(Edge.Bottom));
    }
    const contentHeight = Math.max(0, contentBottom - (viewport.top - box.top));
    const maxScrollTop = Math.max(0, contentHeight - viewport.height);
    const wanted = inst.props.scrollBottom !== undefined
      ? maxScrollTop - inst.props.scrollBottom
      : inst.props.scrollTop ?? 0;
    scrollTop = Math.max(0, Math.min(maxScrollTop, Math.round(wanted)));
    inst.props.onScrollMetrics?.({ contentHeight, viewportHeight: viewport.height, scrollTop, maxScrollTop });
  }

  // Compute descendant clip: if this box clips (overflow:hidden, or it scrolls),
  // intersect inherited clip with this box's content rect; otherwise pass through.
  const childClip = inst.props.overflow === 'hidden' || scrolls
    ? intersectRects(clip, contentRectOf(inst, box))
    : clip;

  // 3. Two-pass: stack-flow children first, then absolute children on top.
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
  for (const child of stackFlow) paintInstance(child, buffer, box.left, box.top - scrollTop, effectiveBg, childClip);
  // Overlays of a scroll viewport may sit in its padding (a scrollbar in the
  // column reserved by paddingRight), so they clip to the padding box instead.
  const overlayClip = scrolls ? intersectRects(clip, paddingRectOf(inst, box)) : childClip;
  for (const child of absolutes) paintInstance(child, buffer, box.left, box.top, effectiveBg, overlayClip);
}
