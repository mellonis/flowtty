import React from "react";
import { type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { useInput } from '../hooks/useInput.js';
import { useFocus } from '../hooks/useFocus.js';

export interface ButtonProps {
  /** Button label. */
  label: string;
  /** Optional shortcut key (e.g., 'o', 'return'). When pressed anywhere in the
   *  surrounding input scope, the button fires (even if not focused). Rendered
   *  as a dim hint after the label. */
  shortcut?: string;
  /** Called when the button is activated — via Enter when focused, OR via the
   *  shortcut key (anywhere in input scope). */
  onPress: () => void;
}

export function Button({ label, shortcut, onPress }: ButtonProps): ReactNode {
  const { isFocused } = useFocus();

  useInput((key) => {
    if ((isFocused && key.name === 'return') || (shortcut !== undefined && key.name === shortcut)) {
      onPress();
      return true; // pressed: nobody behind the button sees the key
    }
  });

  // Visual: `[ label ]` plus dim `shortcut` after. Focused → inverse + bold.
  return (
    <Box flexDirection="row">
      <Box bold={isFocused} inverse={isFocused}>{`[ ${label} ]`}</Box>
      {shortcut ? <Box dim>{` (${shortcut})`}</Box> : null}
    </Box>
  );
}
