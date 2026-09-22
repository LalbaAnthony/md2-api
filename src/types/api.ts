import type { DestinationStream } from "pino";
import type { AppConfig } from "./config.ts";
import type { Semaphore } from "./concurrency.ts";
import type { FormatRegistry } from "./format.ts";
import type { Theme } from "./theme.ts";
import type { ThemeRegistry } from "./theme-registry.ts";

export interface LivenessResponse {
  readonly status: "ok";
  readonly uptimeSeconds: number;
}

export interface ReadinessResponse {
  readonly status: "ready" | "starting";
  readonly themesLoaded: boolean;
  readonly formatsWarmedUp: boolean;
}

export interface ReadinessState {
  themesLoaded: boolean;
  formatsWarmedUp: boolean;
}

export type ThemeCaveatProvider = (theme: Theme) => Readonly<Record<string, readonly string[]>>;

export interface ServerDependencies {
  readonly readiness: ReadinessState;
  readonly themes: ThemeRegistry;
  readonly formats: FormatRegistry;
  readonly themeCaveats: ThemeCaveatProvider;
  readonly logStream: DestinationStream;
}

export interface ConvertRouteDependencies {
  readonly config: AppConfig;
  readonly themes: ThemeRegistry;
  readonly formats: FormatRegistry;
  readonly semaphore: Semaphore;
}

export interface ConvertMetadataInput {
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly author?: readonly string[] | undefined;
  readonly date?: string | undefined;
  readonly subject?: string | undefined;
  readonly keywords?: readonly string[] | undefined;
  readonly language?: string | undefined;
}
