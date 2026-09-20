import React, { useRef, useState, type ReactNode } from 'react';
import { editorReducer as reduce, inputRows, caretPosition, type Key } from '@flowtty/core';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useInput } from '../hooks/useInput.js';
import { useFocus } from '../hooks/useFocus.js';

export interface TextAreaProps {
  /** Controlled value; line breaks are `\n`. */
  value: string;
  /** Called on every edit. */
  onChange: (value: string) => void;
  /** Enter. Shift+Enter, Alt+Enter and backslash-then-Enter insert a line break
   *  instead (the last is the one every terminal delivers). */
  onSubmit?: (value: string) => void;
  /** Escape. */
  onCancel?: () => void;
  /** Runs BEFORE the field's own handling; return true to consume the key. This
   *  is how a host owns Enter, Tab, Escape, history on up/down, etc. */
  onKey?: (key: Key) => boolean | void;
  /** Controlled caret (index into `value`). Omit to let the field keep it; then
   *  a value replaced from outside puts the caret at its end. */
  cursor?: number;
  onCursorChange?: (cursor: number) => void;
  /** Show at most this many rows, windowed around the caret. */
  maxRows?: number;
  /** Gutter before the first row of the value (a prompt), and before every
   *  other row. The text wraps in the width that is left. */
  prefix?: ReactNode;
  continuationPrefix?: ReactNode;
  /** Untyped completion drawn dim right after the value while the caret is at
   *  its end, with the caret sitting on the ghost's first character. Not part
   *  of the value. Clipped to the row, never wrapped. */
  ghost?: string;
  /** Rendered after the text (and ghost) while the caret is at the end. */
  suffix?: ReactNode;
  /** Shown dim while the value is empty. */
  placeholder?: string;
  /** Override focus state; defaults to the enclosing FocusGroup's. */
  isFocused?: boolean;
  /** Field background. Default: the same light gray as `<TextInput>`, with the
   *  text drawn dark on it. Pass your own (or `'default'` for none) and the text
   *  keeps the terminal's colors, with `dim` for the placeholder and ghost. */
  backgroundColor?: string;
}

const CURSOR_AT_END = ' ';
const FIELD_BG = 'rgb(211,211,211)';
// On the default light field the terminal's own foreground (white in a dark
// theme) and `dim` on top of it are close to invisible — draw the text dark and
// the placeholder/ghost in a mid gray instead.
const FIELD_FG = 'black';
const FIELD_FADED = 'rgb(105,105,105)';

/**
 * A multi-line text field: soft wrap, a caret that moves across visual rows,
 * Home/End, word motion and kill bindings per line, pastes inserted with their
 * line breaks. Its height is its row count (capped by `maxRows`), so the layout
 * around it needs no bookkeeping.
 */
