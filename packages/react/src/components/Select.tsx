import React from 'react';
import { useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_BORDER_STYLE, type BoxProps, type Key } from '@flowtty/core';
import { visibleIndices, type SelectItem } from '@flowtty/core';
import type { Rect } from '@flowtty/core/host';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useInput } from '../hooks/useInput.js';
import { useFocus } from '../hooks/useFocus.js';
import { useDialog, useDialogHost } from '../hooks/useDialog.js';
import { DialogHostPresentContext } from '../context/dialogContext.js';
import { checkboxMarker, type CheckboxFrame } from './checkboxMarker.js';

export type { SelectItem } from '@flowtty/core';

/** What the closed field looks like. See docs/components.md (Select). */
export type SelectFrame = 'field' | 'none' | 'border';

export interface SelectBaseProps<T> extends Pick<BoxProps, 'width' | 'minWidth' | 'maxWidth' | 'flexGrow' | 'flexShrink'> {
  items: SelectItem<T>[];
  /** Shown when nothing is chosen. Default `—`. */
  placeholder?: string;
  /** The field's chrome: the filled band `TextInput` draws (`field`), bare
   *  `value ▾` (`none`, for a filter bar), or a bordered box. Default 'field'. */
  frame?: SelectFrame;
  /** Typing in the open popup narrows the list. Default true. */
  filter?: boolean;
  /** Rows the popup shows at most before scrolling. Default 8. */
  maxRows?: number;
  /** Override focus state. If unset (default), the component reads from the
   *  enclosing FocusGroup. */
  isFocused?: boolean;
}

export interface SelectSingleProps<T> extends SelectBaseProps<T> {
  multiple?: false;
  /** The chosen value, or undefined for none (controlled). */
  value: T | undefined;
  /** A value was picked — the popup closes. */
  onChange: (value: T) => void;
}

export interface SelectMultipleProps<T> extends SelectBaseProps<T> {
  multiple: true;
  /** The chosen values (controlled), always in the order of `items`. */
  value: T[];
  /** A value was toggled. Enter closes the popup. */
  onChange: (value: T[]) => void;
  /** A "+ add new" row at the end of the popup; Enter on it calls this. Return
   *  the new item's value — directly or as a promise — and the component
   *  selects it once it appears in `items` (adding it there is the caller's
   *  job). Return `null` / nothing for a cancelled prompt. */
  onAddNew?: () => void | T | null | Promise<T | null | void>;
  /** How a popup row's checkbox is drawn: `brackets` (default) is `[x]` /
   *  `[ ]`, `none` is `☑` / `☐`. See docs/components.md (Checkbox). */
  checkboxFrame?: CheckboxFrame;
}

export type SelectProps<T> = SelectSingleProps<T> | SelectMultipleProps<T>;

// The same band the other fields draw (see TextInput / TextArea).
const FIELD_BG = 'rgb(211,211,211)';
const FIELD_FG = 'black';

// What the field shares with its popup while the popup is open. The popup is a
// dialog, and a dialog's element is a snapshot: props that change while it is
// open (`items` after an add, `value` after a toggle) reach it through here.
interface Shared<T> {
  items: SelectItem<T>[];
  value: T | undefined | T[];
}

interface Store<T> {
  get(): Shared<T>;
  set(next: Shared<T>): void;
  subscribe(listener: () => void): () => void;
}

function createStore<T>(initial: Shared<T>): Store<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      if (next.items === current.items && next.value === current.value) return;
      current = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

let warnedNoHost = false;

const inside = (r: Rect | null, x: number | undefined, y: number | undefined): boolean =>
  r !== null && x !== undefined && y !== undefined
  && x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;

/**
 * A dropdown: a one-line field showing the chosen value and `▾`, which opens a
 * popup — anchored under the field, or above it when there is no room — to
 * choose from. Single, or any number with `multiple`. The popup is a floating
 * dialog, so a `<DialogHost>` above the field is required; without one the
 * field warns once and cannot open. See docs/components.md (Select).
 */
