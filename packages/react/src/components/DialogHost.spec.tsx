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
    await flushAsync();
    const a = openA(createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }));
    const b = openA(createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'blue' }));
    await flushAsync();
    // Race a non-promise tick — neither should be resolved yet.
    let resolvedA = false; let resolvedB = false;
    a.then(() => { resolvedA = true; });
    b.then(() => { resolvedB = true; });
    await flushAsync();
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
    await flushAsync();
    // Stack: a (bottom), b (top)
    const a = openD<string>(createElement('flowtty-box', { width: 1, height: 1, backgroundColor: 'red' }));
    const b = openD<string>(createElement(CaptureApi));
    await flushAsync();
    expect(topApi).not.toBeNull();
    let aResult: DialogResult<string> | null = null;
    let bResult: DialogResult<string> | null = null;
    a.then((r) => { aResult = r; });
    b.then((r) => { bResult = r; });
    topApi!.done('top-result');
    await flushAsync();
    // b resolved; a still pending
    expect(bResult).not.toBeNull();
    expect(bResult).toEqual({ status: 'done', value: 'top-result' });
    expect(aResult).toBeNull();
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
    await flushAsync();
    const p1 = openD<string>(createElement(CaptureApi));
    await flushAsync();
    const p2 = openD<string>(createElement(CaptureApi));
    await flushAsync();
    const p3 = openD<string>(createElement(CaptureApi));
    await flushAsync();
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
    await flushAsync();
    expect(results[2]).toEqual({ status: 'done', value: 'three' });
    expect(results[1]).toBeNull();
    expect(results[0]).toBeNull();
    // Now p2 is top; its api should be in apis. After p3 popped, render fires
    // again — Capture inside p2 was already mounted; its api is in apis at
    // index apis.length - 2 (before the p3 capture). All dialog components
    // share dialogApi which always pops top — so call apis[<any>].done.
    apis[apis.length - 2]!.done('two');
    await flushAsync();
    expect(results[1]).toEqual({ status: 'done', value: 'two' });
    expect(results[0]).toBeNull();
    // Pop p1
    apis[apis.length - 3]!.done('one');
    await flushAsync();
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
    await flushAsync();
    openD(createElement(LowerDialog));
    await flushAsync();
    openD(createElement(UpperDialog));
    await flushAsync();
    backend.press({ name: 'x', sequence: 'x', ctrl: false, meta: false, shift: false });
    await flushAsync();
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
    await flushAsync();
    // Before any dialog: host receives keys.
    backend.press({ name: 'a', sequence: 'a', ctrl: false, meta: false, shift: false });
    await flushAsync();
    expect(hostKeys).toEqual(['a']);
    // Open a dialog; host is now muted.
    openD(createElement('flowtty-box', { width: 1, height: 1 }));
    await flushAsync();
    backend.press({ name: 'b', sequence: 'b', ctrl: false, meta: false, shift: false });
    await flushAsync();
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
    await flushAsync();

    // Open lower dialog with 2 buttons.
    openD(
      createElement(Box, { flexDirection: 'column' },
        createElement(Button, { label: 'L1', onPress: lowerBtn1 }),
        createElement(Button, { label: 'L2', onPress: lowerBtn2 }),
      ),
    );
    await flushAsync();

    // Open upper dialog with 2 buttons + api capture.
    openD(
      createElement(Box, { flexDirection: 'column' },
        createElement(Button, { label: 'U1', onPress: upperBtn1 }),
        createElement(Button, { label: 'U2', onPress: upperBtn2 }),
        createElement(CaptureApi),
      ),
    );
    await flushAsync();
    await flushAsync();

    // Upper dialog is active; U1 is auto-focused. Enter fires U1.
    backend.press({ name: 'return' });
    await flushAsync();
    expect(upperBtn1).toHaveBeenCalledTimes(1);
    expect(lowerBtn1).not.toHaveBeenCalled();

    // Tab in upper moves focus to U2. Enter fires U2.
    backend.press({ name: 'tab' });
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
    expect(upperBtn2).toHaveBeenCalledTimes(1);
    expect(lowerBtn1).not.toHaveBeenCalled();
    expect(lowerBtn2).not.toHaveBeenCalled();

    // Close the top dialog.
    topApi!.done(null);
    await flushAsync();

    // Lower dialog is now top. Its FocusGroup was never reset — L1 is still
    // auto-focused (it was first to register and focus was never stolen).
    backend.press({ name: 'return' });
    await flushAsync();
    expect(lowerBtn1).toHaveBeenCalledTimes(1);

    // Tab in lower moves focus to L2. Enter fires L2.
    backend.press({ name: 'tab' });
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
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
        await flushAsync();
        void host!.openDialog(createElement(Box, null, 'x'));
        // Same call signature → should NOT warn a second time.
        void host!.openDialog(createElement(Box, null, 'y'));
        await flushAsync();
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
        await flushAsync();
        void host!.openDialog(createElement(Box, null, 'x'), { floating: true, minWidth: 10 });
        await flushAsync();
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
        const handle = await render(
          createElement(DialogHost, null, createElement(Inner)),
          new TestBackend(40, 4),
        );
        await flushAsync();
        void host!.openDialog(createElement(Box, null, 'x'));
        await flushAsync();
        expect(warn).not.toHaveBeenCalled();
        handle.unmount();
      } finally {
        warn.mockRestore();
      }
    });
  });
});
