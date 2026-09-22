import { watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { themeExtensionError, themeNotFoundError, validationError } from "../errors.ts";
import { hashJson } from "../lib/hash.ts";
import { themeSchema } from "./schema.ts";
import { THEME_FILE_SUFFIX } from "./constants.ts";
import { academicTheme } from "./builtin/academic.theme.ts";
import { corporateTheme } from "./builtin/corporate.theme.ts";
import { defaultTheme } from "./builtin/default.theme.ts";
import { technicalTheme } from "./builtin/technical.theme.ts";
import type { FSWatcher } from "node:fs";
import type { z } from "zod";
import type { StructuredLogger } from "../types/logging.ts";
import type { Theme } from "../types/theme.ts";
import type {
  ThemeLoadFailure,
  ThemeLoadReport,
  ThemeRecord,
  ThemeRegistry,
  ThemeRegistryOptions,
  ThemeReloadListener,
  ThemeSummary,
  ThemeValidationIssue,
} from "../types/theme-registry.ts";

const BUILTIN_THEMES: readonly Theme[] = [
  defaultTheme,
  corporateTheme,
  academicTheme,
  technicalTheme,
];
const RELOAD_DEBOUNCE_MS = 150;

const toIssues = (error: z.ZodError): readonly ThemeValidationIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)),
    message: issue.message,
  }));

const summarise = (record: ThemeRecord): ThemeSummary => ({
  id: record.theme.id,
  label: record.theme.label,
  description: record.theme.description,
  version: record.theme.version,
  origin: record.origin,
  hash: record.hash,
});

const readDirectoryEntries = async (
  directory: string,
  logger: StructuredLogger,
): Promise<readonly string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(THEME_FILE_SUFFIX))
      .map((entry) => join(directory, entry.name))
      .sort();
  } catch (reason) {
    logger.debug(
      { directory, reason: reason instanceof Error ? reason.message : String(reason) },
      "No theme directory to read, continuing with built in themes only.",
    );
    return [];
  }
};

