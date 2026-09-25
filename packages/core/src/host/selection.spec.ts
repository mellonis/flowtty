import { expect, test } from 'vitest';
import { Buffer } from '../cells.js';
import { clusterWidth, graphemes, stringWidth } from '../graphemes.js';
import { takeWarnings } from '../warnings.js';
import { getYoga } from './yoga.js';
import { appendChild, createInstance, createTextInstance, type Container } from './host.js';
import { computeLayout, contentHeight, type Rect } from './layout.js';
import { paint } from './paint.js';
import {
  applySelection, lineAt, rowSeparator, selectedStyle, selectionRows, selectionSegments, selectionText, wordAt,
  type SelectionRange, type SelectionRow,
} from './selection.js';

const SCREEN: Rect = { left: 0, top: 0, width: 10, height: 4 };

function range(
  anchor: [number, number],
  head: [number, number],
  clip: Rect = SCREEN,
  excluded: Rect[] = [],
): SelectionRange {
  return { anchor: { x: anchor[0], y: anchor[1] }, head: { x: head[0], y: head[1] }, clip, excluded };
}

// A frame from rows of text, clusters placed by display column (a wide glyph
// takes two cells, as paint would leave it).
function bufferOf(lines: string[], width = lines.reduce((m, l) => Math.max(m, stringWidth(l)), 0)): Buffer {
  const b = new Buffer(width, lines.length);
  lines.forEach((line, y) => {
    let x = 0;
    for (const g of graphemes(line)) { b.set(x, y, g); x += clusterWidth(g); }
  });
  return b;
}

// ─── geometry ────────────────────────────────────────────────────────────────

test('a selection inside one row covers the cells between the two ends, inclusive', () => {
  expect(selectionSegments(range([2, 1], [5, 1]))).toEqual([{ y: 1, x0: 2, x1: 6 }]);
});

test('a backwards drag selects the same cells as a forwards one', () => {
  expect(selectionSegments(range([5, 1], [2, 1]))).toEqual(selectionSegments(range([2, 1], [5, 1])));
});

test('a multi-row selection is a stream: first row to the clip edge, middle rows whole', () => {
  expect(selectionSegments(range([6, 0], [3, 2]))).toEqual([
    { y: 0, x0: 6, x1: 10 },
    { y: 1, x0: 0, x1: 10 },
    { y: 2, x0: 0, x1: 4 },
  ]);
});

test('the clip rect, not the screen, bounds the rows of a scoped selection', () => {
  const clip: Rect = { left: 2, top: 1, width: 4, height: 3 };
  expect(selectionSegments(range([3, 1], [4, 2], clip))).toEqual([
    { y: 1, x0: 3, x1: 6 },
    { y: 2, x0: 2, x1: 5 },
  ]);
});

test('an excluded rect splits the rows it covers and is never selected', () => {
  const excluded: Rect[] = [{ left: 3, top: 0, width: 2, height: 1 }];
  expect(selectionSegments(range([1, 0], [7, 0], SCREEN, excluded))).toEqual([
    { y: 0, x0: 1, x1: 3 },
    { y: 0, x0: 5, x1: 8 },
  ]);
});

test('a row covered end to end by an excluded rect contributes no segment', () => {
  const excluded: Rect[] = [{ left: 0, top: 1, width: 10, height: 1 }];
  const rows = selectionRows(range([0, 0], [9, 2], SCREEN, excluded));
  expect(rows.map((r) => r.parts.length)).toEqual([1, 0, 1]);
});

// ─── text ────────────────────────────────────────────────────────────────────

test('selectionText reads the selected cells and trims trailing blanks per row', () => {
  const b = bufferOf(['hello     ', 'world     ', '          ']);
  expect(selectionText(b, range([0, 0], [9, 1]))).toBe('hello\nworld');
});

test('selectionText drops blank rows at the top and the bottom of the selection', () => {
  // A scope is usually taller than the text in it: a drag to its bottom edge
  // sweeps empty rows, and they are not part of what was copied.
  const b = bufferOf(['          ', 'one       ', 'two       ', '          ', '          ']);
  expect(selectionText(b, range([0, 0], [9, 4], { left: 0, top: 0, width: 10, height: 5 })))
    .toBe('one\ntwo');
});

