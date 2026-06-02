/** @jsxImportSource react */
import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Box, useDialog, useDialogHost, useInput } from '@flowtty/react';
import { listFolders, loadRegisteredTags, slugify, writeArticleSkeleton, TODAY } from './helpers.js';
import { WIZARD_STEPS, type WizardStepName } from './types.js';
import { LangDialog, LANG_DIALOG_TITLE } from './LangDialog.js';
import { TitleDialog, TITLE_DIALOG_TITLE } from './TitleDialog.js';
import { SlugDialog, SLUG_DIALOG_TITLE } from './SlugDialog.js';
import { TagsDialog, TAGS_DIALOG_TITLE } from './TagsDialog.js';

export const CREATE_VIEW_TITLE = 'New article wizard';

// ─── CreateView ───────────────────────────────────────────────────────────────
//
// Checklist outer dialog + per-question nested sub-dialogs (stacked DialogHost).
// The outer dialog shows progress (☐ pending, ✓ done) with a ▸ cursor row.
// Each question is asked via openDialog on demand, not via auto-chain.
//
// Interaction model:
//   - ↑/k, ↓/j: move cursor among the 4 rows (cycle).
//   - Enter: open the highlighted row's sub-dialog (pre-filled if already set).
//   - Esc (all 4 filled): write skeleton + done(slug).
//   - Esc (not all filled): cancel the wizard.
//   - On mount: auto-open the first unfilled step (convenience).
//   - After each sub-dialog submit: auto-open the next unfilled step (if any).
//   - Esc on a sub-dialog: sub-dialog closes, wizard stays open with cursor on that row.
//
// State tracking:
//   - React state drives checklist rendering.
//   - valuesRef is the authoritative accumulator for async chains; React state
//     updates are async — closure code reads from valuesRef.current.

