// Shared interfaces for the articles-tui example.

export interface ListAction {
  kind: 'create' | 'view' | 'delete' | 'publish' | 'withdraw' | 'tags-list';
  id?: string;
}

export interface ArticleViewDoneResult {
  action: 'edit-tags';
  lang: 'en' | 'ru';
  page: number;
}

export type AppView =
  | { kind: 'list' }
  | { kind: 'view'; id: string; lang?: 'en' | 'ru'; page?: number }
  | { kind: 'tags-list' }
  | { kind: 'edit-tags'; id: string; returnLang: 'en' | 'ru'; returnPage: number };

export const WIZARD_STEPS = ['lang', 'title', 'slug', 'tags'] as const;
export type WizardStepName = typeof WIZARD_STEPS[number];
