// A bare terminal probe, no flowtty: writes the byte patterns TtyBackend
// produces around a wide cluster and lets the terminal show what it makes of
// them. Screenshot the result.
//   node packages/examples/wide-glyphs/probe.mjs
//
// Each case is one line. The ruler `0123456789` above the block gives the
// columns; a `|` marks where the writer believes the cursor is (column 4 for a
// two-column cluster in a four-column cell).
const out = process.stdout;
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BG = `${ESC}[45m`;   // magenta background
const cursorTo = (col, row) => `${ESC}[${row + 1};${col + 1}H`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FAMILY = '👩‍👧';
const THUMB = '👍🏽';
const KEYCAP = '1️⃣';

let row = 0;
function line(text) { out.write(cursorTo(0, row) + text + RESET); row += 1; }

out.write(`${ESC}[2J${ESC}[H`);
line('0123456789          Terminal probe for wide clusters. Every | should sit under column 4.');
line('');

// A. One write: cluster, two blanks, bar. What the table says.
line(`${FAMILY}  |  A  family, one write`);
line(`${THUMB}  |  A  thumb+tone, one write`);
line(`${KEYCAP}  |  A  keycap, one write`);
line('');

// B. The cluster ends the write; the bar comes in a later write (the frame
//    diff does this when the cluster is the last changed cell of a frame).
const bRows = [];
for (const [g, label] of [[FAMILY, 'family'], [THUMB, 'thumb+tone'], [KEYCAP, 'keycap']]) {
  bRows.push([row, label]);
  out.write(cursorTo(0, row) + g + RESET);
  row += 1;
}
line('');

// C. The cluster ends the write and the next write starts with a cursor move
//    to the next row (no printable follows it on its own row).
const cRows = [];
for (const [g, label] of [[FAMILY, 'family'], [THUMB, 'thumb+tone']]) {
  cRows.push([row, label]);
  out.write(cursorTo(0, row) + g + RESET);
  row += 1;
  out.write(cursorTo(0, row)); // the move that a diff makes when the next changed cell is on another row
}
line('');

// D. A marquee like the demo's: a 12-column window with a background, the
//    text "c FAMILY z" sliding left one column per frame, each frame rewriting
//    only the window's 12 cells the way drawDiff does (one cursor move, then
//    the cells in order). Left as the terminal leaves it: any paint outside
//    the 12 columns (before the `|` at column 12) is residue.
const dRow = row; row += 1;
const dRow2 = row; row += 1;
line('');
line('D  the two rows above: a 12-column window, text slid left one column per frame; `|` marks column 12.');
line('   Row 1: only the window is rewritten. Row 2: the cell after the window is rewritten too, every frame.');
line('');
line('Waiting 8 s, then exiting. Screenshot when the marquee rows stop moving.');

await sleep(400);
for (const [r, label] of bRows) out.write(cursorTo(4, r) + `|  B  ${label}: cluster in one write, this bar in a later one` + RESET);
for (const [r, label] of cRows) out.write(cursorTo(4, r) + `|  C  ${label}: cluster, then a cursor move, then this bar` + RESET);

const WIN = 12;
const TEXT = ['c', ' ', FAMILY, ' ', 'z'];
const widths = { c: 1, ' ': 1, [FAMILY]: 2, z: 1 };
out.write(cursorTo(WIN, dRow) + '|' + RESET + cursorTo(WIN, dRow2) + '|' + RESET);
for (let step = 0; step <= WIN + 6; step++) {
  // Window columns [0, WIN); the text starts at column WIN - step.
  let s = '';
  let col = 0;
  const start = WIN - step;
  const cells = [];
  let at = start;
  for (const g of TEXT) { cells.push([at, at + widths[g], g]); at += widths[g]; }
  while (col < WIN) {
    const cell = cells.find(([a, b]) => a <= col && col < b);
    if (cell === undefined) { s += ' '; col += 1; continue; }
    const [a, b, g] = cell;
    if (a < 0 || b > WIN) { s += ' '.repeat(Math.min(b, WIN) - Math.max(a, 0)); col = Math.min(b, WIN); continue; }
    s += g; col = b;
  }
  out.write(cursorTo(0, dRow) + BG + s + RESET);
  out.write(cursorTo(0, dRow2) + BG + s + RESET + '|' + RESET);
  await sleep(350);
}
await sleep(8000);
out.write(cursorTo(0, row + 1) + RESET + '\n');
