import React from "react";
import { describe, expect, test, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { render } from '../index.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { DialogHost } from './DialogHost.js';
import { useDialog, useDialogHost } from '../hooks/useDialog.js';
import { useInput } from '../hooks/useInput.js';
import type { DialogResult, DialogResultApi } from '../context/dialogContext.js';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { Button } from './Button.js';

describe('DialogHost stack', () => {
  test('two consecutive openDialog calls stack instead of cancelling', async () => {
    // First openDialog returns a promise that does NOT resolve when second opens.
    // The first dialog stays alive (its promise is unresolved).
    const backend = new TestBackend(20, 5);
    let openA!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    function Host() {
      const { openDialog } = useDialogHost();
      openA = openDialog;
      return createElement('flowtty-box', { width: 20, height: 5 });
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync(backend);
    const a = openA(createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }));
    const b = openA(createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }));
    await flushAsync(backend);
    // Let the tree settle — neither dialog should have resolved.
    let resolvedA = false; let resolvedB = false;
    a.then(() => { resolvedA = true; });
    b.then(() => { resolvedB = true; });
    await flushAsync(backend);
    expect(resolvedA).toBe(false);
    expect(resolvedB).toBe(false);
    handle.unmount();
  });

  test('close (via dialogApi.done) resolves the TOP dialog only; lower stays open', async () => {
    const backend = new TestBackend(20, 5);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    let topApi: DialogResultApi | null = null;
    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      return createElement('flowtty-box', { width: 20, height: 5 });
    }
    function CaptureApi() {
      topApi = useDialog();
      return null;
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync(backend);
    // Stack: a (bottom), b (top)
    const a = openD<string>(createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }));
    const b = openD<string>(createElement(CaptureApi));
    await flushAsync(backend);
    expect(topApi).not.toBeNull();
    let aResult: DialogResult<string> | null = null;
    let bResult: DialogResult<string> | null = null;
    a.then((r) => { aResult = r; });
    b.then((r) => { bResult = r; });
    topApi!.done('top-result');
    await flushAsync(backend);
    // b resolved; a still pending
    expect(bResult).not.toBeNull();
    expect(bResult).toEqual({ status: 'done', value: 'top-result' });
    expect(aResult).toBeNull();
    handle.unmount();
  });

  test('a lower (non-top) dialog resolving async closes ITS OWN entry, not the top', async () => {
    const backend = new TestBackend(20, 5);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    let apiA: DialogResultApi | null = null;
    let apiB: DialogResultApi | null = null;
    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      return null;
    }
    function Capture({ into }: { into: (api: DialogResultApi) => void }) {
      into(useDialog());
      return null;
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync(backend);
    // Stack: a (bottom), b (top). Each binds its own result API.
    const a = openD<string>(createElement(Capture, { into: (api: DialogResultApi) => { apiA = api; } }));
    await flushAsync(backend);
    const b = openD<string>(createElement(Capture, { into: (api: DialogResultApi) => { apiB = api; } }));
    await flushAsync(backend);
    expect(apiA).not.toBeNull();
    expect(apiB).not.toBeNull();
    let aResult: DialogResult<string> | null = null;
    let bResult: DialogResult<string> | null = null;
    a.then((r) => { aResult = r; });
    b.then((r) => { bResult = r; });
    // Resolve the LOWER dialog (simulating an async timer in a non-top dialog).
    // The old shared API would have popped b (the top); the per-entry API pops a.
    apiA!.done('from-lower');
    await flushAsync(backend);
    expect(aResult).toEqual({ status: 'done', value: 'from-lower' });
    expect(bResult).toBeNull(); // top dialog stays open
    handle.unmount();
  });

  test('three-deep stack: pop one at a time in order', async () => {
    const backend = new TestBackend(20, 5);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    const apis: DialogResultApi[] = [];
    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      return null;
    }
    function CaptureApi() {
      apis.push(useDialog());
      return null;
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync(backend);
    const p1 = openD<string>(createElement(CaptureApi));
    await flushAsync(backend);
    const p2 = openD<string>(createElement(CaptureApi));
    await flushAsync(backend);
    const p3 = openD<string>(createElement(CaptureApi));
    await flushAsync(backend);
    // Apis array now has at least 3 entries (one per mount); the LAST one is
    // the top dialog's. Easier path: each Capture appends; the most recently
    // pushed one is the top.
    const topApi = apis[apis.length - 1]!;
    const results: Array<DialogResult<string> | null> = [null, null, null];
    p1.then((r) => { results[0] = r; });
    p2.then((r) => { results[1] = r; });
    p3.then((r) => { results[2] = r; });
    // Pop p3
    topApi.done('three');
    await flushAsync(backend);
    expect(results[2]).toEqual({ status: 'done', value: 'three' });
    expect(results[1]).toBeNull();
    expect(results[0]).toBeNull();
    // Now p2 is top; its api should be in apis. After p3 popped, render fires
    // again — Capture inside p2 was already mounted; its api is in apis at
    // index apis.length - 2 (before the p3 capture). All dialog components
    // share dialogApi which always pops top — so call apis[<any>].done.
    apis[apis.length - 2]!.done('two');
    await flushAsync(backend);
    expect(results[1]).toEqual({ status: 'done', value: 'two' });
    expect(results[0]).toBeNull();
    // Pop p1
    apis[apis.length - 3]!.done('one');
    await flushAsync(backend);
    expect(results[0]).toEqual({ status: 'done', value: 'one' });
    handle.unmount();
  });

  test('useInput in a lower dialog does NOT fire while a higher dialog is open', async () => {
    const backend = new TestBackend(20, 5);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    const lowerKeys: string[] = [];
    const upperKeys: string[] = [];
    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      return null;
    }
    function LowerDialog() {
      useInput((key) => { lowerKeys.push(key.name); });
      return null;
    }
    function UpperDialog() {
      useInput((key) => { upperKeys.push(key.name); });
      return null;
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync(backend);
    openD(createElement(LowerDialog));
    await flushAsync(backend);
    openD(createElement(UpperDialog));
    await flushAsync(backend);
    backend.press({ name: 'x', sequence: 'x', ctrl: false, meta: false, shift: false });
    await flushAsync(backend);
    expect(upperKeys).toEqual(['x']);
    expect(lowerKeys).toEqual([]); // muted while upper is on top
    handle.unmount();
  });

  test('host content useInput is muted while ANY dialog is open', async () => {
    const backend = new TestBackend(20, 5);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    const hostKeys: string[] = [];
    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      useInput((key) => { hostKeys.push(key.name); });
      return null;
    }
    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync(backend);
    // Before any dialog: host receives keys.
    backend.press({ name: 'a', sequence: 'a', ctrl: false, meta: false, shift: false });
    await flushAsync(backend);
    expect(hostKeys).toEqual(['a']);
    // Open a dialog; host is now muted.
    openD(createElement('flowtty-box', { width: 1, height: 1 }));
    await flushAsync(backend);
    backend.press({ name: 'b', sequence: 'b', ctrl: false, meta: false, shift: false });
    await flushAsync(backend);
    expect(hostKeys).toEqual(['a']); // 'b' did NOT reach host
    handle.unmount();
  });

  test('each dialog has its own focus scope; Tab cycles within top dialog only', async () => {
    const backend = new TestBackend(30, 10);
    let openD!: <T>(el: ReactNode) => Promise<DialogResult<T>>;
    let topApi: DialogResultApi | null = null;

    const lowerBtn1 = vi.fn();
    const lowerBtn2 = vi.fn();
    const upperBtn1 = vi.fn();
    const upperBtn2 = vi.fn();

    function Host() {
      const { openDialog } = useDialogHost();
      openD = openDialog;
      return null;
    }
    function CaptureApi() {
      topApi = useDialog();
      return null;
    }

    const handle = await render(
      createElement(DialogHost, {}, createElement(Host)),
      backend,
    );
    await flushAsync(backend);

    // Open lower dialog with 2 buttons.
    openD(
      createElement(Box, { flexDirection: 'column' },
        createElement(Button, { label: 'L1', onPress: lowerBtn1 }),
        createElement(Button, { label: 'L2', onPress: lowerBtn2 }),
      ),
    );
    await flushAsync(backend);

    // Open upper dialog with 2 buttons + api capture.
    openD(
      createElement(Box, { flexDirection: 'column' },
        createElement(Button, { label: 'U1', onPress: upperBtn1 }),
        createElement(Button, { label: 'U2', onPress: upperBtn2 }),
        createElement(CaptureApi),
      ),
    );
    await flushAsync(backend);
    await flushAsync(backend);

    // Upper dialog is active; U1 is auto-focused. Enter fires U1.
    backend.press({ name: 'return' });
    await flushAsync(backend);
    expect(upperBtn1).toHaveBeenCalledTimes(1);
    expect(lowerBtn1).not.toHaveBeenCalled();

    // Tab in upper moves focus to U2. Enter fires U2.
    backend.press({ name: 'tab' });
    await flushAsync(backend);
    backend.press({ name: 'return' });
    await flushAsync(backend);
    expect(upperBtn2).toHaveBeenCalledTimes(1);
    expect(lowerBtn1).not.toHaveBeenCalled();
    expect(lowerBtn2).not.toHaveBeenCalled();

    // Close the top dialog.
    topApi!.done(null);
    await flushAsync(backend);

    // Lower dialog is now top. Its FocusGroup was never reset — L1 is still
    // auto-focused (it was first to register and focus was never stolen).
    backend.press({ name: 'return' });
    await flushAsync(backend);
    expect(lowerBtn1).toHaveBeenCalledTimes(1);

    // Tab in lower moves focus to L2. Enter fires L2.
    backend.press({ name: 'tab' });
    await flushAsync(backend);
    backend.press({ name: 'return' });
    await flushAsync(backend);
    expect(lowerBtn2).toHaveBeenCalledTimes(1);

    handle.unmount();
  });

  describe('on a bounded-region backend (fullScreen=false)', () => {
    test('warns once when openDialog is called WITHOUT floating, suggesting floating:true', async () => {
      const tb = new TestBackend(40, 4);
      const inlineLike: any = Object.assign(tb, { fullScreen: false });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        let host: { openDialog: (e: ReactNode, o?: any) => Promise<any> } | null = null;
        function Inner() {
          host = useDialogHost();
          return null;
        }
        const handle = await render(createElement(DialogHost, null, createElement(Inner)), inlineLike);
        await flushAsync(tb);
        void host!.openDialog(createElement(Box, null, 'x'));
        // Same call signature → should NOT warn a second time.
        void host!.openDialog(createElement(Box, null, 'y'));
        await flushAsync(tb);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('floating: true');
        handle.unmount();
      } finally {
        warn.mockRestore();
      }
    });

    test('does NOT warn when openDialog is called WITH floating:true', async () => {
      const tb = new TestBackend(40, 4);
      const inlineLike: any = Object.assign(tb, { fullScreen: false });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        let host: { openDialog: (e: ReactNode, o?: any) => Promise<any> } | null = null;
        function Inner() {
          host = useDialogHost();
          return null;
        }
        const handle = await render(createElement(DialogHost, null, createElement(Inner)), inlineLike);
        await flushAsync(tb);
        void host!.openDialog(createElement(Box, null, 'x'), { floating: true, minWidth: 10 });
        await flushAsync(tb);
        expect(warn).not.toHaveBeenCalled();
        handle.unmount();
      } finally {
        warn.mockRestore();
      }
    });

    test('does NOT warn on a full-screen backend regardless of options', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        let host: { openDialog: (e: ReactNode, o?: any) => Promise<any> } | null = null;
        function Inner() {
          host = useDialogHost();
          return null;
        }
        const backend = new TestBackend(40, 4);
        const handle = await render(
          createElement(DialogHost, null, createElement(Inner)),
          backend,
        );
        await flushAsync(backend);
        void host!.openDialog(createElement(Box, null, 'x'));
        await flushAsync(backend);
        expect(warn).not.toHaveBeenCalled();
        handle.unmount();
      } finally {
        warn.mockRestore();
      }
    });
  });
});

