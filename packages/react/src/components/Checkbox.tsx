import React from 'react';
import { useRef, type ReactNode } from 'react';
import type { Key } from '@flowtty/core';
import type { Rect } from '@flowtty/core/host';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useInput } from '../hooks/useInput.js';
import { useFocus } from '../hooks/useFocus.js';
import { useClick } from '../hooks/useClick.js';
import { checkboxMarker, type CheckboxFrame, type CheckboxState } from './checkboxMarker.js';

export type { CheckboxFrame, CheckboxState } from './checkboxMarker.js';

export interface CheckboxProps {
  /** On, off, or `'mixed'` — some of what it stands for (a "select all" over a
   *  list that is partly selected). Controlled. */
  checked: CheckboxState;
  /** Space, or a click on the checkbox, asks for the next state: the opposite
   *  of `checked`, and `true` from `'mixed'`. */
  onChange: (next: boolean) => void;
  /** Text after the marker. */
  label?: string;
  /** `brackets` (default) is `[ ]` / `[x]` / `[-]`; `none` is one glyph —
   *  `☐` / `☑` / `⊟`. See docs/components.md (Checkbox). */
  frame?: CheckboxFrame;
  /** Override focus state. If unset (default), the component reads from the
   *  enclosing FocusGroup. */
  isFocused?: boolean;
}

/**
 * A yes / no field: a marker and a label. Focusable (Tab reaches it); Space
 * toggles, as does a click on it whether or not it is focused. Enter is left
 * alone — in a form it is the submit. See docs/components.md (Checkbox).
 */
export function Checkbox({ checked, onChange, label, frame = 'brackets', isFocused: explicitFocus }: CheckboxProps): ReactNode {
  const { isFocused: ctxFocused, focus } = useFocus();
  const isFocused = explicitFocus !== undefined ? explicitFocus : ctxFocused;
  const rectRef = useRef<Rect | null>(null);
  const toggle = () => onChange(checked === 'mixed' ? true : !checked);

  useClick(rectRef, () => { focus(); toggle(); }); // a click toggles, and focuses
  useInput((key: Key) => {
    if (isFocused && key.name === ' ') {
      toggle();
      return true;
    }
  });

  // Focus has to be visible: a cyan, bold marker and a bold label. Unfocused,
  // a checked marker keeps its green and an unchecked one goes dim — so the
  // state reads at a glance either way.
  const marker = checkboxMarker(checked, frame);
  return (
    <Box flexDirection="row" onLayout={(r) => { rectRef.current = r; }}>
      <Text color={isFocused ? 'cyan' : marker.color} bold={isFocused} dim={!isFocused && marker.color === undefined}>{marker.text}</Text>
      {label !== undefined ? <Text bold={isFocused}>{` ${label}`}</Text> : null}
    </Box>
  );
}
