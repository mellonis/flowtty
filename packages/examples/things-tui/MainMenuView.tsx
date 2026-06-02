/** @jsxImportSource react */
import { useState, type ReactNode } from 'react';
import { Box, Menu, type MenuItem, HelpBar } from '@flowtty/react';
import { SectionsListView } from './SectionsListView.js';
import { AllThingsView } from './AllThingsView.js';
import { ThingsOfTheDayView } from './ThingsOfTheDayView.js';

interface MainMenuViewProps {
  onLogout: () => void;
}

export function MainMenuView({ onLogout }: MainMenuViewProps) {
  // The active "page" rendered below the menubar. Items with `render` set this
  // via the Menu's onPage callback; selecting a different item swaps it.
  const [page, setPage] = useState<ReactNode>(null);

  const items: MenuItem[] = [
    {
      key: 'sections',
      label: 'Sections',
      submenu: [
        { key: 'sections-list', label: 'List', render: () => <SectionsListView onLogout={onLogout} /> },
      ],
    },
    {
      key: 'things',
      label: 'Things',
      submenu: [
        { key: 'things-list', label: 'List',              render: () => <AllThingsView onLogout={onLogout} /> },
        { key: 'things-totd', label: 'Things of the day', render: () => <ThingsOfTheDayView onLogout={onLogout} /> },
      ],
    },
    { key: 'logout', label: 'Logout', onSelect: onLogout },
  ];

  // Esc at the menu root: clear the page first (back out of a page view), else
  // logout. Menu's own Esc-in-submenu close happens before this is called.
  const handleExit = () => {
    if (page) setPage(null);
    else onLogout();
  };

  // When no page is shown: empty state centered h/v + a minimal HelpBar.
  // When a page is shown: the page renders its own chrome (Title + HelpBar);
  // we don't add a second HelpBar to avoid competing for the bottom row.
  return (
    <Menu title="Poetry CMS" items={items} onExit={handleExit} onPage={setPage}>
      {page != null ? (
        <Box flexGrow={1} flexDirection="column">{page}</Box>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          <Box flexGrow={1} justifyContent="center" alignItems="center">
            <Box dim>Select a menu item to begin. Press F10 to focus the menu.</Box>
          </Box>
          <HelpBar>F10 menu · Esc logout</HelpBar>
        </Box>
      )}
    </Menu>
  );
}
