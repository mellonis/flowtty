/** @jsxImportSource react */
import { render, DialogHost } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';
import { App } from './App.js';

let handle: { unmount: () => void } | null = null;
handle = await render(
  <DialogHost>
    <App onExit={() => handle?.unmount()} />
  </DialogHost>,
  new TtyBackend(),
);