// ─── backdrop ────────────────────────────────────────────────────────────────

function BackdropApp({ hostBackdrop, dialogBackdrop, stacked }: { hostBackdrop?: boolean; dialogBackdrop?: boolean; stacked?: boolean }) {
  function Opener() {
    const { openDialog } = useDialogHost();
    useInput((key) => {
      if (key.name !== 'o') return;
      const opts = { floating: true, title: 'one', ...(dialogBackdrop !== undefined ? { backdrop: dialogBackdrop } : {}) };
      void openDialog(createElement(Text, null, 'first'), opts);
      if (stacked) void openDialog(createElement(Text, null, 'second'), { ...opts, title: 'two' });
    });
    return createElement(Text, { color: 'red' }, 'host content in the corner');
  }
  return createElement(DialogHost, hostBackdrop === undefined ? null : { backdrop: hostBackdrop }, createElement(Opener));
}

test('<DialogHost backdrop> dims the content behind a floating dialog and keeps the dialog bright', async () => {
  const backend = new TestBackend(40, 9);
  await render(createElement(BackdropApp, { hostBackdrop: true }), backend);
  expect(backend.lastBuffer!.get(0, 0).style.dim).toBeFalsy();
  backend.press({ name: 'o' });
  await flushAsync(backend);
  const buf = backend.lastBuffer!;
  expect(buf.get(0, 0).char).toBe('h');                  // still readable…
  expect(buf.get(0, 0).style).toMatchObject({ dim: true, fg: 'red' }); // …but pushed back
  const frame = backend.lastFrame.split('\n');
  const y = frame.findIndex((l) => l.includes('first'));
  const x = frame[y]!.indexOf('first');
  expect(buf.get(x, y).style.dim).toBeFalsy();           // the dialog itself is not dimmed
});

