import type { SyntaxScope } from "../../../types/ir.ts";
import type { SyntaxStyle, Theme } from "../../../types/theme.ts";
import type { DocxSyntaxRuns } from "../../../types/docx-theme.ts";

const SYNTAX_SCOPES: readonly SyntaxScope[] = [
  "keyword",
  "string",
  "number",
  "comment",
  "function",
  "type",
  "variable",
  "operator",
  "punctuation",
  "constant",
  "tag",
  "attribute",
  "plain",
];

const runOf = (style: SyntaxStyle) => ({
  color: style.foreground,
  bold: style.bold,
  italics: style.italic,
});

export const compileSyntaxRuns = (theme: Theme): DocxSyntaxRuns => ({
  keyword: runOf(theme.syntax.keyword),
  string: runOf(theme.syntax.string),
  number: runOf(theme.syntax.number),
  comment: runOf(theme.syntax.comment),
  function: runOf(theme.syntax.function),
  type: runOf(theme.syntax.type),
  variable: runOf(theme.syntax.variable),
  operator: runOf(theme.syntax.operator),
  punctuation: runOf(theme.syntax.punctuation),
  constant: runOf(theme.syntax.constant),
  tag: runOf(theme.syntax.tag),
  attribute: runOf(theme.syntax.attribute),
  plain: runOf(theme.syntax.plain),
});

export const syntaxScopes = (): readonly SyntaxScope[] => SYNTAX_SCOPES;
