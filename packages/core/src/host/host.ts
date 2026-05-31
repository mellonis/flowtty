import { Align, Display, Edge, FlexDirection, Gutter, Justify, MeasureMode, PositionType, Wrap, type Yoga, type YogaNode } from './yoga.js';
import { wrapText, type WrapMode } from '../wrap.js';
import type { BorderStyle } from './borders.js';
import type { Rect } from './layout.js';

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
  strikethrough?: boolean;
  // Box background fill:
  backgroundColor?: string;
  // Border drawn around the box (one cell on each side). When set, Yoga
  // reserves 1 cell on each edge so border doesn't overlap content.
  border?: BorderStyle;
  // Color for border glyphs — same string format as `color` (named or truecolor).
  borderColor?: string;
  // Text painted into the top border line (after the corner + 1 edge piece).
  // No-op unless `border` is set. Long titles are truncated with `…` to leave
  // at least 1 edge piece on each side. Painted with the same color as the border.
  borderTitle?: string;
  // Padding (cells). Per-edge wins over axis wins over shorthand.
  // E.g. paddingTop overrides paddingY which overrides padding.
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  // Margin (cells). Per-edge wins over axis wins over shorthand.
  // Negative values are allowed (Yoga supports overlap layouts).
  margin?: number;
  marginX?: number;
  marginY?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  // Gap between flex children (cells). Per-axis wins over shorthand.
  // CSS convention: rowGap = gap BETWEEN rows (vertical spacing in column flex);
  // columnGap = gap BETWEEN columns (horizontal spacing in row flex).
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  // Flex sizing. Defaults match Yoga (NOT CSS):
  //   flexGrow:   0  (no expansion into leftover space)
  //   flexShrink: 0  (no shrink under deficit — CSS default is 1)
  //   flexBasis:  'auto'  (use width/height as initial size)
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | 'auto' | `${number}%`;
  // Multi-line flex: 'wrap' / 'wrap-reverse' lets children flow onto additional lines
  // when they overflow the main axis. Default 'nowrap'.
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  /** Cross-axis distribution of wrap lines. Only effective when flexWrap is 'wrap' or 'wrap-reverse'
   *  AND the parent has extra cross-axis space. Default 'flex-start'. */
  alignContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly' | 'stretch';
  /** Minimum cell size — Yoga prevents the box from shrinking below this.
   *  Accepts a number (cells) or a percent string (e.g. '50%'). Undefined = no minimum. */
  minWidth?: number | `${number}%`;
  maxWidth?: number | `${number}%`;
  minHeight?: number | `${number}%`;
  maxHeight?: number | `${number}%`;
  /** Width / height ratio. Yoga derives the missing dimension from the constrained one.
   *  CSS convention: `aspectRatio: 2` = twice as wide as tall; `0.5` = twice as tall as wide; `1` = square. */
  aspectRatio?: number;
  /** 'none' removes this box and all descendants from layout (siblings don't reserve space for it,
   *  and paint skips the subtree). Default 'flex'. Useful for conditional UI without unmounting. */
  display?: 'flex' | 'none';
  /** Fires after layout with this box's computed rect. Use to read allocated dimensions
   *  for responsive rendering (e.g. paginating an article reader). **Diff before setState** —
   *  this fires on EVERY paint, and unconditionally calling setState with a new object
   *  will infinite-loop. Pattern:
   *    onLayout={(r) => { if (!size || size.width !== r.width || size.height !== r.height) setSize(r); }} */
  onLayout?: (rect: Rect) => void;
  /** Stacking order within the same paint pass. Higher values paint on top.
   *  Default 0. Tree order is the tiebreaker. Does NOT cross pass boundaries:
   *  absolutes always overlay stack-flow regardless of zIndex. */
  zIndex?: number;
  /** Clip descendants to this box's content rect. Default 'visible' (no clipping).
   *  'hidden' clips ALL descendant writes including their backgrounds and borders.
   *  Does NOT clip this box's own background or border (those are this box's own area). */
  overflow?: 'visible' | 'hidden';
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

/**
 * Adapter-facing root container: a list of top-level Instances plus the loaded
 * Yoga module. Each framework adapter (React reconciler, Vue, …) builds one of
 * these and passes it to `computeLayout` + `paint`. Lives in host so layout /
 * paint (in core) can depend on it without pulling in any adapter code.
 */
export interface Container {
  children: Instance[];
  Yoga: Yoga;
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

  // Border edge reservation — Yoga subtracts these from content space.
  // Always set (including to 0 when border drops away) so prop changes re-render correctly.
  const borderWidth = props.border ? 1 : 0;
  n.setBorder(Edge.Top, borderWidth);
  n.setBorder(Edge.Right, borderWidth);
  n.setBorder(Edge.Bottom, borderWidth);
  n.setBorder(Edge.Left, borderWidth);

