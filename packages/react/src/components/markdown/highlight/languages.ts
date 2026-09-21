// The language table. Every entry is a name, the fence labels that map onto it,
// a one-line description for the docs, and a highlighter — nearly always the
// shared engine with a keyword set and a few rules.

import { createState, tokenize, tokenizeLine } from './engine.js';
import { highlightDiff } from './diff.js';
import { highlightJs } from './js.js';
import { createMarkupState, markupLine } from './markup.js';
import { createBuilder } from './tokenColors.js';
import type { CodeLine, EngineState, LangSpec, SegBuilder, StringRule } from './types.js';

export interface LangDef {
  name: string;
  aliases: readonly string[];
  colors: string;
  highlight: (lines: readonly string[]) => CodeLine[];
}

const words = (list: string): ReadonlySet<string> => new Set(list.split(/\s+/).filter(Boolean));

/** One highlighter from one spec, threading a block's cross-line state. */
function fromSpec(spec: LangSpec): (lines: readonly string[]) => CodeLine[] {
  return (lines) => {
    const state = createState();
    return lines.map((line) => ({ segs: tokenizeLine(line, spec, state).segs }));
  };
}

// ─── families ───────────────────────────────────────────────────────────────

const BLOCK_COMMENT = [{ start: '/*', end: '*/' }] as const;
const QUOTES: readonly StringRule[] = [{ start: '"' }, { start: "'" }];
const ANNOTATION = { re: /@[A-Za-z_][\w.]*/y, token: 'annotation' } as const;

/** `//` + `/* … *``/` comments, `"` / `'` strings, a keyword set. */
function cLike(keywords: ReadonlySet<string>, extra: Partial<LangSpec> = {}): LangSpec {
  return {
    keywords,
    lineComments: ['//'],
    blockComments: BLOCK_COMMENT,
    strings: QUOTES,
    ...extra,
  };
}

/** `#` comments, `"` / `'` strings, a keyword set. */
function hashLike(keywords: ReadonlySet<string>, extra: Partial<LangSpec> = {}): LangSpec {
  return { keywords, lineComments: ['#'], strings: QUOTES, ...extra };
}

// ─── markup ─────────────────────────────────────────────────────────────────

function highlightMarkup(lines: readonly string[]): CodeLine[] {
  const state = createMarkupState();
  return lines.map((line) => {
    const b = createBuilder();
    markupLine(line, state, b);
    return { segs: b.segs };
  });
}

// ─── css ────────────────────────────────────────────────────────────────────

// Selector or declaration is decided per name, not per nesting level: a name
// standing before the line's `{` — or on a line that ends with `,`, the way a
// selector list is written — is a selector; anything else is a declaration.
// Brace *depth* would get this wrong inside `@media`, where selectors nest.
function inSelector(m: RegExpExecArray): boolean {
  const brace = m.input.indexOf('{');
  return (brace >= 0 && m.index < brace) || /,[ \t]*$/.test(m.input);
}

