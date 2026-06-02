/** @jsxImportSource react */
// Dogfood port of site/scripts/articles.mjs's interactive wizard.
// Lives in flowtty/examples/ (not site/) to sidestep the npm-link + dual-React
// gotchas that ate several hours during initial dogfood. When flowtty is
// published to npm, this can move back to site/scripts/articles-tui.mjs and
// import @flowtty/flowtty normally.
//
// Run: `cd flowtty && npm run articles-tui` (uses tsx via the npm script).
// Helpers (listFolders, buildRows, statusOf, slugify, …) are imported via
// workspace-relative path from site/scripts/articles.mjs. Both repos must be
// siblings under /Users/mellonis/Developer/mellonis-workspace/ for the import
// to resolve.
//
// helpers.ts does the chdir + dynamic import of articles.mjs at module-init time.
// It is imported transitively via App → ListView/CreateView/etc. → helpers.
// The top-level-await in helpers.ts ensures chdir + articles.mjs load completes
// before any component code executes.
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
