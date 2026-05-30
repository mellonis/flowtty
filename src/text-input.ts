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

// When cursor is past the end of the value (nothing to inverse), render a
// SPACE — combined with inverse:true that's a solid filled cell on most
// terminals, more reliably visible than the █ block char (which can render
// thin or unstyled on some terminal renderers).
const CURSOR_AT_END = ' ';

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

  // Compute the visible window [off, windowEnd).
  // - If the value + cursor fits in `width` (or width unknown): show the whole value
  //   inline; cursor is INSERTED at position (display grows by 1 char).
  // - Else: scroll viewport to keep cursor visible; cursor OVERLAYS the char it's on.
  const scrollOffsetRef = useRef(0);
  const fits = width === null || display.length + 1 <= width;

  let off: number;
  let windowEnd: number;
  if (fits) {
    off = 0;
    windowEnd = display.length;
    scrollOffsetRef.current = 0;
  } else {
    const w = width!;
    if (safeCursor < scrollOffsetRef.current) scrollOffsetRef.current = safeCursor;
    if (safeCursor >= scrollOffsetRef.current + w) scrollOffsetRef.current = safeCursor - w + 1;
    off = scrollOffsetRef.current;
    // In scroll mode the cursor REPLACES (overlays) the char it's on, so window
    // includes one char at the cursor's position. windowEnd = off + w.
    windowEnd = off + w;
  }

  // Split the visible display around the cursor. Unified model in both modes:
  // the char AT the cursor is rendered as the cursor (inverse video) — it's
  // consumed from the "after" slice. When cursor is past end of value, render
  // the block glyph instead (no char to invert).
  const before = display.slice(off, safeCursor);
  const cursorChar = safeCursor < display.length ? display.charAt(safeCursor) : CURSOR_AT_END;
  const after = display.slice(safeCursor + 1, windowEnd);

  // In inline mode at end-of-value, cursorChar is the block glyph (no char to invert).
  // We still render it as "inverse" — the block character on a swapped-bg cell looks
  // like the block. Either way the user sees a clear cursor marker.

  return createElement(Box, {
    flexDirection: 'row',
    onLayout: (r: Rect) => {
      if (r.width !== width) setWidth(r.width);
    },
  },
    before ? createElement(Text, null, before) : null,
    createElement(Text, { inverse: true }, cursorChar),
    after ? createElement(Text, null, after) : null,
  );
}
