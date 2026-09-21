import { describe, expect, test } from 'vitest';
import { highlightBlock, resolveLanguage, detectLanguage } from './index.js';

const texts = (lines: { segs: { text: string }[] }[]): string[] =>
  lines.map((l) => l.segs.map((s) => s.text).join(''));

describe('plain blocks', () => {
  test('an unknown language is one plain segment per line — no color, not dim', () => {
    const out = highlightBlock(['hello', 'world'], 'brainfuck');
    expect(out).toEqual([{ segs: [{ text: 'hello' }] }, { segs: [{ text: 'world' }] }]);
  });

  test('text / log / plain are explicitly plain', () => {
    for (const lang of ['text', 'log', 'plain']) {
      expect(highlightBlock(['a # b "c"'], lang)).toEqual([{ segs: [{ text: 'a # b "c"' }] }]);
      expect(resolveLanguage(lang)).toBeUndefined();
    }
  });

  test('a block with no language and no diff markers is plain', () => {
    expect(highlightBlock(['const x = 1;'], '')).toEqual([{ segs: [{ text: 'const x = 1;' }] }]);
    expect(resolveLanguage('')).toBeUndefined();
  });

  test('an empty block yields no lines and an empty line yields one empty segment', () => {
    expect(highlightBlock([], 'ts')).toEqual([]);
    expect(highlightBlock([''], 'ts')).toEqual([{ segs: [{ text: '' }] }]);
    expect(highlightBlock([''], 'nope')).toEqual([{ segs: [{ text: '' }] }]);
  });
});

describe('resolveLanguage', () => {
  test('canonicalizes an alias and ignores case and surrounding space', () => {
    expect(resolveLanguage('TS')).toBe('typescript');
    expect(resolveLanguage('  js  ')).toBe('javascript');
    expect(resolveLanguage('patch')).toBe('diff');
  });

  test('a name resolves to itself', () => {
    expect(resolveLanguage('diff')).toBe('diff');
    expect(resolveLanguage('python')).toBe('python');
  });

  test('an unknown label is undefined', () => {
    expect(resolveLanguage('cobol')).toBeUndefined();
  });
});

describe('detectLanguage', () => {
  test('a hunk header makes an unlabeled block a diff', () => {
    expect(detectLanguage([' a', '@@ -1,3 +1,4 @@', '+b'])).toBe('diff');
    expect(detectLanguage(['@@ -1 +1 @@'])).toBe('diff');
  });

  test('a `diff --git` line makes it a diff', () => {
    expect(detectLanguage(['diff --git a/x b/x', '--- a/x'])).toBe('diff');
  });

  test('anything else is undetected', () => {
    expect(detectLanguage(['+ a list item', '- another'])).toBeUndefined();
    expect(detectLanguage([])).toBeUndefined();
  });

  test('highlightBlock detects a diff when the fence has no label', () => {
    const out = highlightBlock(['@@ -1,2 +1,2 @@', '-old', '+new'], '');
    expect(out.map((l) => l.kind)).toEqual(['hunk', 'removed', 'added']);
  });
});

describe('diff', () => {
  const block = [
    'diff --git a/a.ts b/a.ts',
    'index 1234567..89abcde 100644',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -1,4 +1,4 @@ fn main',
    ' context',
    '-gone',
    '+added',
    'new file mode 100644',
    'rename from x',
  ];

  test('rows carry a kind and the matching color', () => {
    const out = highlightBlock(block, 'diff');
    expect(out.map((l) => l.kind)).toEqual([
      'header', 'header', 'header', 'header', 'hunk', undefined,
      'removed', 'added', 'header', 'header',
    ]);
    expect(out[4]!.segs[0]!.color).toBe('cyan');
    expect(out[6]!.segs[0]!.color).toBe('red');
    expect(out[7]!.segs[0]!.color).toBe('green');
    expect(out[0]!.segs[0]).toEqual({ text: 'diff --git a/a.ts b/a.ts', bold: true });
  });

  test('`+++` / `---` are tested before `+` / `-`', () => {
    const out = highlightBlock(['--- a/x', '+++ b/x'], 'patch');
    expect(out.map((l) => l.kind)).toEqual(['header', 'header']);
    expect(out.every((l) => l.segs.every((s) => s.color === undefined))).toBe(true);
  });

  test('a context line is normal text with no kind', () => {
    const [ctx] = highlightBlock([' untouched'], 'diff');
    expect(ctx).toEqual({ segs: [{ text: ' untouched' }] });
  });

  test('every row re-joins to its source', () => {
    expect(texts(highlightBlock(block, 'diff'))).toEqual(block);
  });
});
