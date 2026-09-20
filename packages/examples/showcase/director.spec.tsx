import React, { useState } from 'react';
import { describe, test, expect } from 'vitest';
import { render, Text, TextInput, useInput } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { ScriptedBackend, play, type, press, paste, wait, waitFor } from './director.js';

function Probe() {
  const [value, setValue] = useState('');
  const [log, setLog] = useState<string[]>([]);
  useInput((key) => { if (key.name === 'f2') setTimeout(() => setLog((l) => [...l, 'late']), 40); });
  return (
    <>
      <TextInput value={value} onChange={setValue} isFocused onSubmit={(v) => setLog((l) => [...l, `sent:${v}`])} />
      <Text>{log.join(' ')}</Text>
    </>
  );
}

describe('showcase director', () => {
  test('types, presses and pastes into the app through the wrapped backend', async () => {
    const inner = new TestBackend(30, 3);
    const backend = new ScriptedBackend(inner);
    const app = await render(<Probe />, backend);
    await play(backend, [type('hi'), paste(' there'), press('return')], { speed: Infinity });
    await flushAsync(inner);
    expect(inner.lastFrame).toContain('sent:hi there');
    app.unmount();
  });

  test('waitFor blocks until the app shows the text on its own clock', async () => {
    const inner = new TestBackend(30, 3);
    const backend = new ScriptedBackend(inner);
    const app = await render(<Probe />, backend);
    await play(backend, [press('f2'), waitFor('late'), type('x')], { speed: Infinity });
    await flushAsync(inner);
    expect(inner.lastFrame).toContain('late');
    app.unmount();
  });

  test('a waitFor that never comes true throws with the last frame', async () => {
    const backend = new ScriptedBackend(new TestBackend(30, 3));
    const app = await render(<Probe />, backend);
    await expect(play(backend, [waitFor('never', 60)], { speed: Infinity })).rejects.toThrow(/never/);
    app.unmount();
  });

  test('real keys still reach the app and are reported to onRealKey; injected ones are not', async () => {
    const inner = new TestBackend(30, 3);
    const backend = new ScriptedBackend(inner);
    const real: string[] = [];
    backend.onRealKey = (k) => real.push(k.name);
    const app = await render(<Probe />, backend);
    inner.type('a');
    await play(backend, [type('b'), wait(1)], { speed: Infinity });
    await flushAsync(inner);
    expect(inner.lastFrame).toContain('ab');
    expect(real).toEqual(['a']);
    app.unmount();
  });

  test('the gate pauses playback between keys', async () => {
    const inner = new TestBackend(30, 3);
    const backend = new ScriptedBackend(inner);
    const app = await render(<Probe />, backend);
    let open!: () => void;
    let gate: Promise<void> = Promise.resolve();
    const playing = play(backend, [type('ab')], { speed: Infinity, gate: () => gate });
    gate = new Promise<void>((resolve) => { open = resolve; }); // pause right after the script starts
    await flushAsync(inner);
    const whilePaused = inner.lastFrame;
    open();
    await playing;
    await flushAsync(inner);
    expect(whilePaused.trim().length).toBeLessThan(2);
    expect(inner.lastFrame).toContain('ab');
    app.unmount();
  });
});
