// The showcase plays itself: a script of steps is fed into the app as if someone
// were typing. `ScriptedBackend` wraps any real backend — drawing and size go
// straight through, while `onKey` delivers BOTH the real keyboard and the keys
// the director injects. Because it wraps the `Backend` interface, the same
// script drives a live TTY (for a recording) and a `TestBackend` (as a test).
import type { Backend, Buffer, Key } from '@flowtty/react';

export type Step =
  | { kind: 'wait'; ms: number }
  | { kind: 'type'; text: string; perCharMs: number }
  | { kind: 'press'; key: Partial<Key> & { name: string }; times: number }
  | { kind: 'paste'; text: string }
  | { kind: 'wheel'; direction: 'up' | 'down'; x: number; y: number; times: number }
  | { kind: 'waitFor'; text: string; timeoutMs: number };

export const wait = (ms: number): Step => ({ kind: 'wait', ms });
export const type = (text: string, perCharMs = 55): Step => ({ kind: 'type', text, perCharMs });
export const press = (name: string, mods: Partial<Key> = {}, times = 1): Step => ({ kind: 'press', key: { ...mods, name }, times });
export const paste = (text: string): Step => ({ kind: 'paste', text });
export const wheel = (direction: 'up' | 'down', x: number, y: number, times = 1): Step => ({ kind: 'wheel', direction, x, y, times });
/** Block until the frame shows `text` — for anything the app does on its own clock. */
export const waitFor = (text: string, timeoutMs = 8000): Step => ({ kind: 'waitFor', text, timeoutMs });

export class ScriptedBackend implements Backend {
  readonly fullScreen: boolean | undefined;
  readonly hyperlinks: boolean | undefined;
  /** Plain text of the last frame — what `waitFor` looks at. */
  lastText = '';
  /** Called for every key from the REAL keyboard (never for injected ones). */
  onRealKey: ((key: Key) => void) | undefined;
  onResize: Backend['onResize'];
  printStatic: Backend['printStatic'];

  private readonly subscribers = new Set<(key: Key) => void>();
  private unsubscribeInner: (() => void) | undefined;

  constructor(private readonly inner: Backend) {
    this.fullScreen = inner.fullScreen;
    this.hyperlinks = inner.hyperlinks;
    if (inner.onResize) this.onResize = (h) => inner.onResize!(h);
    if (inner.printStatic) this.printStatic = (lines) => inner.printStatic!(lines);
  }

  size(): { width: number; height: number } { return this.inner.size(); }

  draw(buffer: Buffer): void {
    this.lastText = buffer.toString();
    this.inner.draw(buffer);
  }

  onKey(handler: (key: Key) => void): () => void {
    this.subscribers.add(handler);
    if (!this.unsubscribeInner && this.inner.onKey) {
      this.unsubscribeInner = this.inner.onKey((key) => { this.onRealKey?.(key); this.emit(key); });
    }
    return () => { this.subscribers.delete(handler); };
  }

  /** Deliver a scripted key exactly as a real one would arrive. */
  inject(key: Partial<Key> & { name: string }): void {
    this.emit({ sequence: '', ctrl: false, meta: false, shift: false, ...key });
  }

  dispose(): void {
    this.unsubscribeInner?.();
    this.inner.dispose?.();
  }

  private emit(key: Key): void {
    for (const h of [...this.subscribers]) h(key);
  }
}

export interface DirectorOptions {
  /** Divides every wait and typing delay. `Infinity` = as fast as the app can take it (tests). */
  speed?: number;
  /** Stop playing (the app is quitting). */
  signal?: AbortSignal;
  /** Resolves while playback may proceed; swap in a pending promise to pause. */
  gate?: () => Promise<void>;
  /** A `waitFor` that times out: throw (tests) or carry on (a live demo should not die). */
  onTimeout?: 'throw' | 'continue';
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Play `steps` into `backend`. Resolves when the script is done or the signal aborts. */
export async function play(backend: ScriptedBackend, steps: readonly Step[], opts: DirectorOptions = {}): Promise<void> {
  const speed = opts.speed ?? 1;
  const scaled = (ms: number): number => (speed === Infinity ? 0 : ms / speed);
  // Even at infinite speed, yield after every key: state updates land
  // synchronously, but the repaint is a microtask and timers need a turn.
  const beat = async (ms: number): Promise<void> => { await sleep(scaled(ms)); await opts.gate?.(); };
  const aborted = (): boolean => opts.signal?.aborted === true;

  for (const step of steps) {
    if (aborted()) return;
    await opts.gate?.();
    switch (step.kind) {
      case 'wait':
        await beat(step.ms);
        break;
      case 'type':
        for (const ch of step.text) {
          if (aborted()) return;
          backend.inject({ name: ch, sequence: ch });
          await beat(step.perCharMs);
        }
        break;
      case 'press':
        for (let i = 0; i < step.times; i++) {
          if (aborted()) return;
          backend.inject(step.key);
          await beat(step.times > 1 ? 110 : 0);
        }
        break;
      case 'paste':
        backend.inject({ name: 'paste', text: step.text });
        await beat(0);
        break;
      case 'wheel':
        for (let i = 0; i < step.times; i++) {
          if (aborted()) return;
          backend.inject({ name: step.direction === 'up' ? 'wheelup' : 'wheeldown', x: step.x, y: step.y });
          await beat(90);
        }
        break;
      case 'waitFor': {
        const deadline = Date.now() + step.timeoutMs;
        while (!backend.lastText.includes(step.text)) {
          if (aborted()) return;
          if (Date.now() > deadline) {
            if ((opts.onTimeout ?? 'throw') === 'throw') {
              throw new Error(`showcase: waited ${step.timeoutMs}ms for ${JSON.stringify(step.text)} — last frame:\n${backend.lastText}`);
            }
            break;
          }
          await sleep(15);
        }
        break;
      }
    }
  }
}
