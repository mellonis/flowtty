// The wide-glyphs demo's screen; index.tsx mounts it on a TtyBackend.
import React, { useState } from 'react';
import {
  Box, Text, Span, Table, TextInput, Markdown, Menu, DialogHost, HelpBar,
  useApp, useInput, useTicker, stringWidth,
  type TableColumn, type MenuItem,
} from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

const INTERVAL = 400;

// A string whose clusters differ in width: narrow, CJK, flag, toned emoji,
// decomposed accent, ZWJ family, keycap.
const MIXED = 'a日b🇯🇵c👍🏽 café 👩‍👧 1️⃣ z';
const CLUSTERS = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(MIXED)].map((s) => s.segment);
const BGS = ['red', 'blue', 'green', 'magenta', 'yellow', 'cyan'] as const;

function Panel({ title, children, width }: { title: string; children: React.ReactNode; width?: number }) {
  return (
    <Box flexDirection="column" border="round" borderTitle={title} paddingX={1} width={width} overflow="hidden">
      {children}
    </Box>
  );
}

// 1. The same columns hold wide text on even ticks and narrow text on odd ones:
//    the frame diff must repaint both cells of every glyph and never leave a
//    half behind. The counter next to it changes every tick.
function Alternating({ tick }: { tick: number }) {
  const wide = tick % 2 === 0;
  return (
    <Box flexDirection="row">
      <Box width={14}><Text backgroundColor={wide ? 'blue' : 'red'}>{wide ? '日本語テスト' : 'abcdefghijkl'}</Text></Box>
      <Text> tick </Text>
      <Text bold>{String(tick).padStart(4)}</Text>
      <Text>  {wide ? '← wide' : '← narrow'}</Text>
    </Box>
  );
}

// 2. A marquee: the mixed string slides one column per tick through a fixed
//    window with a background. Clusters cut by either edge must show as blanks,
//    never as half a glyph; the background must have no gaps.
function Marquee({ tick }: { tick: number }) {
  const width = 24;
  // A strip of `width` blanks, the text, `width` blanks: the window slides over
  // it, so the text enters from the right and leaves through the left edge.
  const strip = [...' '.repeat(width), ...CLUSTERS, ...' '.repeat(width)];
  const total = strip.reduce((n, g) => n + stringWidth(g), 0);
  const off = tick % (total - width + 1);
  let col = 0;
  let out = '';
  for (const g of strip) {
    const w = stringWidth(g);
    const a = col;
    const b = col + w;
    col = b;
    if (b <= off || a >= off + width) continue;
    out += a >= off && b <= off + width ? g : ' '.repeat(Math.min(b, off + width) - Math.max(a, off));
  }
  out += ' '.repeat(Math.max(0, width - stringWidth(out)));
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box width={width}><Text backgroundColor="magenta">{out}</Text></Box>
        <Text dim>  ← marquee: blanks at the edges, never half a glyph</Text>
      </Box>
      <Box flexDirection="row">
        <Box width={width}><Text backgroundColor="magenta">{out}</Text></Box>
        <Text bold>{'|/-\\'[tick % 4]}</Text>
        <Text dim> ← same, with a cell repainted right after it every tick</Text>
      </Box>
    </Box>
  );
}

// 3. Segments with rotating backgrounds: a continuation cell carries its
//    lead's background, so a colour band never has a one-column hole.
function Segments({ tick }: { tick: number }) {
  return (
    <Box flexDirection="column">
      <Text>
        {CLUSTERS.map((g, i) => (
          <Span key={i} backgroundColor={BGS[(i + tick) % BGS.length]} color="white">{g}</Span>
        ))}
      </Text>
      <Text>
        <Span backgroundColor="red">日本</Span><Span backgroundColor="blue">ab</Span><Span backgroundColor="green">🇯🇵</Span>
        <Span backgroundColor="yellow" color="black">c</Span><Span backgroundColor="cyan" color="black">👍🏽</Span><Span backgroundColor="magenta">語</Span>
      </Text>
      <Text dim>each cluster its own colour; no gaps, no overlap</Text>
    </Box>
  );
}

// 4. Edges: truncation, wrap, and a glyph that would straddle the last column.
function Edges() {
  return (
    <Box flexDirection="row">
      <Box width={6} border="single"><Text wrap="truncate">日本語日本語</Text></Box>
      <Box width={6} border="single"><Text wrap="wrap">a日本語</Text></Box>
      <Box width={5} border="single"><Text>ab日</Text></Box>
      <Box width={9} border="single" borderTitle="日本語" />
      <Box flexDirection="column" paddingLeft={1}>
        <Text dim>truncate → 日…   wrap → a日 / 本語</Text>
        <Text dim>ab日 in 3 cols → ab + blank</Text>
        <Text dim>title 日本語 in 5 → 日…</Text>
      </Box>
    </Box>
  );
}

