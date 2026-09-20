import { describe, test, expect } from 'vitest';
import { H, W, newGame, step, type Game } from './snake.js';

const run = (g: Game, ticks: number): Game => { for (let i = 0; i < ticks; i++) g = step(g, { type: 'tick' }); return g; };

describe('snake', () => {
  test('the autopilot eats its way to a real score without dying, and the game is the same every run', () => {
    const a = run(newGame(), 600);
    const b = run(newGame(), 600);
    expect(a.score).toBeGreaterThanOrEqual(10);
    expect(a.deaths).toBe(0);
    expect(a).toEqual(b);
  });

  test('the snake stays on the board and never overlaps itself', () => {
    let g = newGame();
    for (let i = 0; i < 400; i++) {
      g = step(g, { type: 'tick' });
      expect(g.snake.every((p) => p.x >= 0 && p.y >= 0 && p.x < W && p.y < H)).toBe(true);
      expect(new Set(g.snake.map((p) => `${p.x},${p.y}`)).size).toBe(g.snake.length);
    }
  });

  test('an arrow key takes the controls; a reversal is ignored; hitting a wall starts over', () => {
    let g = step(newGame(), { type: 'turn', dir: 'left' }); // reversal of "right"
    expect(g.auto).toBe(false);
    expect(g.queued).toBeNull();
    g = step(g, { type: 'turn', dir: 'up' });
    g = run(g, 20); // straight up into the wall
    expect(g.deaths).toBe(1);
    expect(g.score).toBe(0);
    expect(step(g, { type: 'auto' }).auto).toBe(true);
  });
});
