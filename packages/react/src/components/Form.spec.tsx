import React from "react";
import { expect, test } from 'vitest';
import { createElement, useContext, useEffect } from 'react';
import { render } from '../index.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { Form } from './Form.js';
import { FormContext, type FormApi } from '../context/formContext.js';

test('Form provides FormContext to descendants', async () => {
  let api: FormApi | null = null;
  function Probe() {
    api = useContext(FormContext);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {} }, createElement(Probe)),
    backend,
  );
  expect(api).not.toBeNull();
  expect(api!.values).toEqual({});
  expect(api!.errors).toEqual({});
  expect(api!.focusedField).toBeNull();
});

test('register/setValue/setError reflect in api state', async () => {
  let api: FormApi | null = null;
  function Probe() {
    api = useContext(FormContext);
    useEffect(() => {
      api!.register('name');
      api!.setValue('name', 'alice');
    }, []);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {} }, createElement(Probe)),
    backend,
  );
  await flushAsync();
  expect(api!.values).toEqual({ name: 'alice' });
});

test('first registered field becomes focused (focusedField === first name)', async () => {
  let api: FormApi | null = null;
  function Probe() {
    api = useContext(FormContext);
    useEffect(() => {
      api!.register('a');
      api!.register('b');
    }, []);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {} }, createElement(Probe)),
    backend,
  );
  await flushAsync();
  expect(api!.focusedField).toBe('a');
});

test('advance(name) moves focus to next; advance from LAST fires onSubmit(values)', async () => {
  let api: FormApi | null = null;
  const submitted: Array<Record<string, unknown>> = [];
  function Probe() {
    api = useContext(FormContext);
    useEffect(() => {
      api!.register('a');
      api!.register('b');
      api!.setValue('a', 1);
      api!.setValue('b', 2);
    }, []);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: (v: Record<string, unknown>) => submitted.push(v) },
      createElement(Probe)),
    backend,
  );
  await flushAsync();
  api!.advance('a');
  await flushAsync();
  expect(api!.focusedField).toBe('b');
  expect(submitted).toEqual([]);
  api!.advance('b');
  expect(submitted).toEqual([{ a: 1, b: 2 }]);
});

test('Tab moves focus forward; Shift-Tab backward (and wraps)', async () => {
  let api: FormApi | null = null;
  function Probe() {
    api = useContext(FormContext);
    useEffect(() => {
      api!.register('a');
      api!.register('b');
      api!.register('c');
    }, []);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {} }, createElement(Probe)),
    backend,
  );
  await flushAsync();
  expect(api!.focusedField).toBe('a');

  backend.press({ name: 'tab' });
  await flushAsync();
  expect(api!.focusedField).toBe('b');

  backend.press({ name: 'tab', shift: true });
  await flushAsync();
  expect(api!.focusedField).toBe('a');

  // Shift-Tab from the first field wraps to the last.
  backend.press({ name: 'tab', shift: true });
  await flushAsync();
  expect(api!.focusedField).toBe('c');
});

test('unregistering the focused field moves focus to the next, not the first', async () => {
  let api: FormApi | null = null;
  function Probe() {
    api = useContext(FormContext);
    useEffect(() => {
      api!.register('a');
      api!.register('b');
      api!.register('c');
    }, []);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {} }, createElement(Probe)),
    backend,
  );
  await flushAsync();
  api!.focus('b');
  await flushAsync();
  expect(api!.focusedField).toBe('b');
  // Removing the focused middle field lands focus on 'c' (the next), not 'a'.
  api!.unregister('b');
  await flushAsync();
  expect(api!.focusedField).toBe('c');
});

test('cancel() fires onCancel', async () => {
  let api: FormApi | null = null;
  let cancelled = false;
  function Probe() {
    api = useContext(FormContext);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {}, onCancel: () => { cancelled = true; } },
      createElement(Probe)),
    backend,
  );
  await flushAsync();
  api!.cancel();
  expect(cancelled).toBe(true);
});
