import { formatNotFoundError, notAcceptableError } from "../errors.ts";
import type {
  AcceptEntry,
  FormatRegistry,
  FormatSelection,
  FormatSelectionInput,
} from "../types/format.ts";

const WILDCARD_MEDIA_TYPE = "*/*";
const DEFAULT_QUALITY = 1;

export const parseAcceptHeader = (header: string): readonly AcceptEntry[] => {
  const entries = header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const [mediaType, ...parameters] = part.split(";").map((piece) => piece.trim());
      const qualityParameter = parameters.find((parameter) => parameter.startsWith("q="));
      const quality =
        qualityParameter === undefined
          ? DEFAULT_QUALITY
          : Number.parseFloat(qualityParameter.slice(2));
      return {
        mediaType: (mediaType ?? "").toLowerCase(),
        quality: Number.isNaN(quality) ? 0 : quality,
      };
    })
    .filter((entry) => entry.mediaType.length > 0 && entry.quality > 0);

  return [...entries].sort((left, right) => right.quality - left.quality);
};

export const acceptsAnything = (entries: readonly AcceptEntry[]): boolean =>
  entries.length === 0 || entries.some((entry) => entry.mediaType === WILDCARD_MEDIA_TYPE);

export const selectFormat = (
  registry: FormatRegistry,
  input: FormatSelectionInput,
): FormatSelection => {
  const available = registry.ids();

  if (input.bodyFormat !== undefined) {
    const backend = registry.resolve(input.bodyFormat);
    if (backend === null) {
      throw formatNotFoundError(input.bodyFormat, available);
    }
    return { backend, source: "body" };
  }

  if (input.queryFormat !== undefined) {
    const backend = registry.resolve(input.queryFormat);
    if (backend === null) {
      throw formatNotFoundError(input.queryFormat, available);
    }
    return { backend, source: "query" };
  }

  if (input.acceptHeader !== undefined) {
    const entries = parseAcceptHeader(input.acceptHeader);
    if (!acceptsAnything(entries)) {
      for (const entry of entries) {
        const matched = registry
          .backends()
          .find((backend) => backend.descriptor.mediaType.toLowerCase() === entry.mediaType);
        if (matched !== undefined) {
          return { backend: matched, source: "accept" };
        }
      }
      throw notAcceptableError(
        input.acceptHeader,
        registry.list().map((descriptor) => descriptor.mediaType),
      );
    }
  }

  const fallback = registry.resolve(input.defaultFormat);
  if (fallback === null) {
    throw formatNotFoundError(input.defaultFormat, available);
  }
  return { backend: fallback, source: "default" };
};
