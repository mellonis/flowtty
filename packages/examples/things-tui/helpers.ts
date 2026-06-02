// examples/things-tui/helpers.ts
//
// Display helpers shared across views.

// Strip C0 control bytes (including the stray \r left behind by split('\n') on
// CRLF data). Poetry's CMS db has Windows-imported rows where firstLines ends
// with \r — and a raw \r in a TUI cell repositions the terminal cursor.
function clean(s: string): string {
  return s.replace(/[\x00-\x1f]+/gu, ' ').trim();
}

// Mirrors poetry-nextjs/src/shared/api/cms.ts `displayThingTitle`.
// Fallback chain: title → «first line…» → #id.
// The poetry API is inconsistent: list endpoints return firstLines as `string[]`,
// detail + calendar return `string`. Accept both shapes.
export function displayThingTitle(
  title: string | null | undefined,
  firstLines: string | string[] | null | undefined,
  id: number,
): string {
  if (title) return clean(title);
  if (firstLines && firstLines.length > 0) {
    const first = Array.isArray(firstLines) ? firstLines[0] : firstLines.split('\n')[0];
    if (first) return `«${clean(first)}…»`;
  }
  return `#${id}`;
}