export function Select<T>(props: SelectProps<T>): ReactNode {
  const {
    items, placeholder = '—', frame = 'field', filter = true, maxRows = 8, isFocused: explicitFocus,
    width, minWidth, maxWidth, flexGrow, flexShrink,
  } = props;
  const { isFocused: ctxFocused } = useFocus();
  const isFocused = explicitFocus !== undefined ? explicitFocus : ctxFocused;
  const host = useDialogHost();
  const hasHost = useContext(DialogHostPresentContext);
  const [open, setOpen] = useState(false);
  const rectRef = useRef<Rect | null>(null);
  const store = useRef<Store<T> | null>(null);
  if (store.current === null) store.current = createStore<T>({ items, value: props.value });
  store.current.set({ items, value: props.value });
  // The latest callbacks, for a popup opened with an earlier render's closure.
  const propsRef = useRef(props);
  propsRef.current = props;

  const openPopup = () => {
    if (open) return;
    if (!hasHost) {
      if (!warnedNoHost) {
        warnedNoHost = true;
        console.warn('flowtty: <Select> needs a <DialogHost> above it to open its popup; the field cannot open without one.');
      }
      return;
    }
    const rect = rectRef.current ?? { left: 0, top: 0, width: 1, height: 1 };
    const rows = Math.min(items.length + (props.multiple && props.onAddNew ? 1 : 0), maxRows);
    setOpen(true);
    void host.openDialog(
      <SelectPopup<T>
        store={store.current!}
        multiple={props.multiple === true}
        filter={filter}
        maxRows={maxRows}
        hasAddRow={props.multiple === true && props.onAddNew !== undefined}
        checkboxFrame={props.multiple === true ? props.checkboxFrame ?? 'brackets' : 'brackets'}
        onPick={(v) => (propsRef.current as SelectSingleProps<T>).onChange(v)}
        onToggle={(v) => (propsRef.current as SelectMultipleProps<T>).onChange(v)}
        onAddNew={() => (propsRef.current as SelectMultipleProps<T>).onAddNew?.()}
      />,
      { floating: true, anchor: rect, height: rows + 2, backdrop: false },
    ).then(() => setOpen(false));
  };

  useInput((key: Key) => {
    if (key.name === 'mousedown') {
      if (!inside(rectRef.current, key.x, key.y)) return;
      openPopup();
      return true;
    }
    if (!isFocused) return;
    if (key.name === 'return' || key.name === ' ' || key.name === 'down') {
      openPopup();
      return true;
    }
  }, { isActive: !open });

  // The text on the field. `multiple`: the labels, or a count when they would
  // not fit the band (only known with a numeric width).
  const labelOf = (v: T) => items.find((it) => it.value === v)?.label ?? String(v);
  let text: string;
  if (props.multiple) {
    const picked = props.value.map(labelOf);
    const joined = picked.join(', ');
    const inner = typeof width === 'number' ? width - 2 - (frame === 'border' ? 2 : 0) : Infinity;
    text = picked.length === 0 ? placeholder : joined.length > inner ? `${picked.length} selected` : joined;
  } else {
    text = props.value === undefined ? placeholder : labelOf(props.value);
  }

  const band = frame === 'field';
  const fg = band ? FIELD_FG : undefined;
  const row = (
    <Box
      flexDirection="row"
      {...(frame !== 'border' ? { width, minWidth, maxWidth, flexGrow, flexShrink } : { width: '100%' as const })}
      overflow="hidden"
      backgroundColor={band ? FIELD_BG : undefined}
      inverse={open}
      onLayout={frame === 'border' ? undefined : (r) => { rectRef.current = r; }}
    >
      <Text color={fg} bold={isFocused} wrap="truncate">{text}</Text>
      <Box flexGrow={1} flexShrink={1} />
      <Text color={isFocused ? 'cyan' : fg} bold={isFocused} dim={!isFocused && !band}>{open ? ' ▴' : ' ▾'}</Text>
    </Box>
  );
  // Bare text takes only the room it needs — a filter bar lines several up —
  // so it sits in a row of its own instead of stretching across a column; a
  // band stretches, as TextInput's does.
  if (frame === 'none' && width === undefined) return <Box flexDirection="row">{row}</Box>;
  if (frame !== 'border') return row;
  return (
    <Box
      border={DEFAULT_BORDER_STYLE}
      flexDirection="column"
      width={width} minWidth={minWidth} maxWidth={maxWidth} flexGrow={flexGrow} flexShrink={flexShrink}
      onLayout={(r) => { rectRef.current = r; }}
    >
      {row}
    </Box>
  );
}

interface PopupProps<T> {
  store: Store<T>;
  multiple: boolean;
  filter: boolean;
  maxRows: number;
  hasAddRow: boolean;
  checkboxFrame: CheckboxFrame;
  onPick: (value: T) => void;
  onToggle: (value: T[]) => void;
  onAddNew: () => void | T | null | Promise<T | null | void>;
}

