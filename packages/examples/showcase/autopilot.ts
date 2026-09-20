// Tiny external store for the autopilot state, so the UI can show ▶ / ⏸ and the
// director can wait on the same flag.
import { useSyncExternalStore } from 'react';

export type AutopilotState = 'playing' | 'paused' | 'finished' | 'manual';

export class Autopilot {
  private state: AutopilotState;
  private readonly listeners = new Set<() => void>();
  private resume: (() => void) | undefined;
  private gatePromise: Promise<void> = Promise.resolve();

  constructor(initial: AutopilotState) { this.state = initial; }

  get = (): AutopilotState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  /** What the director awaits between keys. */
  gate = (): Promise<void> => this.gatePromise;

  pause(): void {
    if (this.state !== 'playing') return;
    this.gatePromise = new Promise<void>((resolve) => { this.resume = resolve; });
    this.set('paused');
  }

  play(): void {
    if (this.state !== 'paused') return;
    this.resume?.();
    this.resume = undefined;
    this.gatePromise = Promise.resolve();
    this.set('playing');
  }

  finish(): void { if (this.state === 'playing' || this.state === 'paused') this.set('finished'); }

  private set(next: AutopilotState): void { this.state = next; for (const l of [...this.listeners]) l(); }
}

export function useAutopilot(autopilot: Autopilot): AutopilotState {
  return useSyncExternalStore(autopilot.subscribe, autopilot.get, autopilot.get);
}
