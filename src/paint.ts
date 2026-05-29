import { Buffer, type Style } from './cells.js';
import { layoutOf, type Rect } from './layout.js';
import { ownText, type Instance } from './host.js';
import type { Container } from './reconciler.js';
import { wrapText, type WrapMode } from './wrap.js';

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

  // 2. Paint own text (wrapped if wrap prop set).
  const text = ownText(inst);
  if (text) {
    const mode = (inst.props.wrap ?? 'none') as WrapMode;
    const lines = mode === 'none' ? text.split('\n') : wrapText(text, box.width, mode);
    const textStyle = textStyleOf(inst);
    if (textStyle.bg === undefined && effectiveBg !== undefined) {
      textStyle.bg = effectiveBg;
    }
    for (let row = 0; row < lines.length; row++) {
      const chars = [...(lines[row] ?? '')];
      for (let col = 0; col < chars.length; col++) {
        buffer.set(box.left + col, box.top + row, chars[col]!, textStyle);
      }
    }
  }

  // 3. Recurse into child boxes, threading effectiveBg.
  for (const child of inst.children) {
    if (child.type === 'box') paintInstance(child, buffer, box.left, box.top, effectiveBg);
  }
}
