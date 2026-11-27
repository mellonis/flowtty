// The colours of markdown PROSE — everything outside a fenced block that the
// layout and the source view colour: headings, inline `code`, link labels, list
// markers and the blockquote bar. The fenced blocks have their own palette
// (`tokenColors`); this is its sibling, with the same override shape and the same
// merge rules. Every default is a named palette colour, so the 256 / 16-colour
// downgrade and NO_COLOR apply (docs/components.md — markdown colours).

import type { Color } from '@flowtty/core';

/** A prose element a caller may recolour. Headings past level 3 use `heading3`. */
export type ProseRole =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'code'
  | 'link'
  | 'listMarker'
  | 'quote';

/** The ink of one prose element. A heading is bold whatever its style says. */
export interface ProseStyle {
  color?: Color;
  dim?: boolean;
  bold?: boolean;
}

/** One role's override: a whole style, or just the ink. */
export type ProseColorOverride = ProseStyle | Color;

/** What a caller may override; every role left out keeps its default. */
export type ProseColors = Partial<Record<ProseRole, ProseColorOverride>>;

/** The styles prose is drawn with, one per role. */
export type ProsePalette = Readonly<Record<ProseRole, ProseStyle>>;

export const DEFAULT_PROSE_COLORS: ProsePalette = {
  heading1: { color: 'magenta' },
  heading2: { color: 'cyan' },
  heading3: { color: 'blue' },
  code: { color: 'cyan' },
  link: { color: 'blue' },
  listMarker: { color: 'yellow' },
  // The bar (or the `> ` a source view keeps) says "quoted"; the quoted text
  // itself is dimmed by the layout, not by this role.
  quote: { color: 'cyan', dim: true },
};

/**
 * The defaults with the caller's overrides laid over them, role by role — the
 * same rules as `tokenColors`: a field left out (or explicitly `undefined`) keeps
 * the default, a bare Color is that role's ink, and an unknown role or a role
 * mapped to `undefined` is ignored.
 */
export function resolveProse(overrides?: ProseColors): ProsePalette {
  if (!overrides) return DEFAULT_PROSE_COLORS;
  const out: Record<ProseRole, ProseStyle> = { ...DEFAULT_PROSE_COLORS };
  for (const role of Object.keys(DEFAULT_PROSE_COLORS) as ProseRole[]) {
    const o = overrides[role];
    if (o === undefined) continue;
    const base = DEFAULT_PROSE_COLORS[role];
    out[role] = typeof o === 'string'
      ? { ...base, color: o }
      : {
          ...base,
          ...(o.color === undefined ? {} : { color: o.color }),
          ...(o.dim === undefined ? {} : { dim: o.dim }),
          ...(o.bold === undefined ? {} : { bold: o.bold }),
        };
  }
  return out;
}

/** The role a heading of `level` is drawn with. */
export function headingRole(level: number): ProseRole {
  return level <= 1 ? 'heading1' : level === 2 ? 'heading2' : 'heading3';
}

/** A style's set fields only, so spreading it never writes an `undefined`. */
export function proseInk(style: ProseStyle): ProseStyle {
  const ink: ProseStyle = {};
  if (style.color !== undefined) ink.color = style.color;
  if (style.dim !== undefined) ink.dim = style.dim;
  if (style.bold !== undefined) ink.bold = style.bold;
  return ink;
}
