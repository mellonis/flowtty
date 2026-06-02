/** @jsxImportSource react */
import React from 'react';
import { render } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';
import { App } from './App.js';
import { pickSource } from './logSource.js';

const { source, demo } = pickSource(process.argv.slice(2));

let handle: { unmount: () => void } | null = null;
handle = await render(
  <App source={source} demo={demo} onExit={() => handle?.unmount()} />,
  new TtyBackend(),
);
