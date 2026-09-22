import { Children, createElement, isValidElement, type ReactNode } from 'react';
import type { TextRun } from '@flowtty/core';
import { Span, type SpanProps } from './Span.js';
import type { Color } from '@flowtty/core';

export interface TextProps {
  children?: ReactNode;
  /** Text color. Unset, the text takes the nearest ancestor box's `color`;
   *  `'default'` is the terminal's own foreground. */
  color?: Color;
  /** Cell background behind this text. `'default'` paints the terminal's own
   *  background, masking whatever was under it. */
  backgroundColor?: Color;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
  /** OSC 8 hyperlink target. Rendered clickable by backends that support it. */
  link?: string;
  /** Default 'none' (no wrap). 'wrap' = word-wrap with char-wrap fallback. 'truncate' = single-cell ellipsis. */
  wrap?: 'wrap' | 'truncate' | 'none';
  /** `false` takes this text out of every drag-selection: it is painted, but
   *  never highlighted and never copied. For frame a component draws around
   *  content — a gutter, a bar — and for text that is not the point.
   *  See docs/input.md (selection). */
  selectable?: boolean;
}

// Fold children into runs — the strings as they are, each <Span> as a run with
// its style laid over its parent's. Returns null as soon as a child is anything
// else (another component, a nested <Text>): that cannot be inlined, and the
// caller falls back to ordinary children.
function toRuns(children: ReactNode, inherited: Omit<TextRun, 'text'>, out: TextRun[]): TextRun[] | null {
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string' || typeof child === 'number') {
      out.push({ ...inherited, text: String(child) });
    } else if (isValidElement<SpanProps>(child) && child.type === Span) {
      const { children: inner, ...own } = child.props;
      if (toRuns(inner, { ...inherited, ...own }, out) === null) return null;
    } else {
      return null;
    }
  }
  return out;
}

const hasSpan = (children: ReactNode): boolean =>
  Children.toArray(children).some((c) => isValidElement(c) && c.type === Span);

export function Text({ children, ...style }: TextProps): ReactNode {
  // Spans: the line is handed to the host as styled runs, to be measured and
  // wrapped as one paragraph. (Only when there IS a span — plain text stays on
  // the ordinary path, where React keeps the text nodes.)
  if (hasSpan(children)) {
    const runs = toRuns(children, {}, []);
    if (runs !== null) return createElement('flowtty-box', { ...style, runs });
  }

  // An empty string is a blank line, but React creates no host text node for
  // it, so the box would measure to zero rows and the line would vanish. Hold
  // one row open for it. `null` / `false` children (toArray drops them) stay
  // zero-height: "no content" is not the same as "an empty line".
  const parts = Children.toArray(children);
  const blankLine = parts.length > 0 && parts.every((c) => c === '');
  // Renders to a flowtty-box whose paint pass reads these style props off inst.props.
  const props: TextProps & { minHeight?: number } = blankLine ? { ...style, minHeight: 1 } : style;
  return createElement('flowtty-box', props, children);
}
