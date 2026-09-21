import React, { useState } from 'react';
import { Box, Text, useFocus, useInput, type Color } from '@flowtty/react';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Color of the filled part. */
  color?: Color;
  /** Override focus; by default the enclosing <FocusGroup> decides. */
  isFocused?: boolean;
}

/** A number you nudge with ←/→, drawn as a bar that fills the width it is given. */
export function Stepper({ value, onChange, min = 0, max = 10, color = 'cyan', isFocused: forced }: StepperProps) {
  // 1. Focus: register with the FocusGroup; outside one, useFocus() says "focused".
  const { isFocused: groupFocus } = useFocus();
  const isFocused = forced ?? groupFocus;

  // 2. Input: only while focused. Handle the keys you own, ignore the rest.
  useInput((key) => {
    if (key.name === 'left') onChange(Math.max(min, value - 1));
    if (key.name === 'right') onChange(Math.min(max, value + 1));
  }, { isActive: isFocused });

  // 3. Size: onLayout reports the width the layout gave us. It fires on EVERY
  //    paint, so only set state when the number actually changed.
  const [width, setWidth] = useState(0);
  const filled = Math.round(((value - min) / (max - min)) * width);

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={isFocused ? color : undefined} bold={isFocused}>{isFocused ? '▸' : ' '}</Text>
      {/* A box stacks its children in a COLUMN unless told otherwise — and <Text> is a
          box, not an inline span — so two runs on one line need flexDirection="row". */}
      <Box flexDirection="row" flexGrow={1} flexShrink={1} onLayout={(r) => { if (r.width !== width) setWidth(r.width); }}>
        <Text color={color}>{'█'.repeat(filled)}</Text>
        <Text dim>{'░'.repeat(Math.max(0, width - filled))}</Text>
      </Box>
      <Text>{String(value).padStart(String(max).length)}</Text>
    </Box>
  );
}
