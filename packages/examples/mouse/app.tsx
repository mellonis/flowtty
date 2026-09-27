// The mouse demo's screen; index.tsx mounts it on a TtyBackend with hover on.
// Each panel exercises one rule from docs/input.md (clicks and hover). Move
// the pointer over the cards and the list; click the nested boxes; q quits.
import React, { useRef, useState, type ReactNode } from 'react';
import {
  Box, Text, ListSelect, ScrollList, useApp, useHover, useInput, type Key,
} from '@flowtty/react';

// ── 1. Nested hover: a panel, three cards in it, a word in each card. Every
//      level has its own useHover, so hovering the word lights all three;
//      leaving the word but staying on the card keeps the outer two.
function Word({ label }: { label: string }): ReactNode {
  const [hovered, hover] = useHover();
  return <Text {...hover} bold={hovered} inverse={hovered}>{` ${label} `}</Text>;
}

function Card({ title, onTrace }: { title: string; onTrace: (line: string) => void }): ReactNode {
  const [hovered, hover] = useHover();
  const renders = useRef(0);
  renders.current += 1;
  return (
    <Box
      flexDirection="column" border="round" paddingX={1} marginRight={1} width={15}
      borderColor={hovered ? 'cyan' : undefined}
      backgroundColor={hovered ? 'blue' : undefined}
      onHoverChange={(h) => { hover.onHoverChange(h); onTrace(`${title}: ${h ? 'enter' : 'leave'}`); }}
    >
      <Text bold={hovered}>{title}</Text>
      <Box flexDirection="row"><Word label="one" /><Word label="two" /></Box>
      <Text dim>{`renders ${renders.current}`}</Text>
    </Box>
  );
}

function HoverPanel({ onTrace }: { onTrace: (line: string) => void }): ReactNode {
  const [hovered, hover] = useHover();
  return (
    <Box flexDirection="column" border="single" borderTitle=" nested hover " paddingX={1} borderColor={hovered ? 'green' : undefined} {...hover}>
      <Text dim>{hovered ? 'pointer is inside the panel' : 'move the pointer over a card, then over a word'}</Text>
      <Box flexDirection="row" marginTop={1}>
        <Card title="alpha" onTrace={onTrace} />
        <Card title="beta" onTrace={onTrace} />
        <Card title="gamma" onTrace={onTrace} />
      </Box>
    </Box>
  );
}

// ── 2. Nested clicks: the box painted on top wins, then the nearest handler
//      up the chain — the inner box takes its own clicks, the outer only the
//      clicks on its padding.
function ClickPanel(): ReactNode {
  const [outer, setOuter] = useState(0);
  const [inner, setInner] = useState(0);
  const [last, setLast] = useState('');
  return (
    <Box flexDirection="column" border="single" borderTitle=" nested clicks " paddingX={1} width={36}>
      <Box
        flexDirection="column" border="round" padding={1} width={30}
        onClick={(k: Key) => { setOuter((n) => n + 1); setLast(`outer @${k.x},${k.y}`); }}
      >
        <Text>{`outer: ${outer} clicks`}</Text>
        <Text dim>click the padding</Text>
        <Box border="round" paddingX={1} width={20} onClick={(k: Key) => { setInner((n) => n + 1); setLast(`inner @${k.x},${k.y}`); }}>
          <Text>{`inner: ${inner} clicks`}</Text>
        </Box>
      </Box>
      <Text dim>{last === '' ? 'nothing clicked yet' : `last: ${last}`}</Text>
    </Box>
  );
}

// ── 3. A list: rows brighten under the pointer through their own useHover
//      (only that row re-renders — watch the counters), a click picks the row.
const ROWS = Array.from({ length: 12 }, (_, i) => `row ${i + 1}`);

function Row({ label, picked }: { label: string; picked: boolean }): ReactNode {
  const [hovered, hover] = useHover();
  const renders = useRef(0);
  renders.current += 1;
  return (
    <Box flexDirection="row" {...hover} backgroundColor={hovered ? 'blue' : undefined}>
      <Text bold={picked} color={picked ? 'cyan' : undefined} dim={!hovered && !picked}>{picked ? '▸ ' : '  '}{label}</Text>
      <Text dim>{`  (renders ${renders.current})`}</Text>
    </Box>
  );
}

function ListPanel(): ReactNode {
  const [picked, setPicked] = useState(0);
  return (
    <Box flexDirection="column" border="single" borderTitle=" ScrollList: hover, click picks " paddingX={1} width={42}>
      <ScrollList height={6} items={ROWS} renderItem={(r, i) => <Row label={r} picked={i === picked} />} onRowClick={(i) => setPicked(i)} />
      <Text dim>{`picked: ${ROWS[picked]}  · wheel scrolls`}</Text>
    </Box>
  );
}

// ── 4. ListSelect: a click moves the highlight (onChange), never submits.
function SelectPanel(): ReactNode {
  const [value, setValue] = useState('b');
  const [submitted, setSubmitted] = useState('');
  return (
    <Box flexDirection="column" border="single" borderTitle=" ListSelect: click " paddingX={1} width={26}>
      <ListSelect
        items={[{ label: 'apple', value: 'a' }, { label: 'banana', value: 'b' }, { label: 'cherry', value: 'c' }]}
        value={value} onChange={setValue} onSubmit={(v) => setSubmitted(v)} isFocused
      />
      <Text dim>{`value ${value} · Enter ${submitted || '—'}`}</Text>
    </Box>
  );
}

export function App(): ReactNode {
  const { exit } = useApp();
  const [trace, setTrace] = useState<string[]>([]);
  const onTrace = (line: string) => setTrace((t) => [...t.slice(-2), line]);
  useInput((key) => { if (key.name === 'q') { exit(); return true; } return false; }, { fallback: true });
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <HoverPanel onTrace={onTrace} />
        <Box marginLeft={1}><SelectPanel /></Box>
      </Box>
      <Box flexDirection="row">
        <ClickPanel />
        <Box marginLeft={1}><ListPanel /></Box>
      </Box>
      <Box flexDirection="column" border="single" borderTitle=" hover trace (last 3) " paddingX={1}>
        {trace.length === 0 ? <Text dim>no enter / leave yet</Text> : trace.map((l, i) => <Text key={i}>{l}</Text>)}
      </Box>
      <Text dim>q quits · needs a terminal that reports the mouse</Text>
    </Box>
  );
}
