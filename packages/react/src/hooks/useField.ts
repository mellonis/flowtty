import { useContext, useEffect } from 'react';
import { FormContext } from '../context/formContext.js';

export interface UseFieldOptions {
  /** Sync validator. Return null/undefined = valid; string = error message (blocks advance/submit). */
  validate?: (value: unknown) => string | null | undefined;
}

export interface FieldControl {
  value: unknown;
  onChange: (value: unknown) => void;
  /** Validate; on pass, advance focus (or fire form's onSubmit if last field). */
  onSubmit: () => void;
  /** Cancel the form. */
  onCancel: () => void;
  isFocused: boolean;
  error: string | null;
}

export function useField(name: string, opts: UseFieldOptions = {}): FieldControl {
  const ctx = useContext(FormContext);

  // Extract stable callbacks from ctx. Form's api useMemo depends on all state
  // (values, errors, focusedField), so ctx gets a new identity on every state
  // change. Including ctx in the effect deps would re-run register/unregister on
  // every keystroke, and the unregister cleanup's "if current === name, fall
  // back to list[0]" branch would clobber focus back to the first field.
  // register/unregister are useCallback([]) in Form — they are stable across
  // renders and safe to destructure here.
  const { register, unregister } = ctx;
  useEffect(() => {
    register(name);
    return () => unregister(name);
  }, [register, unregister, name]);

  return {
    value: ctx.values[name],
    onChange: (value: unknown) => ctx.setValue(name, value),
    onSubmit: () => {
      const value = ctx.values[name];
      const err = opts.validate ? opts.validate(value) : null;
      if (err) {
        ctx.setError(name, err);
        return;
      }
      ctx.setError(name, null);
      ctx.advance(name);
    },
    onCancel: () => ctx.cancel(),
    isFocused: ctx.focusedField === name,
    error: ctx.errors[name] ?? null,
  };
}
