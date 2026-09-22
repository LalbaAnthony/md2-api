import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { RenderedPage } from "./rasterise.ts";

const BASELINE_ROOT = resolve(import.meta.dirname, "..", "baseline");
const DIFF_ROOT = resolve(import.meta.dirname, "..", "diff");

export interface BaselineKey {
  readonly formatId: string;
  readonly themeId: string;
  readonly corpus: string;
}

const pageName = (key: BaselineKey, page: number): string => `${key.corpus}-${page}.png`;

export const baselineDirectory = (key: BaselineKey): string =>
  join(BASELINE_ROOT, key.formatId, key.themeId);

export const baselinePath = (key: BaselineKey, page: number): string =>
  join(baselineDirectory(key), pageName(key, page));

export const diffPath = (key: BaselineKey, page: number): string =>
  join(DIFF_ROOT, key.formatId, key.themeId, pageName(key, page));

export const listBaselinePages = async (key: BaselineKey): Promise<readonly number[]> => {
  const pattern = new RegExp(`^${key.corpus}-(\\d+)\\.png$`);
  try {
    const entries = await readdir(baselineDirectory(key));
    return entries
      .map((entry) => pattern.exec(entry))
      .filter((match) => match !== null)
      .map((match) => Number(match[1] ?? "0"))
      .sort((left, right) => left - right);
  } catch {
    return [];
  }
};

export const readBaseline = (key: BaselineKey, page: number): Promise<Buffer> =>
  readFile(baselinePath(key, page));

const writeUnder = async (path: string, content: Buffer): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

export const writeBaselines = async (
  key: BaselineKey,
  pages: readonly RenderedPage[],
): Promise<void> => {
  const directory = baselineDirectory(key);
  await mkdir(directory, { recursive: true });
  const kept = new Set(pages.map((page) => page.number));
  for (const page of await listBaselinePages(key)) {
    if (!kept.has(page)) {
      await rm(baselinePath(key, page), { force: true });
    }
  }
  for (const page of pages) {
    await writeUnder(baselinePath(key, page.number), page.png);
  }
};

export const writeDiff = (key: BaselineKey, page: number, content: Buffer): Promise<void> =>
  writeUnder(diffPath(key, page), content);
