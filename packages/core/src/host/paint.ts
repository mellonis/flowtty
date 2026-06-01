import { Buffer, type Style } from '../cells.js';
import { wrapText, type WrapMode } from '../wrap.js';
import { BORDER_CHARS } from './borders.js';
import { layoutOf, type Rect } from './layout.js';
import { ownText, type Instance, type Container } from './host.js';
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
function paintBorder(inst: Instance, buffer: Buffer, box: Rect, clip: Rect | null): void {
  const style = inst.props.border;
  if (!style) return;
  if (box.width < 2 || box.height < 2) return; // can't draw a border without an interior

  const chars = BORDER_CHARS[style];
  const cellStyle: Style = {};
  if (inst.props.borderColor !== undefined) cellStyle.fg = inst.props.borderColor;

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
    setClipped(buffer, x, y0, chars.t, cellStyle, clip);
    setClipped(buffer, x, y1, chars.b, cellStyle, clip);
  }
  // Left + right edges (between corners)
  for (let y = y0 + 1; y < y1; y++) {
    setClipped(buffer, x0, y, chars.l, cellStyle, clip);
    setClipped(buffer, x1, y, chars.r, cellStyle, clip);
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
  if (ownBg !== undefined) {
    const fillStyle: Style = ownBg === 'default' ? {} : { bg: ownBg };
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        setClipped(buffer, x, y, ' ', fillStyle, clip);
      }
    }
  }

  // 1b. Border (if set), clipped by inherited clip.
  paintBorder(inst, buffer, box, clip);

  // 2. Own text — clipped by content rect (existing behavior) AND inherited clip.
  const text = ownText(inst);
  if (text) {
    const content = contentRectOf(inst, box);
    const mode = (inst.props.wrap ?? 'none') as WrapMode;
    const lines = mode === 'none' ? text.split('\n') : wrapText(text, content.width, mode);
    const textStyle = textStyleOf(inst);
    if (textStyle.bg === undefined && effectiveBg !== undefined) {
      textStyle.bg = effectiveBg;
    }
    for (let row = 0; row < lines.length; row++) {
      if (row >= content.height) break;
      const chars = [...(lines[row] ?? '')];
      for (let col = 0; col < chars.length; col++) {
        if (col >= content.width) break;
        // Sanitize C0 control bytes (NUL..US): emitting them to a TTY moves /
        // resets the cursor (e.g. \r → col 0, \b → back) and corrupts subsequent
        // cells in the diff-emitted stream. Substitute a space so the cell is
        // still occupied but inert. Tab/newline included — splitting is handled
        // upstream by wrapText.
        const ch = chars[col]!;
        const safe = ch.charCodeAt(0) < 0x20 ? ' ' : ch;
        setClipped(buffer, content.left + col, content.top + row, safe, textStyle, clip);
      }
    }
  }

  // Compute descendant clip: if this box has overflow:hidden, intersect inherited
  // clip with this box's content rect; otherwise pass inherited through.
  const childClip = inst.props.overflow === 'hidden'
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
  for (const child of stackFlow) paintInstance(child, buffer, box.left, box.top, effectiveBg, childClip);
  for (const child of absolutes) paintInstance(child, buffer, box.left, box.top, effectiveBg, childClip);
}
