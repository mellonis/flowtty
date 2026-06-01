import React from 'react';
import { useState } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';

export interface ProgressBarProps {
  /** Current progress. Treated as a 0..1 fraction unless `total` is given. */
  value: number;
  /** When set, the fraction is `value / total` (clamped to 0..1). */
  total?: number;
  /** Fixed bar width in cells. Omit to fill the row (measured via onLayout). */
  width?: number;
  /** Glyph for filled cells. Default '█'. */
  char?: string;
  /** Glyph for empty cells. Default '░'. */
  emptyChar?: string;
  /** Color of the filled portion (named / #rrggbb / rgb(...)). */
  color?: string;
  /** Append a ` NN%` readout after the bar. Default false. */
  showPercent?: boolean;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * A determinate progress bar. Progress is driven by props — re-render with a new
 * `value` to advance it (it does not animate on its own). With no `width` it
 * fills the available row; the percent readout, when shown, takes its own space
 * so the bar measures the remainder.
 */
export function ProgressBar({
  value, total, width, char = '█', emptyChar = '░', color, showPercent = false,
}: ProgressBarProps) {
  const fraction = clamp01(total !== undefined ? (total <= 0 ? 0 : value / total) : value);
  const [measured, setMeasured] = useState(0);
  const fixed = typeof width === 'number';
  const barW = Math.max(0, fixed ? width : measured);

  const filled = Math.round(fraction * barW);
  const empty = barW - filled;
  const inner = (
    <>
      <Text color={color}>{char.repeat(filled)}</Text>
      <Text dim>{emptyChar.repeat(empty)}</Text>
    </>
  );
  const percent = showPercent
    ? <Text>{` ${Math.round(fraction * 100)}%`}</Text>
    : null;

  if (fixed) {
    return (
      <Box flexDirection="row">
        <Box flexDirection="row" width={barW}>{inner}</Box>
        {percent}
      </Box>
    );
  }
  return (
    <Box flexDirection="row">
      <Box
        flexDirection="row"
        flexGrow={1}
        overflow="hidden"
        onLayout={(r) => { if (r.width !== measured) setMeasured(r.width); }}
      >
        {inner}
      </Box>
      {percent}
    </Box>
  );
}
