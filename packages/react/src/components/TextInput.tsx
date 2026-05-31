import React from "react";
import { useRef, useState, type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useInput } from '../hooks/useInput.js';
import { useFocus } from '../hooks/useFocus.js';
import { editorReducer as reduce, type EditorState } from '@flowtty/core';
import { type Rect } from '@flowtty/core/host';

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
  /** Override focus state. If unset (default), the component reads from the
   *  enclosing FocusGroup. If set, this overrides — useful for forcing focus
   *  outside the focus system. */
  isFocused?: boolean;
}

// When cursor is past the end of the value (nothing to inverse), render a
// SPACE — combined with inverse:true that's a solid filled cell on most
// terminals, more reliably visible than the █ block char.
const CURSOR_AT_END = ' ';

export function TextInput(props: TextInputProps): ReactNode {
  const { value, onChange, onSubmit, onCancel, validate, mask, isFocused: explicitFocus } = props;
  const { isFocused: ctxFocused } = useFocus();
  const isFocused = explicitFocus !== undefined ? explicitFocus : ctxFocused;
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

  // Always render exactly `width` cells (or the natural value+cursor when width
  // is unknown — one-frame placeholder until onLayout fires).
  // Scroll-offset rules:
  //   1. Keep cursor in viewport: clamp when cursor leaves [off, off+w).
  //   2. Slide LEFT when content shrinks: don't leave trailing empty space at
  //      the right while leading content is still scrolled off-screen. Gives
  //      q[qqqqqqqq#] → [qqqqqqqq#] → [qqqqqqq# ] as user deletes.
  const scrollOffsetRef = useRef(0);
  let off: number;
  let windowEnd: number;
  if (width === null) {
    off = 0;
    windowEnd = display.length;
  } else {
    const w = width;
    if (safeCursor < scrollOffsetRef.current) scrollOffsetRef.current = safeCursor;
    if (safeCursor >= scrollOffsetRef.current + w) scrollOffsetRef.current = safeCursor - w + 1;
    // Slide-left-on-shrink: scroll offset must not exceed what's needed to fit
    // content+cursor. Beyond that, leading content can come into view.
    const maxUseful = Math.max(0, display.length + 1 - w);
    if (scrollOffsetRef.current > maxUseful) scrollOffsetRef.current = maxUseful;
    off = scrollOffsetRef.current;
    windowEnd = off + w;
  }

  // Split the visible display around the cursor. The cursor consumes one cell:
  // either the char at safeCursor (rendered with inverse) or CURSOR_AT_END
  // (space + inverse = solid filled cell) when safeCursor is past end-of-value.
  const before = display.slice(off, safeCursor);
  const cursorChar = safeCursor < display.length ? display.charAt(safeCursor) : CURSOR_AT_END;
  // Pad "after" with trailing spaces to fill the viewport — these become visible
  // blank cells (with the lightgray bg) instead of leaving previous content behind.
  const afterRaw = display.slice(safeCursor + 1, windowEnd);
  const afterLen = Math.max(0, windowEnd - safeCursor - 1);
  const after = width === null ? afterRaw : afterRaw.padEnd(afterLen);

  const onLayout = (r: Rect) => {
    if (r.width !== width) setWidth(r.width);
  };

  // When NOT focused: render the display flat, no cursor cell. Tells the user
  // at a glance which field has focus (only the focused one shows the inverse cursor).
  if (!isFocused) {
    const flat = width === null ? display : display.padEnd(width);
    return (
      <Box
        flexDirection="row"
        backgroundColor="rgb(211,211,211)"
        onLayout={onLayout}
      >
        <Text>{flat}</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="row"
      // Subtle lightgray bg differentiates the input from the dialog content area.
      backgroundColor="rgb(211,211,211)"
      onLayout={onLayout}
    >
      {before ? <Text>{before}</Text> : null}
      <Text inverse>{cursorChar}</Text>
      {after ? <Text>{after}</Text> : null}
    </Box>
  );
}
