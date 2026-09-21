// flowtty showcase — a self-playing tour of the components.
//   npm run showcase                  play the script, then hand over the keys
//   npm run showcase -- --manual      no autopilot
//   npm run showcase -- --speed 2     twice as fast (0.5 = half speed)
//   npm run showcase -- --loop        start over when the script ends (for a booth screen)
//   npm run showcase -- --exit        quit when the script ends (what the recording uses)
import React from 'react';
import { render } from '@flowtty/react';
import { TtyBackend, isInteractive } from '@flowtty/tty-backend';
import { App, FRAME } from './App.js';
import { Autopilot } from './autopilot.js';
import { CopyFeed } from './copyFeed.js';
import { ScriptedBackend, play } from './director.js';
import { FULL_SCRIPT } from './script.js';
import { SCENES } from './scenes.js';

const args = process.argv.slice(2);
const manual = args.includes('--manual');
const loop = args.includes('--loop');
const exitWhenDone = args.includes('--exit');
const speedAt = args.indexOf('--speed');
const speed = speedAt >= 0 ? Number(args[speedAt + 1]) || 1 : 1;

if (!isInteractive(process.stdout)) {
  console.error('flowtty showcase: needs an interactive terminal (stdout is piped or redirected, or TERM=dumb)');
  process.exit(1);
}
const backend = new ScriptedBackend(new TtyBackend(process.stdout, process.stdin, { mouse: true }));
// In a terminal smaller than the frame the app only shows a "make it bigger"
// message, so there is nothing to play into: every waitFor would sit out its
// timeout. Don't start the autopilot; a recording fails loudly instead.
const { width, height } = backend.size();
const fits = width >= FRAME.width && height >= FRAME.height;
if (!fits && exitWhenDone) {
  backend.dispose();
  console.error(`flowtty showcase: needs a ${FRAME.width}x${FRAME.height} terminal, got ${width}x${height}`);
  process.exit(1);
}
const autopilot = new Autopilot(manual || !fits ? 'manual' : 'playing');
// Any real key takes the controls; Ctrl+G (handled in App) gives them back.
backend.onRealKey = (key) => { if (!(key.ctrl && key.name === 'g')) autopilot.pause(); };

// A drag over the frame copies; the tour shows "copied N chars" for a moment.
const copies = new CopyFeed();
const app = await render(
  <App scenes={SCENES} autopilot={autopilot} speed={speed} copies={copies} />,
  backend,
  { onCopy: copies.push },
);
const quitting = new AbortController();
void app.waitUntilExit().then(() => quitting.abort());

if (!manual && fits) {
  do {
    await play(backend, FULL_SCRIPT, {
      speed, signal: quitting.signal, gate: autopilot.gate, onTimeout: 'continue',
      // The frame is centered in the window; the script's mouse points are frame-relative.
      origin: () => {
        const { width, height } = backend.size();
        return { x: Math.max(0, Math.floor((width - FRAME.width) / 2)), y: Math.max(0, Math.floor((height - FRAME.height) / 2)) };
      },
    });
  } while (loop && !quitting.signal.aborted);
  autopilot.finish();
  if (exitWhenDone && !quitting.signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, 1200 / speed));
    app.unmount();
  }
}
await app.waitUntilExit();
// Printed on the restored screen — the recording waits for this line.
console.log('flowtty showcase finished');
process.exit(0);
