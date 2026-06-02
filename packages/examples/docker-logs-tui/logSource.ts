import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Container } from './types.js';

// The seam between the UI and "where logs come from". streamLogs returns a
// stop() that tears down the underlying stream (kills the child / clears the
// timer). Both implementations honor an optional AbortSignal for root teardown.
export interface LogSource {
  listContainers(signal?: AbortSignal): Promise<Container[]>;
  streamLogs(
    id: string,
    opts: { tail: number; signal?: AbortSignal },
    onLine: (raw: string) => void,
  ): () => void;
}

const DEMO_CONTAINERS: Container[] = [
  { id: 'c1', name: 'poetry-nextjs', state: 'running', status: 'Up 3 hours' },
  { id: 'c2', name: 'poetry-mysql', state: 'running', status: 'Up 3 hours' },
  { id: 'c3', name: 'meilisearch', state: 'running', status: 'Up 2 days' },
  { id: 'c4', name: 'dozzle', state: 'exited', status: 'Exited (0) 5 minutes ago' },
];

const DEMO_MESSAGES = [
  '[info] connection accepted',
  '[warn] slow query 412ms',
  '[info] flush complete',
  '[error] deadlock detected, retrying',
  '[debug] heartbeat ok',
];

export function makeDemoSource(): LogSource {
  return {
    async listContainers() {
      return DEMO_CONTAINERS.map((c) => ({ ...c }));
    },
    streamLogs(id, opts, onLine) {
      const stamp = () => new Date().toISOString().slice(11, 19);
      const emit = (i: number) => onLine(`${stamp()} ${DEMO_MESSAGES[i % DEMO_MESSAGES.length]} (${id})`);
      // Seed up to `tail` recent lines synchronously (cap at the message set).
      const seed = Math.min(opts.tail, 8);
      for (let i = 0; i < seed; i++) emit(i);
      let n = seed;
      const timer = setInterval(() => emit(n++), 400);
      const onAbort = () => clearInterval(timer);
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      return () => {
        clearInterval(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      };
    },
  };
}

interface DockerPsJson { ID: string; Names: string; State: string; Status: string; }

// Not unit-tested — it shells out to the host `docker` binary, impractical in
// CI. Exercised by the manual run (`npm run docker-logs-tui`). The spec covers
// the demo source and pickSource('--demo') instead.
export function makeDockerCliSource(): LogSource {
  return {
    async listContainers(signal) {
      const out = await execText('docker', ['ps', '-a', '--format', '{{json .}}'], signal);
      const containers: Container[] = [];
      for (const line of out.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const j = JSON.parse(t) as DockerPsJson;
          containers.push({ id: j.ID, name: j.Names, state: j.State, status: j.Status });
        } catch {
          /* skip a malformed line */
        }
      }
      return containers;
    },
    streamLogs(id, opts, onLine) {
      const child = spawn('docker', ['logs', '--follow', '--tail', String(opts.tail), id], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      // Many containers log to stderr — tail both, line-buffered.
      const rlOut = createInterface({ input: child.stdout });
      const rlErr = createInterface({ input: child.stderr });
      rlOut.on('line', onLine);
      rlErr.on('line', onLine);
      const onAbort = () => child.kill();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      return () => {
        opts.signal?.removeEventListener('abort', onAbort);
        rlOut.close();
        rlErr.close();
        child.kill();
      };
    },
  };
}

function execText(cmd: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('error', reject);
    child.on('close', () => resolve(out));
    signal?.addEventListener('abort', () => child.kill(), { once: true });
  });
}

function dockerAvailable(): boolean {
  try {
    const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

// Choose the source: real Docker when present (and not forced to demo), else the
// synthetic source. `demo` drives the on-screen banner.
export function pickSource(argv: string[]): { source: LogSource; demo: boolean } {
  if (!argv.includes('--demo') && dockerAvailable()) {
    return { source: makeDockerCliSource(), demo: false };
  }
  return { source: makeDemoSource(), demo: true };
}
