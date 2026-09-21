import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const repositoryRoot = resolve(import.meta.dirname, "..", "..");

const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  "__snapshots__",
  "baseline",
]);

export const toPosixPath = (path: string): string => path.replaceAll("\\", "/");

export const listFiles = (directory: string, extensions: readonly string[]): readonly string[] => {
  const absoluteDirectory = resolve(repositoryRoot, directory);
  const collected: string[] = [];

  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (IGNORED_DIRECTORIES.has(entry)) {
        continue;
      }
      const absoluteEntry = join(current, entry);
      if (statSync(absoluteEntry).isDirectory()) {
        walk(absoluteEntry);
        continue;
      }
      if (extensions.some((extension) => entry.endsWith(extension))) {
        collected.push(toPosixPath(relative(repositoryRoot, absoluteEntry)));
      }
    }
  };

  walk(absoluteDirectory);
  return collected.sort();
};

export const readSource = (relativePath: string): string =>
  readFileSync(resolve(repositoryRoot, relativePath), "utf8");
