import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, ScrollBox, TextArea, type ScrollBoxHandle, type ScrollMetrics } from '@flowtty/react';
import { useTempo } from '../tempo.js';

interface Msg { id: number; who: 'you' | 'bot'; text: string }

const REPLY = 'A ScrollBox takes whatever height the layout leaves it, stays pinned to the newest line while an answer streams in, and holds still once you scroll up to read. The field below is a TextArea: it wraps, grows to a few rows, and keeps the line breaks of whatever you paste.';

const Message = React.memo(({ m }: { m: Msg }) => (
  <Box flexDirection="column" backgroundColor={m.who === 'you' ? 'rgb(38,48,68)' : undefined}>
    <Text bold color={m.who === 'you' ? 'cyan' : 'green'}>{m.who}</Text>
    {m.text.split('\n').map((line, i) => <Text key={i} wrap="wrap">{line}</Text>)}
    <Text>{''}</Text>
  </Box>
));

export function ChatScene() {
  const tempo = useTempo();
  const [msgs, setMsgs] = useState<Msg[]>(() => Array.from({ length: 6 }, (_, i) => ({
    id: i, who: i % 2 ? 'bot' : 'you', text: i % 2 ? `Earlier answer ${(i + 1) / 2}, kept here so there is something to scroll.` : `Earlier question ${i / 2 + 1}`,
  })));
  const [text, setText] = useState('');
  const [metrics, setMetrics] = useState<ScrollMetrics | null>(null);
  const nextId = useRef(100);
  const [answered, setAnswered] = useState(0);
  const scroll = useRef<ScrollBoxHandle>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const send = (value: string) => {
    if (value.trim() === '') return;
    setMsgs((m) => [...m, { id: nextId.current++, who: 'you', text: value }]);
    setText('');
    scroll.current?.scrollToEnd();
    const botId = nextId.current++;
    const words = REPLY.split(' ');
    let shown = 0;
    setMsgs((m) => [...m, { id: botId, who: 'bot', text: '' }]);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      shown += 2;
      setMsgs((m) => m.map((x) => (x.id === botId ? { ...x, text: words.slice(0, shown).join(' ') } : x)));
      if (shown >= words.length && timer.current) { clearInterval(timer.current); timer.current = null; setAnswered((n) => n + 1); }
    }, tempo(45));
  };

  const below = metrics ? metrics.maxScrollTop - metrics.scrollTop : 0;
  return (
    // flexShrink: Yoga defaults it to 0 — without it this box grows to its content
    // and the ScrollBox never gets a bounded height to scroll in.
    <Box flexDirection="column" flexGrow={1} flexShrink={1}>
      {/* One unbreakable status row: the script waits on "answered N", which a wrapped message line could split. */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text dim>{below > 0 ? `↓ ${below} rows below — scrolled up, the view holds still while the answer grows` : 'pinned to the newest line · wheel or PgUp/PgDn to scroll'}</Text>
        <Text dim>{`answered ${answered}`}</Text>
      </Box>
      <ScrollBox ref={scroll} flexGrow={1} flexShrink={1} anchor="bottom" scrollbar onMetrics={setMetrics}>
        {msgs.map((m) => <Message key={m.id} m={m} />)}
      </ScrollBox>
      <TextArea
        value={text} onChange={setText} onSubmit={send} isFocused maxRows={4}
        prefix={<Text color="blue" bold>{'› '}</Text>} continuationPrefix="  "
        placeholder="ask something · \ then Enter for a new line"
      />
    </Box>
  );
}