  // Padding edge reservation — per-edge ?? axis ?? all ?? 0.
  // Always set (including 0) so removing the prop re-renders correctly.
  const padTop    = props.paddingTop    ?? props.paddingY ?? props.padding ?? 0;
  const padRight  = props.paddingRight  ?? props.paddingX ?? props.padding ?? 0;
  const padBottom = props.paddingBottom ?? props.paddingY ?? props.padding ?? 0;
  const padLeft   = props.paddingLeft   ?? props.paddingX ?? props.padding ?? 0;
  n.setPadding(Edge.Top, padTop);
  n.setPadding(Edge.Right, padRight);
  n.setPadding(Edge.Bottom, padBottom);
  n.setPadding(Edge.Left, padLeft);

  // Margin edge reservation — per-edge ?? axis ?? all ?? 0.
  // Always set (including 0) so removing the prop re-renders correctly.
  const marTop    = props.marginTop    ?? props.marginY ?? props.margin ?? 0;
  const marRight  = props.marginRight  ?? props.marginX ?? props.margin ?? 0;
  const marBottom = props.marginBottom ?? props.marginY ?? props.margin ?? 0;
  const marLeft   = props.marginLeft   ?? props.marginX ?? props.margin ?? 0;
  n.setMargin(Edge.Top, marTop);
  n.setMargin(Edge.Right, marRight);
  n.setMargin(Edge.Bottom, marBottom);
  n.setMargin(Edge.Left, marLeft);

  // Gap between siblings — per-axis ?? shorthand ?? 0.
  // Always set so removing the prop re-renders correctly.
  const rGap = props.rowGap    ?? props.gap ?? 0;
  const cGap = props.columnGap ?? props.gap ?? 0;
  n.setGap(Gutter.Row, rGap);
  n.setGap(Gutter.Column, cGap);

  // Flex sizing — always set (including defaults) so removing the prop re-renders correctly.
  n.setFlexGrow(props.flexGrow ?? 0);
  n.setFlexShrink(props.flexShrink ?? 0);

  // flexBasis follows the width/height pattern: number → exact, '%' → percent, else auto.
  if (typeof props.flexBasis === 'number') {
    n.setFlexBasis(props.flexBasis);
  } else if (typeof props.flexBasis === 'string' && props.flexBasis.endsWith('%')) {
    n.setFlexBasisPercent(parseFloat(props.flexBasis));
  } else {
    n.setFlexBasisAuto();
  }

  // Min/max constraints — pass-through. Yoga's signatures accept number | '${number}%' | undefined
  // directly, so no manual branching is needed (different from width/height which support 'auto').
  n.setMinWidth(props.minWidth);
  n.setMaxWidth(props.maxWidth);
  n.setMinHeight(props.minHeight);
  n.setMaxHeight(props.maxHeight);
  n.setAspectRatio(props.aspectRatio);
  n.setDisplay(props.display === 'none' ? Display.None : Display.Flex);

  // flex-wrap → Yoga Wrap enum. Always set so removing the prop re-renders correctly.
  n.setFlexWrap(wrapMap(props.flexWrap));
  n.setAlignContent(acMap(props.alignContent));

  // Alignment.
  n.setJustifyContent(jcMap(props.justifyContent));
  n.setAlignItems(aiMap(props.alignItems));
}

function wrapMap(v: BoxProps['flexWrap']): number {
  switch (v) {
    case 'wrap':         return Wrap.Wrap;
    case 'wrap-reverse': return Wrap.WrapReverse;
    default:             return Wrap.NoWrap;
  }
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
    case 'flex-start': return Align.FlexStart;
    // Default 'stretch' (matches React Native; deviates from CSS flex-start).
    // Rationale: most TUI use cases want children to fill cross-axis (e.g. a
    // column dialog wants its TextInput/buttons to span the dialog width); CSS's
    // flex-start default forces content-sizing which causes percentage children
    // to collapse and onLayout-driven scroll to misreport viewport widths.
    default: return Align.Stretch;
  }
}

function acMap(v: BoxProps['alignContent']): number {
  switch (v) {
    case 'flex-end':      return Align.FlexEnd;
    case 'center':        return Align.Center;
    case 'space-between': return Align.SpaceBetween;
    case 'space-around':  return Align.SpaceAround;
    case 'space-evenly':  return Align.SpaceEvenly;
    case 'stretch':       return Align.Stretch;
    default:              return Align.FlexStart;
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
    // yoga-layout 3.x WASM does not reliably mark the node dirty when
    // setMeasureFunc is called (e.g. on text updates). markDirty() forces
    // the next calculateLayout call to recompute rather than use stale cache.
    inst.yogaNode.markDirty();
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
