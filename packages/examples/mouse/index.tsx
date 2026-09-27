// Clicks and hover on a real terminal.
//   npm run mouse          (from the repo root)
import React from 'react';
import { render } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';
import { App } from './app.js';

const app = await render(<App />, new TtyBackend(process.stdout, process.stdin, { mouse: { hover: true } }));
await app.waitUntilExit();