test('selectionText keeps interior blank rows', () => {
  const b = bufferOf(['one       ', '          ', 'two       ']);
  expect(selectionText(b, range([0, 0], [9, 2]))).toBe('one\n\ntwo');
});

test('selectionText drops leading and trailing rows that were wholly skipped', () => {
  const b = bufferOf(['aaa       ', 'bbb       ', 'ccc       ']);
  const excluded: Rect[] = [
    { left: 0, top: 0, width: 10, height: 1 },
    { left: 0, top: 2, width: 10, height: 1 },
  ];
  expect(selectionText(b, range([0, 0], [9, 2], SCREEN, excluded))).toBe('bbb');
});

test('selectionText skips an interior row that was taken out whole', () => {
  // Nothing of that row was selectable, so it is frame — a fence label, a menu
  // bar — not a blank line of the text.
  const b = bufferOf(['aaa       ', 'bbb       ', 'ccc       ']);
  const excluded: Rect[] = [{ left: 0, top: 1, width: 10, height: 1 }];
  expect(selectionText(b, range([0, 0], [9, 2], SCREEN, excluded))).toBe('aaa\nccc');
});

test('selectionText keeps an interior row that is merely blank', () => {
  // The other half of the rule: nothing took this row out, it just has nothing
  // on it — a paragraph break, an empty line inside a code block.
  const b = bufferOf(['aaa       ', '          ', 'ccc       ']);
  expect(selectionText(b, range([0, 0], [9, 2]))).toBe('aaa\n\nccc');
});

test('selectionText joins the two halves of a row split by an excluded rect', () => {
  const b = bufferOf(['abcdefghij']);
  const excluded: Rect[] = [{ left: 3, top: 0, width: 3, height: 1 }];
  expect(selectionText(b, range([0, 0], [9, 0], SCREEN, excluded))).toBe('abcghij');
});

test('a cell holding an astral code point comes back whole', () => {
  const b = bufferOf(['a😀b']);
  expect(selectionText(b, range([1, 0], [1, 0], { left: 0, top: 0, width: 3, height: 1 }))).toBe('😀');
});

// ─── soft wrap ───────────────────────────────────────────────────────────────
// A row that the painter marked as continuing joins to the next one without a
// newline — but only when the selection covers exactly that span and nothing
// else on either row, or a neighbouring pane's text would be spliced into the
// middle of the paragraph.

const rowsOf = (r: SelectionRange): SelectionRow[] => selectionRows(r);

test('rowSeparator is a newline when nothing marked the row as continuing', () => {
  const b = bufferOf(['abc', 'def']);
  const [above, below] = rowsOf(range([0, 0], [2, 1], { left: 0, top: 0, width: 3, height: 2 }));
  expect(rowSeparator(b, above!, below!)).toBe('\n');
});

test('rowSeparator joins a word wrap with a space and a hard break with nothing', () => {
  const b = bufferOf(['abc', 'def']);
  const clip: Rect = { left: 0, top: 0, width: 3, height: 2 };
  const [above, below] = rowsOf(range([0, 0], [2, 1], clip));
  b.markContinuation({ y: 0, x0: 0, x1: 3, join: ' ' });
  expect(rowSeparator(b, above!, below!)).toBe(' ');

  const hard = bufferOf(['abc', 'def']);
  hard.markContinuation({ y: 0, x0: 0, x1: 3, join: '' });
  expect(rowSeparator(hard, above!, below!)).toBe('');
});

test('rowSeparator refuses the join when the selection runs past the marked span', () => {
  // A wrapped paragraph in the left pane, unrelated text in the right one. The
  // mark covers columns 0..4; the selection covers the whole width.
  const b = bufferOf(['aaa  RIGHT', 'bbb  OTHER']);
  b.markContinuation({ y: 0, x0: 0, x1: 5, join: ' ' });
  const [above, below] = rowsOf(range([0, 0], [9, 1], { left: 0, top: 0, width: 10, height: 2 }));
  expect(rowSeparator(b, above!, below!)).toBe('\n');
});

