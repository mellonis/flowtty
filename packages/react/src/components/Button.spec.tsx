import React from "react";
import { describe, test, expect, vi } from 'vitest';
import { createElement } from 'react';
import { render } from '../internal/render.js';
import { TestBackend } from '@flowtty/core/testing';
import { flushAsync } from '@flowtty/core/testing';
import { FocusGroup } from './FocusGroup.js';
import { Box } from './base/Box.js';
import { Button } from './Button.js';

describe('Button', () => {
  test('renders [ label ] + (shortcut) hint', async () => {
    const backend = new TestBackend(30, 1);
    await render(
      createElement(FocusGroup, {},
        createElement(Button, { label: 'Open', shortcut: 'o', onPress: () => {} }),
      ),
      backend,
    );
    await flushAsync();
    expect(backend.lastFrame).toContain('[ Open ]');
    expect(backend.lastFrame).toContain('(o)');
  });

  test('Enter fires onPress when focused', async () => {
    const backend = new TestBackend(30, 1);
    const onPress = vi.fn();
    await render(
      createElement(FocusGroup, {},
        createElement(Button, { label: 'Save', onPress }),
      ),
      backend,
    );
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('Shortcut key fires onPress even when NOT focused', async () => {
    const backend = new TestBackend(30, 3);
    const aFn = vi.fn();
    const bFn = vi.fn();
    await render(
      createElement(Box, { flexDirection: 'column' },
        createElement(FocusGroup, {},
          createElement(Button, { label: 'A', onPress: aFn }),
          createElement(Button, { label: 'B', shortcut: 'b', onPress: bFn }),
        ),
      ),
      backend,
    );
    await flushAsync();
    // A is focused (auto-focused first), B is not. Press 'b' → B fires.
    backend.press({ name: 'b' });
    await flushAsync();
    expect(aFn).not.toHaveBeenCalled();
    expect(bFn).toHaveBeenCalledTimes(1);
  });

  test('Tab moves focus between buttons; Enter fires the focused one', async () => {
    const backend = new TestBackend(30, 3);
    const aFn = vi.fn();
    const bFn = vi.fn();
    await render(
      createElement(Box, { flexDirection: 'column' },
        createElement(FocusGroup, {},
          createElement(Button, { label: 'A', onPress: aFn }),
          createElement(Button, { label: 'B', onPress: bFn }),
        ),
      ),
      backend,
    );
    await flushAsync();
    // A is focused (auto-focused first). Press Enter → A fires.
    backend.press({ name: 'return' });
    await flushAsync();
    expect(aFn).toHaveBeenCalledTimes(1);
    // Tab → B is focused. Press Enter → B fires.
    backend.press({ name: 'tab' });
    await flushAsync();
    backend.press({ name: 'return' });
    await flushAsync();
    expect(bFn).toHaveBeenCalledTimes(1);
  });
});
