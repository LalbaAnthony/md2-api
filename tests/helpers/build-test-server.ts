import { loadConfig } from "../../src/config.ts";
import { createReadinessState } from "../../src/lib/readiness.ts";
import { buildServer } from "../../src/server.ts";
import type { AppConfig, EnvironmentSource } from "../../src/types/config.ts";
import type { ReadinessState } from "../../src/types/api.ts";
import type { FastifyInstance } from "fastify";

export const testEnvironment = (overrides: EnvironmentSource = {}): EnvironmentSource => ({
  NODE_ENV: "test",
  LOG_LEVEL: "fatal",
  ...overrides,
});

export const testConfig = (overrides: EnvironmentSource = {}): AppConfig =>
  loadConfig(testEnvironment(overrides));

export const buildTestServer = async (
  overrides: EnvironmentSource = {},
  readiness: ReadinessState = createReadinessState(),
): Promise<FastifyInstance> => buildServer(testConfig(overrides), readiness);

export const startTestServer = async (
  overrides: EnvironmentSource = {},
  readiness: ReadinessState = createReadinessState(),
): Promise<FastifyInstance> => {
  const app = await buildServer(testConfig(overrides), readiness);
  await app.ready();
  return app;
};
