// Wide glyphs on a real terminal — a visual check of the two-cell grid.
//   npm run wide-glyphs          (from the repo root)
//
// Every panel exercises one rule from docs/terminal.md (display width). Things
// move on a timer so a recording shows the frame diff at work: a wide glyph
// replacing narrow characters at the same column and the reverse, backgrounds
// travelling over a wide cluster, a caret crossing one.
//
// Keys: type into the field; F10 opens the menu (Esc closes it); q quits.
import React from 'react';
import { render, DialogHost } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';
import { App } from './app.js';

const app = await render(<DialogHost><App /></DialogHost>, new TtyBackend());
await app.waitUntilExit();
