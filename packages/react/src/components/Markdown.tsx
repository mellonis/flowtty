import React, { useMemo, useState } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { layoutMarkdown, type StyledLine } from './markdown/layout.js';

export interface MarkdownProps {
  /** Markdown source. */
  children?: string;
  /**
   * Content width in cells. When omitted, the component measures its own width
   * (via onLayout) and re-lays out — handy inside a flex layout, but it costs an
   * extra paint on first mount and on every resize.
   */
  width?: number;
}

function MdLine({ line }: { line: StyledLine }) {
  if (line.spans.length === 0) return <Box>{' '}</Box>;
  return (
    <Box flexDirection="row">
      {line.spans.map((s, i) => (
        <Text key={i} color={s.color} bold={s.bold} dim={s.dim} underline={s.underline}>
          {s.text}
        </Text>
      ))}
    </Box>
  );
}

/**
 * Render a markdown string as styled terminal text. Best-effort, line-based —
 * supports headings, paragraphs, bold/emphasis/code/links, blockquotes,
 * bullet/ordered lists, fenced code blocks (per-language token colors), and rules.
 * Content is pre-wrapped to the resolved width so the output is a stable column
 * of rows (a paginating host can slice it — see {@link layoutMarkdown}).
 */
export function Markdown({ children = '', width }: MarkdownProps) {
  const [measured, setMeasured] = useState<number | null>(null);
  const w = width ?? measured;
  const lines = useMemo(() => (w != null ? layoutMarkdown(children, w) : []), [children, w]);

  return (
    <Box
      flexDirection="column"
      width="100%"
      onLayout={width == null ? (r) => { if (measured !== r.width) setMeasured(r.width); } : undefined}
    >
      {w == null
        ? <Box>{'…'}</Box>
        : lines.map((ln, i) => <MdLine key={i} line={ln} />)}
    </Box>
  );
}
