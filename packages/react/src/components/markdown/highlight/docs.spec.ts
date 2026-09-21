import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { HIGHLIGHTED_LANGUAGES, type HighlightedLanguage } from './index.js';

// docs/components.md prints the language table. Its rows are generated from
// HIGHLIGHTED_LANGUAGES, so a language added (or renamed, or given another
// alias) without touching the page — or a row left behind after one is
// removed — fails here instead of quietly lying to a reader.
const page = readFileSync(new URL('../../../../../../docs/components.md', import.meta.url), 'utf8');

const label = (text: string): string => `\`${text}\``;

const row = (lang: HighlightedLanguage): string =>
  `| ${label(lang.name)} | ${lang.aliases.length === 0 ? '—' : lang.aliases.map(label).join(', ')} | ${lang.colors} |`;

const HEADER = '| Language | Other labels | Colored |';

test('docs/components.md lists exactly the languages the highlighter knows', () => {
  const lines = page.split('\n');
  const at = lines.indexOf(HEADER);
  expect(at).toBeGreaterThan(-1);
  // The header, the separator rule, then one row per language until the table ends.
  const rows: string[] = [];
  for (let i = at + 2; i < lines.length && lines[i]!.startsWith('|'); i++) rows.push(lines[i]!);
  expect(rows).toEqual(HIGHLIGHTED_LANGUAGES.map(row));
});
