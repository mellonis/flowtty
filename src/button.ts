import { createElement, type ReactNode } from 'react';
import { Box } from './components.js';
import { useInput } from './use-input.js';
import { useFocus } from './use-focus.js';

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
    if (isFocused && key.name === 'return') {
      onPress();
    } else if (shortcut && key.name === shortcut) {
      onPress();
    }
  });

  // Visual: `[ label ]` plus dim `shortcut` after. Focused → inverse + bold.
  return createElement(Box, { flexDirection: 'row' },
    createElement(Box, { bold: isFocused, inverse: isFocused }, `[ ${label} ]`),
    shortcut
      ? createElement(Box, { dim: true }, ` (${shortcut})`)
      : null,
  );
}
