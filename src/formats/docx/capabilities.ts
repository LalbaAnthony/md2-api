import type { FormatCapabilities } from "../../types/format.ts";

export const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOCX_FILE_EXTENSION = "docx";
export const DOCX_MAX_LIST_DEPTH = 9;

export const docxCapabilities: FormatCapabilities = {
  pagination: true,
  pageChrome: true,
  titlePage: true,
  tableOfContents: "deferredField",
  footnotes: "native",
  math: "source",
  syntaxHighlighting: true,
  columns: true,
  landscapeSections: true,
  vectorImages: false,
  maxListDepth: DOCX_MAX_LIST_DEPTH,
};

export const docxCaveats: readonly string[] = [
  "The table of contents is inserted as a field and stays empty until the fields are refreshed.",
  "Fonts are referenced by name and never embedded, so the reader must have them installed.",
  "Vector images are rasterised during normalisation, the document carries no SVG.",
  "Word silently truncates list nesting beyond nine levels.",
];
