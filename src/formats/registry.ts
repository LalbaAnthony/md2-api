import { validationError } from "../errors.ts";
import { debugJsonBackend } from "./debug-json/backend.ts";
import type {
  FormatBackend,
  FormatDescriptor,
  FormatRegistry,
  FormatRegistryOptions,
  OutputFormatId,
} from "../types/format.ts";

const ALL_BACKENDS: readonly FormatBackend[] = [debugJsonBackend];

const DEVELOPMENT_ONLY_BACKEND_IDS: ReadonlySet<OutputFormatId> = new Set(["debug-json"]);

const isEnabled = (
  backend: FormatBackend,
  enabledFormats: readonly string[],
  isProduction: boolean,
): boolean => {
  if (isProduction) {
    return backend.descriptor.productionReady && enabledFormats.includes(backend.descriptor.id);
  }
  if (DEVELOPMENT_ONLY_BACKEND_IDS.has(backend.descriptor.id)) {
    return true;
  }
  return enabledFormats.includes(backend.descriptor.id);
};

export const createFormatRegistry = (options: FormatRegistryOptions): FormatRegistry => {
  const { config, logger } = options;
  const candidates = options.candidates ?? ALL_BACKENDS;
  const isProduction = config.NODE_ENV === "production";

  const knownIds = new Set<string>(candidates.map((backend) => backend.descriptor.id));

  if (isProduction) {
    const notProductionReady = candidates
      .filter((backend) => !backend.descriptor.productionReady)
      .map((backend) => backend.descriptor.id)
      .filter((id) => config.ENABLED_FORMATS.includes(id));
    if (notProductionReady.length > 0) {
      throw validationError(
        "ENABLED_FORMATS names an output format that is not ready for production.",
        { variable: "ENABLED_FORMATS", notProductionReady: [...notProductionReady] },
      );
    }
  }

  for (const requested of config.ENABLED_FORMATS) {
    if (!knownIds.has(requested)) {
      logger.warn(
        { formatId: requested, known: [...knownIds] },
        "ENABLED_FORMATS names an output format that no backend implements, ignoring it.",
      );
    }
  }

  const registered = candidates.filter((backend) =>
    isEnabled(backend, config.ENABLED_FORMATS, isProduction),
  );
  const byId = new Map<string, FormatBackend>(
    registered.map((backend) => [backend.descriptor.id, backend]),
  );

  logger.info({ formats: [...byId.keys()] }, "Output formats registered.");

  return {
    resolve: (formatId) => byId.get(formatId) ?? null,
    list: (): readonly FormatDescriptor[] => registered.map((backend) => backend.descriptor),
    ids: (): readonly OutputFormatId[] => registered.map((backend) => backend.descriptor.id),
    backends: () => registered,
    warmUpAll: async () => {
      await Promise.all(registered.map(async (backend) => backend.warmUp()));
    },
    invalidateThemeCache: (themeId) => {
      for (const backend of registered) {
        backend.invalidateThemeCache(themeId);
      }
    },
  };
};
