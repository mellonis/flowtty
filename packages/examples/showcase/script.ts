import { mouse, press, paste, type, wait, waitFor, type Step } from './director.js';

// One entry per scene, in F-key order. Each starts by jumping to its scene, so a
// scene's script can be played (and tested) on its own. Anything the app does on
// its own clock is awaited with `waitFor`, never with a guessed pause.
export const SCRIPT: Record<string, Step[]> = {
  layout: [
    press('f1'), wait(1400),
    press('right'), wait(650), press('right'), wait(650), press('right'), wait(650),
    press('right'), wait(650), press('right'), waitFor('space-evenly'), wait(1100),
  ],
  form: [
    press('f2'), wait(700),
    press('return'), wait(900),                          // empty name → the field shows its own error
    type('Ada Lovelace'), wait(400),
    press('tab'), wait(350), press('down'), wait(500),   // plan: the focused list is highlighted
    press('tab'), wait(350), press('tab'), wait(350),     // past "select all" (it turns mixed once some are picked)
    press(' '), wait(250), press('down', {}, 2), press(' '), wait(250),
    press('down'), wait(300), press('return'), wait(700), // "+ add new" → a new item, selected
    press('tab'), wait(350), press('return'), wait(600),  // region: the dropdown opens under the field
    type('tok'), wait(500), press('return'), wait(500),   // typing filters; Enter picks Asia (Tokyo)
    press('tab'), wait(350), press('return'), wait(600),  // tags: a multiple dropdown
    press(' '), wait(300), press('down'), wait(200), press(' '), wait(300), press('return'), wait(500),
    press('tab'), wait(350), press(' '), wait(500),       // notify me: a glyph checkbox
    press('tab'), wait(300), press('return'),
    waitFor('Saved ✓'), wait(1400),
  ],
  data: [
    press('f3'), wait(500),
    // Sweep the pane's first paragraph. It is soft-wrapped over two rows, and
    // the pane is a selectionScope, so it comes back as the one line it was
    // written as — and the footer says how many characters went out.
    mouse([
      { kind: 'down', x: 71, y: 6 },
      { kind: 'drag', x: 84, y: 6 },
      { kind: 'drag', x: 94, y: 6 },
      { kind: 'drag', x: 84, y: 7 },
      { kind: 'drag', x: 94, y: 7 },
      { kind: 'up', x: 94, y: 7 },
    ]),
    waitFor('copied'), wait(700),
    press('down'), wait(650), press('down'), wait(650), press('down'), wait(650), press('down'),
    waitFor('@flowtty/testing'), wait(1300),
  ],
  progress: [
    press('f4'),
    waitFor('released ✓'), wait(1300),
  ],
  chat: [
    press('f5'), wait(700),
    type('How do I scroll a list?'), wait(300), press('return'),
    waitFor('answered 1'), wait(700),
    paste('And a paste keeps\nits line breaks,\nlike this.'), wait(900), press('return'),
    wait(900), press('pageup', {}, 2),                   // scroll up mid-answer: the view holds still
    waitFor('rows below'), wait(1600),
    press('pagedown', {}, 4),
    waitFor('answered 2'), wait(1200),
  ],
  dialog: [
    press('f6'), wait(900),
    press('down'), wait(400), press('r'), waitFor('New name'), wait(600),
    press('a', { ctrl: true }), press('k', { ctrl: true }), wait(300), type('ideas.md'), wait(400), press('return'),
    waitFor('renamed to ideas.md'), wait(1000),
    press('down'), wait(400), press('d'), waitFor('Delete “release-plan.md”?'), wait(900), press('y'),
    waitFor('deleted release-plan.md'), wait(1300),
  ],
  snake: [
    press('f7'),
    waitFor('score 6', 60000), wait(900),
  ],
};

export const FULL_SCRIPT: Step[] = Object.values(SCRIPT).flat();
