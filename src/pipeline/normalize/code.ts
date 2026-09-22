import { bundledLanguages, bundledLanguagesAlias, createHighlighter } from "shiki";
import { warning } from "./warnings.ts";
import type { BundledLanguage, Highlighter } from "shiki";
import type { Code, Root, RootContent } from "mdast";
import type { IrCodeLine, IrCodeToken, SyntaxScope } from "../../types/ir.ts";
import type { CodeTokenTable, WarningSink } from "../../types/pipeline.ts";

const TOKENISATION_THEME = "github-light";

const SCOPE_RULES: readonly (readonly [string, SyntaxScope])[] = [
  ["comment", "comment"],
  ["punctuation.definition.comment", "comment"],
  ["constant.numeric", "number"],
  ["constant.language", "constant"],
  ["constant.character", "constant"],
  ["support.constant", "constant"],
  ["variable.other.constant", "constant"],
  ["string", "string"],
  ["punctuation.definition.string", "string"],
  ["keyword.operator", "operator"],
  ["storage.type.class", "type"],
  ["storage.type.interface", "type"],
  ["storage.type.enum", "type"],
  ["storage.modifier", "keyword"],
  ["storage.type", "keyword"],
  ["keyword", "keyword"],
  ["entity.name.function", "function"],
  ["support.function", "function"],
  ["meta.function-call", "function"],
  ["entity.name.type", "type"],
  ["entity.other.inherited-class", "type"],
  ["support.type", "type"],
  ["support.class", "type"],
  ["entity.name.tag", "tag"],
  ["entity.other.attribute-name", "attribute"],
  ["variable", "variable"],
  ["support.variable", "variable"],
  ["punctuation", "punctuation"],
];

export const scopeForTextMateScope = (scopeName: string): SyntaxScope | null => {
  for (const [prefix, scope] of SCOPE_RULES) {
    if (scopeName === prefix || scopeName.startsWith(`${prefix}.`)) {
      return scope;
    }
  }
  return null;
};

export const expandTabs = (line: string, tabWidth: number): string => {
  let expanded = "";
  for (const character of line) {
    if (character === "\t") {
      const distance = tabWidth - (expanded.length % tabWidth);
      expanded += " ".repeat(distance);
      continue;
    }
    expanded += character;
  }
  return expanded;
};

export const isKnownLanguage = (language: string): language is BundledLanguage =>
  Object.hasOwn(bundledLanguages, language) || Object.hasOwn(bundledLanguagesAlias, language);

let highlighterPromise: Promise<Highlighter> | null = null;

const highlighterInstance = async (): Promise<Highlighter> => {
  highlighterPromise ??= createHighlighter({ themes: [TOKENISATION_THEME], langs: [] });
  return highlighterPromise;
};

export const warmUpHighlighter = async (): Promise<void> => {
  await highlighterInstance();
};

export const resetHighlighter = (): void => {
  highlighterPromise = null;
};

const plainLines = (value: string, tabWidth: number): readonly IrCodeLine[] =>
  value.split("\n").map((line, index) => ({
    number: index + 1,
    tokens: [{ text: expandTabs(line, tabWidth), scope: "plain" }],
  }));

const collectCodeNodes = (nodes: readonly RootContent[], collected: Code[]): void => {
  for (const node of nodes) {
    if (node.type === "code") {
      collected.push(node);
      continue;
    }
    if ("children" in node && Array.isArray(node.children)) {
      collectCodeNodes(node.children, collected);
    }
  }
};

const tokensOfLine = (
  line: readonly {
    readonly content: string;
    readonly explanation?: readonly {
      readonly scopes: readonly { readonly scopeName: string }[];
    }[];
  }[],
  tabWidth: number,
): readonly IrCodeToken[] => {
  const tokens: IrCodeToken[] = [];
  for (const token of line) {
    const scopeNames = (token.explanation ?? []).flatMap((entry) =>
      entry.scopes.map((scope) => scope.scopeName),
    );
    let scope: SyntaxScope = "plain";
    for (let index = scopeNames.length - 1; index >= 0; index -= 1) {
      const matched = scopeForTextMateScope(scopeNames[index] ?? "");
      if (matched !== null) {
        scope = matched;
        break;
      }
    }
    tokens.push({ text: expandTabs(token.content, tabWidth), scope });
  }
  return tokens;
};

export const tokenizeCodeBlocks = async (
  tree: Root,
  tabWidth: number,
  sink: WarningSink,
): Promise<CodeTokenTable> => {
  const nodes: Code[] = [];
  collectCodeNodes(tree.children, nodes);
  const table = new Map<Code, readonly IrCodeLine[]>();
  if (nodes.length === 0) {
    return table;
  }

  const highlighter = await highlighterInstance();

  for (const node of nodes) {
    const language = node.lang ?? "";
    if (language.length === 0 || !isKnownLanguage(language)) {
      if (language.length > 0) {
        sink.add(
          warning("CODE_LANGUAGE_UNKNOWN", "The code language is unknown, rendering plain text.", {
            language,
          }),
        );
      }
      table.set(node, plainLines(node.value, tabWidth));
      continue;
    }

    try {
      await highlighter.loadLanguage(language);
      const result = highlighter.codeToTokens(node.value, {
        lang: language,
        theme: TOKENISATION_THEME,
        includeExplanation: true,
      });
      table.set(
        node,
        result.tokens.map((line, index) => ({
          number: index + 1,
          tokens: tokensOfLine(line, tabWidth),
        })),
      );
    } catch (reason) {
      sink.add(
        warning("CODE_TOKENISATION_FAILED", "The code block could not be tokenised.", {
          language,
          reason: reason instanceof Error ? reason.message : "unknown",
        }),
      );
      table.set(node, plainLines(node.value, tabWidth));
    }
  }

  return table;
};