// The list inside the popup dialog. Its own keys: ↑/↓ and the wheel move,
// typing filters (when on), Enter picks (single) or closes (multiple), Space
// toggles (multiple), Escape closes; a press on a row picks or toggles it, a
// press outside the popup closes. Every key it uses is consumed.
function SelectPopup<T>({ store, multiple, filter, maxRows, hasAddRow, checkboxFrame, onPick, onToggle, onAddNew }: PopupProps<T>): ReactNode {
  const { done, cancel } = useDialog();
  const { items, value } = useSyncExternalStore(store.subscribe, store.get);
  const picked = (multiple ? (value as T[] | undefined) ?? [] : []);
  const initialCursor = multiple ? 0 : Math.max(0, items.findIndex((it) => it.value === value));
  const [cursor, setCursor] = useState(initialCursor);
  const [query, setQuery] = useState('');
  const [windowStart, setWindowStart] = useState(0);
  const rectRef = useRef<Rect | null>(null);
  const [added, setAdded] = useState<{ value: T } | null>(null);

  const visible = visibleIndices(items, query);
  const rows = visible.length + (hasAddRow ? 1 : 0);
  const at = Math.min(cursor, Math.max(0, rows - 1));
  const onAddRow = hasAddRow && at === visible.length;

  // Keep the cursor inside the window of `maxRows` rows.
  let start = windowStart;
  if (at < start) start = at;
  if (at >= start + maxRows) start = at - maxRows + 1;
  if (start !== windowStart) setWindowStart(start);

  // A value `onAddNew` produced: select it and put the cursor on it once the
  // caller has added it to `items` (as ListMultiSelect does).
  useEffect(() => {
    if (added === null) return;
    const index = items.findIndex((it) => it.value === added.value);
    if (index < 0) return;
    setAdded(null);
    setQuery('');
    setCursor(index);
    if (!picked.includes(added.value)) {
      onToggle(items.filter((it) => it.value === added.value || picked.includes(it.value)).map((it) => it.value));
    }
  }, [added, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (index: number) => {
    const v = items[index]!.value;
    const on = picked.includes(v);
    onToggle(items.filter((it) => (it.value === v ? !on : picked.includes(it.value))).map((it) => it.value));
  };
  const choose = (rowIndex: number) => {
    if (hasAddRow && rowIndex === visible.length) {
      void Promise.resolve(onAddNew()).then((result) => {
        if (result !== null && result !== undefined) setAdded({ value: result as T });
      });
      return;
    }
    const index = visible[rowIndex];
    if (index === undefined) return;
    if (multiple) toggle(index);
    else { onPick(items[index]!.value); done(undefined); }
  };

  useInput((key: Key) => {
    if (key.name === 'escape') { cancel(); return true; }
    if (key.name === 'mousedown') {
      const r = rectRef.current;
      if (!inside(r, key.x, key.y)) { cancel(); return true; }
      const rowIndex = key.y! - r!.top - (query !== '' ? 1 : 0) + start;
      if (rowIndex >= 0 && rowIndex < rows) { setCursor(rowIndex); choose(rowIndex); }
      return true;
    }
    if (key.name === 'mouseup' || key.name === 'mousedrag') return true;
    if (key.name === 'down' || key.name === 'wheeldown') { if (rows > 0) setCursor((at + 1) % rows); return true; }
    if (key.name === 'up' || key.name === 'wheelup') { if (rows > 0) setCursor((at - 1 + rows) % rows); return true; }
    if (key.name === 'return') {
      if (onAddRow) { choose(at); return true; }
      if (multiple) { done(undefined); return true; }
      choose(at);
      return true;
    }
    if (multiple && key.name === ' ') { if (!onAddRow) choose(at); return true; }
    if (filter) {
      if (key.name === 'backspace') { if (query !== '') { setQuery(query.slice(0, -1)); setCursor(0); } return true; }
      if (!key.ctrl && !key.meta && key.name.length === 1) { setQuery(query + key.name); setCursor(0); return true; }
    }
  });

  const shown = Array.from({ length: Math.min(maxRows, Math.max(0, rows - start)) }, (_, i) => start + i);
  return (
    <Box flexDirection="column" selectable={false} onLayout={(r) => { rectRef.current = r; }}>
      {query !== '' && <Text dim>{`filter: ${query}`}</Text>}
      {shown.map((rowIndex) => {
        const isCursor = rowIndex === at;
        const isAdd = hasAddRow && rowIndex === visible.length;
        const item = isAdd ? null : items[visible[rowIndex]!]!;
        const label = isAdd ? '+ add new' : `${multiple ? `${checkboxMarker(picked.includes(item!.value), checkboxFrame).text} ` : ''}${item!.label}`;
        return (
          <Box key={isAdd ? '__add__' : visible[rowIndex]!} flexDirection="row">
            <Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>{isCursor ? '▸ ' : '  '}</Text>
            <Text bold={isCursor}>{label}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
