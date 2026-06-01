import React from "react";
import { type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useInput } from '../hooks/useInput.js';

export interface ConfirmProps {
  message: string;
  /** Default action when user presses Enter. Default 'yes'. */
  defaultValue?: 'yes' | 'no';
  /** Called with true (yes), false (no). */
  onSubmit: (yes: boolean) => void;
  onCancel?: () => void;
  isFocused?: boolean;
}

export function Confirm(props: ConfirmProps): ReactNode {
  const { message, defaultValue = 'yes', onSubmit, onCancel, isFocused = true } = props;
  const hint = defaultValue === 'yes' ? '(Y/n)' : '(y/N)';

  useInput((key) => {
    if (key.name === 'escape') { onCancel?.(); return; }
    if (key.name === 'return') { onSubmit(defaultValue === 'yes'); return; }
    if ((key.name === 'y' || key.name === 'Y') && !key.ctrl && !key.meta) { onSubmit(true); return; }
    if ((key.name === 'n' || key.name === 'N') && !key.ctrl && !key.meta) { onSubmit(false); return; }
  }, { isActive: isFocused });

  return (
    <Box>
      <Text>{`${message} ${hint}`}</Text>
    </Box>
  );
}
