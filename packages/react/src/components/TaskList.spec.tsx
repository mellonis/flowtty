import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../internal/render.js';
import { TaskList, type TaskItem } from './TaskList.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

// Fake only the spinner's interval so its frame is deterministic at index 0.
beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
afterEach(() => vi.useRealTimers());

describe('TaskList', () => {
  test('renders a state icon per task and the labels', async () => {
    const backend = new TestBackend(40, 6);
    const tasks: TaskItem[] = [
      { label: 'Install deps', state: 'success' },
      { label: 'Compile', state: 'running' },
      { label: 'Test', state: 'error', detail: '2 failing' },
      { label: 'Deploy', state: 'pending' },
      { label: 'Notify', state: 'skipped' },
    ];
    const r = await render(<TaskList tasks={tasks} />, backend);
    await flushAsync(backend);

    const frame = backend.lastFrame;
    expect(frame).toContain('✓');
    expect(frame).toContain('⠋');           // running spinner, frame 0
    expect(frame).toContain('✗');
    expect(frame).toContain('◌');
    expect(frame).toContain('↓');
    expect(frame).toContain('Install deps');
    expect(frame).toContain('2 failing');   // detail
    r.unmount();
  });

  test('defaults missing state to pending', async () => {
    const backend = new TestBackend(40, 2);
    const r = await render(<TaskList tasks={[{ label: 'Bare' }]} />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('◌');
    expect(backend.lastFrame).toContain('Bare');
    r.unmount();
  });

  test('advancing a task state re-renders the icon', async () => {
    const backend = new TestBackend(40, 2);
    function Harness() {
      const [done, setDone] = React.useState(false);
      // Flip to success on the first effect tick.
      React.useEffect(() => { setDone(true); }, []);
      return <TaskList tasks={[{ label: 'Step', state: done ? 'success' : 'running' }]} />;
    }
    const r = await render(<Harness />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('✓');
    r.unmount();
  });
});
