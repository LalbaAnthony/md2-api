import GithubSlugger from "github-slugger";
import { toString as mdastToString } from "mdast-util-to-string";
import type { Heading, Root, RootContent } from "mdast";
import type { AnchorTable } from "../../types/pipeline.ts";

const UNTITLED_HEADING_SLUG = "section";

const collectHeadings = (nodes: readonly RootContent[], collected: Heading[]): void => {
  for (const node of nodes) {
    if (node.type === "heading") {
      collected.push(node);
      continue;
    }
    if ("children" in node && Array.isArray(node.children)) {
      collectHeadings(node.children, collected);
    }
  }
};

export const buildAnchorTable = (tree: Root): AnchorTable => {
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  collectHeadings(tree.children, headings);

  const bySlug = new Map<string, string>();
  const byHeading = new Map<string, string>();

  for (const heading of headings) {
    const plainText = mdastToString(heading).trim();
    const slug = slugger.slug(plainText.length === 0 ? UNTITLED_HEADING_SLUG : plainText);
    bySlug.set(slug, plainText);
    byHeading.set(anchorKey(heading), slug);
  }

  return { bySlug, byHeading };
};

export const anchorKey = (heading: Heading): string => {
  const position = heading.position;
  if (position === undefined) {
    return `${heading.depth}:${mdastToString(heading)}`;
  }
  return `${position.start.line}:${position.start.column}`;
};

export const resolveInternalAnchor = (table: AnchorTable, url: string): string | null => {
  if (!url.startsWith("#")) {
    return null;
  }
  const slug = url.slice(1);
  return table.bySlug.has(slug) ? slug : null;
};
