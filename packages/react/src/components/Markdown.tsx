import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import {
  layoutMarkdownDetailed,
  type MarkdownCodeBlock,
  type MarkdownOptions,
  type StyledLine,
} from './markdown/layout.js';

export interface MarkdownProps extends MarkdownOptions {
  /** Markdown source. */
  children?: string;
  /**
   * Content width in cells. When omitted, the component measures its own width
   * (via onLayout) and re-lays out — handy inside a flex layout, but it costs an
   * extra paint on first mount and on every resize.
   */
  width?: number;
  /**
   * Called with the document's fenced code blocks whenever that list changes —
   * the hook for a "copy this block" affordance, since each block carries its
   * raw source and the rows it occupies. Compared by content, so a repaint that
   * leaves the blocks alone doesn't call it again.
   */
  onCodeBlocks?: (blocks: MarkdownCodeBlock[]) => void;
}

function MdLine({ line }: { line: StyledLine }) {
  if (line.spans.length === 0) return <Box>{' '}</Box>;
  const chrome = line.chrome ?? 0;
  return (
    // `wrapContinues` says this row's text carries on below — and which cells
    // of it are that text — so a drag over the two rows copies the paragraph as
    // one line (docs/input.md — selection).
    <Box
      flexDirection="row" wrapContinues={line.continues}
      // A row that is frame from edge to edge goes out of the selection whole,
      // its blank cells included: it is not a line of the document, so a copy
      // skips it rather than returning an empty line. Paint is unaffected.
      selectable={line.frame === true ? false : undefined}
    >
      {line.spans.map((s, i) => (
        <Text
          key={i} color={s.color} backgroundColor={s.background}
          bold={s.bold} dim={s.dim} underline={s.underline} link={s.link}
          // The leading spans of a framed row are the frame — a code block's
          // gutter, a blockquote's bar, a fence label. Painted the same, never
          // copied. Nothing else about the row changes.
          selectable={i < chrome ? false : undefined}
        >
          {s.text}
        </Text>
      ))}
    </Box>
  );
}

/**
 * Render a markdown string as styled terminal text. Best-effort, line-based —
 * supports headings, paragraphs, bold/emphasis/code/links, blockquotes,
 * bullet/ordered/task lists (nested by indentation), GFM tables, fenced code
 * blocks (a dim label over a dim `│ ` gutter, with per-language token colors),
 * and rules.
 * Content is pre-wrapped to the resolved width so the output is a stable column
 * of rows (a paginating host can slice it — see {@link layoutMarkdown}).
 */
export function Markdown({
  children = '',
  width,
  codeFence,
  codeWrap,
  maxCodeRows,
  lineNumbers,
  onCodeBlocks,
}: MarkdownProps): ReactNode {
  const [measured, setMeasured] = useState<number | null>(null);
  const w = width ?? measured;
  const { lines, blocksKey, blocks } = useMemo(() => {
    if (w == null) return { lines: [] as StyledLine[], blocksKey: null, blocks: [] as MarkdownCodeBlock[] };
    const opts: MarkdownOptions = { codeFence, codeWrap, maxCodeRows, lineNumbers };
    const laid = layoutMarkdownDetailed(children, w, opts);
    return { lines: laid.lines, blocksKey: JSON.stringify(laid.codeBlocks), blocks: laid.codeBlocks };
  }, [children, w, codeFence, codeWrap, maxCodeRows, lineNumbers]);

  // Report the blocks from an effect, never during render, and key the effect on
  // the serialized list — a re-render that produces an equal list must not fire
  // it again (the `onLayout` feedback loop, one layer up).
  const latest = useRef({ blocks, onCodeBlocks });
  useEffect(() => { latest.current = { blocks, onCodeBlocks }; });
  useEffect(() => {
    if (blocksKey == null) return; // still measuring — don't report a phantom []
    latest.current.onCodeBlocks?.(latest.current.blocks);
  }, [blocksKey]);

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