test('no backdrop unless asked for; a dialog can opt in or out on its own', async () => {
  const plain = new TestBackend(40, 9);
  await render(createElement(BackdropApp, {}), plain);
  plain.press({ name: 'o' });
  await flushAsync(plain);
  expect(plain.lastBuffer!.get(0, 0).style.dim).toBeFalsy();

  const optIn = new TestBackend(40, 9);
  await render(createElement(BackdropApp, { dialogBackdrop: true }), optIn);
  optIn.press({ name: 'o' });
  await flushAsync(optIn);
  expect(optIn.lastBuffer!.get(0, 0).style.dim).toBe(true);

  const optOut = new TestBackend(40, 9);
  await render(createElement(BackdropApp, { hostBackdrop: true, dialogBackdrop: false }), optOut);
  optOut.press({ name: 'o' });
  await flushAsync(optOut);
  expect(optOut.lastBuffer!.get(0, 0).style.dim).toBeFalsy();
});

test('stacked dialogs: the lower dialog is dimmed by the one above it, the host content is not dimmed twice', async () => {
  const one = new TestBackend(40, 9);
  await render(createElement(BackdropApp, { hostBackdrop: true }), one);
  one.press({ name: 'o' });
  await flushAsync(one);

  const two = new TestBackend(40, 9);
  await render(createElement(BackdropApp, { hostBackdrop: true, stacked: true }), two);
  two.press({ name: 'o' });
  await flushAsync(two);

  expect(two.lastBuffer!.get(0, 0)).toEqual(one.lastBuffer!.get(0, 0)); // same cell, one dialog or two
  const frame = two.lastFrame.split('\n');
  const y = frame.findIndex((l) => l.includes('second'));
  expect(two.lastBuffer!.get(frame[y]!.indexOf('second'), y).style.dim).toBeFalsy();
});

