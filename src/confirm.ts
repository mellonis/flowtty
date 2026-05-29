import { createElement, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';

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
    if (key.name === 'return' || key.name === 'enter') { onSubmit(defaultValue === 'yes'); return; }
    if ((key.name === 'y' || key.name === 'Y') && !key.ctrl && !key.meta) { onSubmit(true); return; }
    if ((key.name === 'n' || key.name === 'N') && !key.ctrl && !key.meta) { onSubmit(false); return; }
  }, { isActive: isFocused });

  return createElement(Box, null, createElement(Text, null, `${message} ${hint}`));
}
