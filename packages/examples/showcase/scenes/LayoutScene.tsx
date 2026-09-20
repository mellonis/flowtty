import React, { useState } from 'react';
import { Box, Text, Link, useInput, NAMED_COLORS, type BoxProps } from '@flowtty/react';

const JUSTIFY: NonNullable<BoxProps['justifyContent']>[] = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'];
const BORDERS = ['single', 'round', 'double', 'bold', 'classic'] as const;

export function LayoutScene() {
  const [j, setJ] = useState(0);
  useInput((key) => {
    if (key.name === 'right') setJ((v) => (v + 1) % JUSTIFY.length);
    if (key.name === 'left') setJ((v) => (v - 1 + JUSTIFY.length) % JUSTIFY.length);
  });
  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} gap={1}>
      <Box flexDirection="row" gap={1}>
        {BORDERS.map((b) => (
          <Box key={b} border={b} borderTitle={` ${b} `} flexGrow={1} paddingX={1}><Text dim>border</Text></Box>
        ))}
      </Box>
      <Box flexDirection="column" border="round" borderTitle={` flexbox — justifyContent: ${JUSTIFY[j]} · ←/→ changes it `} paddingX={1}>
        <Box flexDirection="row" justifyContent={JUSTIFY[j]}>
          {['one', 'two', 'three', 'four'].map((t, i) => (
            <Box key={t} backgroundColor={['rgb(40,70,110)', 'rgb(40,110,80)', 'rgb(110,80,40)', 'rgb(110,40,90)'][i]} paddingX={2}><Text bold>{t}</Text></Box>
          ))}
        </Box>
      </Box>
      <Box flexDirection="row" gap={2}>
        {/* flexShrink: Yoga defaults it to 0 — without it this panel keeps its natural
            width and pushes the fixed-width one next to it out of the frame. */}
        <Box flexDirection="column" border="round" borderTitle=" text " paddingX={1} flexGrow={1} flexShrink={1}>
          {/* <Text> is a box, not an inline span: styled runs on one line go in a row. */}
          <Box flexDirection="row" gap={2}>
            <Text bold>bold</Text><Text dim>dim</Text><Text underline>underline</Text><Text inverse> inverse </Text><Text strikethrough>strike</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text>a</Text><Link href="https://www.npmjs.com/package/@flowtty/react" showUrlFallback={false}>clickable link</Link><Text dim>— an OSC 8 hyperlink</Text>
          </Box>
          <Text wrap="wrap" dim>Text wraps by word when asked to. A box with overflow="hidden" clips whatever its children draw past its edge.</Text>
        </Box>
        <Box flexDirection="column" border="round" borderTitle=" color " paddingX={1} width={44}>
          <Box flexDirection="row" flexWrap="wrap">
            {NAMED_COLORS.filter((c) => c !== 'grey').map((c) => <Box key={c} backgroundColor={c} width={5}><Text>{' '}</Text></Box>)}
          </Box>
          <Box flexDirection="row">
            {Array.from({ length: 40 }, (_, i) => (
              <Box key={i} backgroundColor={`rgb(${Math.round(255 - i * 6)},${Math.round(60 + i * 3)},${Math.round(i * 6)})`} width={1}><Text>{' '}</Text></Box>
            ))}
          </Box>
          <Text dim>18 named colors · 24-bit rgb() and #hex</Text>
        </Box>
      </Box>
    </Box>
  );
}