export function TextArea(props: TextAreaProps): ReactNode {
  const {
    value, onChange, onSubmit, onCancel, onKey, onCursorChange, maxRows,
    prefix, continuationPrefix, ghost, suffix, placeholder, backgroundColor = FIELD_BG,
  } = props;
  const { isFocused: ctxFocused } = useFocus();
  const isFocused = props.isFocused !== undefined ? props.isFocused : ctxFocused;

  const [ownCursor, setOwnCursor] = useState(value.length);
  // The last value this field itself produced. A different incoming value was
  // set from outside (history, completion) — the caret belongs at its end.
  const emittedRef = useRef(value);
  let cursor = props.cursor ?? ownCursor;
  if (props.cursor === undefined && value !== emittedRef.current) {
    emittedRef.current = value;
    cursor = value.length;
    if (ownCursor !== cursor) setOwnCursor(cursor);
  }
  cursor = Math.max(0, Math.min(value.length, cursor));

  // Width of the text column, measured; null for the one frame before layout.
  const [width, setWidth] = useState<number | null>(null);
  const wrapWidth = width ?? Number.MAX_SAFE_INTEGER;

  useInput((key) => {
    if (onKey?.(key) === true) return;
    const action = reduce({ value, cursor }, key, { multiline: true, width: wrapWidth });
    if (action.kind === 'edit') {
      if (action.state.value !== value) {
        emittedRef.current = action.state.value;
        onChange(action.state.value);
      }
      if (action.state.cursor !== cursor) {
        if (props.cursor === undefined) setOwnCursor(action.state.cursor);
        onCursorChange?.(action.state.cursor);
      }
    } else if (action.kind === 'submit') onSubmit?.(value);
    else if (action.kind === 'cancel') onCancel?.();
  }, { isActive: isFocused });

  const rows = inputRows(value, wrapWidth, isFocused ? cursor : undefined);
  const caret = caretPosition(value, cursor, wrapWidth);

  // Keep the caret's row inside a stable window: it only slides when the caret
  // would leave it, and never leaves blank rows below while rows hide above.
  const firstRowRef = useRef(0);
  const visible = Math.min(rows.length, maxRows ?? rows.length);
  if (caret.row < firstRowRef.current) firstRowRef.current = caret.row;
  if (caret.row >= firstRowRef.current + visible) firstRowRef.current = caret.row - visible + 1;
  firstRowRef.current = Math.max(0, Math.min(rows.length - visible, firstRowRef.current));
  const first = firstRowRef.current;

  const atEnd = cursor === value.length;
  // Dim text after the caret: the placeholder for an empty value, else the ghost.
  const trailing = !isFocused ? (value === '' ? placeholder ?? '' : '')
    : value === '' && placeholder ? placeholder
    : atEnd ? ghost ?? '' : '';
  const hasGutter = prefix !== undefined || continuationPrefix !== undefined;
  const onDefaultField = backgroundColor === FIELD_BG;
  const textColor = onDefaultField ? FIELD_FG : undefined;
  const faded = onDefaultField ? { color: FIELD_FADED } : { dim: true };

  return (
    <Box flexDirection="row" backgroundColor={backgroundColor}>
      {hasGutter ? (
        <Box flexDirection="column" flexShrink={0}>
          {rows.slice(first, first + visible).map((_, i) => (
            <Box key={i} flexDirection="row">{gutter(first + i === 0 ? prefix : continuationPrefix, textColor)}</Box>
          ))}
        </Box>
      ) : null}
      <Box
        flexDirection="column" flexGrow={1} flexShrink={1}
        onLayout={(r) => { if (r.width !== width) setWidth(r.width); }}
      >
        {rows.slice(first, first + visible).map((row, i) => {
          const r = first + i;
          const isCaretRow = isFocused && r === caret.row;
          const isLastRow = r === rows.length - 1;
          const tail = isLastRow ? [...trailing].slice(0, Math.max(0, wrapWidth - row.text.length)).join('') : '';
          if (!isCaretRow) {
            return (
              <Box key={r} flexDirection="row">
                <Text color={textColor}>{row.text}</Text>
                {tail ? <Text {...faded}>{tail}</Text> : null}
              </Box>
            );
          }
          const before = row.text.slice(0, caret.col);
          const onText = caret.col < row.text.length;
          const caretChar = onText ? row.text.charAt(caret.col) : tail.charAt(0) || CURSOR_AT_END;
          const after = onText ? row.text.slice(caret.col + 1) : '';
          const dimAfter = onText ? tail : tail.slice(1);
          return (
            <Box key={r} flexDirection="row">
              {before ? <Text color={textColor}>{before}</Text> : null}
              <Text inverse color={textColor}>{caretChar}</Text>
              {after ? <Text color={textColor}>{after}</Text> : null}
              {dimAfter ? <Text {...faded}>{dimAfter}</Text> : null}
              {isLastRow && atEnd ? suffix : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function gutter(node: ReactNode, color?: string): ReactNode {
  if (node === undefined || node === null) return <Text>{''}</Text>;
  return typeof node === 'string' ? <Text color={color}>{node}</Text> : node;
}