test('rowSeparator refuses the join when non-blank text is selected before the span', () => {
  // The wrapping pane is the RIGHT one this time.
  const b = bufferOf(['LEFT  aaa', 'OTHR  bbb']);
  b.markContinuation({ y: 0, x0: 6, x1: 9, join: ' ' });
  const clip: Rect = { left: 0, top: 0, width: 9, height: 2 };
  const [wide, wideBelow] = rowsOf(range([0, 0], [8, 1], clip));
  expect(rowSeparator(b, wide!, wideBelow!)).toBe('\n');
  // Scoped to the right-hand pane, the same mark joins.
  const scope: Rect = { left: 6, top: 0, width: 3, height: 2 };
  const [narrow, narrowBelow] = rowsOf(range([6, 0], [8, 1], scope));
  expect(rowSeparator(b, narrow!, narrowBelow!)).toBe(' ');
});

test('rowSeparator ignores a mark when the rows are not adjacent or one is empty', () => {
  const b = bufferOf(['abc', 'def', 'ghi']);
  b.markContinuation({ y: 0, x0: 0, x1: 3, join: ' ' });
  const rows = rowsOf(range([0, 0], [2, 2], { left: 0, top: 0, width: 3, height: 3 }));
  expect(rowSeparator(b, rows[0]!, rows[2]!)).toBe('\n');
  expect(rowSeparator(b, rows[0]!, { y: 1, parts: [] })).toBe('\n');
});

test('selectionText pastes a wrapped paragraph as one line', () => {
  const b = bufferOf(['hello', 'world']);
  b.markContinuation({ y: 0, x0: 0, x1: 5, join: ' ' });
  expect(selectionText(b, range([0, 0], [4, 1], { left: 0, top: 0, width: 5, height: 2 })))
    .toBe('hello world');
});

test('selectionText keeps the newline between two separate lines of text', () => {
  const b = bufferOf(['hello', 'world']);
  expect(selectionText(b, range([0, 0], [4, 1], { left: 0, top: 0, width: 5, height: 2 })))
    .toBe('hello\nworld');
});

test('selectionText trims the blanks a hanging indent adds at a space join', () => {
  // A list item: the continuation row is indented under the marker's text.
  const b = bufferOf(['• first item', '  continued']);
  b.markContinuation({ y: 0, x0: 0, x1: 12, join: ' ' });
  expect(selectionText(b, range([0, 0], [11, 1], { left: 0, top: 0, width: 12, height: 2 })))
    .toBe('• first item continued');
});

test('selectionText keeps leading blanks at a hard join — code is whitespace-significant', () => {
  const b = bufferOf(['foo(', '  bar']);
  // x1 is where the row's painted text ends — column 4, not the padded width.
  b.markContinuation({ y: 0, x0: 0, x1: 4, join: '' });
  expect(selectionText(b, range([0, 0], [4, 1], { left: 0, top: 0, width: 5, height: 2 })))
    .toBe('foo(  bar');
});

test('selectionText drops the layout blanks left of the span at a hard join too', () => {
  // An indented box in an UNSCOPED selection: the drag starts at column 0, so
  // the blanks between it and the box's content rect come along. They are
  // layout, not text, and must not be spliced into the middle of the word.
  const b = bufferOf(['     longwo', '     rd    ']);
  b.markContinuation({ y: 0, x0: 5, x1: 11, join: '' });
  expect(selectionText(b, range([0, 0], [10, 1], { left: 0, top: 0, width: 11, height: 2 })))
    .toBe('     longword');
});

test('selectionText keeps a trailing space the painted text ends on at a hard join', () => {
  // A code row cut just after a space: the space is content, and the mark's x1
  // says where the painted text ends, so it is not padding to be trimmed.
  const b = bufferOf(['const x = ', '1;        ']);
  b.markContinuation({ y: 0, x0: 0, x1: 10, join: '' });
  expect(selectionText(b, range([0, 0], [9, 1]))).toBe('const x = 1;');
});

