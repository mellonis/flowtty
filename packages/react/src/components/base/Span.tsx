import { createElement, type ReactNode } from 'react';
import type { Color } from '@flowtty/core';

export interface SpanProps {
  children?: ReactNode;
  color?: Color;
  backgroundColor?: Color;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
  /** OSC 8 hyperlink target. */
  link?: string;
}

/**
 * A styled piece of a line of text. Inside a `<Text>` it is not rendered as a
 * component at all: `<Text>` reads its props and folds it, with the text around
 * it, into ONE line that is measured and wrapped as a single paragraph —
 *
 *     <Text wrap="wrap">Press <Span bold color="cyan">q</Span> to quit</Text>
 *
 * — which separate `<Text>`s in a row cannot do, since each wraps on its own.
 * Spans nest; an inner one adds to the outer one's style.
 *
 * Rendered on its own, outside a `<Text>`, it is simply styled text.
 */
export function Span({ children, ...style }: SpanProps): ReactNode {
  return createElement('flowtty-box', style, children);
}
