import React from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { Spinner, type SpinnerType } from './Spinner.js';

export type TaskState = 'pending' | 'running' | 'success' | 'error' | 'skipped';

export interface TaskItem {
  label: string;
  /** Default 'pending'. */
  state?: TaskState;
  /** Optional status text shown dimmed after the label. */
  detail?: string;
}

export interface TaskListProps {
  tasks: TaskItem[];
  /** Spinner set used for 'running' tasks. Default 'dots'. */
  spinnerType?: SpinnerType;
}

const ICON: Record<Exclude<TaskState, 'running'>, { glyph: string; color?: string; dim?: boolean }> = {
  pending: { glyph: '◌', dim: true },
  success: { glyph: '✓', color: 'green' },
  error: { glyph: '✗', color: 'red' },
  skipped: { glyph: '↓', color: 'yellow', dim: true },
};

function TaskRow({ task, spinnerType }: { task: TaskItem; spinnerType: SpinnerType }) {
  const state = task.state ?? 'pending';
  return (
    <Box flexDirection="row">
      <Box width={2}>
        {state === 'running'
          ? <Spinner type={spinnerType} />
          : <Text color={ICON[state].color} dim={ICON[state].dim}>{ICON[state].glyph}</Text>}
      </Box>
      <Box flexGrow={1} flexDirection="row">
        <Text dim={state === 'pending'}>{task.label}</Text>
        {task.detail ? <Text dim>{` — ${task.detail}`}</Text> : null}
      </Box>
    </Box>
  );
}

/**
 * A vertical checklist of tasks, each with a state icon: ◌ pending, an animated
 * spinner while running, ✓ success, ✗ error, ↓ skipped. Driven by props — update
 * a task's `state` and re-render to advance it (e.g. as steps of a deploy or
 * build complete).
 */
export function TaskList({ tasks, spinnerType = 'dots' }: TaskListProps) {
  return (
    <Box flexDirection="column">
      {tasks.map((t, i) => <TaskRow key={i} task={t} spinnerType={spinnerType} />)}
    </Box>
  );
}
