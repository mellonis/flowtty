/** @jsxImportSource react */
import { useEffect, useState, useMemo } from 'react';
import { Box, useInput, useDialog, HRule, HelpBar, splitVisualLines, useRootAbortSignal, type VisualLine } from '@flowtty/react';
import { getThing, ApiError, setToken } from './api.js';
import type { Thing } from './types.js';
import { displayThingTitle } from './helpers.js';

interface ThingDetailViewProps {
  id: number;
  // Called when the user's session expires (401). The parent List view is
  // unmounted by the App's view switch back to login.
  onLogout: () => void;
}

// Keys:
//   ↓/→/j next page · ↑/←/k prev page
//   m toggle metadata · n toggle line numbers · w toggle wrap mode
//   Esc back
export function ThingDetailView({ id, onLogout }: ThingDetailViewProps) {
  const { cancel } = useDialog();
  // Two layers of teardown, on purpose: the `cancelled` flag below stops a
  // setState when THIS dialog closes mid-fetch (per-component unmount), while
  // the root signal aborts the fetch at the socket if the whole app exits.
  const signal = useRootAbortSignal();
  const [thing, setThing] = useState<Thing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageIdx, setPageIdx] = useState(0);
  const [bodySize, setBodySize] = useState<{ width: number; height: number } | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [wrapMode, setWrapMode] = useState<'wrap' | 'nowrap'>('wrap');
  const [showMetadata, setShowMetadata] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const t = await getThing(id, signal ?? undefined);
        if (!cancelled) setThing(t);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Error && e.name === 'AbortError') return;
        if (e instanceof ApiError && e.status === 401) {
          setToken(null);
          onLogout();
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, onLogout, signal]);

  const bodyText = thing?.text ?? '';
  // Source-line digit count drives the gutter width AND its right-padding.
  const numDigits = useMemo(
    () => String(Math.max(1, bodyText.split('\n').length)).length,
    [bodyText],
  );
  const lineNumGutter = showLineNumbers ? numDigits + 3 : 0;  // ` N │ ` is numDigits + 3 cells
  const effectiveWidth = bodySize ? Math.max(1, bodySize.width - lineNumGutter) : 0;

  const bodyLines: VisualLine[] = useMemo(
    () => bodySize ? splitVisualLines(bodyText, wrapMode, effectiveWidth) : [],
    [bodyText, wrapMode, effectiveWidth, bodySize],
  );
  const pagesCount = bodySize ? Math.max(1, Math.ceil(bodyLines.length / bodySize.height)) : 1;
  const clampedPageIdx = Math.min(pageIdx, pagesCount - 1);
  const currentPageLines: VisualLine[] = bodySize
    ? bodyLines.slice(clampedPageIdx * bodySize.height, (clampedPageIdx + 1) * bodySize.height)
    : [];

  useInput((key) => {
    if (key.name === 'right' || key.name === 'down' || key.name === 'j') {
      setPageIdx((p) => Math.min(p + 1, pagesCount - 1));
    } else if (key.name === 'left' || key.name === 'up' || key.name === 'k') {
      setPageIdx((p) => Math.max(p - 1, 0));
    } else if (key.name === 'n') {
      setShowLineNumbers((s) => !s);
    } else if (key.name === 'm') {
      setShowMetadata((s) => !s);
      setPageIdx(0);
    } else if (key.name === 'w') {
      setWrapMode((m) => (m === 'wrap' ? 'nowrap' : 'wrap'));
      setPageIdx(0);
    } else if (key.name === 'escape') {
      cancel();
    }
  });

  if (loading) return <Box>Loading thing #{id}…</Box>;

  if (error) {
    return (
      <Box flexDirection="column">
        <Box color="red">Error: {error}</Box>
        <Box>Esc to go back.</Box>
      </Box>
    );
  }

  if (!thing) return <Box>Not found.</Box>;

  const helpLine = `#${thing.id} · page ${clampedPageIdx + 1}/${pagesCount} · ↓→/↑← page · m meta · n num · w ${wrapMode} · Esc back`;

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Metadata block (toggled by `m`). */}
      {showMetadata && (
        <Box flexDirection="column">
          <Box flexDirection="row"><Box bold>id: </Box><Box>{String(thing.id)}</Box></Box>
          <Box flexDirection="row"><Box bold>title: </Box><Box flexGrow={1} wrap="wrap">{displayThingTitle(thing.title, thing.firstLines, thing.id)}</Box></Box>
          <Box flexDirection="row"><Box bold>categoryId: </Box><Box>{String(thing.categoryId)}</Box></Box>
          <Box flexDirection="row"><Box bold>statusId: </Box><Box>{String(thing.statusId)}</Box></Box>
          {thing.startDate !== null && (
            <Box flexDirection="row"><Box bold>start: </Box><Box>{thing.startDate}</Box></Box>
          )}
          {thing.finishDate !== null && (
            <Box flexDirection="row"><Box bold>finish: </Box><Box>{thing.finishDate}</Box></Box>
          )}
          <Box flexDirection="row"><Box bold>excludeFromDaily: </Box><Box>{String(thing.excludeFromDaily)}</Box></Box>
          {thing.firstLines !== null && (
            <Box flexDirection="row"><Box bold>firstLines: </Box><Box flexGrow={1} wrap="wrap">{thing.firstLines}</Box></Box>
          )}
          <Box flexDirection="row"><Box bold>firstLinesAutoGenerating: </Box><Box>{String(thing.firstLinesAutoGenerating)}</Box></Box>
          {thing.seoDescription !== null && (
            <Box flexDirection="row"><Box bold>seoDescription: </Box><Box flexGrow={1} wrap="wrap">{thing.seoDescription}</Box></Box>
          )}
          {thing.seoKeywords !== null && (
            <Box flexDirection="row"><Box bold>seoKeywords: </Box><Box flexGrow={1} wrap="wrap">{thing.seoKeywords}</Box></Box>
          )}
          {thing.notes.length > 0 && (
            <Box flexDirection="row"><Box bold>notes: </Box><Box flexGrow={1} wrap="wrap">{JSON.stringify(thing.notes)}</Box></Box>
          )}
          {thing.info != null && (
            <Box flexDirection="row"><Box bold>info: </Box><Box flexGrow={1} wrap="wrap">{JSON.stringify(thing.info)}</Box></Box>
          )}
          <HRule />
        </Box>
      )}
      {/* Body region — flexGrow:1 absorbs remaining height; onLayout reports
          the allocated rect so we can paginate. Diff guard avoids re-render
          loop (onLayout fires every paint). */}
      <Box
        flexGrow={1}
        overflow="hidden"
        onLayout={(r) => {
          if (!bodySize || bodySize.width !== r.width || bodySize.height !== r.height) {
            setBodySize({ width: r.width, height: r.height });
          }
        }}
      >
        {bodySize === null ? (
          <Box>{'…'}</Box>
        ) : (
          <Box flexDirection="column">
            {currentPageLines.length === 0 && bodyText === '' ? (
              <Box dim>(no content)</Box>
            ) : currentPageLines.map((bl, i) => {
              const displayLine = bl.text === '' ? ' ' : bl.text;
              if (showLineNumbers) {
                const numStr = bl.lineNum !== null
                  ? String(bl.lineNum).padStart(numDigits, ' ')
                  : ' '.repeat(numDigits);
                return (
                  <Box key={`body-${i}`} flexDirection="row">
                    <Box dim>{`${numStr} │ `}</Box>
                    <Box flexGrow={1}>{displayLine}</Box>
                  </Box>
                );
              }
              return <Box key={`body-${i}`}>{displayLine}</Box>;
            })}
          </Box>
        )}
      </Box>
      <HelpBar>{helpLine}</HelpBar>
    </Box>
  );
}
