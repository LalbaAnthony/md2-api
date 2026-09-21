import type { FormatDescriptor } from "../types/format.ts";
import type { OpenApiDocumentOptions } from "../types/openapi.ts";

export const OPENAPI_VERSION = "3.1.0";
export const API_TITLE = "md2";
export const API_VERSION = "1.0.0";

export const API_DESCRIPTION = [
  "Converts a markdown document into a formatted binary document.",
  "The visual result is decided entirely by a theme, and the output format is selectable.",
].join(" ");

export const API_TAGS: readonly { readonly name: string; readonly description: string }[] = [
  { name: "conversion", description: "Turning markdown into a document" },
  { name: "themes", description: "The themes the service can render with" },
  { name: "formats", description: "The output formats the service can produce" },
  { name: "operations", description: "Liveness and readiness" },
];

export const binaryResponseContent = (
  descriptors: readonly FormatDescriptor[],
): Readonly<Record<string, { readonly schema: { type: "string"; format: "binary" } }>> =>
  Object.fromEntries(
    descriptors.map((descriptor) => [
      descriptor.mediaType,
      { schema: { type: "string", format: "binary" } },
    ]),
  );

export const openApiDocumentOptions = (
  descriptors: readonly FormatDescriptor[],
): OpenApiDocumentOptions => ({
  openapi: OPENAPI_VERSION,
  info: {
    title: API_TITLE,
    description: API_DESCRIPTION,
    version: API_VERSION,
  },
  tags: [...API_TAGS],
  activeMediaTypes: descriptors.map((descriptor) => descriptor.mediaType),
});
