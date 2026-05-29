import { createElement, useState, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';
import { reduce, type EditorState } from './editor.js';

export interface TextInputProps {
  /** Controlled value. Required (no defaultValue / uncontrolled mode in M1b). */
  value: string;
  /** Called whenever the value changes (per edit). */
  onChange: (value: string) => void;
  /** Called on Enter/Return — only if validate (if provided) returns null/undefined. */
  onSubmit?: (value: string) => void;
  /** Called on Escape. */
  onCancel?: () => void;
  /** Sync validator. Return null/undefined = valid; return string = error message (blocks onSubmit). */
  validate?: (value: string) => string | null | undefined;
  /** When true, render U+2022 (•) per character instead of the actual value. */
  mask?: boolean;
  /** When false, the input does not handle keys. Default true. */
  isFocused?: boolean;
}

const CURSOR = '▏'; // LEFT ONE EIGHTH BLOCK — a thin 1-cell vertical bar

export function TextInput(props: TextInputProps): ReactNode {
  const { value, onChange, onSubmit, onCancel, validate, mask, isFocused = true } = props;
  const [cursor, setCursor] = useState(value.length);
  const safeCursor = Math.max(0, Math.min(value.length, cursor));

  useInput((key) => {
    const action = reduce({ value, cursor: safeCursor } as EditorState, key);
    if (action.kind === 'edit') {
      if (action.state.value !== value) onChange(action.state.value);
      if (action.state.cursor !== safeCursor) setCursor(action.state.cursor);
    } else if (action.kind === 'submit') {
      const err = validate ? validate(value) : null;
      if (!err) onSubmit?.(value);
    } else if (action.kind === 'cancel') {
      onCancel?.();
    }
  }, { isActive: isFocused });

  const display = mask ? '•'.repeat(value.length) : value;
  const withCursor = display.slice(0, safeCursor) + CURSOR + display.slice(safeCursor);

  return createElement(Box, null, createElement(Text, null, withCursor));
}
