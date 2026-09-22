const RASTERISED_DIGEST = "rasterised-vector-asset";
const RASTERISED_LENGTH = 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isVectorSource = (value: unknown): boolean =>
  typeof value === "string" && value.toLowerCase().endsWith(".svg");

const collectVectorDigests = (node: unknown, digests: Set<string>): void => {
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectVectorDigests(entry, digests);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  const digest = node["digest"];
  if (isVectorSource(node["sourceKey"]) && typeof digest === "string") {
    digests.add(digest);
  }
  for (const value of Object.values(node)) {
    collectVectorDigests(value, digests);
  }
};

const rewrite = (node: unknown, digests: ReadonlySet<string>): unknown => {
  if (Array.isArray(node)) {
    return node.map((entry) => rewrite(entry, digests));
  }
  if (!isRecord(node)) {
    return node;
  }
  const digest = node["digest"];
  const isVector = typeof digest === "string" && digests.has(digest);
  const rewritten: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (isVector && key === "digest") {
      rewritten[key] = RASTERISED_DIGEST;
      continue;
    }
    if (isVector && key === "byteLength") {
      rewritten[key] = RASTERISED_LENGTH;
      continue;
    }
    rewritten[key] = rewrite(value, digests);
  }
  return rewritten;
};

export const normaliseDebugJson = (text: string): string => {
  const parsed: unknown = JSON.parse(text);
  const digests = new Set<string>();
  collectVectorDigests(parsed, digests);
  const normalised = JSON.stringify(rewrite(parsed, digests), null, 2);
  return text.endsWith("\n") ? `${normalised}\n` : normalised;
};
