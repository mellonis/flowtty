import { Align, Edge, FlexDirection, Justify, MeasureMode, PositionType, type Yoga, type YogaNode } from './yoga.js';
import { wrapText, type WrapMode } from './wrap.js';

// The host has a single element type by design: Text is sugar for Box.
export type HostType = 'flowtty-box';

export interface BoxProps {
  /** Fixed size in cells. Strings like '100%' use Yoga's percentage sizing. */
  width?: number | string;
  height?: number | string;
  flexDirection?: 'row' | 'column';
  /** Default 'static' (Yoga's stack flow). 'absolute' positions via top/left/right/bottom relative to the nearest non-static ancestor. */
  position?: 'static' | 'absolute';
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  /** Main-axis alignment of children (flexbox). */
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  /** Cross-axis alignment of children. */
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch';

  // Text wrap mode for direct text children (default: 'none').
  wrap?: 'wrap' | 'truncate' | 'none';
  // Text styling applied to direct text children:
  color?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
  // Box background fill:
  backgroundColor?: string;
}

export interface Instance {
  type: 'box';
  props: BoxProps;
  yogaNode: YogaNode;
  children: Array<Instance | TextInstance>;
}

export interface TextInstance {
  type: 'text';
  text: string;
  parent?: Instance;
}

export function createInstance(type: HostType, props: BoxProps, Yoga: Yoga): Instance {
  // Single host type — 'flowtty-text' was removed; Text is sugar for Box.
  const node = Yoga.Node.create();
  const inst: Instance = { type: 'box', props, yogaNode: node, children: [] };
  applyProps(inst, props, Yoga);
  return inst;
}

export function createTextInstance(text: string, _Yoga: Yoga): TextInstance {
  return { type: 'text', text };
}

export function applyProps(inst: Instance, props: BoxProps, _Yoga: Yoga): void {
  inst.props = props;
  const n = inst.yogaNode;

  // Size — number OR percentage string ('50%', '100%').
  if (typeof props.width === 'number') n.setWidth(props.width);
  else if (typeof props.width === 'string' && props.width.endsWith('%')) {
    n.setWidthPercent(parseFloat(props.width));
  } else n.setWidthAuto();

  if (typeof props.height === 'number') n.setHeight(props.height);
  else if (typeof props.height === 'string' && props.height.endsWith('%')) {
    n.setHeightPercent(parseFloat(props.height));
  } else n.setHeightAuto();

  n.setFlexDirection(
    props.flexDirection === 'row' ? FlexDirection.Row : FlexDirection.Column,
  );

  // Position type + edge offsets.
  n.setPositionType(props.position === 'absolute' ? PositionType.Absolute : PositionType.Static);
  if (props.top !== undefined) n.setPosition(Edge.Top, props.top);
  if (props.left !== undefined) n.setPosition(Edge.Left, props.left);
  if (props.right !== undefined) n.setPosition(Edge.Right, props.right);
  if (props.bottom !== undefined) n.setPosition(Edge.Bottom, props.bottom);

  // Alignment.
  n.setJustifyContent(jcMap(props.justifyContent));
  n.setAlignItems(aiMap(props.alignItems));
}

function jcMap(v: BoxProps['justifyContent']): number {
  switch (v) {
    case 'center': return Justify.Center;
    case 'flex-end': return Justify.FlexEnd;
    case 'space-between': return Justify.SpaceBetween;
    case 'space-around': return Justify.SpaceAround;
    case 'space-evenly': return Justify.SpaceEvenly;
    default: return Justify.FlexStart;
  }
}

function aiMap(v: BoxProps['alignItems']): number {
  switch (v) {
    case 'center': return Align.Center;
    case 'flex-end': return Align.FlexEnd;
    case 'stretch': return Align.Stretch;
    default: return Align.FlexStart;
  }
}

export function measureText(text: string): { width: number; height: number } {
  const lines = text.split('\n');
  const width = lines.reduce((m, l) => Math.max(m, [...l].length), 0);
  return { width, height: lines.length };
}

// Concatenate a box's direct text children into one string.
export function ownText(inst: Instance): string {
  return inst.children
    .filter((c): c is TextInstance => c.type === 'text')
    .map((c) => c.text)
    .join('');
}

// Install/clear a Yoga measure func: text-only boxes measure to their text.
export function refreshMeasure(inst: Instance, _Yoga: Yoga): void {
  const hasText = inst.children.some((c) => c.type === 'text');
  const hasBox = inst.children.some((c) => c.type === 'box');
  if (hasText && !hasBox) {
    const text = ownText(inst);
    const mode = (inst.props.wrap ?? 'none') as WrapMode;
    inst.yogaNode.setMeasureFunc((width, widthMode /*, _height, _heightMode */) => {
      // When parent imposes a width (Exactly or AtMost) and wrap mode is set,
      // run wrapText to compute the constrained dimensions; otherwise return
      // natural size (longest line × line count) so layout matches existing
      // M0/M1a/M1b/M1c behavior for unwrapped text.
      if (
        mode !== 'none' &&
        (widthMode === MeasureMode.Exactly || widthMode === MeasureMode.AtMost) &&
        Number.isFinite(width)
      ) {
        const cap = Math.max(0, Math.floor(width));
        const lines = wrapText(text, cap, mode);
        const longest = lines.reduce((m, l) => Math.max(m, [...l].length), 0);
        return { width: longest, height: lines.length };
      }
      return measureText(text);
    });
  } else {
    inst.yogaNode.setMeasureFunc(null);
  }
}

export function appendChild(parent: Instance, child: Instance | TextInstance, Yoga: Yoga): void {
  parent.children.push(child);
  if (child.type === 'box') {
    parent.yogaNode.setMeasureFunc(null); // Yoga forbids a measure func on a node with children
    parent.yogaNode.insertChild(child.yogaNode, parent.yogaNode.getChildCount());
  } else {
    child.parent = parent;
  }
  refreshMeasure(parent, Yoga);
}

export function removeChild(parent: Instance, child: Instance | TextInstance, Yoga: Yoga): void {
  const i = parent.children.indexOf(child);
  if (i >= 0) parent.children.splice(i, 1);
  if (child.type === 'box') {
    parent.yogaNode.removeChild(child.yogaNode);
    child.yogaNode.freeRecursive(); // free wasm node — required to avoid leaks
  } else {
    child.parent = undefined;
  }
  refreshMeasure(parent, Yoga);
}

export function insertBefore(
  parent: Instance,
  child: Instance | TextInstance,
  before: Instance | TextInstance,
  Yoga: Yoga,
): void {
  const i = parent.children.indexOf(before);
  parent.children.splice(i < 0 ? parent.children.length : i, 0, child);
  if (child.type === 'box') {
    const boxIndex = parent.children.filter((c) => c.type === 'box').indexOf(child);
    parent.yogaNode.setMeasureFunc(null); // Yoga forbids a measure func on a node with children
    parent.yogaNode.insertChild(child.yogaNode, boxIndex);
  } else {
    child.parent = parent;
  }
  refreshMeasure(parent, Yoga);
}
