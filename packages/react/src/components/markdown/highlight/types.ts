// Shared shapes for fenced-code highlighting. `CodeSeg` / `CodeLine` are the
// public output; everything else is the vocabulary the highlighters speak.

import type { Color } from '@flowtty/core';

/** One run of code text that shares a style. */
export interface CodeSeg {
  text: string;
  color?: Color;
  dim?: boolean;
  bold?: boolean;
}

/** A diff row's role — `undefined` for every non-diff line. */
export type CodeLineKind = 'added' | 'removed' | 'hunk' | 'header' | undefined;

/** One highlighted source line. */
export interface CodeLine {
  segs: CodeSeg[];
  /** set for diff rows, so the layout can add a row background / line numbers */
  kind?: CodeLineKind;
}

/**
 * What a run of characters *is*. The token names are the only vocabulary a
 * language spec uses; `TOKEN_COLORS` turns them into styles, so the palette
 * lives in exactly one place.
 */
export type TokenType =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'type'
  | 'key'
  | 'command'
  | 'property'
  | 'selector'
  | 'tag'
  | 'component'
  | 'attr'
  | 'entity'
  | 'directive'
  | 'annotation'
  | 'muted'
  | 'added'
  | 'removed'
  | 'hunk'
  | 'header';

/** The style half of a `CodeSeg`. */
export type TokenStyle = Omit<CodeSeg, 'text'>;

/** Collects styled runs, merging neighbours that would look identical. */
export interface SegBuilder {
  push(text: string, token: TokenType): void;
  readonly segs: CodeSeg[];
}

/** Where a markup (HTML / XML / JSX) tokenizer is in its state machine. */
export type MarkupMode = 'text' | 'tag' | 'comment' | 'cdata' | 'pi' | 'doctype';

export interface MarkupState {
  mode: MarkupMode;
  /** the quote character of an attribute value left open at the end of a line */
  quote?: string;
  /** inside a JSX `{…}` expression that has not closed yet */
  inExpr?: boolean;
  /** engine brace depth the open expression started at */
  exprBase?: number;
}

/** A construct left open at the end of a line, resumed on the next one. */
export interface OpenBlock {
  end: string;
  token: TokenType;
  escape: boolean;
}

/** Everything a fenced block carries from one line to the next. */
export interface EngineState {
  open?: OpenBlock;
  /** `{` / `}` nesting seen in code — CSS reads it, JSX expressions ride on it */
  depth: number;
  markup?: MarkupState;
}

export interface StringRule {
  start: string;
  /** defaults to `start` */
  end?: string;
  /** backslash escapes inside (default true) */
  escape?: boolean;
  /** may stay open across lines */
  multiline?: boolean;
  /** defaults to `string` */
  token?: TokenType;
}

export interface BlockComment { start: string; end: string }

export interface ExtraRule {
  /** must be sticky (`y`) — it is matched at one position only */
  re: RegExp;
  /** A function may look at `m.input` / `m.index` and decline with `undefined`,
   *  which falls through to the rest of the tokenizer. */
  token: TokenType | ((m: RegExpExecArray) => TokenType | undefined);
  /** only try this rule while nothing but whitespace has been emitted */
  atLineStart?: boolean;
}

/** One language, as a table of pieces the shared tokenizer understands. */
export interface LangSpec {
  keywords?: ReadonlySet<string>;
  /** keywords are matched lowercased (SQL) */
  ignoreCase?: boolean;
  lineComments?: readonly string[];
  blockComments?: readonly BlockComment[];
  strings?: readonly StringRule[];
  /** default true */
  numbers?: boolean;
  identRe?: RegExp;
  rules?: readonly ExtraRule[];
  /** Consumes a line prefix (a C preprocessor directive); returns where to resume. */
  lineStart?: (line: string, state: EngineState, b: SegBuilder) => number;
  /** Consumes a construct the table cannot describe (JSX markup); returns the
   *  new index, or the index it was given when it does not apply. */
  hook?: (line: string, i: number, state: EngineState, b: SegBuilder) => number;
}
