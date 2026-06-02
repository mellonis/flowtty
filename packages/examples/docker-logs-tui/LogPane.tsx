/** @jsxImportSource react */
import React from 'react';
import { useState } from 'react';
import { Box, Text } from '@flowtty/react';
import type { LogLine, Level } from './types.js';

const LEVEL_COLOR: Record<Level, string | undefined> = {
  error: 'red',
  warn: 'yellow',
  info: undefined,
  debug: undefined, // rendered dim instead of colored
};

interface LogPaneProps {
  lines: LogLine[]; // already filtered by the caller
  follow: boolean;
  topIndex: number; // window start when paused (!follow)
  wrap: boolean;
}

export function LogPane({ lines, follow, topIndex, wrap }: LogPaneProps) {
  const [height, setHeight] = useState(0);
  const h = height > 0 ? height : 1; // pre-layout fallback (one-frame)

  // Follow: render the last ~h entries and pin them to the bottom — any overflow
  // (wrapped entries spanning >1 row) clips off the TOP, which is exactly tail
  // behavior. Paused: a plain top-anchored window from topIndex.
  const visible = follow
    ? lines.slice(Math.max(0, lines.length - h))
    : lines.slice(topIndex, topIndex + h);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      overflow="hidden"
      justifyContent={follow ? 'flex-end' : 'flex-start'}
      onLayout={(r) => { if (r.height !== height) setHeight(r.height); }}
    >
      {visible.map((ln, i) => (
        <Box key={i} flexDirection="row">
          <Text
            color={LEVEL_COLOR[ln.level]}
            dim={ln.level === 'debug'}
            wrap={wrap ? 'wrap' : 'truncate'}
          >
            {ln.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
