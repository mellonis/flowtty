import React, { useEffect, useReducer } from 'react';
import { Box, Text, useInput, type Color } from '@flowtty/react';
import { useTempo } from '../tempo.js';
import { H, W, newGame, step, type Dir } from './snake.js';

type Kind = 'empty' | 'body' | 'head' | 'food';
const LOOK: Record<Kind, { text: string; color?: Color; dim?: boolean }> = {
  empty: { text: '· ', dim: true },
  body: { text: '██', color: 'green' },
  head: { text: '██', color: 'greenBright' },
  food: { text: '◆ ', color: 'redBright' },
};
const ARROWS: Record<string, Dir> = { up: 'up', down: 'down', left: 'left', right: 'right' };

export function SnakeScene() {
  const tempo = useTempo();
  const [game, dispatch] = useReducer(step, undefined, () => newGame());
  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'tick' }), tempo(85));
    return () => clearInterval(t);
  }, [tempo]);
  useInput((key) => {
    const dir = ARROWS[key.name];
    if (dir) dispatch({ type: 'turn', dir });
    else if (key.name === 'a') dispatch({ type: 'auto' });
  });

  const kind = (x: number, y: number): Kind => {
    if (game.food.x === x && game.food.y === y) return 'food';
    const i = game.snake.findIndex((p) => p.x === x && p.y === y);
    return i === 0 ? 'head' : i > 0 ? 'body' : 'empty';
  };
  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} alignItems="center">
      <Box flexDirection="row" gap={3}>
        <Text bold>{`score ${game.score}`}</Text>
        <Text dim>{`length ${game.snake.length}`}</Text>
        <Text dim>{game.auto ? 'the snake is steering itself — an arrow key takes over' : 'you are steering — press a to let it play'}</Text>
      </Box>
      <Box flexDirection="column" border="round" borderTitle=" snake — a ticker, fast input, a frame diff ">
        {Array.from({ length: H }, (_, y) => {
          // Merge neighbouring cells of one kind into a single <Text>: fewer nodes per row.
          const runs: { kind: Kind; n: number }[] = [];
          for (let x = 0; x < W; x++) {
            const k = kind(x, y);
            const last = runs[runs.length - 1];
            if (last && last.kind === k) last.n++; else runs.push({ kind: k, n: 1 });
          }
          return (
            <Box key={y} flexDirection="row">
              {runs.map((r, i) => <Text key={i} color={LOOK[r.kind].color} dim={LOOK[r.kind].dim}>{LOOK[r.kind].text.repeat(r.n)}</Text>)}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
