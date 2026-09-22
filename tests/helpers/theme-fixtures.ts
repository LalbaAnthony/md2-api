import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import type { StructuredLogger } from "../../src/types/logging.ts";

export interface RecordedLog {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly details: Record<string, unknown>;
  readonly message: string;
}

export interface RecordingLogger extends StructuredLogger {
  readonly entries: readonly RecordedLog[];
}

export const createRecordingLogger = (): RecordingLogger => {
  const entries: RecordedLog[] = [];
  const record =
    (level: RecordedLog["level"]) =>
    (details: Record<string, unknown>, message: string): void => {
      entries.push({ level, details, message });
    };
  return {
    entries,
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
  };
};

export const themeAsJsonObject = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(defaultTheme));

export const createThemeDirectory = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), "md2-themes-"));

export const removeThemeDirectory = async (directory: string): Promise<void> => {
  await rm(directory, { recursive: true, force: true });
};

export const writeThemeFile = async (
  directory: string,
  fileName: string,
  content: unknown,
): Promise<void> => {
  const serialised = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  await writeFile(join(directory, fileName), serialised, "utf8");
};

export const customTheme = (id: string, label: string): Record<string, unknown> => {
  const draft = themeAsJsonObject();
  draft["id"] = id;
  draft["label"] = label;
  return draft;
};

export const BUILTIN_THEME_IDS: readonly string[] = [
  "default",
  "corporate",
  "academic",
  "technical",
];
