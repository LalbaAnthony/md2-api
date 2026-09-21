import { parse as parseYaml } from "yaml";
import { validationError } from "../../errors.ts";
import type { Root, RootContent } from "mdast";
import type { DocumentMeta } from "../../types/ir.ts";
import type { MetadataOverrides, WarningSink } from "../../types/pipeline.ts";
import { warning } from "./warnings.ts";

const CUSTOM_VALUE_MAX_LENGTH = 500;

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  "title",
  "subtitle",
  "author",
  "authors",
  "date",
  "subject",
  "keywords",
  "language",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asTrimmedString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const asStringList = (value: unknown): readonly string[] => {
  if (Array.isArray(value)) {
    return value.map(asTrimmedString).filter((entry) => entry !== null);
  }
  const single = asTrimmedString(value);
  return single === null ? [] : [single];
};

const truncate = (value: string): string =>
  value.length <= CUSTOM_VALUE_MAX_LENGTH ? value : value.slice(0, CUSTOM_VALUE_MAX_LENGTH);

const customEntries = (source: Readonly<Record<string, unknown>>): Record<string, string> => {
  const custom: Record<string, string> = {};
  for (const key of Object.keys(source).sort()) {
    if (KNOWN_KEYS.has(key)) {
      continue;
    }
    const value = source[key];
    const flattened =
      typeof value === "object" && value !== null ? JSON.stringify(value) : asTrimmedString(value);
    if (flattened !== null) {
      custom[key] = truncate(flattened);
    }
  }
  return custom;
};

const readFrontmatterNode = (tree: Root, sink: WarningSink, strict: boolean): unknown => {
  const index = tree.children.findIndex((child: RootContent) => child.type === "yaml");
  if (index < 0) {
    return {};
  }
  const node = tree.children[index];
  tree.children.splice(index, 1);
  if (node === undefined || node.type !== "yaml") {
    return {};
  }
  try {
    return parseYaml(node.value);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unparseable front matter.";
    if (strict) {
      throw validationError("The YAML front matter cannot be parsed.", { reason: message });
    }
    sink.add(
      warning("FRONTMATTER_UNPARSEABLE", "The YAML front matter was ignored.", { reason: message }),
    );
    return {};
  }
};

export const extractFrontmatter = (
  tree: Root,
  overrides: MetadataOverrides,
  defaultLanguage: string,
  sink: WarningSink,
  strict: boolean,
): DocumentMeta => {
  const parsed = readFrontmatterNode(tree, sink, strict);
  const source = isRecord(parsed) ? parsed : {};

  const frontmatterAuthors = asStringList(source["authors"] ?? source["author"]);
  const title = overrides.title ?? asTrimmedString(source["title"]) ?? undefined;
  const subtitle = overrides.subtitle ?? asTrimmedString(source["subtitle"]) ?? undefined;
  const date = overrides.date ?? asTrimmedString(source["date"]) ?? undefined;
  const subject = overrides.subject ?? asTrimmedString(source["subject"]) ?? undefined;

  return {
    ...(title === undefined ? {} : { title }),
    ...(subtitle === undefined ? {} : { subtitle }),
    authors: overrides.authors ?? frontmatterAuthors,
    ...(date === undefined ? {} : { date }),
    ...(subject === undefined ? {} : { subject }),
    keywords: overrides.keywords ?? asStringList(source["keywords"]),
    language: overrides.language ?? asTrimmedString(source["language"]) ?? defaultLanguage,
    custom: customEntries(source),
  };
};
