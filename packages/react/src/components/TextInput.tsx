import React from "react";
import { useRef, useState, type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useInput } from '../hooks/useInput.js';
import { useFocus } from '../hooks/useFocus.js';
import { useClick } from '../hooks/useClick.js';
import { DEFAULT_BORDER_STYLE, clusterWidth, editorReducer as reduce, graphemes, stringWidth, type BoxProps, type EditorState } from '@flowtty/core';
import { type Rect } from '@flowtty/core/host';

export interface TextInputProps {
  /** Controlled value. Omit it (and optionally pass `defaultValue`) for an
   *  uncontrolled field that keeps its own value — handy for a one-shot prompt. */
  value?: string;
  /** Initial value of an uncontrolled field. Ignored when `value` is set. */
  defaultValue?: string;
  /** Called whenever the value changes (per edit). */
  onChange?: (value: string) => void;
  /** Called on Enter/Return — only if validate (if provided) returns null/undefined. */
  onSubmit?: (value: string) => void;
  /** Called on Escape. */
  onCancel?: () => void;
  /** Sync validator. Return null/undefined = valid; return string = error message (blocks onSubmit). */
  validate?: (value: string) => string | null | undefined;
  /** Render the `validate` message under the field after a rejected submit;
   *  the next edit clears it. Default true — set false to show the error yourself. */
  showError?: boolean;
  /** The field's look: the filled band (`field`, default), bare text sized to
   *  its content with no background (`none`, for a filter bar), or the band
   *  inside a bordered box (`border`). The same three `Select` has, so a form's
   *  fields match. See docs/components.md (TextInput). */
  frame?: 'field' | 'none' | 'border';
  /** The field's width, or its share of a row. Without any of these the field
   *  is as wide as its column (stretched) or, in a row, as wide as its text —
   *  and then it grows as the text does instead of scrolling. */
  width?: BoxProps['width'];
  flexGrow?: number;
  flexShrink?: number;
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
const FIELD_BG = 'rgb(211,211,211)';
// The terminal's own foreground is white in a dark theme — unreadable on the
// light field — so the text is drawn dark. Same pairing as <TextArea>.
const FIELD_FG = 'black';

export function TextInput(props: TextInputProps): ReactNode {
  const { onChange, onSubmit, onCancel, validate, mask, isFocused: explicitFocus, showError = true, frame = 'field', width: widthProp, flexGrow, flexShrink } = props;
  const [ownValue, setOwnValue] = useState(props.defaultValue ?? '');
  const value = props.value ?? ownValue;
  const [error, setError] = useState<string | null>(null);
  const { isFocused: ctxFocused, focus } = useFocus();
  const isFocused = explicitFocus !== undefined ? explicitFocus : ctxFocused;
  const rectRef = useRef<Rect | null>(null);
  useClick(rectRef, focus); // a click on the field focuses it
  const [cursor, setCursor] = useState(value.length);
  const safeCursor = Math.max(0, Math.min(value.length, cursor));
  // Allocated cell width of the input's viewport — captured via onLayout. null
  // until the first paint completes (one-frame placeholder).
  // The width the layout gave the band, and whether that is just the width of
  // its own text: a box sized to its content (in a row, with no width of its
  // own) must not window the text to its previous size — it grows instead.
  const [layout, setLayout] = useState<{ width: number; contentSized: boolean } | null>(null);
  const renderedRef = useRef(0);
  const width = layout === null || layout.contentSized ? null : layout.width;

  useInput((key) => {
    const action = reduce({ value, cursor: safeCursor } as EditorState, key);
    if (action.kind === 'edit') {
      if (action.state.value !== value) {
        if (props.value === undefined) setOwnValue(action.state.value);
        if (error !== null) setError(null);
        onChange?.(action.state.value);
      }
      if (action.state.cursor !== safeCursor) setCursor(action.state.cursor);
    } else if (action.kind === 'submit') {
      // Enter with nothing to submit to is not the field's: it falls through
      // to whatever binds it (a form, a dialog's default button).
      if (!onSubmit && !validate) return;
      const err = validate ? validate(value) : null;
      if (!err) onSubmit?.(value);
      setError(err ?? null);
    } else if (action.kind === 'cancel') {
      if (!onCancel) return;
      onCancel();
    } else {
      return;
    }
    // The key did something here: nobody behind the field sees it.
    return true;
  }, { isActive: isFocused });

  // Everything below works in display COLUMNS, the grid's unit: an emoji is two
  // UTF-16 units, one cluster and two columns, so neither slicing the string by
  // `cursor` nor counting characters would place the caret. `cursor` itself
  // stays a UTF-16 index (see EditorState).
  const clusters = graphemes(mask ? '•'.repeat(graphemes(value).length) : value);
  const widths = clusters.map(clusterWidth);
  // cols[i] is the column cluster i starts at; cols[clusters.length] the total width.
  const cols: number[] = [0];
  for (const w of widths) cols.push(cols[cols.length - 1]! + w);
  const total = cols[clusters.length]!;
  const caretIdx = graphemes(value.slice(0, safeCursor)).length;
  const caretCol = cols[caretIdx]!;
  const caretWidth = caretIdx < clusters.length ? widths[caretIdx]! : 1;

  // Always render exactly `width` cells (or the natural value+cursor when width
  // is unknown — one-frame placeholder until onLayout fires).
  // Scroll-offset rules:
  //   1. Keep the caret cell in the viewport: clamp when it leaves [off, off+w).
  //   2. Slide LEFT when content shrinks: don't leave trailing empty space at
  //      the right while leading content is still scrolled off-screen. Gives
  //      q[qqqqqqqq#] → [qqqqqqqq#] → [qqqqqqq# ] as user deletes.
  const scrollOffsetRef = useRef(0);
  let off: number;
  let windowEnd: number;
  if (width === null) {
    off = 0;
    windowEnd = total + caretWidth;
  } else {
    const w = width;
    if (caretCol < scrollOffsetRef.current) scrollOffsetRef.current = caretCol;
    if (caretCol + caretWidth > scrollOffsetRef.current + w) scrollOffsetRef.current = caretCol + caretWidth - w;
    // Slide-left-on-shrink: scroll offset must not exceed what's needed to fit
    // content+cursor. Beyond that, leading content can come into view.
    const maxUseful = Math.max(0, total + 1 - w);
    if (scrollOffsetRef.current > maxUseful) scrollOffsetRef.current = maxUseful;
    off = scrollOffsetRef.current;
    windowEnd = off + w;
  }

  // The text in columns [from, to): clusters fully inside, and a blank for
  // each column of a cluster the edge cuts — never half a glyph.
  const columnsOf = (from: number, to: number): string => {
    let out = '';
    for (let i = 0; i < clusters.length; i++) {
      const a = cols[i]!;
      const b = cols[i + 1]!;
      if (b <= from || a >= to) continue;
      out += a >= from && b <= to ? clusters[i]! : ' '.repeat(Math.min(b, to) - Math.max(a, from));
    }
    return out;
  };

  // Split the visible display around the cursor. The cursor consumes one cell
  // (two for a wide cluster): either the cluster at the caret (rendered with
  // inverse) or CURSOR_AT_END (space + inverse = solid filled cell) when the
  // caret is past end-of-value.
  const before = columnsOf(off, caretCol);
  const cursorChar = caretIdx < clusters.length ? clusters[caretIdx]! : CURSOR_AT_END;
  // Pad "after" with trailing spaces to fill the viewport — these become visible
  // blank cells (with the lightgray bg) instead of leaving previous content behind.
  const afterText = columnsOf(caretCol + caretWidth, windowEnd);
  const afterLen = Math.max(0, windowEnd - caretCol - caretWidth);
  const after = afterText + (width === null ? '' : ' '.repeat(Math.max(0, afterLen - stringWidth(afterText))));
  const display = clusters.join('');
 

  const onLayout = (r: Rect) => {
    rectRef.current = r;
    const contentSized = r.width === renderedRef.current;
    if (layout === null || layout.width !== r.width || layout.contentSized !== contentSized) {
      setLayout({ width: r.width, contentSized });
    }
  };
  // What this render draws, padding aside: the text and, focused, the caret cell.
  renderedRef.current = total + (isFocused ? 1 : 0);

  // When NOT focused: render the display flat, no cursor cell. Tells the user
  // at a glance which field has focus (only the focused one shows the inverse cursor).
  const errorLine = showError && error !== null ? <Text color="red">{error}</Text> : null;

  // The band: light-gray bg differentiates the input from the dialog content
  // area. `none` drops it and takes only the room its text needs; `border`
  // keeps it inside a box. The text color goes with the band.
  const band = frame !== 'none';
  const fg = band ? FIELD_FG : undefined;
  const bg = band ? FIELD_BG : undefined;
  let row: ReactNode;
  if (!isFocused) {
    const flat = width === null || !band ? display : display + ' '.repeat(Math.max(0, width - total));
    row = (
      <Box flexDirection="row" backgroundColor={bg} onLayout={onLayout}>
        <Text color={fg}>{flat}</Text>
      </Box>
    );
  } else {
    row = (
      <Box flexDirection="row" backgroundColor={bg} onLayout={onLayout}>
        {before ? <Text color={fg}>{before}</Text> : null}
        <Text inverse color={fg}>{cursorChar}</Text>
        {after ? <Text color={fg}>{after}</Text> : null}
      </Box>
    );
  }
  const outer = { width: widthProp, flexGrow, flexShrink };
  if (frame === 'none') {
    // In a row of its own, so the field sizes to its text instead of
    // stretching across a column.
    return (
      <Box flexDirection="column" {...outer}>
        <Box flexDirection="row">{row}</Box>
        {errorLine}
      </Box>
    );
  }
  if (frame === 'border') {
    return (
      <Box flexDirection="column" {...outer}>
        <Box border={DEFAULT_BORDER_STYLE} flexDirection="column">{row}</Box>
        {errorLine}
      </Box>
    );
  }
  return (
    <Box flexDirection="column" {...outer}>
      {row}
      {errorLine}
    </Box>
  );
}