export const createThemeRegistry = async (
  options: ThemeRegistryOptions,
): Promise<ThemeRegistry> => {
  const { config, logger } = options;
  const extensionValidators = options.extensionValidators ?? [];
  const themesDirectory = resolve(config.THEMES_DIR);
  const isProduction = config.NODE_ENV === "production";

  let records: ReadonlyMap<string, ThemeRecord> = new Map();
  let lastReport: ThemeLoadReport = { loaded: [], failures: [], overridden: [] };
  const listeners: ThemeReloadListener[] = [];
  let watcher: FSWatcher | null = null;
  let reloadTimer: NodeJS.Timeout | null = null;

  const validateExtensions = (theme: Theme): readonly ThemeValidationIssue[] => {
    const issues: ThemeValidationIssue[] = [];
    for (const validator of extensionValidators) {
      const extension = theme.formats[validator.formatId] ?? {};
      for (const issue of validator.validate(theme.id, extension)) {
        issues.push({
          path: ["formats", validator.formatId, ...issue.path],
          message: issue.message,
        });
      }
    }
    return issues;
  };

  const readThemeFile = async (
    file: string,
  ): Promise<{ theme: Theme } | { failure: ThemeLoadFailure }> => {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch (reason) {
      return {
        failure: {
          source: file,
          message: reason instanceof Error ? reason.message : "Unreadable theme file.",
          issues: [],
        },
      };
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(content);
    } catch (reason) {
      return {
        failure: {
          source: file,
          message: reason instanceof Error ? reason.message : "Malformed JSON.",
          issues: [],
        },
      };
    }

    const parsed = themeSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        failure: {
          source: file,
          message: "The theme does not match the theme schema.",
          issues: toIssues(parsed.error),
        },
      };
    }

    const expectedId = basename(file, THEME_FILE_SUFFIX);
    if (parsed.data.id !== expectedId) {
      return {
        failure: {
          source: file,
          message: `The theme identifier '${parsed.data.id}' does not match the file name '${expectedId}'.`,
          issues: [{ path: ["id"], message: "Expected the identifier to match the file name." }],
        },
      };
    }

    const extensionIssues = validateExtensions(parsed.data);
    if (extensionIssues.length > 0) {
      return {
        failure: {
          source: file,
          message: "The theme carries an invalid format extension.",
          issues: extensionIssues,
        },
      };
    }

    return { theme: parsed.data };
  };

  const load = async (): Promise<ThemeLoadReport> => {
    const nextRecords = new Map<string, ThemeRecord>();
    const failures: ThemeLoadFailure[] = [];
    const overridden: string[] = [];

    for (const theme of BUILTIN_THEMES) {
      const extensionIssues = validateExtensions(theme);
      if (extensionIssues.length > 0) {
        throw themeExtensionError("A built in theme carries an invalid format extension.", {
          themeId: theme.id,
          issues: extensionIssues.map((issue) => ({
            path: [...issue.path],
            message: issue.message,
          })),
        });
      }
      nextRecords.set(theme.id, {
        theme,
        origin: "builtin",
        hash: hashJson(theme),
      });
    }

    for (const file of await readDirectoryEntries(themesDirectory, logger)) {
      const outcome = await readThemeFile(file);
      if ("failure" in outcome) {
        failures.push(outcome.failure);
        continue;
      }
      if (nextRecords.has(outcome.theme.id)) {
        overridden.push(outcome.theme.id);
      }
      nextRecords.set(outcome.theme.id, {
        theme: outcome.theme,
        origin: "directory",
        hash: hashJson(outcome.theme),
      });
    }

    if (failures.length > 0 && isProduction) {
      throw validationError("One or more themes are invalid, refusing to start.", {
        failures: failures.map((failure) => ({
          source: failure.source,
          message: failure.message,
          issues: failure.issues.map((issue) => ({
            path: [...issue.path],
            message: issue.message,
          })),
        })),
      });
    }

    for (const failure of failures) {
      logger.error(
        { source: failure.source, issues: failure.issues },
        `Theme rejected: ${failure.message}`,
      );
    }
    for (const themeId of overridden) {
      logger.warn({ themeId }, "A theme from the theme directory overrides a built in theme.");
    }

    if (!nextRecords.has(config.DEFAULT_THEME)) {
      throw themeNotFoundError(config.DEFAULT_THEME, [...nextRecords.keys()]);
    }

    records = nextRecords;
    lastReport = {
      loaded: [...nextRecords.values()].map(summarise),
      failures,
      overridden,
    };
    return lastReport;
  };

  const notify = (report: ThemeLoadReport): void => {
    for (const listener of listeners) {
      listener(report);
    }
  };

  const scheduleReload = (): void => {
    if (reloadTimer !== null) {
      clearTimeout(reloadTimer);
    }
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      load()
        .then((report) => {
          logger.info({ themes: report.loaded.length }, "Themes reloaded.");
          notify(report);
        })
        .catch((reason: unknown) => {
          logger.error(
            { reason: reason instanceof Error ? reason.message : String(reason) },
            "Theme reload failed, keeping the previous themes.",
          );
        });
    }, RELOAD_DEBOUNCE_MS);
    reloadTimer.unref();
  };

  await load();

  if (config.ENABLE_THEME_WATCH && !isProduction) {
    try {
      watcher = watch(themesDirectory, { persistent: false }, () => {
        scheduleReload();
      });
      logger.info({ directory: themesDirectory }, "Watching the theme directory.");
    } catch (reason) {
      logger.warn(
        { directory: themesDirectory, reason: reason instanceof Error ? reason.message : "" },
        "The theme directory cannot be watched.",
      );
    }
  }

  return {
    list: () => lastReport.loaded,
    ids: () => [...records.keys()],
    has: (themeId) => records.has(themeId),
    get: (themeId) => records.get(themeId)?.theme ?? null,
    record: (themeId) => records.get(themeId) ?? null,
    report: () => lastReport,
    reload: async () => {
      const report = await load();
      notify(report);
      return report;
    },
    onReload: (listener) => {
      listeners.push(listener);
    },
    close: async () => {
      if (reloadTimer !== null) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
      }
      if (watcher !== null) {
        watcher.close();
        watcher = null;
      }
      await Promise.resolve();
    },
  };
};
