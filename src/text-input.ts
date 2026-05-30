import { createElement, useRef, useState, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';
import { reduce, type EditorState } from './editor.js';
import type { Rect } from './layout.js';

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

const CURSOR = '█'; // FULL BLOCK — solid cursor (no blink; terminal-native blink would need timer-driven re-render)

export function TextInput(props: TextInputProps): ReactNode {
  const { value, onChange, onSubmit, onCancel, validate, mask, isFocused = true } = props;
  const [cursor, setCursor] = useState(value.length);
  const safeCursor = Math.max(0, Math.min(value.length, cursor));
  // Allocated cell width of the input's viewport — captured via onLayout. null
  // until the first paint completes (one-frame placeholder).
  const [width, setWidth] = useState<number | null>(null);

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

  // Two-mode rendering:
  // - "inline" (default): cursor INSERTED at position; display grows by 1 char.
  //   Used when display + cursor fits the allocated width (or width unknown).
  // - "scroll": cursor OVERLAYS the char at its column inside a fixed-width
  //   viewport. The viewport scrolls to keep the cursor visible.
  //   Used when display would overflow the allocated width.
  const scrollOffsetRef = useRef(0);
  let renderText: string;
  if (width === null || display.length + 1 <= width) {
    // Fits inline — keep classic insert-cursor behavior.
    renderText = display.slice(0, safeCursor) + CURSOR + display.slice(safeCursor);
    // Reset scroll so re-entering scroll mode starts from a sensible place.
    scrollOffsetRef.current = 0;
  } else {
    const w = width;
    if (safeCursor < scrollOffsetRef.current) scrollOffsetRef.current = safeCursor;
    if (safeCursor >= scrollOffsetRef.current + w) scrollOffsetRef.current = safeCursor - w + 1;
    const off = scrollOffsetRef.current;
    const slice = display.slice(off, off + w);
    const padded = slice.padEnd(w);
    const cursorCol = safeCursor - off; // 0..w-1
    renderText = padded.slice(0, cursorCol) + CURSOR + padded.slice(cursorCol + 1);
  }

  return createElement(Box, {
    onLayout: (r: Rect) => {
      if (r.width !== width) setWidth(r.width);
    },
  }, createElement(Text, null, renderText));
}
