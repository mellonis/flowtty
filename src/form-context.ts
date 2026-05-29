import { createContext } from 'react';

export interface FormFieldRegistration {
  /** Field's validator. Returns null/undefined = valid; string = error to display. */
  validate?: (value: unknown) => string | null | undefined;
}

export interface FormApi {
  // Aggregated state
  values: Record<string, unknown>;
  errors: Record<string, string | null>;
  focusedField: string | null;

  // Registration (call on mount, unregister on unmount). Insertion order is
  // the focus-ring order.
  register(name: string, opts?: FormFieldRegistration): void;
  unregister(name: string): void;

  // Value/error setters
  setValue(name: string, value: unknown): void;
  setError(name: string, error: string | null): void;

  // Focus
  focus(name: string): void;
  focusNext(): void;
  focusPrev(): void;

  // Advance-or-submit (called by useField's onSubmit after validate passes).
  // Moves focus to the next registered field, or fires the form's onSubmit
  // (with the aggregated values) when called from the LAST registered field.
  advance(fromName: string): void;

  // Cancel the form (Esc on any field, or programmatic).
  cancel(): void;
}

// Default no-op API used when no <Form> ancestor is present. Calling useField
// outside a Form returns a stable shape that does nothing meaningful, so a
// field rendered standalone for testing doesn't blow up.
const noopApi: FormApi = {
  values: {},
  errors: {},
  focusedField: null,
  register() {},
  unregister() {},
  setValue() {},
  setError() {},
  focus() {},
  focusNext() {},
  focusPrev() {},
  advance() {},
  cancel() {},
};

export const FormContext = createContext<FormApi>(noopApi);
