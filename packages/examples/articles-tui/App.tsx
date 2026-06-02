/** @jsxImportSource react */
import { useState, useCallback } from 'react';
import { Box, useDialogHost } from '@flowtty/react';
import { setDraftForFolder } from './helpers.js';
import type { ListAction, ArticleViewDoneResult, AppView } from './types.js';
import { ListView } from './ListView.js';
import { ArticleView } from './ArticleView.js';
import { TagsListView } from './TagsListView.js';
import { EditArticleTagsView } from './EditArticleTagsView.js';
import { CreateView, CREATE_VIEW_TITLE } from './CreateView.js';
import { CreateSuccessDialog, CREATE_SUCCESS_DIALOG_TITLE } from './CreateSuccessDialog.js';
import { DeleteConfirmDialog, DELETE_CONFIRM_DIALOG_TITLE } from './DeleteConfirmDialog.js';

// ─── App ──────────────────────────────────────────────────────────────────────

interface AppProps {
  onExit: () => void;
}

export function App({ onExit }: AppProps) {
  const { openDialog } = useDialogHost();
  const [cursor, setCursor] = useState(0);
  const [view, setView] = useState<AppView>({ kind: 'list' });
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  // Status message shown in the debug line on the list view.
  const [statusMessage, setStatusMessage] = useState<string | null | undefined>(undefined);

  const handleCursorChange = useCallback((n: number) => setCursor(n), []);

  const handleAction = useCallback((action: ListAction | null) => {
    if (action === null) {
      onExit();
      return;
    }
    if (action.kind === 'create') {
      void (async () => {
        const result = await openDialog<string>(<CreateView />, {
          title: CREATE_VIEW_TITLE, floating: true, minWidth: 50, padding: 1,
        });
        if (result.status !== 'done') return;
        const slug = result.value;
        setLastCreated(slug);
        // Show success dialog: 'o' opens the new article, Enter/Esc closes.
        const successResult = await openDialog<{ action: 'open' }>(
          <CreateSuccessDialog slug={slug} />,
          { title: CREATE_SUCCESS_DIALOG_TITLE, floating: true, minWidth: 50, padding: 1 },
        );
        if (successResult.status === 'done' && successResult.value.action === 'open') {
          setView({ kind: 'view', id: slug, lang: 'en', page: 0 });
        }
      })();
      return;
    }
    if (action.kind === 'view' && action.id) {
      setView({ kind: 'view', id: action.id, lang: 'en', page: 0 });
      return;
    }
    if (action.kind === 'tags-list') {
      setView({ kind: 'tags-list' });
      return;
    }
    if (action.kind === 'delete' && action.id) {
      const id = action.id;
      void openDialog<{ deleted: boolean }>(
        <DeleteConfirmDialog id={id} />,
        { title: DELETE_CONFIRM_DIALOG_TITLE, floating: true, minWidth: 50, padding: 1 },
      ).then((result) => {
        if (result.status === 'done' && result.value.deleted) {
          setStatusMessage(`deleted: ${id}`);
        } else {
          setStatusMessage('delete: aborted');
        }
      });
      return;
    }
    if (action.kind === 'publish' && action.id) {
      const id = action.id;
      void setDraftForFolder(id, false)
        .then(() => setStatusMessage(`published: ${id}`));
      return;
    }
    if (action.kind === 'withdraw' && action.id) {
      const id = action.id;
      void setDraftForFolder(id, true)
        .then(() => setStatusMessage(`withdrew: ${id}`));
      return;
    }
  }, [openDialog, onExit]);

  const handleArticleViewDone = useCallback((result: ArticleViewDoneResult | null) => {
    if (result !== null && result.action === 'edit-tags') {
      const currentView = view as { kind: 'view'; id: string };
      setView({
        kind: 'edit-tags',
        id: currentView.id,
        returnLang: result.lang,
        returnPage: result.page,
      });
      return;
    }
    setView({ kind: 'list' });
  }, [view]);

  if (view.kind === 'view') {
    return (
      <ArticleView
        id={view.id}
        initialLang={view.lang ?? 'en'}
        initialPage={view.page ?? 0}
        onDone={handleArticleViewDone}
      />
    );
  }

  if (view.kind === 'tags-list') {
    return (
      <TagsListView onDone={() => setView({ kind: 'list' })} />
    );
  }

  if (view.kind === 'edit-tags') {
    const editTagsView = view;
    return (
      <EditArticleTagsView
        id={editTagsView.id}
        onDone={() => setView({
          kind: 'view',
          id: editTagsView.id,
          lang: editTagsView.returnLang,
          page: editTagsView.returnPage,
        })}
      />
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* ListView takes the full height so it can pin its help bar to the bottom edge. */}
      <Box flexGrow={1}>
        <ListView
          cursor={cursor}
          onCursorChange={handleCursorChange}
          onAction={handleAction}
          statusMessage={statusMessage}
        />
      </Box>
      {lastCreated ? <Box dim>{`last created: ${lastCreated}`}</Box> : null}
    </Box>
  );
}