const CSS_SPEC: LangSpec = {
  lineComments: ['//'],
  blockComments: BLOCK_COMMENT,
  strings: QUOTES,
  identRe: /-?[A-Za-z_][\w-]*/y,
  rules: [
    // A url() may contain `//`, which would otherwise open a comment.
    { re: /url\([^)\n]*\)?/y, token: 'string' },
    { re: /@[\w-]+/y, token: 'directive' },
    { re: /![\w-]+/y, token: 'directive' },
    { re: /\$[\w-]+/y, token: 'key' },
    { re: /#[0-9a-fA-F]{3,8}\b/y, token: (m) => (inSelector(m) ? 'selector' : 'number') },
    { re: /--[\w-]+/y, token: 'property' },
    { re: /-?[\w-]+(?=[ \t]*:)/y, token: (m) => (inSelector(m) ? undefined : 'property') },
    {
      re: /[.#]?[A-Za-z_*][\w-]*|::?[A-Za-z-][\w-]*|[.#][\w-]+/y,
      token: (m) => (inSelector(m) ? 'selector' : undefined),
    },
  ],
};

// ─── shell ──────────────────────────────────────────────────────────────────

const SHELL_KEYWORDS = words(`
  if then else elif fi for while until do done case esac in function return exit
  local export source set unset readonly declare shift break continue trap eval
  exec time select echo cd
`);

const SHELL_SPEC: LangSpec = {
  keywords: SHELL_KEYWORDS,
  lineComments: ['#'],
  strings: [{ start: '"' }, { start: "'", escape: false }],
  identRe: /[A-Za-z_][\w-]*/y,
  rules: [
    { re: /\$\{[^}\n]*\}|\$[\w@#?*!$-]+/y, token: 'key' },
    { re: /<<-?\s*['"]?[A-Za-z_]\w*['"]?/y, token: 'string' },
    {
      re: /[A-Za-z_./][\w./+-]*/y,
      atLineStart: true,
      token: (m) => (SHELL_KEYWORDS.has(m[0]) ? 'keyword' : 'command'),
    },
  ],
};

// A prompt line: an optional `user@host:~` prefix (no spaces) then `$` or `#`.
// A bare `>` is deliberately not a prompt — tool output is full of lines like
// `> pkg@1.0.0 test`, and treating those as commands is the worse mistake.
// Everything that is not a prompt line is output, and output is dim.
const PROMPT_RE = /^([ \t]*[\w.@~:/\\+-]*[$#])([ \t].*|)$/;

function highlightConsole(lines: readonly string[]): CodeLine[] {
  return lines.map((line) => {
    const m = PROMPT_RE.exec(line);
    if (!m) return { segs: line === '' ? [] : [{ text: line, dim: true }] };
    const b = createBuilder();
    b.push(m[1]!, 'muted');
    // Each command stands alone — nothing carries into the output below it.
    tokenize(m[2]!, SHELL_SPEC, createState(), b, 0);
    return { segs: b.segs };
  });
}

// ─── data formats ───────────────────────────────────────────────────────────

const JSON_SPEC: LangSpec = {
  keywords: words('true false null'),
  strings: [{ start: '"' }],
  lineComments: ['//'],
  blockComments: BLOCK_COMMENT,
  rules: [
    { re: /"(?:[^"\\\n]|\\.)*"(?=[ \t]*:)/y, token: 'key' },
    { re: /-(?=\d)/y, token: 'number' },
  ],
};

const YAML_SPEC: LangSpec = {
  keywords: words('true false null yes no on off True False Null None'),
  lineComments: ['#'],
  strings: QUOTES,
  rules: [
    { re: /---|\.\.\./y, atLineStart: true, token: 'directive' },
    {
      re: /(?:-[ \t]+)*(?:"[^"\n]*"|'[^'\n]*'|[^\s:#][^:#\n]*?)(?=[ \t]*:(?:[ \t]|$))/y,
      atLineStart: true,
      token: 'key',
    },
    { re: /[&*][A-Za-z_][\w.-]*/y, token: 'type' },
  ],
};

const TOML_SPEC: LangSpec = {
  keywords: words('true false'),
  lineComments: ['#', ';'],
  strings: [
    { start: '"""', escape: false, multiline: true },
    { start: "'''", escape: false, multiline: true },
    { start: '"' },
    { start: "'", escape: false },
  ],
  rules: [
    { re: /\[+[^\]\n]*\]+/y, atLineStart: true, token: 'key' },
    { re: /(?:"[^"\n]*"|[A-Za-z0-9_.$-]+)(?=[ \t]*=)/y, atLineStart: true, token: 'key' },
  ],
};

// ─── keyword sets ───────────────────────────────────────────────────────────

const SQL_KEYWORDS = words(`
  select from where insert into values update set delete create table alter drop
  index view join inner left right outer full cross on as and or not null is in
  like ilike between group by order having limit offset distinct union all any
  primary key foreign references default unique constraint check begin commit
  rollback transaction with case when then else end exists count sum avg min max
  asc desc cast coalesce returning using cascade if add column database schema
  grant revoke true false int integer bigint smallint serial text varchar char
  boolean timestamp timestamptz date time numeric decimal real double precision
  jsonb json uuid array procedure function trigger declare each row before after
`);

const PYTHON_KEYWORDS = words(`
  and as assert async await break class continue def del elif else except
  finally for from global if import in is lambda nonlocal not or pass raise
  return try while with yield True False None self cls match case
`);

const GO_KEYWORDS = words(`
  break case chan const continue default defer else fallthrough for func go goto
  if import interface map package range return select struct switch type var
  nil true false iota make new len cap append copy delete panic recover string
  int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64
  byte rune bool error any
`);

const RUST_KEYWORDS = words(`
  as async await break const continue crate dyn else enum extern false fn for if
  impl in let loop match mod move mut pub ref return self Self static struct
  super trait true type unsafe use where while box union yield
  Option Some None Result Ok Err Vec String str bool u8 u16 u32 u64 usize i8 i16
  i32 i64 isize f32 f64 char
`);

const C_KEYWORDS = words(`
  auto break case char const continue default do double else enum extern float
  for goto if inline int long register restrict return short signed sizeof
  static struct switch typedef union unsigned void volatile while bool true
  false NULL size_t uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t
  int64_t
`);

const CPP_KEYWORDS = words(`
  alignas alignof and auto bool break case catch char class const consteval
  constexpr const_cast continue decltype default delete do double dynamic_cast
  else enum explicit export extern false float for friend goto if inline int
  long mutable namespace new noexcept nullptr operator or private protected
  public register reinterpret_cast return short signed sizeof static
  static_assert static_cast struct switch template this thread_local throw true
  try typedef typeid typename union unsigned using virtual void volatile while
  concept requires co_await co_return co_yield
`);

const JAVA_KEYWORDS = words(`
  abstract assert boolean break byte case catch char class const continue
  default do double else enum extends final finally float for goto if implements
  import instanceof int interface long native new package private protected
  public return short static strictfp super switch synchronized this throw
  throws transient try void volatile while var record sealed permits yield true
  false null String
`);

const KOTLIN_KEYWORDS = words(`
  as break by catch class companion const constructor continue crossinline data
  delegate do dynamic else enum expect external false final finally for fun get
  if import in infix init inline inner interface internal is lateinit noinline
  null object open operator out override package private protected public
  reified return sealed set super suspend tailrec this throw true try typealias
  typeof val var vararg when where while it
`);

const SWIFT_KEYWORDS = words(`
  actor as associatedtype async await break case catch class continue default
  defer deinit do else enum extension fallthrough false fileprivate final for
  func guard if import in indirect infix init inout internal is lazy let mutating
  nil nonmutating open operator override postfix precedencegroup prefix private
  protocol public repeat required rethrows return self Self static struct
  subscript super switch throw throws true try typealias var weak where while
  some any unowned convenience
`);

const CSHARP_KEYWORDS = words(`
  abstract as async await base bool break byte case catch char checked class
  const continue decimal default delegate do double else enum event explicit
  extern false finally fixed float for foreach get goto if implicit in int
  interface internal is lock long namespace new null object operator out
  override params private protected public readonly record ref return sbyte
  sealed set short sizeof stackalloc static string struct switch this throw true
  try typeof uint ulong unchecked unsafe ushort using var virtual void volatile
  when where while yield nameof
`);

// ─── language-specific rules ────────────────────────────────────────────────

// A preprocessor line — `#` is a directive here, never a comment. The header of
// an `#include` is a string whether it is in angle brackets or quotes.
function preprocessorLine(line: string, _state: EngineState, b: SegBuilder): number {
  const m = /^([ \t]*)(#[ \t]*[A-Za-z_]+)/.exec(line);
  if (!m) return 0;
  b.push(m[1]!, 'plain');
  b.push(m[2]!, 'directive');
  let i = m[0].length;
  const header = /^([ \t]*)(<[^<>\n]*>)/.exec(line.slice(i));
  if (header && /include|import/.test(m[2]!)) {
    b.push(header[1]!, 'plain');
    b.push(header[2]!, 'string');
    i += header[0].length;
  }
  return i;
}

const PYTHON_SPEC: LangSpec = hashLike(PYTHON_KEYWORDS, {
  strings: [
    { start: '"""', multiline: true },
    { start: "'''", multiline: true },
    { start: '"' },
    { start: "'" },
  ],
  rules: [
    { re: /[rRbBuUfF]{1,2}(?=["'])/y, token: 'string' },
    { re: /@[\w.]+/y, atLineStart: true, token: 'annotation' },
  ],
});

const TRIPLE_QUOTED: readonly StringRule[] = [{ start: '"""', multiline: true }, { start: '"' }];

// ─── tape-machine toolchains ────────────────────────────────────────────────
// The Post machine (PM-1) and multi-tape Turing machine (TM-1) toolchains: a
// C-like source language and an assembly stage for each. Token sets follow the
// toolchains' own editor grammars.

const PMC_KEYWORDS = words(`
  use namespace export as volatile goto check halt left right mark unmark
  debugger
`);

const TMC_KEYWORDS = words(`
  alphabet machine tape state routine graph namespace export entry volatile use
  as goto call then return stop halt graft bind write move map with debugger
  writes preserves
`);

/** A call or symbol reference: `@goToEnd`, `@std::mark`. */
const AT_SYMBOL = { re: /@[ \t]*[A-Za-z_][\w.:]*/y, token: 'command' } as const;
/** `Lstart:` at the head of an assembly line. */
const ASM_LABEL = { re: /[A-Za-z_]\w*[ \t]*:/y, atLineStart: true, token: 'key' } as const;
/** `.func`, `.section`, `.row`, … — longest alternative first, as in the grammars. */
const asmMnemonics = (list: string): { re: RegExp; token: 'keyword' } => ({
  re: new RegExp(`(?:${list.trim().split(/\s+/).join('|')})(?![\\w.])`, 'y'),
  token: 'keyword',
});

const PMC_SPEC: LangSpec = {
  keywords: PMC_KEYWORDS,
  lineComments: ['//'],
  blockComments: BLOCK_COMMENT,
  rules: [
    // A step label: `12:` — never `::`, which separates namespaces.
    { re: /\d+[ \t]*:/y, token: 'key' },
    AT_SYMBOL,
    // `!` ends a call chain: it is control flow, not punctuation.
    { re: /!/y, token: 'keyword' },
  ],
};

const PMA_SPEC: LangSpec = {
  lineComments: [';'],
  rules: [
    { re: /\.[a-z]+/y, token: 'directive' },
    ASM_LABEL,
    AT_SYMBOL,
    asmMnemonics(`
      call\\.s jmp\\.s jnm\\.s jm\\.s call jmp jnm nop stp hlt lft rgt ret ent
      brk wrl wrr wr jm
    `),
    { re: /\blocal\b/y, token: 'keyword' },
  ],
};

const TMC_SPEC: LangSpec = {
  keywords: TMC_KEYWORDS,
  lineComments: ['//'],
  blockComments: BLOCK_COMMENT,
  // Symbol literals: '0', '\n', '_'.
  strings: [{ start: "'" }],
  rules: [
    // A whole-line doc comment (`?`) or attention comment (`!`).
    { re: /[?!].*/y, atLineStart: true, token: 'comment' },
  ],
};

const TMA_SPEC: LangSpec = {
  lineComments: [';'],
  rules: [
    { re: /\.[a-z]+/y, token: 'directive' },
    ASM_LABEL,
    AT_SYMBOL,
    asmMnemonics(`
      call\\.m call\\.s wrmv djmp retx trap call jmp jnm brk ent hlt mov mtc nop
      ret stp rd jm wr
    `),
    { re: /\blocal\b/y, token: 'keyword' },
  ],
};

// ─── the table ──────────────────────────────────────────────────────────────

const LANGUAGES: readonly LangDef[] = [
  {
    name: 'diff', aliases: ['patch'],
    colors: 'added lines green, removed red, hunk headers cyan, file headers bold',
    highlight: highlightDiff,
  },
  {
    name: 'javascript', aliases: ['js', 'jsx', 'mjs', 'cjs', 'node'],
    colors: 'keywords, strings, numbers, comments, JSX tags and attributes',
    highlight: highlightJs,
  },
  {
    name: 'typescript', aliases: ['ts', 'tsx'],
    colors: 'keywords, strings, numbers, comments, JSX tags and attributes',
    highlight: highlightJs,
  },
  {
    name: 'json', aliases: ['jsonc', 'json5'],
    colors: 'keys, strings, numbers, true / false / null',
    highlight: fromSpec(JSON_SPEC),
  },
  {
    name: 'html', aliases: ['htm', 'svg', 'vue'],
    colors: 'tags, components, attribute names and values, comments, entities',
    highlight: highlightMarkup,
  },
  {
    name: 'xml', aliases: ['xhtml', 'xsd', 'xsl', 'xslt', 'plist', 'pom', 'rss'],
    colors: 'tags, attributes, the XML declaration, DOCTYPE, CDATA, comments, entities',
    highlight: highlightMarkup,
  },
  {
    name: 'css', aliases: ['scss', 'less', 'sass'],
    colors: 'selectors, property names, values, @rules, comments',
    highlight: fromSpec(CSS_SPEC),
  },
  {
    name: 'shell', aliases: ['sh', 'bash', 'zsh', 'ksh'],
    colors: 'the leading command, keywords, strings, variables, comments',
    highlight: fromSpec(SHELL_SPEC),
  },
  {
    name: 'console', aliases: ['shell-session', 'shellsession', 'terminal'],
    colors: 'prompt lines highlighted as shell, output dim',
    highlight: highlightConsole,
  },
  {
    name: 'yaml', aliases: ['yml'],
    colors: 'keys, strings, numbers, booleans, comments',
    highlight: fromSpec(YAML_SPEC),
  },
  {
    name: 'toml', aliases: ['ini', 'cfg', 'conf'],
    colors: 'section headers, keys, strings, numbers, comments',
    highlight: fromSpec(TOML_SPEC),
  },
  {
    name: 'sql', aliases: ['psql', 'mysql', 'postgres', 'postgresql', 'sqlite'],
    colors: 'keywords (case-insensitive), strings, numbers, comments',
    highlight: fromSpec({
      keywords: SQL_KEYWORDS,
      ignoreCase: true,
      lineComments: ['--'],
      blockComments: BLOCK_COMMENT,
      strings: [
        { start: "'", escape: false },
        { start: '"', escape: false, token: 'key' },
        { start: '`', escape: false, token: 'key' },
      ],
    }),
  },
  {
    name: 'python', aliases: ['py'],
    colors: 'keywords, strings (including triple-quoted), numbers, decorators, comments',
    highlight: fromSpec(PYTHON_SPEC),
  },
  {
    name: 'go', aliases: ['golang'],
    colors: 'keywords, strings (including raw backticks), numbers, comments',
    highlight: fromSpec(cLike(GO_KEYWORDS, {
      strings: [{ start: '"' }, { start: '`', escape: false, multiline: true }, { start: "'" }],
    })),
  },
  {
    name: 'rust', aliases: ['rs'],
    colors: 'keywords, strings (including raw), lifetimes, macros, numbers, comments',
    highlight: fromSpec(cLike(RUST_KEYWORDS, {
      strings: [
        { start: 'r#"', end: '"#', escape: false, multiline: true },
        { start: 'r"', end: '"', escape: false, multiline: true },
        { start: '"' },
      ],
      rules: [
        { re: /'(?:\\.|[^'\\])'/y, token: 'string' },
        { re: /'[A-Za-z_]\w*/y, token: 'type' },
        { re: /[A-Za-z_]\w*!(?![=])/y, token: 'directive' },
      ],
    })),
  },
  {
    name: 'c', aliases: ['h'],
    colors: 'keywords, strings, numbers, comments, preprocessor directives',
    highlight: fromSpec(cLike(C_KEYWORDS, { lineStart: preprocessorLine })),
  },
  {
    name: 'cpp', aliases: ['c++', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
    colors: 'keywords, strings, numbers, comments, preprocessor directives',
    highlight: fromSpec(cLike(CPP_KEYWORDS, { lineStart: preprocessorLine })),
  },
  {
    name: 'java', aliases: [],
    colors: 'keywords, strings (including text blocks), numbers, annotations, comments',
    highlight: fromSpec(cLike(JAVA_KEYWORDS, {
      strings: [...TRIPLE_QUOTED, { start: "'" }],
      rules: [ANNOTATION],
    })),
  },
  {
    name: 'kotlin', aliases: ['kt', 'kts'],
    colors: 'keywords, strings (including triple-quoted), numbers, annotations, comments',
    highlight: fromSpec(cLike(KOTLIN_KEYWORDS, {
      strings: [...TRIPLE_QUOTED, { start: "'" }],
      rules: [ANNOTATION],
    })),
  },
  {
    name: 'swift', aliases: [],
    colors: 'keywords, strings (including triple-quoted), numbers, attributes, comments',
    highlight: fromSpec(cLike(SWIFT_KEYWORDS, {
      strings: TRIPLE_QUOTED,
      rules: [ANNOTATION],
    })),
  },
  {
    name: 'csharp', aliases: ['cs'],
    colors: 'keywords, strings, numbers, attributes, comments',
    highlight: fromSpec(cLike(CSHARP_KEYWORDS, { rules: [ANNOTATION] })),
  },
  {
    name: 'pmc', aliases: [],
    colors: 'Post machine source: keywords, step labels, calls, numbers, comments',
    highlight: fromSpec(PMC_SPEC),
  },
  {
    name: 'pma', aliases: [],
    colors: 'Post machine assembly: directives, mnemonics, labels, symbols, numbers, comments',
    highlight: fromSpec(PMA_SPEC),
  },
  {
    name: 'tmc', aliases: [],
    colors: 'Turing machine source: keywords, symbol literals, numbers, doc and line comments',
    highlight: fromSpec(TMC_SPEC),
  },
  {
    name: 'tma', aliases: [],
    colors: 'Turing machine assembly: directives, mnemonics, labels, numbers, comments',
    highlight: fromSpec(TMA_SPEC),
  },
];

/** Fence labels that mean "do not highlight this". */
const PLAIN_LANGUAGES: ReadonlySet<string> = words('text log plain txt none');

const BY_LABEL = new Map<string, LangDef>();
for (const def of LANGUAGES) {
  BY_LABEL.set(def.name, def);
  for (const alias of def.aliases) BY_LABEL.set(alias, def);
}

export function findLanguage(label: string): LangDef | undefined {
  const key = label.trim().toLowerCase();
  if (key === '' || PLAIN_LANGUAGES.has(key)) return undefined;
  return BY_LABEL.get(key);
}

/** One row of the published language table: what a fenced block can be labeled
 *  and what the highlighter colors in it. */
export interface HighlightedLanguage {
  /** The canonical name — also a usable fence label. */
  name: string;
  /** Other labels that select this language. */
  aliases: readonly string[];
  /** One line on what gets colored, for an app that lists the languages. */
  colors: string;
}

/** For the docs and for a spec that walks it. */
export const HIGHLIGHTED_LANGUAGES: readonly HighlightedLanguage[] =
  LANGUAGES.map(({ name, aliases, colors }) => ({ name, aliases, colors }));
