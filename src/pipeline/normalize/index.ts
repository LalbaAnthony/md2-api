import { buildAnchorTable } from "./anchors.ts";
import { tokenizeCodeBlocks } from "./code.ts";
import { resolveDocumentImages } from "./images.ts";
import { ROOT_CONTEXT, flattenDocument } from "./flatten.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { resolveLinkReferences } from "./links.ts";
import { createWarningSink } from "./warnings.ts";
import type { Root } from "mdast";
import type { DocumentIr, IrBlock, IrImageAsset } from "../../types/ir.ts";
import type { NormalizeOptions, NormalizeResult } from "../../types/pipeline.ts";

const EMPTY_FOOTNOTES: ReadonlyMap<number, readonly IrBlock[]> = new Map();

const assetsBySourceKey = (
  images: ReadonlyMap<object, IrImageAsset>,
): ReadonlyMap<string, IrImageAsset> => {
  const assets = new Map<string, IrImageAsset>();
  for (const asset of images.values()) {
    assets.set(asset.sourceKey, asset);
  }
  return assets;
};

const withTableOfContents = (
  blocks: readonly IrBlock[],
  options: NormalizeOptions,
): readonly IrBlock[] => {
  const wanted = options.documentOptions.tableOfContents ?? options.tableOfContentsEnabled;
  if (!wanted || blocks.some((block) => block.kind === "tableOfContents")) {
    return blocks;
  }
  return [{ kind: "tableOfContents", context: ROOT_CONTEXT }, ...blocks];
};

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

  const codeTokens = await tokenizeCodeBlocks(tree, options.tabWidth, sink);

  const images = await resolveDocumentImages(tree, {
    policy: options.imagePolicy,
    contentWidth: options.contentWidth,
    maxWidthRatio: options.maxWidthRatio,
    strict: options.strict,
    sink,
  });

  const flattened = flattenDocument({
    tree,
    anchors,
    sink,
    strict: options.strict,
    maxNestingDepth: options.maxNestingDepth,
    codeTokens,
    images,
    contentWidth: options.contentWidth,
    minimumColumnWidth: options.minimumColumnWidth,
  });

  const document: DocumentIr = {
    meta,
    blocks: withTableOfContents(flattened.blocks, options),
    footnotes: EMPTY_FOOTNOTES,
    anchors: anchors.bySlug,
    assets: assetsBySourceKey(images),
    stats: {
      headings: flattened.headingCount,
      words: flattened.wordCount,
      images: flattened.imageCount,
      codeBlocks: flattened.codeBlockCount,
      tables: flattened.tableCount,
    },
  };

  return { document, warnings: sink.list() };
};
