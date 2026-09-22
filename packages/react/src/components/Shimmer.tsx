import React from 'react';
import type { ReactNode } from 'react';
import { Text } from './base/Text.js';
import { Span } from './base/Span.js';
import { useTicker } from '../hooks/useTicker.js';
import type { Color } from '@flowtty/core';

export interface ShimmerProps {
  /**
   * The text the band travels along. A raw string only — the band colours the
   * text character by character, so it needs the characters, not elements.
   */
  children: string;
  /** The text's own colour. Unset, it is inherited (the nearest box's `color`,
   *  else the terminal's foreground). */
  color?: Color;
  /**
   * The band. One colour: every cell under the band takes it. Several: a
   * gradient across the band, the first colour at its leading edge. Default
   * `'white'`; pass the app's own accent colours, `'white'` is only a guess.
   */
  highlight?: Color | readonly Color[];
  /** Band width in cells. Default 3; anything below 1 is 1. */
  width?: number;
  /** Milliseconds per one-cell step. Default 80. */
  interval?: number;
  /** Which way the band travels. Default 'ltr'. */
  direction?: 'ltr' | 'rtl';
  /**
   * Whether the band is moving. While false there is no ticker and the text is
   * a still frame in its base colour (one `<Text>`, no spans). Flipping back to
   * true resumes. Default true.
   */
  running?: boolean;
  /**
   * The character limit: at most this many characters (code points, counted
   * from the start) are ever under the band. Characters past it stay in the
   * base colour and the band never travels over them, so the number of runs a
   * frame produces is bounded whatever the length of the text. Default 64.
   */
  limit?: number;
}

const DEFAULT_HIGHLIGHT: Color = 'white';
const DEFAULT_WIDTH = 3;
const DEFAULT_INTERVAL = 80;
const DEFAULT_LIMIT = 64;

interface Run {
  text: string;
  /** Undefined = the base colour (a plain string run, not a span). */
  color: Color | undefined;
}

// One run per stretch of characters that share a colour. A frame is the text
// before the band, the band's own cells (one run per gradient colour) and the
// text after it — a handful of runs, never one per character.
function coalesce(chars: readonly string[], colorAt: (i: number) => Color | undefined): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const color = colorAt(i);
    const last = runs[runs.length - 1];
    if (last !== undefined && last.color === color) last.text += ch;
    else runs.push({ text: ch, color });
  }
  return runs;
}

/**
 * A running label that does not blink: a bright band travels along the text
 * while something is in flight. Mount it with `running` while the work runs;
 * with `running={false}` it is a still frame in the base colour, at no cost.
 *
 * The band enters from before the first character, crosses the animated part
 * of the text and leaves past its end before it comes round again; `direction`
 * mirrors the travel. Characters are code points, one cell each — the grid's
 * own rule. The animation rides on useTicker, so it stops on unmount and on
 * whole-app teardown. See docs/components.md (Shimmer).
 */
export function Shimmer({
  children,
  color,
  highlight = DEFAULT_HIGHLIGHT,
  width = DEFAULT_WIDTH,
  interval = DEFAULT_INTERVAL,
  direction = 'ltr',
  running = true,
  limit = DEFAULT_LIMIT,
}: ShimmerProps): ReactNode {
  const chars = [...children];
  const bandWidth = Math.max(1, Math.floor(width));
  const animated = Math.min(chars.length, Math.max(0, Math.floor(limit)));
  const active = running && animated > 0;
  // One state change per step: the ticker is the only thing that re-renders
  // this component on its own, and it is paused whenever there is nothing to move.
  const tick = useTicker({ interval, active });

  if (!active) return <Text color={color}>{children}</Text>;

  const colors: readonly Color[] = typeof highlight === 'string' ? [highlight] : highlight;
  if (colors.length === 0) return <Text color={color}>{children}</Text>;

  // The band's cells are [lead - bandWidth + 1, lead] going right, mirrored
  // going left. Its leading edge walks from the first animated character to
  // one band past the last, so the band enters and leaves fully; the period
  // is that walk, then it wraps.
  const phase = tick % (animated + bandWidth);
  const lead = direction === 'ltr' ? phase : animated - 1 - phase;
  const colorAt = (i: number): Color | undefined => {
    if (i >= animated) return undefined;
    const depth = direction === 'ltr' ? lead - i : i - lead; // distance into the band from its leading edge
    if (depth < 0 || depth >= bandWidth) return undefined;
    return colors[Math.floor((depth * colors.length) / bandWidth)];
  };
  const runs = coalesce(chars, colorAt);

  return (
    <Text color={color}>
      {runs.map((run, i) => (run.color === undefined
        ? run.text
        : <Span key={i} color={run.color}>{run.text}</Span>))}
    </Text>
  );
}
