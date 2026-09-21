import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { App, FRAME } from './App.js';
import { Autopilot } from './autopilot.js';
import { CopyFeed } from './copyFeed.js';
import { ScriptedBackend, play, press } from './director.js';
import { SCRIPT } from './script.js';
import { SCENES } from './scenes.js';

// The script that gets recorded is the script that gets tested: each scene is
// played into a TestBackend as fast as the app can take it, and has to reach
// the frames the recording is meant to show.
const SPEED = 25;

// Nothing a scene draws may spill over the showcase frame: every row between the
// top and bottom borders starts and ends with the frame's own `│`.
function expectIntactFrame(frame: string, scene: string): void {
  const rows = frame.split('\n');
  expect(rows, scene).toHaveLength(FRAME.height);
  rows.slice(1, -1).forEach((row, i) => {
    const cells = [...row];
    expect(cells[0], `${scene}: left border, row ${i + 1}`).toBe('│');
    expect(cells[FRAME.width - 1], `${scene}: right border, row ${i + 1}: ${row}`).toBe('│');
    expect(cells.length, `${scene}: row ${i + 1} is wider than the frame`).toBe(FRAME.width);
  });
}

async function playScene(name: string) {
  const inner = new TestBackend(FRAME.width, FRAME.height);
  const backend = new ScriptedBackend(inner);
  // Scenes that run on their own clock play at SPEED; the script itself plays flat out.
  const copies = new CopyFeed();
  const app = await render(
    <App scenes={SCENES} autopilot={new Autopilot('playing')} speed={SPEED} copies={copies} />,
    backend,
    { onCopy: copies.push },
  );
  await play(backend, SCRIPT[name]!, { speed: Infinity });
  await flushAsync(inner);
  expectIntactFrame(inner.lastFrame, name);
  return { frame: inner.lastFrame, app, backend, inner, copies };
}

