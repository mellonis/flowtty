import { createElement, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { FormContext, type FormApi, type FormFieldRegistration } from './form-context.js';

export interface FormProps {
  /** Aggregated submit: called when advance() is invoked from the LAST registered field. */
  onSubmit: (values: Record<string, unknown>) => void;
  /** Called from cancel() (Esc handling lands in M1c.3 T3). */
  onCancel?: () => void;
  /** When false, form-level key handling (T3) is suppressed. Default true. */
  isFocused?: boolean;
  children?: ReactNode;
}

export function Form(props: FormProps): ReactNode {
  const { onSubmit, onCancel, children } = props;

  // Ordered list of registered field names (insertion order = focus-ring order).
  // Held in a ref so register/unregister effects don't churn Form re-renders themselves.
  const order = useRef<string[]>([]);
  const validators = useRef<Map<string, FormFieldRegistration['validate']>>(new Map());

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const register = useCallback((name: string, opts?: FormFieldRegistration) => {
    if (!order.current.includes(name)) order.current.push(name);
    if (opts?.validate) validators.current.set(name, opts.validate);
    // Auto-focus the first registered field (only if nothing focused yet).
    setFocusedField((current) => current ?? order.current[0] ?? null);
  }, []);

  const unregister = useCallback((name: string) => {
    order.current = order.current.filter((n) => n !== name);
    validators.current.delete(name);
    setFocusedField((current) => (current === name ? (order.current[0] ?? null) : current));
  }, []);

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setError = useCallback((name: string, error: string | null) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const focus = useCallback((name: string) => {
    if (order.current.includes(name)) setFocusedField(name);
  }, []);

  const focusNext = useCallback(() => {
    setFocusedField((current) => {
      const list = order.current;
      if (list.length === 0) return null;
      const i = current === null ? -1 : list.indexOf(current);
      return list[(i + 1) % list.length]!;
    });
  }, []);

  const focusPrev = useCallback(() => {
    setFocusedField((current) => {
      const list = order.current;
      if (list.length === 0) return null;
      const i = current === null ? 0 : list.indexOf(current);
      return list[(i - 1 + list.length) % list.length]!;
    });
  }, []);

  // advance(fromName) — moves focus to the next field, or fires onSubmit if
  // fromName is the LAST registered. We mirror `values` in a ref so the
  // callback always reads the freshest snapshot (sidesteps stale closures).
  const latestValues = useRef(values);
  latestValues.current = values;

  const advance = useCallback((fromName: string) => {
    const list = order.current;
    const i = list.indexOf(fromName);
    if (i < 0) return;
    if (i === list.length - 1) {
      onSubmit(latestValues.current);
      return;
    }
    setFocusedField(list[i + 1]!);
  }, [onSubmit]);

  const cancel = useCallback(() => { onCancel?.(); }, [onCancel]);

  const api = useMemo<FormApi>(() => ({
    values, errors, focusedField,
    register, unregister, setValue, setError,
    focus, focusNext, focusPrev, advance, cancel,
  }), [values, errors, focusedField, register, unregister, setValue, setError, focus, focusNext, focusPrev, advance, cancel]);

  return createElement(FormContext.Provider, { value: api }, children);
}
