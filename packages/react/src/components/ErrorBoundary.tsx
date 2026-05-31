import React from "react";
import { Component, type ReactNode } from 'react';

export type ErrorSource = 'react' | 'uncaughtException' | 'unhandledRejection';

interface ErrorBoundaryProps {
  /** Fires when an error is caught from the subtree. Receives the error and which path caught it ('react' here). */
  onError: (info: { error: unknown; source: ErrorSource }) => void;
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** React class boundary for the user tree. Catches errors thrown during render,
 *  commit (via react-reconciler's error callbacks — see render.ts), and inside
 *  useEffect bodies. Does NOT perform cleanup itself — defers to the parent
 *  render.ts handler so all error paths share one orchestration. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: unknown): ErrorBoundaryState {
    // Switch to fallback (null) so the broken subtree stops trying to render.
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError({ error, source: 'react' });
  }

  render() {
    // After an error, render nothing — keep the buffer in whatever state it was
    // pre-error. Cleanup (dispose, exit) happens in onError handler, not here.
    if (this.state.hasError) return null;
    return this.props.children ?? null;
  }
}
