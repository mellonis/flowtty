import { loadYoga } from 'yoga-layout/load';

export type Yoga = Awaited<ReturnType<typeof loadYoga>>;
export type YogaNode = ReturnType<Yoga['Node']['create']>;

let yogaPromise: Promise<Yoga> | null = null;

// Async because yoga-layout 3.x ships as wasm. Loaded once, cached; all
// per-frame layout calls after the first await are synchronous.
export function getYoga(): Promise<Yoga> {
  yogaPromise ??= loadYoga();
  return yogaPromise;
}

// Re-export the enums the rest of the renderer needs.
export { FlexDirection, MeasureMode, PositionType, Edge, Justify, Align, Gutter, Wrap, Display } from 'yoga-layout/load';
