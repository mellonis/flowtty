export type Level = 'error' | 'warn' | 'info' | 'debug';

// One container as surfaced by `docker ps -a --format '{{json .}}'`.
// `state` is the machine state ('running' | 'exited' | …); `status` is the
// human string ('Up 3 hours', 'Exited (0) 5 minutes ago') — that's the "stats".
export interface Container {
  id: string;
  name: string;
  state: string;
  status: string;
}

export interface LogLine {
  text: string;
  level: Level;
}