test('selectionText still trims the padding beyond a continuing row’s text', () => {
  // The same row, but the painted text stops at column 2 (x1) and the cells
  // after it are a diff band's fill.
  const b = bufferOf(['ab        ', 'cd        ']);
  b.markContinuation({ y: 0, x0: 0, x1: 2, join: '' });
  expect(selectionText(b, range([0, 0], [9, 1]))).toBe('abcd');
});

test('selectionText across two panes joins nothing — each row stands on its own', () => {
  const b = bufferOf(['aaa  RIGHT', 'bbb  OTHER']);
  b.markContinuation({ y: 0, x0: 0, x1: 5, join: ' ' });
  expect(selectionText(b, range([0, 0], [9, 1]))).toBe('aaa  RIGHT\nbbb  OTHER');
});

// ─── overlay ─────────────────────────────────────────────────────────────────

test('applySelection toggles inverse on the selected cells and leaves the rest alone', () => {
  const b = bufferOf(['abcd']);
  const out = applySelection(b, [{ y: 0, x0: 1, x1: 3 }]);
  expect(out.get(0, 0).style.inverse).toBeFalsy();
  expect(out.get(1, 0).style.inverse).toBe(true);
  expect(out.get(2, 0).style.inverse).toBe(true);
  expect(out.get(3, 0).style.inverse).toBeFalsy();
});

test('a selected cell keeps its own two colors under inverse — the band takes the text color', () => {
  const b = new Buffer(2, 1);
  b.set(0, 0, 'a', { fg: 'red', bg: '#3b0000', dim: true, bold: true, underline: true });
  b.set(1, 0, 'b', { fg: 'cyan' });
  const out = applySelection(b, [{ y: 0, x0: 0, x1: 1 }]);
  // `inverse` swaps the two in the terminal: the band is the cell's own fg and
  // the glyph its own bg — a pair that contrasted before the swap and so
  // contrasts after it. Only `dim` goes.
  expect(out.get(0, 0).char).toBe('a');
  expect(out.get(0, 0).style).toEqual({ inverse: true, fg: 'red', bg: '#3b0000', bold: true, underline: true });
  // The cell beside it was not selected and is untouched.
  expect(out.get(1, 0).style).toEqual({ fg: 'cyan' });
});

test('a selected cell with no color of its own is the plain band', () => {
  expect(selectedStyle({})).toEqual({ inverse: true });
  expect(selectedStyle({ bg: 'yellow' })).toEqual({ inverse: true, bg: 'yellow' });
});

test('a cell painted in the inherited ink selects to a band of that ink, never moved into bg', () => {
  // A box's `color` reaches every cell in it, and an app picks that ink to sit
  // near the terminal's own foreground. Moving it into `bg` would put the glyph
  // in the ink on a band of the default foreground — the same color twice.
  // Keeping it as `fg` makes the band the ink and the glyph the default
  // background, readable on a light theme and on a dark one.
  const ink = '#d0d0d0';
  expect(selectedStyle({ fg: ink })).toEqual({ inverse: true, fg: ink });
  // A deliberately different fg — a syntax-highlighted keyword — is kept too.
  expect(selectedStyle({ fg: 'cyan' })).toEqual({ inverse: true, fg: 'cyan' });
});

test('a selected cell with fg and bg keeps both — white on black selects to black on white', () => {
  expect(selectedStyle({ fg: 'white', bg: 'black' })).toEqual({ inverse: true, fg: 'white', bg: 'black' });
});

test('a selected cell that was already inverse keeps its colors and is not inverted again', () => {
  const b = new Buffer(1, 1);
  b.set(0, 0, 'a', { inverse: true, fg: 'green', bg: 'cyan', dim: true, bold: true });
  const out = applySelection(b, [{ y: 0, x0: 0, x1: 1 }]);
  // A hole in the band: not inverse where everything around it is, showing its
  // own pair the way the box around it does. Only `dim` goes.
  expect(out.get(0, 0).style).toEqual({ fg: 'green', bg: 'cyan', bold: true });
  // With only an inherited ink, the hole is that ink on the default background.
  expect(selectedStyle({ inverse: true, fg: '#d0d0d0' })).toEqual({ fg: '#d0d0d0' });
  expect(selectedStyle({ inverse: true })).toEqual({});
});

