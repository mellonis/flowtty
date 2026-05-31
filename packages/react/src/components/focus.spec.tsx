import React from "react";
import { describe, test, expect } from 'vitest';
import { createElement, useState } from 'react';
import { render } from '../internal/render.js';
import { TestBackend } from '@flowtty/core/testing';
import { flushAsync } from '@flowtty/core/testing';
import { FocusGroup } from './FocusGroup.js';
import { useFocus } from '../hooks/useFocus.js';
import { useInput } from '../hooks/useInput.js';
import { Box } from './base/Box.js';

/** A test focusable: renders "*{label}" when focused, " {label}" when not. */
function Reporter({ label }: { label: string }) {
  const { isFocused } = useFocus();
  return createElement('flowtty-box', { width: 10, height: 1 },
    `${isFocused ? '*' : ' '}${label}`,
  );
}

/** Column layout wrapper — needed because FocusGroup is just a Provider (no
 *  host element), and multiple sibling boxes at the container level all start
 *  at (0, 0) and overlap. Wrapping in a column Box gives each Reporter its
 *  own row. */
function Col({ children }: { children?: React.ReactNode }) {
  return createElement(Box, { flexDirection: 'column' }, children);
}

describe('FocusGroup + useFocus', () => {
  test('first registered focusable is auto-focused', async () => {
    const backend = new TestBackend(20, 3);
    await render(
      createElement(Col, {},
        createElement(FocusGroup, {},
          createElement(Reporter, { label: 'A' }),
          createElement(Reporter, { label: 'B' }),
        ),
      ),
      backend,
    );
    await flushAsync();
    const frame = backend.lastFrame!;
    // A is focused (*A), B is not ( B)
    expect(frame).toContain('*A');
    expect(frame).toContain(' B');
  });

  test('Tab moves focus to next; Shift-Tab moves to previous; cycles', async () => {
    const backend = new TestBackend(20, 3);
    await render(
      createElement(Col, {},
        createElement(FocusGroup, {},
          createElement(Reporter, { label: 'A' }),
          createElement(Reporter, { label: 'B' }),
          createElement(Reporter, { label: 'C' }),
        ),
      ),
      backend,
    );
    await flushAsync();
    expect(backend.lastFrame).toContain('*A');
    backend.press({ name: 'tab' });
    await flushAsync();
    expect(backend.lastFrame).toContain('*B');
    backend.press({ name: 'tab' });
    await flushAsync();
    expect(backend.lastFrame).toContain('*C');
    backend.press({ name: 'tab' });
    await flushAsync();
    expect(backend.lastFrame).toContain('*A'); // cycled
    backend.press({ name: 'tab', shift: true });
    await flushAsync();
    expect(backend.lastFrame).toContain('*C'); // back
  });

  test('useFocus outside a FocusGroup returns isFocused: true', async () => {
    const backend = new TestBackend(20, 1);
    await render(
      createElement(Reporter, { label: 'X' }),
      backend,
    );
    await flushAsync();
    // Outside a FocusGroup the noop default returns true → component is focused
    expect(backend.lastFrame).toContain('*X');
  });

  test('isActive: false ignores Tab', async () => {
    const backend = new TestBackend(20, 3);
    await render(
      createElement(Col, {},
        createElement(FocusGroup, { isActive: false },
          createElement(Reporter, { label: 'A' }),
          createElement(Reporter, { label: 'B' }),
        ),
      ),
      backend,
    );
    await flushAsync();
    expect(backend.lastFrame).toContain('*A');
    backend.press({ name: 'tab' });
    await flushAsync();
    expect(backend.lastFrame).toContain('*A'); // unchanged
  });

  test('unmounting focused focusable moves focus to next available', async () => {
    const backend = new TestBackend(20, 3);

    function Toggler({ onToggle }: { onToggle: () => void }) {
      useInput((key) => { if (key.name === 'd') onToggle(); });
      return null;
    }

    function App() {
      const [showA, setShowA] = useState(true);
      return createElement(Col, {},
        createElement(FocusGroup, {},
          showA ? createElement(Reporter, { label: 'A' }) : null,
          createElement(Reporter, { label: 'B' }),
          createElement(Toggler, { onToggle: () => setShowA(false) }),
        ),
      );
    }

    await render(createElement(App), backend);
    await flushAsync();
    expect(backend.lastFrame).toContain('*A');
    backend.press({ name: 'd' });
    await flushAsync();
    // A unmounted; B should become focused.
    expect(backend.lastFrame).toContain('*B');
  });
});
