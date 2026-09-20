import React, { useState } from 'react';
import { Box, Text, TextInput, Select, MultiSelect, Button, FocusGroup } from '@flowtty/react';

const PLANS = [{ label: 'Hobby', value: 'hobby' }, { label: 'Team', value: 'team' }, { label: 'Enterprise', value: 'enterprise' }];

export function FormScene() {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('hobby');
  const [features, setFeatures] = useState([
    { label: 'Tables', value: 'tables' }, { label: 'Markdown', value: 'markdown' }, { label: 'Scrolling', value: 'scrolling' },
  ]);
  const [picked, setPicked] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  return (
    <Box flexDirection="row" gap={2} flexGrow={1} flexShrink={1}>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} border="round" borderTitle=" New project " paddingX={1}>
        <FocusGroup>
          <Text dim>Name — Enter validates, Tab moves on</Text>
          <TextInput value={name} onChange={(v) => { setName(v); setSaved(false); }} validate={(v) => (v.trim() ? null : 'a name is required')} />
          <Text>{''}</Text>
          <Text dim>Plan — ↑/↓</Text>
          <Select items={PLANS} value={plan} onChange={setPlan} onSubmit={setPlan} />
          <Text>{''}</Text>
          <Text dim>Features — Space toggles · “+ add new” adds one</Text>
          <MultiSelect
            items={features} value={picked} onChange={setPicked} onSubmit={() => {}}
            onAddNew={() => {
              const value = 'mouse';
              setFeatures((cur) => (cur.some((f) => f.value === value) ? cur : [...cur, { label: 'Mouse wheel', value }]));
              return value;
            }}
          />
          <Text>{''}</Text>
          <Button label="Save" onPress={() => setSaved(name.trim() !== '')} />
        </FocusGroup>
      </Box>
      <Box flexDirection="column" width={36} border="round" borderTitle=" Live state " paddingX={1}>
        <Box flexDirection="row"><Text dim>name     </Text><Text color="cyan">{JSON.stringify(name)}</Text></Box>
        <Box flexDirection="row"><Text dim>plan     </Text><Text color="cyan">{plan}</Text></Box>
        <Text dim>features</Text>
        {picked.length === 0 ? <Text dim>  (none)</Text> : picked.map((p) => <Text key={p} color="green">{`  ✓ ${p}`}</Text>)}
        <Text>{''}</Text>
        {saved ? <Text bold color="green">Saved ✓</Text> : <Text dim>not saved yet</Text>}
      </Box>
    </Box>
  );
}
