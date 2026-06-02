/** @jsxImportSource react */
import { useState, useMemo, type ReactNode } from 'react';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Box, Text, useInput, HRule, HelpBar,
  layoutMarkdown, type StyledLine,
  highlightMarkdownSource, type SourceLine,
} from '@flowtty/react';
import type { ArticleViewDoneResult } from './types.js';

// ─── ArticleView ──────────────────────────────────────────────────────────────
//
// Displays one article: frontmatter (always visible) + paginated body.
// Pagination is driven by onLayout on the body region — gives the ALLOCATED
// height of that region after Yoga layout, so page size auto-adapts to any
// terminal size or resize.
//
// Key bindings mirror the original articles.mjs articleView:
//   ↓/→/j — next page     ↑/←/k — prev page
//   l — toggle lang        r — set ru    e — set en
//   c — cap body width at 80 cols (readable measure on wide terminals)
//   t — edit-tags action   Esc — back to list

// Comfortable prose measure: cap the body at this many columns when the
// reading-width toggle is on, so long lines don't sprawl across a wide terminal.
const MAX_READING_COLS = 80;

// Parse an article .md file into frontmatter text and body text.
function loadArticle(id: string, lang: 'en' | 'ru'): { fmText: string; bodyText: string } {
  const filePath = join('content/articles', id, `${lang}.md`);
  if (!existsSync(filePath)) return { fmText: `(${lang}.md not found)`, bodyText: '' };
  const raw = readFileSync(filePath, 'utf-8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) return { fmText: m[1]!, bodyText: m[2]!.replace(/^\n+/, '') };
  return { fmText: '(no frontmatter)', bodyText: raw };
}

interface ArticleViewProps {
  id: string;
  initialLang?: 'en' | 'ru';
  initialPage?: number;
  onDone: (result: ArticleViewDoneResult | null) => void;
}

export function ArticleView({ id, initialLang = 'en', initialPage = 0, onDone }: ArticleViewProps) {
  const [lang, setLang] = useState<'en' | 'ru'>(initialLang);
  const [pageIdx, setPageIdx] = useState(initialPage);
  const [bodySize, setBodySize] = useState<{ width: number; height: number } | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [wrapMode, setWrapMode] = useState<'wrap' | 'nowrap'>('wrap');
  const [showMetadata, setShowMetadata] = useState(true);
  const [capWidth, setCapWidth] = useState(false);
  // Default to the styled markdown render; `R` flips to the raw source view
  // (which keeps the line-number / wrap-mode source-reading affordances).
  const [rendered, setRendered] = useState(true);

  const { fmText, bodyText } = useMemo(() => loadArticle(id, lang), [id, lang]);

  // Reserve gutter cells for line-number prefix when toggled on (raw view only).
  // Width of the largest source-line number + ` │ ` (3 chars).
  const numDigits = String(bodyText.split('\n').length).length;
  const lineNumGutter = showLineNumbers ? numDigits + 3 : 0;
  // Body measure: the allocated width, optionally capped to a readable column
  // count. The cap is a no-op when the terminal is already narrower than 80.
  const contentWidth = bodySize
    ? (capWidth ? Math.min(bodySize.width, MAX_READING_COLS) : bodySize.width)
    : 0;
  const effectiveWidth = bodySize ? Math.max(1, contentWidth - lineNumGutter) : 0;
  // Raw view: source highlighted in place (markers kept, colored) — same syntax
  // highlighting as the rendered view, but the literal markdown is preserved.
  // Rendered view: markdown laid out into styled visual lines at the body width.
  // Both paginate by height the same.
  const srcLines: SourceLine[] = bodySize && !rendered
    ? highlightMarkdownSource(bodyText, effectiveWidth, wrapMode === 'wrap')
    : [];
  const mdLines: StyledLine[] = bodySize && rendered
    ? layoutMarkdown(bodyText, contentWidth)
    : [];
  const totalLines = rendered ? mdLines.length : srcLines.length;
  const pageH = bodySize ? bodySize.height : 1;
  const pagesCount: number = bodySize ? Math.max(1, Math.ceil(totalLines / pageH)) : 1;
  const clampedPageIdx: number = Math.min(pageIdx, pagesCount - 1);
  const pageStart = clampedPageIdx * pageH;

  const help = rendered ? 'R raw' : `R md · n num · w ${wrapMode}`;
  const widthHelp = `c ${capWidth ? '80col' : 'full'}`;
  const helpLine = `${id} · ${lang} · page ${clampedPageIdx + 1}/${pagesCount} · ↓→/↑← page · l lang · m meta · ${widthHelp} · ${help} · t tags · Esc back`;

  useInput((key) => {
    if (key.name === 'right' || key.name === 'down' || key.name === 'j') {
      setPageIdx((p) => Math.min(p + 1, pagesCount - 1));
    } else if (key.name === 'left' || key.name === 'up' || key.name === 'k') {
      setPageIdx((p) => Math.max(p - 1, 0));
    } else if (key.name === 'l') {
      setLang((l) => (l === 'en' ? 'ru' : 'en'));
      setPageIdx(0);
    } else if (key.name === 'r') {
      setLang('ru');
      setPageIdx(0);
    } else if (key.name === 'e') {
      setLang('en');
      setPageIdx(0);
    } else if (key.name === 'R') {
      setRendered((s) => !s);
      setPageIdx(0);
    } else if (key.name === 'n') {
      setShowLineNumbers((s) => !s);
    } else if (key.name === 'm') {
      setShowMetadata((s) => !s);
      setPageIdx(0);
    } else if (key.name === 'c') {
      // Capping the measure re-wraps the body → line count changes → repaginate.
      setCapWidth((s) => !s);
      setPageIdx(0);
    } else if (key.name === 'w') {
      setWrapMode((m) => (m === 'wrap' ? 'nowrap' : 'wrap'));
      setPageIdx(0);
    } else if (key.name === 't') {
      onDone({ action: 'edit-tags', lang, page: clampedPageIdx });
    } else if (key.name === 'escape') {
      onDone(null);
    }
  });

  const fmLines = fmText.split('\n');

  // Renders one frontmatter line. YAML keys (`key: value`) are bold up to the
  // colon; continuation/value lines render plain. Lines without `:` are plain.
  function renderFmLine(line: string, i: number): ReactNode {
    const m = /^([a-zA-Z_][\w-]*):(.*)$/.exec(line);
    if (m) {
      return (
        <Box key={`fm-${i}`} flexDirection="row">
          <Box bold>{`${m[1]}:`}</Box>
          <Box>{m[2]}</Box>
        </Box>
      );
    }
    return <Box key={`fm-${i}`}>{line === '' ? ' ' : line}</Box>;
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Metadata block (toggled by `m`). Bold keys; HR separator below. */}
      {showMetadata ? (
        <Box flexDirection="column">
          {fmLines.map(renderFmLine)}
          <HRule />
        </Box>
      ) : null}
      {/* Body region — flexGrow:1 so it absorbs remaining terminal height.
          onLayout fires after Yoga layout with the allocated rect. Diff guard
          prevents infinite re-render loops (onLayout fires on EVERY paint). */}
      <Box
        flexGrow={1}
        overflow="hidden"
        onLayout={(r) => {
          if (!bodySize || bodySize.width !== r.width || bodySize.height !== r.height) {
            setBodySize({ width: r.width, height: r.height });
          }
        }}
      >
        {/* First frame: bodySize is null — render a placeholder. Otherwise render
            the current page. Rendered view paints each styled markdown line as a
            row of <Text> spans; raw view paints source visual lines (with an
            optional line-number gutter; continuation wrap-lines blank it). */}
        {bodySize === null ? (
          <Box>{'…'}</Box>
        ) : rendered ? (
          <Box flexDirection="column">
            {mdLines.slice(pageStart, pageStart + pageH).map((ln, i) =>
              ln.spans.length === 0 ? (
                <Box key={`md-${i}`}>{' '}</Box>
              ) : (
                <Box key={`md-${i}`} flexDirection="row">
                  {ln.spans.map((s, j) => (
                    <Text key={j} color={s.color} bold={s.bold} dim={s.dim} underline={s.underline} link={s.link}>
                      {s.text}
                    </Text>
                  ))}
                </Box>
              ),
            )}
          </Box>
        ) : (
          <Box flexDirection="column">
            {srcLines.slice(pageStart, pageStart + pageH).map((ln, i) => {
              const content = ln.spans.length === 0 ? (
                <Box flexGrow={1}>{' '}</Box>
              ) : (
                <Box flexGrow={1} flexDirection="row">
                  {ln.spans.map((s, j) => (
                    <Text key={j} color={s.color} bold={s.bold} dim={s.dim} underline={s.underline} link={s.link}>
                      {s.text}
                    </Text>
                  ))}
                </Box>
              );
              if (showLineNumbers) {
                const numStr = ln.lineNum !== null
                  ? String(ln.lineNum).padStart(numDigits, ' ')
                  : ' '.repeat(numDigits);
                return (
                  <Box key={`body-${i}`} flexDirection="row">
                    <Box dim>{`${numStr} │ `}</Box>
                    {content}
                  </Box>
                );
              }
              return <Box key={`body-${i}`} flexDirection="row">{content}</Box>;
            })}
          </Box>
        )}
      </Box>
      {/* Help / status line pinned at the bottom (dim). */}
      <HelpBar>{helpLine}</HelpBar>
    </Box>
  );
}
