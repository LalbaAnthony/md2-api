import { buildAnchorTable } from "./anchors.ts";
import { flattenDocument } from "./flatten.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { resolveLinkReferences } from "./links.ts";
import { createWarningSink } from "./warnings.ts";
import type { Root } from "mdast";
import type { DocumentIr, IrBlock, IrImageAsset } from "../../types/ir.ts";
import type { NormalizeOptions, NormalizeResult } from "../../types/pipeline.ts";

const EMPTY_FOOTNOTES: ReadonlyMap<number, readonly IrBlock[]> = new Map();
const EMPTY_ASSETS: ReadonlyMap<string, IrImageAsset> = new Map();

export const normalizeDocument = async (
  tree: Root,
  options: NormalizeOptions,
): Promise<NormalizeResult> => {
  const sink = createWarningSink();

  const meta = extractFrontmatter(
    tree,
    options.metadata,
    options.defaultLanguage,
    sink,
    options.strict,
  );

  resolveLinkReferences(tree, sink);

  const anchors = buildAnchorTable(tree);

  const flattened = flattenDocument({
    tree,
    anchors,
    sink,
    strict: options.strict,
    maxNestingDepth: options.maxNestingDepth,
  });

  await Promise.resolve();

  const document: DocumentIr = {
    meta,
    blocks: flattened.blocks,
    footnotes: EMPTY_FOOTNOTES,
    anchors: anchors.bySlug,
    assets: EMPTY_ASSETS,
    stats: {
      headings: flattened.headingCount,
      words: flattened.wordCount,
      images: 0,
      codeBlocks: 0,
      tables: 0,
    },
  };

  return { document, warnings: sink.list() };
};
