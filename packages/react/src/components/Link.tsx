import { createElement, type ReactNode } from 'react';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useBackend } from '../hooks/useBackend.js';

export interface LinkProps {
  /** Target URL. Emitted as an OSC 8 hyperlink on backends that support it. */
  href: string;
  /** Visible label. Defaults to the href when omitted. */
  children?: ReactNode;
  /** Label color. Default 'blue'. */
  color?: string;
  /**
   * When the backend can't render clickable links, append the URL in dim
   * parentheses after the label so it's still reachable. Default true. No-op
   * when the label already equals the href (would be redundant). Ignored on
   * link-capable backends (the URL is in the OSC 8 escape, not on screen).
   */
  showUrlFallback?: boolean;
}

/**
 * A terminal hyperlink. On a backend that advertises `hyperlinks` (the TTY and
 * inline-TTY backends), renders the label as an underlined OSC 8 link — click
 * (or Cmd/Ctrl-click) in a supporting terminal opens it. On backends that
 * can't (the headless test surface, plain pipes), degrades to the styled label
 * plus a dim ` (url)` so the address is still visible.
 */
export function Link({ href, children, color = 'blue', showUrlFallback = true }: LinkProps) {
  const backend = useBackend();
  const label: ReactNode = children ?? href;

  if (backend?.hyperlinks) {
    return createElement(Text, { color, underline: true, link: href }, label);
  }

  // Fallback: styled label, optionally followed by the visible URL. Skip the
  // URL suffix when the label is itself the href (no extra information).
  const labelIsHref = children === undefined || children === href;
  const showUrl = showUrlFallback && !labelIsHref;
  if (!showUrl) {
    return createElement(Text, { color, underline: true }, label);
  }
  return createElement(
    Box,
    { flexDirection: 'row' },
    createElement(Text, { color, underline: true }, label),
    createElement(Text, { dim: true }, ` (${href})`),
  );
}
