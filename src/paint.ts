import { Buffer, type Style } from './cells.js';
import { layoutOf, type Rect } from './layout.js';
import { ownText, type Instance } from './host.js';
import type { Container } from './reconciler.js';
import { wrapText, type WrapMode } from './wrap.js';
import { BORDER_CHARS } from './borders.js';
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
  if (p.backgroundColor !== undefined) style.bg = p.backgroundColor;
  return style;
}

// Draw the box's 8-slot border (4 corners + 4 edge runs) directly into the
// buffer. Called BEFORE children paint so content / nested children overlay
// the border interior. The border itself sits on the outermost cell ring of
// the box rect; Yoga's setBorder(edge, 1) reserved those cells from layout
// so neither own-text nor child layout will land on them.
function paintBorder(inst: Instance, buffer: Buffer, box: Rect): void {
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
  buffer.set(x0, y0, chars.tl, cellStyle);
  buffer.set(x1, y0, chars.tr, cellStyle);
  buffer.set(x0, y1, chars.bl, cellStyle);
  buffer.set(x1, y1, chars.br, cellStyle);

  // Top + bottom edges (between corners)
  for (let x = x0 + 1; x < x1; x++) {
    buffer.set(x, y0, chars.t, cellStyle);
    buffer.set(x, y1, chars.b, cellStyle);
  }
  // Left + right edges (between corners)
  for (let y = y0 + 1; y < y1; y++) {
    buffer.set(x0, y, chars.l, cellStyle);
    buffer.set(x1, y, chars.r, cellStyle);
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
): void {
  const box: Rect = layoutOf(inst, offsetX, offsetY);
  const ownBg = inst.props.backgroundColor;
  const effectiveBg = ownBg ?? inheritedBg;

  // 1. Fill the box rect with own backgroundColor (if set).
  if (ownBg !== undefined) {
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        buffer.set(x, y, ' ', { bg: ownBg });
      }
    }
  }

  // 1b. Draw border (if set) on the outermost ring before content paints.
  paintBorder(inst, buffer, box);

  // 2. Paint own text (wrapped if wrap prop set) inside the content area
  //    (rect with padding + border subtracted).
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
      if (row >= content.height) break; // clip vertically against content area
      const chars = [...(lines[row] ?? '')];
      for (let col = 0; col < chars.length; col++) {
        if (col >= content.width) break; // clip horizontally
        buffer.set(content.left + col, content.top + row, chars[col]!, textStyle);
      }
    }
  }

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
  for (const child of stackFlow) paintInstance(child, buffer, box.left, box.top, effectiveBg);
  for (const child of absolutes) paintInstance(child, buffer, box.left, box.top, effectiveBg);
}