// 5. Width check: each cluster in a four-column cell with a bar after it. The
//    bar is painted at column 4 by flowtty; a terminal that draws the cluster
//    wider than flowtty measures it pushes the bar right of the ruler's mark —
//    that cluster is where this terminal and the tables disagree.
const PROBES: [string, string][] = [
  ['ab', 'ascii (reference)'], ['日', 'CJK'], ['🇯🇵', 'flag: two regional indicators'],
  ['👍🏽', 'thumb + skin tone'], ['👩‍👧', 'ZWJ family'], ['1\ufe0f\u20e3', 'keycap: 1 + VS16 + U+20E3'],
  ['e\u0301', 'e + combining acute'], ['✅', 'U+2705 (wide)'], ['☑\ufe0f', 'U+2611 + VS16'], ['✔', 'U+2714 (narrow)'],
];
function WidthCheck() {
  return (
    <Box flexDirection="column">
      <Text dim>{'0123|'}</Text>
      {PROBES.map(([g, label]) => (
        <Box key={label} flexDirection="row">
          <Box width={4}><Text>{g}</Text></Box>
          <Text bold>|</Text>
          <Text dim> {stringWidth(g)} col{stringWidth(g) === 1 ? '' : 's'} · {label}</Text>
        </Box>
      ))}
    </Box>
  );
}

interface Row { name: string; qty: number; note: string }
const ROWS: Row[] = [
  { name: '日本語', qty: 3, note: 'CJK' },
  { name: '🇯🇵 flag', qty: 12, note: 'two indicators' },
  { name: '👍🏽 tone', qty: 7, note: 'modifier' },
  { name: 'café', qty: 4, note: 'combining' },
  { name: '👩‍👧 zwj', qty: 1, note: 'sequence' },
  { name: 'plain', qty: 99, note: 'ascii' },
];
const COLUMNS: TableColumn<Row>[] = [
  { accessor: 'name', header: 'Name' },
  { accessor: 'qty', header: 'Qty', align: 'right' },
  { accessor: 'note', header: 'Note', width: 8 },
];

const MD = [
  '| Status | Qty |', '| :-- | --: |', '| ✅ Done | 11 |', '| 日本語 | 3 |', '| 🇯🇵 flag | 5 |', '| plain | 7 |',
  '', '```', 'const s = "日本語 👩‍👧 café";', '```',
].join('\n');

const MENU: MenuItem[] = [
  { key: 'f', label: 'ファイル', submenu: [
    { key: 'o', label: '開く 🇯🇵', onSelect: () => {} },
    { key: 's', label: 'save', onSelect: () => {} },
  ] },
  { key: 'e', label: 'Edit', submenu: [
    { key: 'c', label: '日本語をコピー', onSelect: () => {} },
    { key: 'p', label: 'paste 👍🏽', onSelect: () => {} },
  ] },
];

export function App(): React.ReactNode {
  const { exit } = useApp();
  const tick = useTicker({ interval: INTERVAL, active: true });
  const [value, setValue] = useState('日本語😀 café 🇯🇵 ab');
  useInput((key) => { if (key.name === 'q' && !key.ctrl && !key.meta) { exit(); return true; } return false; }, { fallback: true });

  return (
    <Menu items={MENU} title="幅テスト" onExit={exit}>
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Panel title="diff: wide ↔ narrow every tick">
            <Alternating tick={tick} />
            <Marquee tick={tick} />
          </Panel>
          <Panel title="segments with backgrounds">
            <Segments tick={tick} />
          </Panel>
          <Panel title="edges">
            <Edges />
          </Panel>
          <Panel title="TextInput (type; ← → Home End)">
            <Box flexDirection="row">
              <TextInput value={value} onChange={setValue} isFocused width={16} />
              <Text dim>  16 cols, scrolls</Text>
            </Box>
          </Panel>
          <Panel title="width check: the bar must sit under the ruler's |">
            <WidthCheck />
          </Panel>
        </Box>
        <Box flexDirection="column" width={44}>
          <Panel title="Table">
            <Table data={ROWS} columns={COLUMNS} width={40} />
          </Panel>
          <Panel title="Markdown">
            <Markdown width={40}>{MD}</Markdown>
          </Panel>
        </Box>
      </Box>
      <Box flexGrow={1} />
      <HelpBar>{'日本語 help bar · F10 menu · q quit'}</HelpBar>
    </Menu>
  );
}

