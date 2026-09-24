import React, { useState, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { DialogHost } from './DialogHost.js';
import { FocusGroup } from './FocusGroup.js';
import { TextInput } from './TextInput.js';
import { useInput } from '../hooks/useInput.js';
import { useDialog, useDialogHost } from '../hooks/useDialog.js';

// The delivery order is the mount order — children before parents — and it
// has to stay that way for the app's whole life: a dialog opening and closing,
// or a subtree muted and unmuted, must not move anyone in the queue.

async function mount(el: ReactNode) {
  const backend = new TestBackend(30, 8);
  const r = await render(el, backend);
  await flushAsync(backend);
  return { backend, unmount: r.unmount, settle: () => flushAsync(backend) };
}

function Closer(): ReactNode {
  const { done } = useDialog();
  useInput((key) => { if (key.name === 'escape') { done(undefined); return true; } });
  return <Text>dialog</Text>;
}

function Field(): ReactNode {
  const [v, setV] = useState('');
  return <FocusGroup><Box flexDirection="column"><TextInput value={v} onChange={setV} /></Box></FocusGroup>;
}

describe('delivery order stays the mount order', () => {
  test('after a dialog opened and closed, a focused field still hears a key before the root', async () => {
    const quit = vi.fn();
    let open!: () => void;
    function Host(): ReactNode {
      const { openDialog } = useDialogHost();
      open = () => { void openDialog(<Closer />, { floating: true }); };
      return <Field />;
    }
    // The root handler lives ABOVE the DialogHost, so it never resubscribes.
    function App(): ReactNode {
      useInput((key) => { if (key.name === 'q') quit(); });
      return <DialogHost><Host /></DialogHost>;
    }
    const { backend, settle, unmount } = await mount(<App />);
    backend.type('q');
    expect(quit).not.toHaveBeenCalled();           // the field took it
    open();
    await settle();
    backend.press({ name: 'escape' });             // the dialog closes
    await settle();
    backend.type('q');
    expect(quit).not.toHaveBeenCalled();           // still the field's, not the root's
    unmount();
  });

  test('after a subtree was muted and unmuted, its field still hears a key before the root', async () => {
    const quit = vi.fn();
    let setInert!: (v: boolean) => void;
    function App(): ReactNode {
      const [inert, set] = useState(false);
      setInert = set;
      useInput((key) => { if (key.name === 'q') quit(); });
      return <Box inert={inert}><Field /></Box>;
    }
    const { backend, settle, unmount } = await mount(<App />);
    backend.type('q');
    expect(quit).not.toHaveBeenCalled();
    setInert(true);
    await settle();
    backend.type('q');
    expect(quit).toHaveBeenCalledTimes(1);         // muted: the root hears it
    setInert(false);
    await settle();
    backend.type('q');
    expect(quit).toHaveBeenCalledTimes(1);         // the field is first again
    unmount();
  });
});

describe('useInput capture', () => {
  test('a capture handler hears a key before a focused field, and can consume it', async () => {
    const seen: string[] = [];
    function App(): ReactNode {
      useInput((key) => { seen.push(`root:${key.name}`); return key.name === 'q'; }, { capture: true });
      return <Field />;
    }
    const { backend, settle, unmount } = await mount(<App />);
    expect(backend.press({ name: 'q' })).toBe(true);
    backend.type('a');
    await settle();
    expect(seen).toEqual(['root:q', 'root:a']);
    expect(backend.lastFrame.split('\n')[0]).toContain('a');   // 'a' went on to the field
    expect(backend.lastFrame.split('\n')[0]).not.toContain('q');
    unmount();
  });

  test('capture handlers hear a key in mount order among themselves, before every ordinary one', async () => {
    const seen: string[] = [];
    function Child(): ReactNode {
      useInput((key) => { seen.push(`child-capture:${key.name}`); }, { capture: true });
      useInput((key) => { seen.push(`child:${key.name}`); });
      return <Text>x</Text>;
    }
    function App(): ReactNode {
      useInput((key) => { seen.push(`root-capture:${key.name}`); }, { capture: true });
      useInput((key) => { seen.push(`root:${key.name}`); });
      return <Child />;
    }
    const { backend, unmount } = await mount(<App />);
    backend.press({ name: 'k' });
    expect(seen).toEqual(['child-capture:k', 'root-capture:k', 'child:k', 'root:k']);
    unmount();
  });

  test('a capture handler under a muted host is muted like the rest', async () => {
    const seen: string[] = [];
    let open!: () => void;
    function Host(): ReactNode {
      const { openDialog } = useDialogHost();
      open = () => { void openDialog(<Closer />, { floating: true }); };
      useInput((key) => { seen.push(key.name); }, { capture: true });
      return <Text>host</Text>;
    }
    const { backend, settle, unmount } = await mount(<DialogHost><Host /></DialogHost>);
    backend.press({ name: 'a' });
    open();
    await settle();
    backend.press({ name: 'b' });
    expect(seen).toEqual(['a']);
    unmount();
  });
});

describe('useInput fallback', () => {
  test('a fallback handler hears only what nobody consumed, after every ordinary handler', async () => {
    const seen: string[] = [];
    function App(): ReactNode {
      useInput((key) => { seen.push(`fallback:${key.name}`); return key.name === 'q'; }, { fallback: true });
      useInput((key) => { seen.push(`root:${key.name}`); });
      return <Field />;
    }
    const { backend, unmount } = await mount(<App />);
    expect(backend.press({ name: 'a' })).toBe(true);          // the field took it: no fallback
    expect(backend.press({ name: 'tab' })).toBe(false);       // nowhere to go: falls all the way through
    expect(backend.press({ name: 'q' })).toBe(true);          // typed into the field — consumed there
    backend.press({ name: 'escape' });                        // nothing binds it: the fallback hears it
    expect(seen).toEqual(['root:tab', 'fallback:tab', 'root:escape', 'fallback:escape']);
    unmount();
  });

  test('phases run capture, ordinary, fallback; fallbacks in mount order; a consuming fallback stops the rest', async () => {
    const seen: string[] = [];
    function Child(): ReactNode {
      useInput((key) => { seen.push(`child-fallback:${key.name}`); return true; }, { fallback: true });
      useInput((key) => { seen.push(`child:${key.name}`); });
      return <Text>x</Text>;
    }
    function App(): ReactNode {
      useInput((key) => { seen.push(`root-fallback:${key.name}`); }, { fallback: true });
      useInput((key) => { seen.push(`root-capture:${key.name}`); }, { capture: true });
      useInput((key) => { seen.push(`root:${key.name}`); });
      return <Child />;
    }
    const { backend, unmount } = await mount(<App />);
    expect(backend.press({ name: 'k' })).toBe(true);
    expect(seen).toEqual(['root-capture:k', 'child:k', 'root:k', 'child-fallback:k']);
    unmount();
  });

  test('a fallback under a muted host is muted like the rest', async () => {
    const seen: string[] = [];
    let open!: () => void;
    function Host(): ReactNode {
      const { openDialog } = useDialogHost();
      open = () => { void openDialog(<Closer />, { floating: true }); };
      useInput((key) => { seen.push(key.name); }, { fallback: true });
      return <Text>host</Text>;
    }
    const { backend, settle, unmount } = await mount(<DialogHost><Host /></DialogHost>);
    backend.press({ name: 'a' });
    open();
    await settle();
    backend.press({ name: 'b' });
    expect(seen).toEqual(['a']);
    unmount();
  });
});