// ─── anchored placement ───────────────────────────────────────────────────────

async function anchored(anchor: { left: number; top: number; width: number; height: number }, height = 3) {
  const backend = new TestBackend(20, 8);
  let open!: (el: ReactNode, o: object) => Promise<unknown>;
  function Host() {
    open = useDialogHost().openDialog;
    return createElement('flowtty-box', { width: 20, height: 8 });
  }
  const handle = await render(createElement(DialogHost, {}, createElement(Host)), backend);
  await flushAsync(backend);
  void open(createElement(Text, null, 'opt'), { floating: true, anchor, height });
  await flushAsync(backend);
  const frame = backend.lastFrame.split('\n');
  const y = frame.findIndex((l) => l.includes('opt'));
  const x = frame[y]!.indexOf('opt');
  const boxLeft = frame[y]!.search(/\S/);
  handle.unmount();
  return { y, x, boxLeft, frame };
}

test('an anchored floating dialog sits under the anchor, flush with its left edge, at least as wide', async () => {
  const { y, x, boxLeft, frame } = await anchored({ left: 2, top: 1, width: 8, height: 1 });
  expect(y).toBe(3);                          // anchor row 1, popup rows 2..4, text on row 3
  expect(boxLeft).toBe(2);                    // the border starts at the anchor's left edge
  expect(x).toBe(3);
  expect(frame[2]!.trimEnd()).toHaveLength(10); // 8 wide: the anchor's width, not the text's
  expect(frame[2]![2]).not.toBe(' ');         // a border row above…
  expect(frame[4]![2]).not.toBe(' ');         // …and below
});

test('an anchored dialog flips above the anchor when there is no room below', async () => {
  const { y, boxLeft } = await anchored({ left: 2, top: 7, width: 8, height: 1 });
  expect(y).toBe(5);                          // popup rows 4..6, just above row 7
  expect(boxLeft).toBe(2);
});

test('an anchored dialog is shifted left to stay inside the screen', async () => {
  const { y, boxLeft } = await anchored({ left: 15, top: 1, width: 8, height: 1 });
  expect(y).toBe(3);
  expect(boxLeft).toBe(12);                   // 12 + 8 = 20, the right edge
});
