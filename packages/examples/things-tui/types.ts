// examples/things-tui/types.ts
//
// Wire shapes verified against the running api.poetry.ddev.site DDEV instance.

export interface UserRights {
  canVote: boolean;
  canComment: boolean;
  canEditContent: boolean;
  canEditUsers: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  user?: {
    id: number;
    login: string;
    rights?: UserRights;
  };
}

// GET /cms/things — flat array of summaries. Wire shape inconsistencies (faithful):
//   - list uses `thingId`, detail uses `id`
//   - list `firstLines` is `string[]`, detail + calendar use `string`
//   - `title` is nullable on the wire (use displayThingTitle for fallback)
export interface ThingSummary {
  thingId: number;
  title: string | null;
  firstLines: string[] | null;
}

// GET /cms/things/:id — full detail. `text` is the body (BBCode-ish).
// `title` can be null on the wire — use displayThingTitle for display.
export interface Thing {
  id: number;
  title: string | null;
  text: string;
  categoryId: number;
  statusId: number;
  startDate: string | null;
  finishDate: string | null;
  firstLines: string | null;
  firstLinesAutoGenerating: boolean;
  excludeFromDaily: boolean;
  notes: unknown[];
  seoDescription: string | null;
  seoKeywords: string | null;
  info: unknown;
}

// GET /cms/sections — flat array.
export interface Section {
  id: number;
  identifier: string;
  title: string;
  description: string | null;
  annotationText: string | null;
  annotationAuthor: string | null;
  typeId: number;
  statusId: number;
  redirectSectionId: number | null;
  settings: unknown | null;
  order: number;
}

// GET /cms/sections/:id/things — adds `position` to ThingSummary.
export interface SectionThing extends ThingSummary {
  position: number;
}

// GET /things-of-the-day — array of "today's" things with section memberships.
// Section ids here are the section's `identifier` STRING (not the numeric Section.id).
export interface ThingOfTheDay {
  id: number;
  categoryId: number;
  title: string;
  finishDate: string | null;
  text: string;
  votes: { likes: number; dislikes: number };
  userVote: 'like' | 'dislike' | null;
  sections: Array<{ id: string; position: number }>;
}

// GET /cms/things-of-the-day/calendar — rolling 365-day window keyed by YYYY-MM-DD.
// Each day has ≥1 entry: curated rows (finishDate matches that day) or a single
// deterministic fallback pick. `firstLines` is a newline-joined string (or null).
export interface CalendarEntry {
  kind: 'curated' | 'fallback';
  id: number;
  title: string | null;
  firstLines: string | null;
  finishDate: string;
  statusId: number;
  categoryId: number;
  sections: Array<{ id: string; position: number }>;
}
export type ThingsOfTheDayCalendar = Record<string, CalendarEntry[]>;

// App-level state machine reduces to auth state. All sub-views are pushed onto
// the DialogHost stack from MainMenu, which stays mounted while authed → cursor
// state on every level (menu, list, sub-list) is preserved naturally.
export type AppView =
  | { kind: 'login' }
  | { kind: 'main-menu' };
