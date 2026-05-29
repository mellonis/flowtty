import { FlexDirection } from 'yoga-layout/load';
import type { Yoga, YogaNode } from './yoga.js';

export type HostType = 'flowtty-box' | 'flowtty-text';

export interface BoxProps {
  width?: number;
  height?: number;
  flexDirection?: 'row' | 'column';
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
}

export function createInstance(type: HostType, props: BoxProps, Yoga: Yoga): Instance {
  if (type !== 'flowtty-box') throw new Error(`unknown host type: ${type}`);
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
  if (props.width !== undefined) n.setWidth(props.width);
  else n.setWidthAuto();
  if (props.height !== undefined) n.setHeight(props.height);
  else n.setHeightAuto();
  n.setFlexDirection(
    props.flexDirection === 'row' ? FlexDirection.Row : FlexDirection.Column,
  );
}

export function appendChild(parent: Instance, child: Instance | TextInstance): void {
  parent.children.push(child);
  if (child.type === 'box') parent.yogaNode.insertChild(child.yogaNode, parent.yogaNode.getChildCount());
}

export function removeChild(parent: Instance, child: Instance | TextInstance): void {
  const i = parent.children.indexOf(child);
  if (i >= 0) parent.children.splice(i, 1);
  if (child.type === 'box') {
    parent.yogaNode.removeChild(child.yogaNode);
    child.yogaNode.freeRecursive(); // free wasm node — required to avoid leaks
  }
}

export function insertBefore(
  parent: Instance,
  child: Instance | TextInstance,
  before: Instance | TextInstance,
): void {
  const i = parent.children.indexOf(before);
  parent.children.splice(i < 0 ? parent.children.length : i, 0, child);
  if (child.type === 'box') {
    const boxIndex = parent.children.filter((c) => c.type === 'box').indexOf(child);
    parent.yogaNode.insertChild(child.yogaNode, boxIndex);
  }
}
