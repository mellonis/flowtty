// The snake game as a pure reducer, so the same code is driven by a timer in
// the scene and stepped directly in a test. Food comes from a seeded generator:
// the autopilot's game is the same game on every run — and in every recording.
export const W = 30;
export const H = 14;

export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Point { x: number; y: number }
export interface Game {
  snake: Point[];            // head first
  dir: Dir;
  food: Point;
  score: number;
  seed: number;
  auto: boolean;             // steering itself until someone presses an arrow
  queued: Dir | null;
  deaths: number;
}

const DELTA: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

// mulberry32 — tiny, deterministic, good enough to scatter food.
function next(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const inside = (p: Point): boolean => p.x >= 0 && p.y >= 0 && p.x < W && p.y < H;

function placeFood(snake: Point[], seed: number): { food: Point; seed: number } {
  let s = seed;
  for (;;) {
    const a = next(s); const b = next(a.seed); s = b.seed;
    const food = { x: Math.floor(a.value * W), y: Math.floor(b.value * H) };
    if (!snake.some((p) => same(p, food))) return { food, seed: s };
  }
}

export function newGame(seed = 7, deaths = 0): Game {
  const snake = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
  const placed = placeFood(snake, seed);
  return { snake, dir: 'right', food: placed.food, score: 0, seed: placed.seed, auto: true, queued: null, deaths };
}

// Cells reachable from `from` without crossing `blocked` — how the autopilot
// tells an open corridor from a dead end.
function reachable(from: Point, blocked: Point[]): number {
  const seen = new Set<number>(blocked.map((p) => p.y * W + p.x));
  const stack = [from];
  let n = 0;
  while (stack.length) {
    const p = stack.pop()!;
    const k = p.y * W + p.x;
    if (!inside(p) || seen.has(k)) continue;
    seen.add(k); n++;
    for (const d of DIRS) stack.push({ x: p.x + DELTA[d].x, y: p.y + DELTA[d].y });
  }
  return n;
}

function steer(g: Game): Dir {
  const head = g.snake[0]!;
  const body = g.snake.slice(0, -1); // the tail cell frees up as the snake moves
  let best: { dir: Dir; roomy: boolean; dist: number } | null = null;
  for (const dir of DIRS) {
    if (dir === OPPOSITE[g.dir]) continue;
    const to = { x: head.x + DELTA[dir].x, y: head.y + DELTA[dir].y };
    if (!inside(to) || body.some((p) => same(p, to))) continue;
    const roomy = reachable(to, body) >= g.snake.length + 2;
    const dist = Math.abs(to.x - g.food.x) + Math.abs(to.y - g.food.y);
    const better = !best || (roomy !== best.roomy ? roomy : dist < best.dist || (dist === best.dist && dir === g.dir));
    if (better) best = { dir, roomy, dist };
  }
  return best?.dir ?? g.dir;
}

export type Action = { type: 'tick' } | { type: 'turn'; dir: Dir } | { type: 'auto' };

export function step(g: Game, action: Action): Game {
  if (action.type === 'auto') return { ...g, auto: true, queued: null };
  if (action.type === 'turn') return action.dir === OPPOSITE[g.dir] ? { ...g, auto: false } : { ...g, auto: false, queued: action.dir };

  const dir = g.auto ? steer(g) : g.queued ?? g.dir;
  const head = g.snake[0]!;
  const to = { x: head.x + DELTA[dir].x, y: head.y + DELTA[dir].y };
  const eats = same(to, g.food);
  const body = eats ? g.snake : g.snake.slice(0, -1);
  if (!inside(to) || body.some((p) => same(p, to))) return { ...newGame(g.seed, g.deaths + 1), auto: g.auto };
  const snake = [to, ...body];
  if (!eats) return { ...g, snake, dir, queued: null };
  const placed = placeFood(snake, g.seed);
  return { ...g, snake, dir, queued: null, food: placed.food, seed: placed.seed, score: g.score + 1 };
}
