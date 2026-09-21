import { dxa, px } from "../../src/units.ts";
import type {
  ConversionResult,
  FormatBackend,
  FormatCapabilities,
  FormatDescriptor,
  OutputFormatId,
} from "../../src/types/format.ts";
import type { BlockContext, DocumentIr, IrBlock, IrImageAsset } from "../../src/types/ir.ts";

export const rootContext: BlockContext = {
  indentLevel: 0,
  listPath: [],
  insideQuote: false,
  insideCallout: null,
  insideTableCell: false,
  insideFootnote: false,
};

export const plainCapabilities: FormatCapabilities = {
  pagination: true,
  pageChrome: true,
  titlePage: true,
  tableOfContents: "deferredField",
  footnotes: "native",
  math: "native",
  syntaxHighlighting: true,
  columns: true,
  landscapeSections: true,
  vectorImages: false,
  maxListDepth: 9,
};

export const fakeBackend = (
  id: OutputFormatId,
  mediaType: string,
  productionReady: boolean,
): FormatBackend => {
  const descriptor: FormatDescriptor = {
    id,
    label: `Fake ${id}`,
    mediaType,
    fileExtension: id,
    productionReady,
    capabilities: plainCapabilities,
    caveats: [],
  };
  const invalidated: string[] = [];
  return {
    descriptor,
    themeExtensionJsonSchema: null,
    validateThemeExtension: () => ({ ok: true }),
    describeThemeCaveats: () => [`caveat of ${id}`],
    warmUp: async () => {
      await Promise.resolve();
    },
    convert: async (): Promise<ConversionResult> => {
      await Promise.resolve();
      return {
        body: new TextEncoder().encode(id),
        mediaType,
        fileExtension: id,
        warnings: [],
        timings: { compileMs: 0, renderMs: 0, packMs: 0 },
      };
    },
    invalidateThemeCache: (themeId) => {
      invalidated.push(themeId);
    },
  };
};

export const sampleAsset = (sourceKey: string, bytes: readonly number[]): IrImageAsset => ({
  sourceKey,
  data: Uint8Array.from(bytes),
  encoding: "png",
  intrinsic: { width: px(800), height: px(600) },
  rendered: { width: px(400), height: px(300) },
});

export const sampleDocument = (overrides: Partial<DocumentIr> = {}): DocumentIr => {
  const blocks: readonly IrBlock[] = [
    {
      kind: "heading",
      context: rootContext,
      level: 1,
      anchor: "title",
      plainText: "Title",
      children: [
        {
          kind: "text",
          value: "Title",
          marks: {
            bold: false,
            italic: false,
            strike: false,
            subscript: false,
            superscript: false,
            code: false,
          },
        },
      ],
    },
    {
      kind: "paragraph",
      context: rootContext,
      align: null,
      children: [
        {
          kind: "text",
          value: "Body text.",
          marks: {
            bold: false,
            italic: false,
            strike: false,
            subscript: false,
            superscript: false,
            code: false,
          },
        },
      ],
    },
    {
      kind: "table",
      context: rootContext,
      header: null,
      rows: [],
      columnWidths: [dxa(4513), dxa(4513)],
      columnAlign: [null, "right"],
      caption: null,
      sequence: 1,
    },
    { kind: "thematicBreak", context: rootContext },
  ];

  return {
    meta: {
      title: "Sample",
      authors: ["Ada"],
      keywords: [],
      language: "en",
      custom: {},
    },
    blocks,
    footnotes: new Map(),
    anchors: new Map([["title", "Title"]]),
    assets: new Map(),
    stats: { headings: 1, words: 3, images: 0, codeBlocks: 0, tables: 1 },
    ...overrides,
  };
};