test('applySelection un-inverts a cell that was already inverse, so it stays visible', () => {
  const b = new Buffer(2, 1);
  b.set(0, 0, 'a', { inverse: true, bold: true });
  b.set(1, 0, 'b', {});
  const out = applySelection(b, [{ y: 0, x0: 0, x1: 2 }]);
  expect(out.get(0, 0).style.inverse).toBeFalsy();
  expect(out.get(0, 0).style.bold).toBe(true);
  expect(out.get(1, 0).style.inverse).toBe(true);
});

test('applySelection never touches the buffer it was given', () => {
  const b = bufferOf(['abcd']);
  const out = applySelection(b, [{ y: 0, x0: 0, x1: 4 }]);
  expect(out).not.toBe(b);
  expect(b.get(0, 0).style.inverse).toBeUndefined();
});

test('applySelection with no segments hands the same buffer back', () => {
  const b = bufferOf(['abcd']);
  expect(applySelection(b, [])).toBe(b);
});

// ─── round trip ──────────────────────────────────────────────────────────────
// The whole pipeline, end to end: wrap the text, paint it into a scoped box,
// select every cell of it and get the source back. This is the property the
// marks exist for, and it goes through the painter's x0/x1 placement and
// `selectionText`'s cuts — not just `wrapTextLines`.

/** What `wrap` mode does not paint, and so cannot be selected back. The two
 *  normalizations are documented in docs/input.md (selection); the list is kept
 *  in step with `wrap.spec.ts`, which pins the same rule one layer down. */
function asPainted(source: string): string {
  return source
    .split('\n')
    .filter((line) => /[^ ]/u.test(line) || line === '') // ASCII spaces only: NBSP paints a row
    .map((line) => line.replace(/^ +/u, '').replace(/ +$/u, ''))
    .join('\n');
}

const ROUND_TRIP_CORPUS = [
  'hello world',
  'antidisestablishment',
  'hi superlongword bye',
  'abc  def',                    // two spaces, eaten at the break
  'ab   cd',                     // three, so one of them is painted
  'one    two   three',
  'const x = 1;',                // a cut can land right after the space
  'wrap  a superlongunbreakableword  here',
  'one two\n\nthree four',       // a blank line between paragraphs
  ' leading and trailing ',      // both trimmed — see asPainted
  'ключ значение 🙂 emoji',
  'a b nbsp word',     // NBSP is content: never a break, never trimmed
];

// A scope deliberately bigger than the text in it — the ordinary case, and the
// one that used to come back with trailing newlines.
const SCOPE_PAD = { right: 3, bottom: 4 };

async function paintScoped(source: string, width: number): Promise<{ buffer: Buffer; clip: Rect }> {
  const Yoga = await getYoga();
  const scope = createInstance(
    'flowtty-box',
    { width: width + SCOPE_PAD.right, selectionScope: true, flexDirection: 'column' },
    Yoga,
  );
  const text = createInstance('flowtty-box', { width, wrap: 'wrap' }, Yoga);
  appendChild(text, createTextInstance(source, Yoga), Yoga);
  appendChild(scope, text, Yoga);
  const container: Container = { children: [scope], Yoga };
  const frameWidth = width + SCOPE_PAD.right;
  computeLayout(container, frameWidth, undefined); // height auto: as tall as the text
  const height = contentHeight(container) + SCOPE_PAD.bottom;
  return {
    buffer: paint(container, frameWidth, height),
    clip: { left: 0, top: 0, width: frameWidth, height },
  };
}

