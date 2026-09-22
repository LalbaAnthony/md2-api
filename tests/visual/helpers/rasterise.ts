import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { RASTER_RESOLUTION_DPI } from "./environment.ts";

const execute = promisify(execFile);

const COMMAND_TIMEOUT_MS = 180_000;
const COMMAND_MAX_BUFFER = 16 * 1024 * 1024;
const PAGE_PREFIX = "page";
const PAGE_PATTERN = /^page-(\d+)\.png$/;

export interface RenderedPage {
  readonly number: number;
  readonly png: Buffer;
}

const run = async (command: string, args: readonly string[]): Promise<void> => {
  try {
    await execute(command, [...args], {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: COMMAND_MAX_BUFFER,
    });
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : String(reason);
    throw new Error(`${command} failed: ${detail}`, { cause: reason });
  }
};

const readPages = async (directory: string): Promise<readonly RenderedPage[]> => {
  const entries = await readdir(directory);
  const numbered = entries
    .map((name) => ({ name, match: PAGE_PATTERN.exec(name) }))
    .filter((entry) => entry.match !== null)
    .map((entry) => ({ name: entry.name, number: Number(entry.match?.[1] ?? "0") }))
    .sort((left, right) => left.number - right.number);
  return Promise.all(
    numbered.map(async (entry) => ({
      number: entry.number,
      png: await readFile(join(directory, entry.name)),
    })),
  );
};

export const rasterisePages = async (
  document: Buffer,
  name: string,
): Promise<readonly RenderedPage[]> => {
  const workspace = await mkdtemp(join(tmpdir(), "md2-visual-"));
  try {
    const profile = join(workspace, "profile");
    const source = join(workspace, `${name}.docx`);
    await writeFile(source, document);
    await run("soffice", [
      "--headless",
      "--norestore",
      "--invisible",
      "--nolockcheck",
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      "--convert-to",
      "pdf:writer_pdf_Export",
      "--outdir",
      workspace,
      source,
    ]);
    const pdf = join(workspace, `${basename(source, ".docx")}.pdf`);
    await run("pdftoppm", [
      "-png",
      "-r",
      String(RASTER_RESOLUTION_DPI),
      pdf,
      join(workspace, PAGE_PREFIX),
    ]);
    const pages = await readPages(workspace);
    if (pages.length === 0) {
      throw new Error(`No page was rasterised for ${name}`);
    }
    return pages;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
};
