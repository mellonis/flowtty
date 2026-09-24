/** What a checkbox shows: off, on, or `'mixed'` — some of what it stands for. */
export type CheckboxState = boolean | 'mixed';
/** `brackets` is ASCII — `[ ]`, `[x]`, `[-]`; `none` is one glyph — `☐`, `☑`, `⊟`. */
export type CheckboxFrame = 'brackets' | 'none';

export interface CheckboxMarker {
  text: string;
  /** The color a checked marker carries (green, as Markdown's task lists). */
  color?: string;
}

/**
 * The marker for a checkbox state, in one of the two frames — the one place the
 * glyphs live, so `<Checkbox>`, `<ListMultiSelect>` and `<Select multiple>` draw
 * the same thing. The mixed glyph is a squared minus: the dash is what a
 * partial selection shows everywhere else. See docs/components.md (Checkbox).
 */
export function checkboxMarker(state: CheckboxState, frame: CheckboxFrame): CheckboxMarker {
  const glyphs = frame === 'none'
    ? { off: '☐', on: '☑', mixed: '⊟' }
    : { off: '[ ]', on: '[x]', mixed: '[-]' };
  if (state === 'mixed') return { text: glyphs.mixed };
  return state ? { text: glyphs.on, color: 'green' } : { text: glyphs.off };
}
