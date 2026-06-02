// articles.mjs reads ARTICLES_DIR from process.cwd() at module-init time.
// Chdir to site BEFORE the dynamic import so the helpers see the right content path.
const SITE_DIR = '/Users/mellonis/Developer/mellonis-workspace/site';
process.chdir(SITE_DIR);
// articles.mjs is plain JS with no .d.ts. Cast to `any` locally so we don't
// oscillate between the missing-declaration error (without a suppression) and
// the unused-directive error (with one) across TS passes. Use the absolute
// path under SITE_DIR so the import is robust to wherever this file is moved.
const mod: any = await import(`${SITE_DIR}/scripts/articles.mjs` as any);

export const listFolders: () => string[] = mod.listFolders;
export const buildRows: (folders: string[]) => Array<{
  id: string; status: string; date: string; title: string;
}> = mod.buildRows;
export const statusOf: (folder: string) => string = mod.statusOf;
export const slugify: (title: string, lang: string) => string = mod.slugify;
export const SLUG_RE: RegExp = mod.SLUG_RE;
export const TODAY: string = mod.TODAY;
export const loadRegisteredTags: () => string[] = mod.loadRegisteredTags;
export const addArticleTagToContent: (tag: string) => void = mod.addArticleTagToContent;
export const writeArticleSkeleton: (opts: {
  slug: string; date: string; tags: string[]; originalLang: string; title: string;
}) => void = mod.writeArticleSkeleton;
export const readFrontmatter: (folder: string, lang: string) => Record<string, string> | null = mod.readFrontmatter;
export const writeArticleTags: (folder: string, tags: string[]) => void = mod.writeArticleTags;
export const setDraftForFolder: (folder: string, draft: boolean) => Promise<void> = mod.setDraftForFolder;
