import React, { useState } from 'react';
import { Box, Text, TextInput, Select, ListSelect, ListMultiSelect, Checkbox, Button, FocusGroup } from '@flowtty/react';

const PLANS = [{ label: 'Hobby', value: 'hobby' }, { label: 'Team', value: 'team' }, { label: 'Enterprise', value: 'enterprise' }];
const REGIONS = [{ label: 'Europe (Frankfurt)', value: 'eu' }, { label: 'US East (Virginia)', value: 'us-east' }, { label: 'US West (Oregon)', value: 'us-west' }, { label: 'Asia (Tokyo)', value: 'ap' }];
const TAGS = [{ label: 'backend', value: 'backend' }, { label: 'frontend', value: 'frontend' }, { label: 'infra', value: 'infra' }, { label: 'docs', value: 'docs' }];

export function FormScene() {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('hobby');
  const [features, setFeatures] = useState([
    { label: 'Tables', value: 'tables' }, { label: 'Markdown', value: 'markdown' }, { label: 'Scrolling', value: 'scrolling' },
  ]);
  const [picked, setPicked] = useState<string[]>([]);
  const [region, setRegion] = useState<string | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [notify, setNotify] = useState(false);
  const [saved, setSaved] = useState(false);
  const allFeatures = picked.length === 0 ? false : picked.length === features.length ? true : 'mixed';

  return (
    <Box flexDirection="row" gap={2} flexGrow={1} flexShrink={1}>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} border="round" borderTitle=" New project " paddingX={1}>
        <FocusGroup>
          <Text dim>Name — Enter validates, Tab moves on</Text>
          <TextInput value={name} onChange={(v) => { setName(v); setSaved(false); }} validate={(v) => (v.trim() ? null : 'a name is required')} />
          <Text>{''}</Text>
          <Text dim>Plan — ↑/↓</Text>
          <ListSelect items={PLANS} value={plan} onChange={setPlan} onSubmit={setPlan} />
          <Text>{''}</Text>
          <Text dim>Features — Space toggles · “+ add new” adds one · the checkbox above is mixed while some are picked</Text>
          <Checkbox label="select all" checked={allFeatures} onChange={(on) => setPicked(on ? features.map((f) => f.value) : [])} />
          <ListMultiSelect
            items={features} value={picked} onChange={setPicked} onSubmit={() => {}}
            onAddNew={() => {
              const value = 'mouse';
              setFeatures((cur) => (cur.some((f) => f.value === value) ? cur : [...cur, { label: 'Mouse wheel', value }]));
              return value;
            }}
          />
          <Text>{''}</Text>
          <Text dim>Region — Enter opens a dropdown, typing filters it</Text>
          <Select items={REGIONS} value={region} onChange={setRegion} width={24} placeholder="pick a region" />
          <Text>{''}</Text>
          <Text dim>Tags — a dropdown with Space toggling</Text>
          <Select multiple items={TAGS} value={tags} onChange={setTags} width={24} />
          <Text>{''}</Text>
          <Checkbox label="notify me when it is ready" checked={notify} onChange={setNotify} frame="none" />
          <Text>{''}</Text>
          <Button label="Save" onPress={() => setSaved(name.trim() !== '')} />
        </FocusGroup>
      </Box>
      <Box flexDirection="column" width={36} border="round" borderTitle=" Live state " paddingX={1}>
        <Box flexDirection="row"><Text dim>name     </Text><Text color="cyan">{JSON.stringify(name)}</Text></Box>
        <Box flexDirection="row"><Text dim>plan     </Text><Text color="cyan">{plan}</Text></Box>
        <Box flexDirection="row"><Text dim>region   </Text><Text color="cyan">{region ?? '—'}</Text></Box>
        <Box flexDirection="row"><Text dim>tags     </Text><Text color="cyan">{tags.join(', ') || '—'}</Text></Box>
        <Box flexDirection="row"><Text dim>notify   </Text><Text color="cyan">{String(notify)}</Text></Box>
        <Text dim>features</Text>
        {picked.length === 0 ? <Text dim>  (none)</Text> : picked.map((p) => <Text key={p} color="green">{`  ✓ ${p}`}</Text>)}
        <Text>{''}</Text>
        {saved ? <Text bold color="green">Saved ✓</Text> : <Text dim>not saved yet</Text>}
      </Box>
    </Box>
  );
}
