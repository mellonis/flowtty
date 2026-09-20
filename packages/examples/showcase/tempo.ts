// Scenes that run on their own clock (a streamed reply, a fake deploy, the snake)
// divide their intervals by the playback speed, so `--speed 2` — and the tests,
// which play far faster — speed the whole show up, not just the typing.
import { createContext, useContext } from 'react';

export const TempoContext = createContext<number>(1);

/** Scale a base interval by the playback speed (never below 1 ms). */
export function useTempo(): (ms: number) => number {
  const speed = useContext(TempoContext);
  return (ms) => Math.max(1, Math.round(ms / speed));
}
