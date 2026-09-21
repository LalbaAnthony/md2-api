const MAXIMUM_FILENAME_BYTES = 200;
const DEFAULT_BASE_NAME = "document";
const PATH_SEPARATORS = /[/\\:]/gu;
const UNSAFE_CHARACTERS = /["<>|?*]/gu;
const COLLAPSIBLE_SPACE = / {2,}/gu;
const COLLAPSIBLE_HYPHEN = /-{2,}/gu;

const LOWEST_PRINTABLE_CODE_POINT = 0x20;
const DELETE_CODE_POINT = 0x7f;

const stripControlCharacters = (value: string): string =>
  Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= LOWEST_PRINTABLE_CODE_POINT && codePoint !== DELETE_CODE_POINT;
    })
    .join("");

const EXTENSION_PATTERN = /^[A-Za-z0-9]{1,8}$/;

const stripTrailingExtension = (value: string): string => {
  const lastDot = value.lastIndexOf(".");
  if (lastDot <= 0) {
    return value;
  }
  const candidate = value.slice(lastDot + 1);
  return EXTENSION_PATTERN.test(candidate) ? value.slice(0, lastDot) : value;
};

const truncateToBytes = (value: string, maximumBytes: number): string => {
  let candidate = value;
  while (Buffer.byteLength(candidate, "utf8") > maximumBytes && candidate.length > 0) {
    candidate = candidate.slice(0, -1);
  }
  return candidate;
};

export const sanitiseFileName = (requested: string | undefined, extension: string): string => {
  const cleaned = stripControlCharacters((requested ?? DEFAULT_BASE_NAME).normalize("NFC"))
    .replaceAll(PATH_SEPARATORS, "-")
    .replaceAll(UNSAFE_CHARACTERS, "")
    .replaceAll(COLLAPSIBLE_HYPHEN, "-")
    .replaceAll(COLLAPSIBLE_SPACE, " ")
    .trim();
  const withoutExtension = stripTrailingExtension(cleaned);
  const safeBase = withoutExtension.length === 0 ? DEFAULT_BASE_NAME : withoutExtension;
  const suffix = `.${extension}`;
  const truncated = truncateToBytes(safeBase, MAXIMUM_FILENAME_BYTES - suffix.length);
  return `${truncated.length === 0 ? DEFAULT_BASE_NAME : truncated}${suffix}`;
};

const isAsciiPrintable = (value: string): boolean => /^[ -~]*$/u.test(value);

const escapeQuotes = (value: string): string => value.replaceAll('"', "");

export const contentDispositionOf = (fileName: string): string => {
  const encoded = encodeURIComponent(fileName);
  const asciiFallback = isAsciiPrintable(fileName) ? fileName : encoded;
  return `attachment; filename="${escapeQuotes(asciiFallback)}"; filename*=UTF-8''${encoded}`;
};
