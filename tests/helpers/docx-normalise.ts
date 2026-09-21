const VOLATILE_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  "w14:paraId",
  "w14:textId",
  "w:rsidR",
  "w:rsidRDefault",
  "w:rsidP",
  "w:rsidRPr",
  "w:rsidTr",
]);

const RELATIONSHIP_ID_PATTERN = /rId[A-Za-z0-9_-]+/g;
const TAG_PATTERN = /<([A-Za-z0-9:_.-]+)((?:\s+[A-Za-z0-9:_.-]+="[^"]*")*)\s*(\/?)>/g;
const ATTRIBUTE_PATTERN = /([A-Za-z0-9:_.-]+)="([^"]*)"/g;
const INDENT = "  ";

export const createRelationshipIdNormaliser = (): ((xml: string) => string) => {
  const substitutions = new Map<string, string>();
  return (xml: string): string =>
    xml.replaceAll(RELATIONSHIP_ID_PATTERN, (match) => {
      const existing = substitutions.get(match);
      if (existing !== undefined) {
        return existing;
      }
      const replacement = `rId${String(substitutions.size + 1)}`;
      substitutions.set(match, replacement);
      return replacement;
    });
};

const sortAttributes = (xml: string): string =>
  xml.replaceAll(TAG_PATTERN, (_whole, tagName: string, rawAttributes: string, closing: string) => {
    const attributes = [...rawAttributes.matchAll(ATTRIBUTE_PATTERN)]
      .map((match) => ({ name: match[1] ?? "", value: match[2] ?? "" }))
      .filter((attribute) => !VOLATILE_ATTRIBUTE_NAMES.has(attribute.name))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
      .join("");
    return `<${tagName}${attributes}${closing}>`;
  });

const isClosingTag = (line: string): boolean => line.startsWith("</");
const isSelfClosing = (line: string): boolean => line.endsWith("/>") || line.startsWith("<?");

const reindent = (xml: string): string => {
  const lines = xml
    .replaceAll(/\r\n/g, "\n")
    .replaceAll(/>\s*</g, ">\n<")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let depth = 0;
  return lines
    .map((line) => {
      if (isClosingTag(line)) {
        depth = Math.max(depth - 1, 0);
      }
      const indented = `${INDENT.repeat(depth)}${line}`;
      if (!isClosingTag(line) && !isSelfClosing(line) && !line.includes("</")) {
        depth += 1;
      }
      return indented;
    })
    .join("\n");
};

export const normalisePart = (
  xml: string,
  normaliseRelationships: (value: string) => string,
): string => reindent(sortAttributes(normaliseRelationships(xml))).trim();

export const normaliseParts = (parts: readonly (readonly [string, string])[]): string => {
  const normaliseRelationships = createRelationshipIdNormaliser();
  return parts
    .map(([name, xml]) => `${name}\n${normalisePart(xml, normaliseRelationships)}`)
    .join("\n\n");
};