test('a wrapped paragraph painted into a scope selects back as its source', async () => {
  for (const source of ROUND_TRIP_CORPUS) {
    for (const width of [2, 3, 5, 8, 13, 24]) {
      const { buffer, clip } = await paintScoped(source, width);
      const whole: SelectionRange = {
        anchor: { x: 0, y: 0 },
        head: { x: clip.width - 1, y: clip.height - 1 },
        clip,
        excluded: [],
      };
      expect(selectionText(buffer, whole), `${JSON.stringify(source)} at width ${width}`)
        .toBe(asPainted(source));
    }
  }
});

// ─── word and line under a cell ─────────────────────────────────────────────

test('wordAt: the run of non-space cells around the cell, within the scope', () => {
  const b = bufferOf(['hello world', '           ']);
  const scope = { clip: { left: 0, top: 0, width: 11, height: 2 }, excluded: [] };
  expect(wordAt(b, scope, 7, 0)).toEqual(range([6, 0], [10, 0], scope.clip));
  expect(wordAt(b, scope, 5, 0)).toBeNull(); // a blank cell is no word
  expect(wordAt(b, scope, 0, 1)).toBeNull(); // an empty row
  expect(wordAt(b, scope, 3, 2)).toBeNull(); // outside the clip
});

test('wordAt stops at an excluded region and at the clip', () => {
  const b = bufferOf(['abcdefgh']);
  const excluded = [{ left: 5, top: 0, width: 1, height: 1 }];
  const scope = { clip: { left: 2, top: 0, width: 6, height: 1 }, excluded };
  expect(wordAt(b, scope, 3, 0)).toEqual(range([2, 0], [4, 0], scope.clip, excluded));
  expect(wordAt(b, scope, 6, 0)).toEqual(range([6, 0], [7, 0], scope.clip, excluded));
  expect(wordAt(b, scope, 5, 0)).toBeNull(); // the excluded cell itself
});

test('lineAt: the row, extended over the rows a soft wrap joins to it', () => {
  const b = bufferOf(['aaa bbb', 'ccc ddd', 'eee    ']);
  b.markContinuation({ y: 0, x0: 0, x1: 7, join: ' ' }); // row 0 wraps into row 1
  const scope = { clip: { left: 0, top: 0, width: 7, height: 3 }, excluded: [] };
  expect(lineAt(b, scope, 5, 1)).toEqual(range([0, 0], [6, 1], scope.clip));
  expect(lineAt(b, scope, 1, 2)).toEqual(range([0, 2], [6, 2], scope.clip));
  expect(selectionText(b, lineAt(b, scope, 5, 1)!)).toBe('aaa bbb ccc ddd');
  expect(lineAt(b, scope, 1, 3)).toBeNull(); // outside the clip
});

// ─── wide glyphs ─────────────────────────────────────────────────────────────
// A wide glyph is a lead cell and a continuation cell (`''`); a selection that
// touches either half has the whole glyph.

test('applySelection restyles both cells of a wide glyph and never writes an empty char', () => {
  const b = bufferOf(['日x'], 4);
  const out = applySelection(b, [{ y: 0, x0: 0, x1: 3 }]);
  expect(out.get(0, 0).char).toBe('日');
  expect(out.get(1, 0)).toEqual({ char: '', style: out.get(0, 0).style });
  expect(out.get(0, 0).style).toEqual(selectedStyle({}));
  expect(takeWarnings()).toEqual([]);
});

test('a segment starting on a continuation cell covers the glyph from its lead', () => {
  const b = bufferOf(['日x'], 4);
  const out = applySelection(b, [{ y: 0, x0: 1, x1: 3 }]);
  expect(out.get(0, 0).style).toEqual(selectedStyle({}));
  expect(selectionText(b, range([1, 0], [2, 0], { left: 0, top: 0, width: 4, height: 1 }))).toBe('日x');
});

test('a double-click inside 日本語 selects the whole word', () => {
  const b = bufferOf(['ab 日本語 cd'], 12);
  const scope = { clip: { left: 0, top: 0, width: 12, height: 1 }, excluded: [] };
  const r = wordAt(b, scope, 4, 0)!; // the right half of 日
  expect([r.anchor.x, r.head.x]).toEqual([3, 8]);
  expect(selectionText(b, r)).toBe('日本語');
});