export function CreateView() {
  const { done, cancel } = useDialog();
  const { openDialog } = useDialogHost();

  // ── Cursor state ──────────────────────────────────────────────────────────
  const [cursor, setCursor] = useState(0);

  // ── Render state (drives checklist display) ───────────────────────────────
  // No user-controlled cursor — the ▸ marker always points to the first
  // unfilled step (or nowhere when all filled). Filled steps are read-only.
  const [lang, setLang] = useState<'en' | 'ru' | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[] | null>(null);

  // ── Authoritative value accumulator (read by async chains) ────────────────
  //
  // React state is async; openStep() is called from async chains that may see
  // stale state closures. valuesRef is kept in sync with state and is safe to
  // read inside awaits.
  const valuesRef = useRef<{
    lang: 'en' | 'ru' | null;
    title: string | null;
    slug: string | null;
    selectedTags: string[] | null;
  }>({ lang: null, title: null, slug: null, selectedTags: null });

  // Snapshot of existing slugs + known tags at mount time (stable for wizard duration).
  const existingSlugs = useRef<Set<string>>(new Set<string>(listFolders() as string[]));
  const knownTagsAtStart = useRef<string[]>(loadRegisteredTags() as string[]);

  // Guard against strict-mode double-mount re-opening the auto sub-dialog.
  const hasAutoOpened = useRef(false);

  // Helper: true if a step's value is filled (non-null and non-empty).
  const isFilled = useCallback((name: WizardStepName): boolean => {
    const v = valuesRef.current;
    if (name === 'lang') return v.lang !== null;
    if (name === 'title') return v.title !== null && v.title !== '';
    if (name === 'slug') return v.slug !== null && v.slug !== '';
    if (name === 'tags') return v.selectedTags !== null && (v.selectedTags as string[]).length > 0;
    return false;
  }, []);

  // Helper: find the first unfilled step index, or -1 if all filled.
  const findNextUnfilled = useCallback((startFrom = 0): number => {
    for (let i = startFrom; i < WIZARD_STEPS.length; i++) {
      if (!isFilled(WIZARD_STEPS[i]!)) return i;
    }
    return -1;
  }, [isFilled]);

  // ── openStep: open the appropriate sub-dialog for a given step index ───────
  //
  // Sets selectedRow to the step's index, awaits the dialog result, updates
  // ref + state on submit, then auto-opens the next unfilled step (if any).
  // On cancel from sub-dialog: just returns (wizard stays open).
  const openStep = useCallback(async (idx: number): Promise<void> => {
    const stepName = WIZARD_STEPS[idx]!;
    const wasFilledBefore = isFilled(stepName);
    setCursor(idx);

    // Track whether the submitted value differs from what was already there —
    // only ACTUAL changes invalidate downstream (re-confirming the same value
    // is a no-op, downstream stays intact).
    let valueChanged = false;

    if (stepName === 'lang') {
      const oldValue = valuesRef.current.lang;
      const result = await openDialog<'en' | 'ru'>(
        <LangDialog initialValue={oldValue ?? 'en'} />,
        { title: LANG_DIALOG_TITLE, floating: true, minWidth: 40, padding: 1 },
      );
      if (result.status === 'cancelled') return;
      valuesRef.current.lang = result.value;
      setLang(result.value);
      valueChanged = oldValue !== result.value;
    } else if (stepName === 'title') {
      const oldValue = valuesRef.current.title;
      const result = await openDialog<string>(
        <TitleDialog initialValue={oldValue ?? ''} />,
        { title: TITLE_DIALOG_TITLE, floating: true, minWidth: 40, padding: 1 },
      );
      if (result.status === 'cancelled') return;
      valuesRef.current.title = result.value;
      setTitle(result.value);
      valueChanged = oldValue !== result.value;
    } else if (stepName === 'slug') {
      const oldValue = valuesRef.current.slug;
      const currentTitle = valuesRef.current.title ?? '';
      const currentLang = valuesRef.current.lang ?? 'en';
      const defaultSlug = oldValue ?? slugify(currentTitle, currentLang);
      const result = await openDialog<string>(
        <SlugDialog
          defaultValue={defaultSlug}
          existingSlugs={existingSlugs.current}
          editingCurrentSlug={oldValue ?? undefined}
        />,
        { title: SLUG_DIALOG_TITLE, floating: true, minWidth: 40, padding: 1 },
      );
      if (result.status === 'cancelled') return;
      valuesRef.current.slug = result.value;
      setSlug(result.value);
      valueChanged = oldValue !== result.value;
    } else if (stepName === 'tags') {
      const oldValue = valuesRef.current.selectedTags;
      const result = await openDialog<string[]>(
        <TagsDialog
          knownTags={knownTagsAtStart.current}
          preSelected={oldValue ?? []}
        />,
        { title: TAGS_DIALOG_TITLE, floating: true, minWidth: 40, padding: 1 },
      );
      if (result.status === 'cancelled') return;
      valuesRef.current.selectedTags = result.value;
      setSelectedTags(result.value);
      // Arrays: compare by serialized contents (order matters in submit order).
      valueChanged = (oldValue?.join('\x00') ?? null) !== result.value.join('\x00');
    }

    // On RE-EDIT with an actual value change: clear all downstream values, as
    // they may have been derived from / depend on the now-changed input.
    // No-op re-edit (value unchanged) leaves downstream intact.
    if (wasFilledBefore && valueChanged) {
      for (let i = idx + 1; i < WIZARD_STEPS.length; i++) {
        const s = WIZARD_STEPS[i]!;
        if (s === 'lang') { valuesRef.current.lang = null; setLang(null); }
        else if (s === 'title') { valuesRef.current.title = null; setTitle(null); }
        else if (s === 'slug') { valuesRef.current.slug = null; setSlug(null); }
        else if (s === 'tags') { valuesRef.current.selectedTags = null; setSelectedTags(null); }
      }
    } else if (!wasFilledBefore) {
      // First-fill of a previously-empty step → cascade forward to next unfilled.
      const nextIdx = findNextUnfilled(0);
      if (nextIdx !== -1) await openStep(nextIdx);
    }
  }, [openDialog, findNextUnfilled, isFilled]);

  // Extract the submit logic so it's reachable from both auto-submit (openStep)
  // and the Enter-re-open path (in case user Esc'd out then triggered submit).
  const submitWizard = useCallback(() => {
    const v = valuesRef.current;
    writeArticleSkeleton({
      slug: v.slug!,
      date: TODAY,
      tags: v.selectedTags!,
      originalLang: v.lang!,
      title: v.title!,
    });
    done(v.slug!);
  }, [done]);

  // ── Auto-open first unfilled step on mount ────────────────────────────────
  useEffect(() => {
    if (hasAutoOpened.current) return;
    hasAutoOpened.current = true;
    const firstUnfilled = findNextUnfilled(0);
    if (firstUnfilled !== -1) {
      void openStep(firstUnfilled);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard input ────────────────────────────────────────────────────────
  //
  // Reachable rows: all FILLED rows + the FIRST UNFILLED row (sequential
  // unlock). Unfilled rows past the first are locked — can't navigate to them
  // until their predecessor is filled. Prevents user from "skipping" steps.
  // ↑↓/jk navigate within the reachable range (no wrap; clamped).
  // Enter on cursor → open/edit that step's sub-dialog.
  // Esc on the LAST row when everything is filled → submit; else cancel.
  const rowCount = WIZARD_STEPS.length;
  const firstUnfilled = findNextUnfilled(0); // -1 when all filled
  const maxReachable = firstUnfilled === -1 ? rowCount - 1 : firstUnfilled;

  useInput((key) => {
    if (key.name === 'up' || key.name === 'k') {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (key.name === 'down' || key.name === 'j') {
      setCursor((c) => Math.min(c + 1, maxReachable));
    } else if (key.name === 'return') {
      void openStep(cursor);
    } else if (key.name === 'escape') {
      const allFilled = WIZARD_STEPS.every(isFilled);
      if (allFilled && cursor === rowCount - 1) {
        submitWizard();
      } else {
        cancel();
      }
    }
  });

  // Keep cursor in bounds if maxReachable shrinks after a state change.
  // (e.g. user edited a filled row but it's still filled — no change. If a
  // first-fill happens via the cascade, maxReachable advances; cursor stays
  // at the row that was just filled, which is still reachable.)

  // ── Checklist rendering ────────────────────────────────────────────────────
  //
  // Row: {▸ if at cursor, else spaces}{✓ or ☐} label-or-value
  // - Cursor row is bold (active focus indicator)
  // - Filled rows downstream of the cursor (cursor on a non-last row) get
  //   strikethrough to warn the user: "editing this likely invalidates these"
  //   (e.g. changing title regenerates slug derivation, downstream steps may
  //   need re-confirmation).

  function checklistRow(
    idx: number,
    label: string,
    doneText: string | null,
  ): ReactNode {
    const isActive = idx === cursor;
    const isDone = doneText !== null;
    // Downstream filled = filled row past the cursor → render with red ✗ to
    // warn it's "stale" (cursor is before it; editing the current step may
    // invalidate this value).
    const isDownstream = idx > cursor && isDone;
    // Unfilled rows past maxReachable (not the first unfilled) are locked →
    // dimmed so the user sees they're unreachable until predecessor fills.
    const isLocked = !isDone && idx > maxReachable;
    const cursorMark = isActive ? '▸ ' : '  ';

    // Icon: ✓ green (confirmed) / ✗ red (downstream stale) / ☐ (unfilled).
    let checkMark: string;
    let checkColor: string | undefined;
    if (isDone && !isDownstream) {
      checkMark = '✓';
      checkColor = 'green';
    } else if (isDone && isDownstream) {
      checkMark = '✗';
      checkColor = 'red';
    } else {
      checkMark = '☐';
      checkColor = undefined;
    }

    const text = isDone ? doneText! : label;

    return (
      <Box key={label} flexDirection="row">
        <Box width={2}>{cursorMark}</Box>
        <Box width={2} bold={isActive} color={checkColor} dim={isLocked}>{checkMark + ' '}</Box>
        <Box flexGrow={1} wrap="truncate" bold={isActive} dim={isLocked}>{text}</Box>
      </Box>
    );
  }

  return (
    <>
      {checklistRow(0, 'Article original language', lang !== null ? `Article original language: ${lang}` : null)}
      {checklistRow(1, 'Article title', title !== null ? `Article title: ${title}` : null)}
      {checklistRow(2, 'Article URL slug', slug !== null ? `Article URL slug: ${slug}` : null)}
      {checklistRow(3, 'Article tags', selectedTags !== null && selectedTags.length > 0
        ? `Article tags: ${selectedTags.join(', ')}` : null)}
    </>
  );
}
