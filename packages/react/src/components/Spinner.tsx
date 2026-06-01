import React from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useTicker } from '../hooks/useTicker.js';

// Inlined frame sets (a curated subset of the cli-spinners catalogue) so the
// package stays dependency-free. Each carries its own natural cadence; frames
// within a set are equal display width so the spinner never jitters the layout.
const SPINNERS = {
  dots: { interval: 80, frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] },
  line: { interval: 130, frames: ['-', '\\', '|', '/'] },
  simpleDots: { interval: 400, frames: ['.  ', '.. ', '...', '   '] },
  arc: { interval: 100, frames: ['◜', '◠', '◝', '◞', '◡', '◟'] },
  circle: { interval: 120, frames: ['◐', '◓', '◑', '◒'] },
} as const;

export type SpinnerType = keyof typeof SPINNERS;

export interface SpinnerProps {
  /** Named frame set. Default 'dots'. Ignored when `frames` is provided. */
  type?: SpinnerType;
  /** Custom frame list — overrides `type`. Keep frames equal-width to avoid jitter. */
  frames?: string[];
  /** Override the cadence (ms per frame). Defaults to the chosen set's natural interval. */
  interval?: number;
  /** Optional text shown one space after the spinner glyph. */
  label?: string;
  /** Color applied to the spinner glyph (named / #rrggbb / rgb(...)). */
  color?: string;
}

/**
 * An animated spinner. Mount it while work is in flight; unmount it when done.
 * The animation stops automatically on unmount and on whole-app teardown (it
 * rides on useTicker, which honors the root abort signal).
 */
export function Spinner({ type = 'dots', frames, interval, label, color }: SpinnerProps) {
  const def = SPINNERS[type] ?? SPINNERS.dots;
  const seq = frames && frames.length > 0 ? frames : def.frames;
  const tick = useTicker({ interval: interval ?? def.interval });
  const frame = seq[tick % seq.length] ?? '';

  if (!label) return <Text color={color}>{frame}</Text>;
  return (
    <Box flexDirection="row">
      <Text color={color}>{frame}</Text>
      <Text>{` ${label}`}</Text>
    </Box>
  );
}