describe('showcase', () => {
  test('every scene has a script and every script has a scene', () => {
    expect(Object.keys(SCRIPT)).toEqual(SCENES.map((s) => s.name));
  });

  test('form: error on the empty name, then the filled form is saved with an added feature', async () => {
    const { frame, app } = await playScene('form');
    expect(frame).toContain('"Ada Lovelace"');
    expect(frame).toContain('team');
    expect(frame).toContain('✓ tables');
    expect(frame).toContain('✓ scrolling');
    expect(frame).toContain('✓ mouse');
    expect(frame).toContain('Saved ✓');
    expect(frame).not.toContain('a name is required'); // cleared by typing
    app.unmount();
  }, 20000);

  test('chat: two replies stream in, the multi-line paste keeps its lines, the view ends pinned', async () => {
    const { frame, app } = await playScene('chat');
    expect(frame).toContain('answered 2');
    expect(frame).toContain('its line breaks,');
    expect(frame).toContain('pinned to the newest line');
    app.unmount();
  }, 30000);

  test('layout: ←/→ walks justifyContent to the last value', async () => {
    const { frame, app } = await playScene('layout');
    expect(frame).toContain('justifyContent: space-evenly');
    expect(frame).toContain('classic');
    // The frame clips, so an overflowing panel would be cut silently — check the
    // right-hand panel is whole: its top-right corner sits just inside the frame.
    expect(frame).toMatch(/ color {2}─+╮ │/);
    expect(frame).toContain('bold  dim  underline');  // styled runs share ONE line
    // No row of the text panel runs over its right border.
    const panelRows = frame.split('\n').filter((r) => r.includes('clickable link') || r.includes('Text wraps'));
    for (const r of panelRows) expect(r).toMatch(/│ {2}[╭│╰]/);
    app.unmount();
  }, 20000);

  test('data: a drag copies the pane\'s paragraph, then the selection walks down the table', async () => {
    const { frame, app, inner, copies } = await playScene('data');
    // The scripted drag swept the pane's first paragraph, which is soft-wrapped
    // over two rows: the pane is a selection scope, so neither the border nor
    // the table came along, and the wrap is joined back into the one line it
    // was written as.
    expect(copies.get()).toEqual({
      text: 'Framework-free. Yoga is the only dependency.',
      delivered: true,
      source: 'selection',
    });
    expect(frame).toContain('## @flowtty/testing');
    expect(frame).toMatch(/ <Markdown> {2}─+╮ │/);      // the pane is whole; its code block wrapped inside it
    expect(frame).toContain('TestBackend');
    expect(frame).toContain('package'); // the table header is still there
    // The three-row diff fits the pane — nothing is clipped (every table row is
    // checked in the test below).
    expect(frame).toContain('│ -  codeWrap="wrap"');
    expect(frame).toContain('│ +  lineNumbers');
    // The removed row wears its band, and it runs to the end of the code area.
    const rows = frame.split('\n');
    const y = rows.findIndex((r) => r.includes('-  codeWrap="wrap"'));
    const x = [...rows[y]!].indexOf('-', rows[y]!.indexOf('│ -'));
    const buf = inner.lastBuffer!;
    expect(buf.get(x, y).style.fg).toBe('red');
    expect(buf.get(x, y).style.bg).toBe('#3b0000');
    expect(buf.get(x - 2, y).style.bg).toBeUndefined();  // the gutter stays outside the band
    app.unmount();
  }, 20000);

  test('progress: every task finishes and the bar fills', async () => {
    const { frame, app } = await playScene('progress');
    expect(frame).toContain('5/5 done');
    expect(frame).toContain('released ✓');
    expect(frame).not.toContain('░');
    app.unmount();
  }, 20000);

  test('dialog: rename through a dialog, then delete through a confirm', async () => {
    const { frame, app } = await playScene('dialog');
    expect(frame).toContain('ideas.md');
    expect(frame).not.toContain('notes.md');
    expect(frame).toContain('deleted release-plan.md');
    expect(frame.split('release-plan.md')).toHaveLength(2); // only in the toast — gone from the list
    app.unmount();
  }, 20000);

  test('snake: the autopilot scores on its own', async () => {
    const { frame, app } = await playScene('snake');
    expect(frame).toMatch(/score (6|7|8)/);
    app.unmount();
  }, 60000);

  test('data: the Markdown pane holds its content for every table row — the bottom border stays whole', async () => {
    const inner = new TestBackend(FRAME.width, FRAME.height);
    const backend = new ScriptedBackend(inner);
    const app = await render(<App scenes={SCENES} autopilot={new Autopilot('manual')} />, backend);
    await play(backend, [press('f3')], { speed: Infinity });
    for (let row = 0; row < 5; row++) {
      await flushAsync(inner);
      const rows = inner.lastFrame.split('\n');
      const heading = rows.find((r) => r.includes('## @flowtty/'))!.trim();
      // The pane's bottom edge: a corner, a rule and a corner, with nothing painted over them.
      const bottom = rows.filter((r) => /╰─+╯ │$/.test(r));
      expect(bottom.length, `${heading}: the pane's bottom border is broken\n${inner.lastFrame}`).toBeGreaterThanOrEqual(1);
      expect(inner.lastFrame, heading).toContain('+  lineNumbers');
      await play(backend, [press('down')], { speed: Infinity });
    }
    app.unmount();
  });

  test('a terminal smaller than the frame gets a message instead of a broken layout', async () => {
    const inner = new TestBackend(60, 20);
    const app = await render(<App scenes={SCENES} autopilot={new Autopilot('manual')} />, new ScriptedBackend(inner));
    await flushAsync(inner);
    expect(inner.lastFrame).toContain('needs a 100×30 terminal');
    app.unmount();
  });

  test('Ctrl+N / Ctrl+P step through the scenes', async () => {
    const inner = new TestBackend(FRAME.width, FRAME.height);
    const backend = new ScriptedBackend(inner);
    const app = await render(<App scenes={SCENES} autopilot={new Autopilot('manual')} />, backend);
    expect(inner.lastFrame).toContain('justifyContent');
    await play(backend, [press('n', { ctrl: true })], { speed: Infinity });
    await flushAsync(inner);
    expect(inner.lastFrame).toContain('New project');
    await play(backend, [press('p', { ctrl: true }), press('p', { ctrl: true })], { speed: Infinity });
    await flushAsync(inner);
    expect(inner.lastFrame).toContain('score'); // wrapped around to the last scene
    app.unmount();
  });
});
