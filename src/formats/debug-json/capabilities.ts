import type { FormatCapabilities } from "../../types/format.ts";

export const DEBUG_JSON_MEDIA_TYPE = "application/json";
export const DEBUG_JSON_FILE_EXTENSION = "json";
export const DEBUG_JSON_MAX_LIST_DEPTH = 64;

export const debugJsonCapabilities: FormatCapabilities = {
  pagination: false,
  pageChrome: false,
  titlePage: false,
  tableOfContents: "none",
  footnotes: "inline",
  math: "source",
  syntaxHighlighting: true,
  columns: false,
  landscapeSections: false,
  vectorImages: false,
  maxListDepth: DEBUG_JSON_MAX_LIST_DEPTH,
};

export const debugJsonCaveats: readonly string[] = [
  "This format exists for development and diagnosis, it is never registered in production.",
  "The output is the intermediate representation, not a paginated document.",
  "Image bytes are replaced by their length and digest, so the output stays small and stable.",
];
