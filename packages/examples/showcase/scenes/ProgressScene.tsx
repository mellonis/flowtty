import React, { useEffect, useState } from 'react';
import { Box, Text, Spinner, ProgressBar, TaskList, useInput, type TaskItem } from '@flowtty/react';
import { useTempo } from '../tempo.js';

const STEPS = ['install dependencies', 'typecheck', 'run 657 tests', 'build four packages', 'publish to the registry'];

export function ProgressScene() {
  const tempo = useTempo();
  // `tick` counts half-steps: a task is "running" for one tick, then done.
  const [tick, setTick] = useState(0);
  const total = STEPS.length * 2;
  useEffect(() => {
    if (tick >= total) return;
    const t = setTimeout(() => setTick((n) => n + 1), tempo(420));
    return () => clearTimeout(t);
  }, [tick, total, tempo]);
  useInput((key) => { if (key.name === 'r') setTick(0); });

  const done = Math.floor(tick / 2);
  const tasks: TaskItem[] = STEPS.map((label, i) => ({
    label,
    state: i < done ? 'success' : i === done && tick < total ? 'running' : 'pending',
    detail: i < done ? 'ok' : undefined,
  }));
  const finished = tick >= total;
  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} gap={1}>
      <Box flexDirection="column" border="round" borderTitle=" <TaskList> " paddingX={1}>
        <TaskList tasks={tasks} />
      </Box>
      <Box flexDirection="column" border="round" borderTitle=" <ProgressBar> " paddingX={1}>
        <ProgressBar value={tick} total={total} color={finished ? 'green' : 'cyan'} />
        <Text dim>{`${done}/${STEPS.length} done`}</Text>
      </Box>
      <Box flexDirection="row" gap={3} border="round" borderTitle=" <Spinner> " paddingX={1}>
        {finished
          ? <Text color="green" bold>released ✓  — press r to run it again</Text>
          : (<><Spinner type="dots" label="working" color="cyan" /><Spinner type="line" label="line" /><Spinner type="arc" label="arc" color="magenta" /></>)}
      </Box>
    </Box>
  );
}
