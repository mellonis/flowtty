import { Buffer } from './cells.js';
import { layoutOf, type Rect } from './layout.js';
import { ownText, type Instance } from './host.js';
import type { Container } from './reconciler.js';

export function paint(container: Container, width: number, height: number): Buffer {
  const buffer = new Buffer(width, height);
  for (const root of container.children) paintInstance(root, buffer, 0, 0);
  return buffer;
}

function paintInstance(inst: Instance, buffer: Buffer, offsetX: number, offsetY: number): void {
  const box: Rect = layoutOf(inst, offsetX, offsetY);

  // A text-only box paints its string at the box origin (one display column
  // per code point in M0).
  const text = ownText(inst);
  if (text) {
    const lines = text.split('\n');
    for (let row = 0; row < lines.length; row++) {
      const line = [...(lines[row] ?? '')];
      for (let col = 0; col < line.length; col++) {
        buffer.set(box.left + col, box.top + row, line[col]!, {});
      }
    }
  }

  for (const child of inst.children) {
    if (child.type === 'box') paintInstance(child, buffer, box.left, box.top);
  }
}
